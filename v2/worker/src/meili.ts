// ============================================================
// Meilisearch integration.
// ------------------------------------------------------------
// - `searchMeili`     — called by /search when MEILI_HOST + MEILI_ADMIN_KEY
//                       are set; returns up to 50 hits ordered by relevance
//                       with typo tolerance baked in.
// - `reindexMeili`    — nightly upsert of ALL songs in paged batches. The
//                       `songs` index settings (searchable, filterable,
//                       sortable) are applied once and then re-applied
//                       idempotently on every run — cheap.
//
// No @meilisearch client dependency here; we hit the REST API directly to
// keep the Worker bundle minimal.
// ============================================================

import type { Env, Song, SongRow } from './types';
import { rowToSong } from './types';

interface MeiliHit {
  id: string;
  name: string;
  artists: string;
  album: string | null;
  year: number;
  duration: number;
  language: 'hindi' | 'telugu';
  audio_url: string;
  image_url: string | null;
  tags: string[];
  popularity: number;
  video_id: string | null;
  lyrics_id: number | null;
}

interface MeiliEnv {
  MEILI_HOST?: string;
  MEILI_ADMIN_KEY?: string;
}

export function meiliConfigured(env: Env & MeiliEnv): boolean {
  return !!(env.MEILI_HOST && env.MEILI_ADMIN_KEY);
}

export async function searchMeili(
  env: Env & MeiliEnv,
  params: { q: string; lang?: string; yearMin: number; yearMax: number; limit?: number },
): Promise<Song[] | null> {
  if (!meiliConfigured(env)) return null;

  const filter: string[] = [
    `year >= ${params.yearMin}`,
    `year <= ${params.yearMax}`,
  ];
  if (params.lang) filter.push(`language = "${params.lang}"`);

  const r = await fetch(`${env.MEILI_HOST}/indexes/songs/search`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.MEILI_ADMIN_KEY}`,
    },
    body: JSON.stringify({
      q: params.q,
      limit: params.limit ?? 50,
      filter,
      sort: ['popularity:desc'],
      attributesToHighlight: [],
    }),
  });
  if (!r.ok) return null;
  const data = (await r.json()) as { hits: MeiliHit[] };
  return data.hits.map(hitToSong);
}

function hitToSong(h: MeiliHit): Song {
  return {
    id: h.id,
    name: h.name,
    artists: h.artists.split(',').map((s) => s.trim()).filter(Boolean),
    album: h.album,
    year: h.year,
    duration: h.duration,
    language: h.language,
    audioUrl: h.audio_url,
    imageUrl: h.image_url,
    tags: h.tags ?? [],
    videoId: h.video_id,
    lyricsId: h.lyrics_id,
    colors: { primary: null, dark: null, light: null },
    popularity: h.popularity,
  };
}

// ---------------------------------------------------------------
// Reindex — called by the nightly cron. Paginates through D1.
// ---------------------------------------------------------------
const PAGE_SIZE = 1000;

export async function reindexMeili(env: Env & MeiliEnv): Promise<{ sent: number }> {
  if (!meiliConfigured(env)) return { sent: 0 };

  await ensureSettings(env);

  let offset = 0;
  let sent = 0;
  for (;;) {
    const rows = await env.DB.prepare(
      `SELECT id, name, artists, album, year, duration, language, audio_url,
              image_url, tags, popularity, video_id, lyrics_id
         FROM songs
         ORDER BY id
         LIMIT ? OFFSET ?`,
    )
      .bind(PAGE_SIZE, offset)
      .all<SongRow>();

    const batch = rows.results ?? [];
    if (batch.length === 0) break;

    const docs = batch.map((r) => ({
      id: r.id,
      name: r.name,
      artists: r.artists,
      album: r.album,
      year: r.year,
      duration: r.duration,
      language: r.language,
      audio_url: r.audio_url,
      image_url: r.image_url,
      tags: r.tags ? JSON.parse(r.tags) : [],
      popularity: r.popularity,
      video_id: r.video_id,
      lyrics_id: r.lyrics_id,
    }));

    const resp = await fetch(`${env.MEILI_HOST}/indexes/songs/documents`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.MEILI_ADMIN_KEY}`,
      },
      body: JSON.stringify(docs),
    });
    if (!resp.ok) throw new Error(`meili index failed: ${resp.status}`);
    sent += docs.length;
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return { sent };
}

async function ensureSettings(env: Env & MeiliEnv): Promise<void> {
  // Idempotent settings — Meili compares and no-ops if unchanged.
  await fetch(`${env.MEILI_HOST}/indexes/songs/settings`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.MEILI_ADMIN_KEY}`,
    },
    body: JSON.stringify({
      searchableAttributes: ['name', 'artists', 'album'],
      filterableAttributes: ['language', 'year', 'tags'],
      sortableAttributes: ['popularity', 'year'],
      rankingRules: ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness'],
      typoTolerance: {
        minWordSizeForTypos: { oneTypo: 4, twoTypos: 8 },
      },
    }),
  }).catch(() => {});
}
