// ============================================================
// Blockbuster Pick v2 — the main logic.
// ------------------------------------------------------------
// Strategy:
//   1. Pull a candidate pool of up to N top-popularity songs
//      that pass hard filters (year window, language, duration).
//   2. Score each candidate with a weighted sum:
//         popularity + era bias + freshness + taste match
//         − anti-repeat penalty.
//   3. Weighted reservoir sample (Efraimidis-Spirakis) to pick
//      1 song. This gives us *weighted-random* in a single pass.
// ------------------------------------------------------------
// Complexity: O(N) per pick with N ≈ 2000 rows — well under 50 ms
// on D1 + Worker CPU. The algorithm is pure — the caller provides
// the context (user taste, excludes, year range, etc).
// ============================================================

import type { Env, PickRequest, PickResult, Song, SongRow, TasteVector } from './types';
import { rowToSong, safeParse } from './types';

const POOL_SIZE = 2000;
const EXCLUDE_RECENT = 300;
const MIN_DURATION = 90; // skip intros / ringtones

// Weights — tuned for the 2000–2026 window. Expose later in a debug panel.
const W_POP = 1.0;
const W_ERA = 0.6;
const W_FRESH = 0.4;
const W_TASTE = 1.2;
const W_MOOD = 0.8;
const PENALTY_ARTIST_RECENT = 10; // same lead artist in last 5 plays
const PENALTY_ALBUM_RECENT = 15; // same album in last 10 plays

const ERA_BOOST: Record<string, number> = {
  '2000s': 25,
  '2010s': 30,
  '2020s': 35,
};

export async function pickBlockbuster(env: Env, req: PickRequest): Promise<PickResult> {
  const years = req.years ?? [2000, 2026];
  const langs = req.langs ?? ['hindi', 'telugu'];
  const langBlend = clamp01(req.langBlend ?? 0.6); // 0 = all Telugu, 1 = all Hindi
  const excludeIds = new Set(req.excludeIds ?? []);

  // --- 1. Load candidate pool --------------------------------------------
  const placeholders = langs.map(() => '?').join(',');
  const pool = await env.DB.prepare(
    `SELECT * FROM songs
       WHERE year BETWEEN ? AND ?
         AND language IN (${placeholders})
         AND duration >= ?
       ORDER BY popularity DESC, play_count DESC
       LIMIT ?`,
  )
    .bind(years[0], years[1], ...langs, MIN_DURATION, POOL_SIZE)
    .all<SongRow>();

  let candidates = pool.results ?? [];
  if (candidates.length === 0) {
    throw new Error('no candidates in range');
  }

  // --- 2. Load user context (taste + recent history) ---------------------
  let taste: TasteVector = { artists: {}, decades: {}, moods: {}, langs: {} };
  let recentSongIds: string[] = [];
  let recentArtists: string[] = [];
  let recentAlbums: string[] = [];

  if (req.userId) {
    const user = await env.DB.prepare(
      'SELECT taste_vector FROM users WHERE id = ?',
    )
      .bind(req.userId)
      .first<{ taste_vector: string }>();
    if (user?.taste_vector) {
      taste = safeParse<TasteVector>(user.taste_vector, taste);
    }

    const hist = await env.DB.prepare(
      `SELECT s.id, s.artists, s.album
         FROM history h JOIN songs s ON s.id = h.song_id
        WHERE h.user_id = ?
        ORDER BY h.played_at DESC
        LIMIT ?`,
    )
      .bind(req.userId, EXCLUDE_RECENT)
      .all<{ id: string; artists: string; album: string | null }>();

    const rows = hist.results ?? [];
    recentSongIds = rows.map((r) => r.id);
    recentArtists = rows.slice(0, 5).map((r) => leadArtist(r.artists));
    recentAlbums = rows.slice(0, 10).map((r) => r.album ?? '').filter(Boolean);
  }

  const recentSongSet = new Set([...recentSongIds, ...excludeIds]);
  const recentArtistSet = new Set(recentArtists.map((s) => s.toLowerCase()));
  const recentAlbumSet = new Set(recentAlbums.map((s) => s.toLowerCase()));

  // --- 3. Filter hard excludes -------------------------------------------
  candidates = candidates.filter((c) => !recentSongSet.has(c.id));
  if (candidates.length === 0) {
    // Soft fallback: ignore history if it's eaten the whole pool.
    candidates = pool.results ?? [];
  }

  // --- 4. Language blend re-weighting ------------------------------------
  // We want results to roughly respect `langBlend` — so we partition
  // candidates by language and weight by the target ratio.
  const wantHindi = langs.includes('hindi') ? langBlend : 0;
  const wantTelugu = langs.includes('telugu') ? 1 - langBlend : 0;
  const sum = wantHindi + wantTelugu || 1;
  const langWeight: Record<string, number> = {
    hindi: wantHindi / sum,
    telugu: wantTelugu / sum,
  };

  // --- 5. Score + weighted reservoir sample ------------------------------
  let best: { row: SongRow; score: number; key: number } | null = null;

  for (const row of candidates) {
    const score = scoreSong(row, {
      taste,
      recentArtists: recentArtistSet,
      recentAlbums: recentAlbumSet,
      moods: req.moods,
      langWeight,
    });
    if (score <= 0) continue;

    // Efraimidis-Spirakis key: r^(1/w), keep max
    const r = Math.random();
    const key = Math.pow(r, 1 / score);
    if (!best || key > best.key) best = { row, score, key };
  }

  if (!best) {
    // Nothing scored positively — fall back to uniform pick from filtered pool.
    const row = candidates[Math.floor(Math.random() * candidates.length)];
    return { song: rowToSong(row), score: 0, reason: 'uniform-fallback' };
  }

  return {
    song: rowToSong(best.row),
    score: best.score,
    reason: 'weighted-reservoir',
  };
}

// ------------------------------------------------------------

interface ScoreCtx {
  taste: TasteVector;
  recentArtists: Set<string>;
  recentAlbums: Set<string>;
  moods?: string[];
  langWeight: Record<string, number>;
}

function scoreSong(row: SongRow, ctx: ScoreCtx): number {
  const decade = getDecade(row.year);
  const artistsLc = row.artists.toLowerCase();
  const lead = leadArtist(row.artists).toLowerCase();
  const album = (row.album ?? '').toLowerCase();

  let score = 0;

  // 1. Popularity proxy (0..100) scaled
  score += W_POP * row.popularity;

  // 2. Era bias (raw boost)
  score += W_ERA * (ERA_BOOST[decade] ?? 5);

  // 3. Freshness — 2024..now gets an extra nudge
  if (row.year >= 2024) score += W_FRESH * (row.year - 2023) * 8;

  // 4. Taste match
  for (const [artist, hits] of Object.entries(ctx.taste.artists)) {
    if (artistsLc.includes(artist.toLowerCase())) {
      score += W_TASTE * Math.min(hits, 20);
      break;
    }
  }
  const decadeTaste = ctx.taste.decades[decade] ?? 0;
  score += W_TASTE * Math.min(decadeTaste, 30) * 0.3;

  // 5. Mood match (if requested)
  if (ctx.moods?.length && row.tags) {
    const tags = safeParse<string[]>(row.tags, []);
    const hit = ctx.moods.some((m) => tags.includes(m));
    if (hit) score += W_MOOD * 40;
    else score *= 0.3; // strong deprioritisation if mood requested + no match
  }

  // 6. Language weight
  score *= ctx.langWeight[row.language] ?? 1;

  // 7. Anti-repeat penalties
  if (ctx.recentArtists.has(lead)) score -= PENALTY_ARTIST_RECENT;
  if (album && ctx.recentAlbums.has(album)) score -= PENALTY_ALBUM_RECENT;

  return Math.max(0, score);
}

function leadArtist(artists: string): string {
  return (artists.split(',')[0] ?? '').trim();
}

function getDecade(year: number): string {
  if (year >= 2020) return '2020s';
  if (year >= 2010) return '2010s';
  if (year >= 2000) return '2000s';
  if (year >= 1990) return '1990s';
  if (year >= 1980) return '1980s';
  return 'pre1980';
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}
