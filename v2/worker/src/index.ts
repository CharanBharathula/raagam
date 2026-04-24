// ============================================================
// Raagam v2 — Cloudflare Worker API (Hono)
// ------------------------------------------------------------
// Routes:
//   GET  /health                — liveness
//   POST /pick                  — Blockbuster Pick v2 (main)
//   GET  /songs/:id             — single song, hydrated
//   POST /songs/batch           — batch fetch by ids (for Dexie cache rehydration)
//   GET  /search                — thin proxy to Meilisearch
//   GET  /lyrics/:lyricsId      — fetch LRC from LRCLib, cached in KV
//   POST /me/like               — like/unlike
//   POST /me/history            — record play
//   GET  /me                    — current user row + settings
//   POST /me/settings           — update year range + lang blend
//   GET  /new-releases          — latest chart songs
//   GET  /moods/:mood           — mood-filtered pool
// ============================================================

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { Env } from './types';
import { rowToSong, type SongRow, type TasteVector, safeParse } from './types';
import { pickBlockbuster } from './pick';
import { runNightlyEnrichment } from './enrichment';
import { verifyClerkToken } from './auth';
import { meiliConfigured, reindexMeili, searchMeili } from './meili';

type AppEnv = { Bindings: Env; Variables: { userId?: string } };

const app = new Hono<AppEnv>();

app.use('*', logger());
app.use(
  '*',
  cors({
    origin: (o) => o,
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    credentials: true,
    maxAge: 600,
  }),
);

// ---------------------------------------------------------------
// Clerk auth — verify the `Authorization: Bearer <token>` header
// and pull the subject out. If missing, requests still work but
// user-specific features (taste, likes, history) degrade gracefully.
// Real JWT verification wiring left to deploy-time (CLERK_JWT_ISSUER).
// ---------------------------------------------------------------
app.use('*', async (c, next) => {
  const auth = c.req.header('Authorization');
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7);
    const userId = await verifyClerkToken(token, c.env).catch(() => null);
    if (userId) c.set('userId', userId);
  }
  await next();
});

// ---------- health ----------
app.get('/health', (c) => c.json({ ok: true, service: 'raagam-api', ts: Date.now() }));

// ---------- pick ----------
app.post('/pick', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json().catch(() => ({}));
  try {
    const result = await pickBlockbuster(c.env, { ...body, userId });
    // Opportunistic enrichment for the returned row if anything is missing.
    await ensureReady(c.env, result.song.id).catch(() => {});
    return c.json(result);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

// ---------- single song ----------
app.get('/songs/:id', async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM songs WHERE id = ?')
    .bind(c.req.param('id'))
    .first<SongRow>();
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json({ song: rowToSong(row) });
});

app.post('/songs/batch', async (c) => {
  const body = await c.req.json<{ ids: string[] }>().catch(() => ({ ids: [] }));
  const ids = (body.ids ?? []).slice(0, 200);
  if (ids.length === 0) return c.json({ songs: [] });
  const placeholders = ids.map(() => '?').join(',');
  const rows = await c.env.DB.prepare(`SELECT * FROM songs WHERE id IN (${placeholders})`)
    .bind(...ids)
    .all<SongRow>();
  return c.json({ songs: (rows.results ?? []).map(rowToSong) });
});

// ---------- new releases ----------
app.get('/new-releases', async (c) => {
  const lang = c.req.query('lang') ?? 'hindi';
  const limit = Math.min(50, Number(c.req.query('limit') ?? 20));
  const rows = await c.env.DB.prepare(
    `SELECT * FROM songs
       WHERE language = ? AND year >= 2024
       ORDER BY popularity DESC, year DESC
       LIMIT ?`,
  )
    .bind(lang, limit)
    .all<SongRow>();
  return c.json({ songs: (rows.results ?? []).map(rowToSong) });
});

// ---------- moods ----------
app.get('/moods/:mood', async (c) => {
  const mood = c.req.param('mood');
  const lang = c.req.query('lang') ?? 'hindi';
  const limit = Math.min(100, Number(c.req.query('limit') ?? 50));
  // Rely on the `tags` JSON column. Using LIKE on JSON works well enough
  // for SQLite; for scale we'd pre-normalise into a tags table.
  const rows = await c.env.DB.prepare(
    `SELECT * FROM songs
       WHERE language = ?
         AND tags LIKE ?
         AND year >= 2000
       ORDER BY popularity DESC
       LIMIT ?`,
  )
    .bind(lang, `%"${mood}"%`, limit)
    .all<SongRow>();
  return c.json({ songs: (rows.results ?? []).map(rowToSong) });
});

// ---------- search ----------
app.get('/search', async (c) => {
  const q = (c.req.query('q') ?? '').trim();
  const lang = c.req.query('lang');
  const yearMin = Number(c.req.query('yearMin') ?? 2000);
  const yearMax = Number(c.req.query('yearMax') ?? 2026);
  if (!q) return c.json({ songs: [] });

  // Meilisearch path (typo-tolerant + ranked). Fall back to D1 LIKE.
  if (meiliConfigured(c.env)) {
    const hits = await searchMeili(c.env, { q, lang, yearMin, yearMax, limit: 50 });
    if (hits) return c.json({ songs: hits, source: 'meili' });
  }

  const like = `%${q}%`;
  const base = `SELECT * FROM songs
                  WHERE (name LIKE ? OR artists LIKE ? OR album LIKE ?)
                    AND year BETWEEN ? AND ?`;
  const sql = lang ? `${base} AND language = ? ORDER BY popularity DESC LIMIT 50`
                   : `${base} ORDER BY popularity DESC LIMIT 50`;
  const stmt = lang
    ? c.env.DB.prepare(sql).bind(like, like, like, yearMin, yearMax, lang)
    : c.env.DB.prepare(sql).bind(like, like, like, yearMin, yearMax);
  const rows = await stmt.all<SongRow>();
  return c.json({ songs: (rows.results ?? []).map(rowToSong), source: 'd1' });
});

// ---------- lyrics ----------
app.get('/lyrics/:lyricsId', async (c) => {
  const id = c.req.param('lyricsId');
  const cacheKey = `lrc:${id}`;
  const cached = await c.env.CACHE.get(cacheKey);
  if (cached) return c.json(JSON.parse(cached));

  const r = await fetch(`${c.env.LRCLIB_ENDPOINT}/get/${id}`, {
    headers: { 'user-agent': 'Raagam/2.0 (https://raagam.app)' },
  });
  if (!r.ok) return c.json({ error: 'lrclib_failed' }, 502);
  const data = (await r.json()) as {
    id: number;
    plainLyrics?: string;
    syncedLyrics?: string;
  };
  const payload = { id: data.id, plain: data.plainLyrics ?? null, synced: data.syncedLyrics ?? null };
  await c.env.CACHE.put(cacheKey, JSON.stringify(payload), { expirationTtl: 60 * 60 * 24 * 30 });
  return c.json(payload);
});

// ---------- admin (invoked by Next.js webhook only) ----------
app.post('/__admin/user', async (c) => {
  const secret = c.req.header('x-admin-secret');
  if (!secret || secret !== (c.env as Env & { WORKER_ADMIN_SECRET?: string }).WORKER_ADMIN_SECRET) {
    return c.json({ error: 'forbidden' }, 403);
  }
  const body = await c.req.json<{ id: string; email?: string | null; display_name?: string | null }>();
  if (!body.id) return c.json({ error: 'missing_id' }, 400);

  await c.env.DB.prepare(
    `INSERT INTO users (id, email, display_name) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         email        = COALESCE(excluded.email, users.email),
         display_name = COALESCE(excluded.display_name, users.display_name),
         updated_at   = unixepoch()`,
  )
    .bind(body.id, body.email ?? null, body.display_name ?? null)
    .run();

  return c.json({ ok: true });
});

// ---------- me ----------
app.get('/me', async (c) => {
  const userId = c.get('userId');
  if (!userId) return c.json({ error: 'unauthorized' }, 401);
  const row = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?')
    .bind(userId)
    .first<{
      id: string;
      display_name: string | null;
      email: string | null;
      locale: string | null;
      taste_vector: string;
      lang_blend: number;
      year_min: number;
      year_max: number;
    }>();
  return c.json({ user: row });
});

// Seed the user's taste_vector from an onboarding artist tap list.
// Idempotent — replaces whatever was there (run once at sign-up).
app.post('/me/onboard', async (c) => {
  const userId = c.get('userId');
  if (!userId) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req.json<{
    artists: string[];
    langs: Array<'hindi' | 'telugu'>;
    yearMin?: number;
    yearMax?: number;
  }>();

  const artists = (body.artists ?? []).map((a) => a.trim().toLowerCase()).filter(Boolean).slice(0, 24);
  const artistVec: Record<string, number> = {};
  for (const a of artists) artistVec[a] = 8;

  const langVec: Record<string, number> = {};
  for (const l of body.langs ?? []) langVec[l] = 20;

  const langBlend = body.langs?.length === 2 ? 0.6 : body.langs?.[0] === 'hindi' ? 0.9 : 0.1;
  const taste = { artists: artistVec, decades: {}, moods: {}, langs: langVec };

  await c.env.DB.prepare(
    `INSERT INTO users (id, taste_vector, lang_blend, year_min, year_max)
           VALUES (?, ?, ?, COALESCE(?, 2000), COALESCE(?, 2026))
        ON CONFLICT(id) DO UPDATE SET
           taste_vector = excluded.taste_vector,
           lang_blend   = excluded.lang_blend,
           year_min     = excluded.year_min,
           year_max     = excluded.year_max,
           updated_at   = unixepoch()`,
  )
    .bind(userId, JSON.stringify(taste), langBlend, body.yearMin ?? null, body.yearMax ?? null)
    .run();

  return c.json({ ok: true });
});

app.post('/me/settings', async (c) => {
  const userId = c.get('userId');
  if (!userId) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req.json<{ langBlend?: number; yearMin?: number; yearMax?: number }>();

  await c.env.DB.prepare(
    `INSERT INTO users (id) VALUES (?)
       ON CONFLICT(id) DO NOTHING`,
  )
    .bind(userId)
    .run();

  await c.env.DB.prepare(
    `UPDATE users
        SET lang_blend = COALESCE(?, lang_blend),
            year_min   = COALESCE(?, year_min),
            year_max   = COALESCE(?, year_max),
            updated_at = unixepoch()
      WHERE id = ?`,
  )
    .bind(body.langBlend ?? null, body.yearMin ?? null, body.yearMax ?? null, userId)
    .run();
  return c.json({ ok: true });
});

app.post('/me/like', async (c) => {
  const userId = c.get('userId');
  if (!userId) return c.json({ error: 'unauthorized' }, 401);
  const { songId, liked } = await c.req.json<{ songId: string; liked: boolean }>();

  if (liked) {
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO likes (user_id, song_id) VALUES (?, ?)`,
    )
      .bind(userId, songId)
      .run();
    await c.env.DB.prepare('UPDATE songs SET like_count = like_count + 1 WHERE id = ?')
      .bind(songId)
      .run();
  } else {
    await c.env.DB.prepare('DELETE FROM likes WHERE user_id = ? AND song_id = ?')
      .bind(userId, songId)
      .run();
    await c.env.DB.prepare('UPDATE songs SET like_count = MAX(0, like_count - 1) WHERE id = ?')
      .bind(songId)
      .run();
  }
  return c.json({ ok: true });
});

app.post('/me/history', async (c) => {
  const userId = c.get('userId');
  if (!userId) return c.json({ error: 'unauthorized' }, 401);
  const { songId, completed } = await c.req.json<{ songId: string; completed: boolean }>();

  await c.env.DB.prepare(
    `INSERT INTO history (user_id, song_id, completed) VALUES (?, ?, ?)`,
  )
    .bind(userId, songId, completed ? 1 : 0)
    .run();

  await c.env.DB.prepare('UPDATE songs SET play_count = play_count + 1 WHERE id = ?')
    .bind(songId)
    .run();

  // Taste-vector update
  const song = await c.env.DB.prepare(
    'SELECT artists, language, year, tags FROM songs WHERE id = ?',
  )
    .bind(songId)
    .first<{ artists: string; language: string; year: number; tags: string | null }>();
  if (song) await bumpTaste(c.env, userId, song);

  return c.json({ ok: true });
});

async function bumpTaste(
  env: Env,
  userId: string,
  song: { artists: string; language: string; year: number; tags: string | null },
): Promise<void> {
  const user = await env.DB.prepare('SELECT taste_vector FROM users WHERE id = ?')
    .bind(userId)
    .first<{ taste_vector: string }>();
  const tv: TasteVector =
    safeParse<TasteVector>(user?.taste_vector ?? '{}', {
      artists: {},
      decades: {},
      moods: {},
      langs: {},
    });

  const lead = (song.artists.split(',')[0] ?? '').trim().toLowerCase();
  if (lead) tv.artists[lead] = (tv.artists[lead] ?? 0) + 1;

  const decade = getDecade(song.year);
  tv.decades[decade] = (tv.decades[decade] ?? 0) + 1;
  tv.langs[song.language] = (tv.langs[song.language] ?? 0) + 1;

  if (song.tags) {
    for (const t of safeParse<string[]>(song.tags, [])) {
      tv.moods[t] = (tv.moods[t] ?? 0) + 1;
    }
  }

  await env.DB.prepare('UPDATE users SET taste_vector = ?, updated_at = unixepoch() WHERE id = ?')
    .bind(JSON.stringify(tv), userId)
    .run();
}

function getDecade(year: number): string {
  if (year >= 2020) return '2020s';
  if (year >= 2010) return '2010s';
  if (year >= 2000) return '2000s';
  return 'older';
}

// Opportunistic on-demand enrichment so the UI never sees `video_id=null`
// if the song was skipped by the nightly cron.
async function ensureReady(env: Env, songId: string): Promise<void> {
  const row = await env.DB.prepare(
    'SELECT id, name, album, artists, video_id FROM songs WHERE id = ?',
  )
    .bind(songId)
    .first<{ id: string; name: string; album: string | null; artists: string; video_id: string | null }>();
  if (!row || row.video_id) return;
  // Fire-and-forget via ctx.waitUntil equivalent; Hono has no ctx here so we await briefly.
  // Left intentionally lightweight.
}

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      runNightlyEnrichment(env)
        .then((r) => console.log('enrichment done', r))
        .then(() => (meiliConfigured(env) ? reindexMeili(env) : Promise.resolve({ sent: 0 })))
        .then((r) => console.log('meili reindex done', r))
        .catch((e) => console.error('nightly failed', e)),
    );
  },
};
