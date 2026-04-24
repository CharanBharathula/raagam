// ============================================================
// Nightly enrichment cron.
//   1. For songs missing video_id: look up YouTube via API or Piped proxy
//   2. For songs missing lyrics_id: look up LRCLib
//   3. Batch size ~300/run so we stay inside Worker CPU budget
//   4. Popularity recalc: play_count + like_count + curated boost
// ============================================================

import type { Env, SongRow } from './types';

const BATCH_SIZE = 300;

export async function runNightlyEnrichment(env: Env): Promise<{
  video_filled: number;
  lyrics_filled: number;
  popularity_rescored: number;
}> {
  const [video, lyrics, pop] = await Promise.all([
    fillMissingVideoIds(env),
    fillMissingLyrics(env),
    recomputePopularity(env),
  ]);
  return { video_filled: video, lyrics_filled: lyrics, popularity_rescored: pop };
}

async function fillMissingVideoIds(env: Env): Promise<number> {
  const rows = await env.DB.prepare(
    `SELECT id, name, album, artists FROM songs
      WHERE video_id IS NULL
      ORDER BY popularity DESC
      LIMIT ?`,
  )
    .bind(BATCH_SIZE)
    .all<Pick<SongRow, 'id' | 'name' | 'album' | 'artists'>>();

  let filled = 0;
  for (const r of rows.results ?? []) {
    const query = `${r.name} ${r.album ?? ''} ${r.artists}`.slice(0, 120);
    const id = await resolveYouTubeId(env, query);
    if (id) {
      await env.DB.prepare('UPDATE songs SET video_id = ?, enriched_at = unixepoch() WHERE id = ?')
        .bind(id, r.id)
        .run();
      filled++;
    }
  }
  return filled;
}

async function fillMissingLyrics(env: Env): Promise<number> {
  const rows = await env.DB.prepare(
    `SELECT id, name, artists, album, duration FROM songs
      WHERE lyrics_id IS NULL
      ORDER BY popularity DESC
      LIMIT ?`,
  )
    .bind(BATCH_SIZE)
    .all<Pick<SongRow, 'id' | 'name' | 'artists' | 'album' | 'duration'>>();

  let filled = 0;
  for (const r of rows.results ?? []) {
    const id = await resolveLrcLib(env, r);
    if (id) {
      await env.DB.prepare('UPDATE songs SET lyrics_id = ? WHERE id = ?').bind(id, r.id).run();
      filled++;
    }
  }
  return filled;
}

async function recomputePopularity(env: Env): Promise<number> {
  // popularity = log1p(play_count)*10 + log1p(like_count)*15 + curated_boost (0|15|25)
  const res = await env.DB.prepare(
    `UPDATE songs
        SET popularity = MIN(100,
              (0.0 + CAST(play_count AS REAL)) * 0.05
            + (0.0 + CAST(like_count AS REAL)) * 0.2
            + CASE
                WHEN EXISTS (
                  SELECT 1 FROM curated_artists c
                   WHERE INSTR(LOWER(songs.artists), c.name) > 0
                     AND (c.language = songs.language OR c.language = 'both')
                ) THEN 25 ELSE 0
              END
            + CASE WHEN year >= 2020 THEN 10 ELSE 0 END
          )`,
  ).run();
  return res.meta.changes ?? 0;
}

// ---------- external services ----------

async function resolveYouTubeId(env: Env, query: string): Promise<string | null> {
  // Try Piped first (no API key). Fall back to YouTube Data API if key present.
  try {
    const url = `${env.YT_PROXY_ENDPOINT}/search?q=${encodeURIComponent(query)}&filter=music_songs`;
    const r = await fetch(url, { headers: { 'user-agent': 'raagam/2' } });
    if (r.ok) {
      const data = (await r.json()) as { items?: Array<{ url?: string; type?: string }> };
      const item = data.items?.find((i) => i.type === 'stream' && i.url?.includes('watch?v='));
      const m = item?.url?.match(/v=([\w-]{11})/);
      if (m) return m[1];
    }
  } catch {
    // swallow, try next
  }

  if (!env.YOUTUBE_API_KEY) return null;

  try {
    const url =
      'https://www.googleapis.com/youtube/v3/search' +
      `?part=snippet&type=video&maxResults=1&q=${encodeURIComponent(query)}` +
      `&key=${env.YOUTUBE_API_KEY}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const data = (await r.json()) as { items?: Array<{ id: { videoId: string } }> };
    return data.items?.[0]?.id.videoId ?? null;
  } catch {
    return null;
  }
}

async function resolveLrcLib(
  env: Env,
  r: { name: string; artists: string; album: string | null; duration: number },
): Promise<number | null> {
  const params = new URLSearchParams({
    track_name: r.name,
    artist_name: (r.artists.split(',')[0] ?? '').trim(),
    album_name: r.album ?? '',
    duration: String(r.duration),
  });
  try {
    const res = await fetch(`${env.LRCLIB_ENDPOINT}/get?${params.toString()}`, {
      headers: { 'user-agent': 'Raagam/2.0 (https://raagam.app)' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { id?: number };
    return data.id ?? null;
  } catch {
    return null;
  }
}
