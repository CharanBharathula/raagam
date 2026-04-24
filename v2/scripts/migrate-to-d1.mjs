#!/usr/bin/env node
// ============================================================
// Legacy JS DB -> D1 migration
// ------------------------------------------------------------
// Reads ../songs-db.js + ../bollywood-songs-db.js, which define
// `class SongsDB { static SONGS_DB = [...] }` etc., and emits
// `scripts/out/songs.sql` — chunked INSERT statements ready for
// `wrangler d1 execute raagam --file=...`.
//
// Rules:
//   - Keep only 2000..2026 rows (the focus window)
//   - Normalise year to integer, strip HTML entities from names
//   - Dedupe on (name, album, artists, duration) — keep best audio
//   - Compute a seed popularity score from curated-artist hits so
//     the very first /pick has meaningful ordering.
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const TELUGU_FILE = path.join(ROOT, 'songs-db.js');
const HINDI_FILE = path.join(ROOT, 'bollywood-songs-db.js');

const OUT_DIR = path.join(__dirname, 'out');
const OUT_FILE = path.join(OUT_DIR, 'songs.sql');

const YEAR_MIN = 2000;
const YEAR_MAX = 2026;
const CHUNK_SIZE = 500; // D1 single-statement arg limit is ~2500 params

// ---------------------------------------------------------------
// Curated-artist substrings for popularity seeding.
// ---------------------------------------------------------------
const CURATED = new Set([
  'arijit singh', 'shreya ghoshal', 'sonu nigam', 'atif aslam',
  'jubin nautiyal', 'neha kakkar', 'armaan malik', 'pritam',
  'a. r. rahman', 'vishal mishra', 'b praak', 'darshan raval',
  'sid sriram', 'anurag kulkarni', 'haricharan', 'karthik',
  'thaman s', 'devi sri prasad', 's. s. thaman', 'm. m. keeravani',
  'sachin-jigar', 'tanishk bagchi', 'amit trivedi', 'shankar ehsaan loy',
  'vishal-shekhar', 'rahat fateh ali khan', 'mohit chauhan',
  'diljit dosanjh', 'jasleen royal', 'amaal mallik',
  'lata mangeshkar', 'kishore kumar', 'mohammed rafi', 'asha bhosle',
  'alka yagnik', 'udit narayan', 'kumar sanu', 'kk',
  'ilaiyaraaja', 'ghantasala', 's. p. balasubrahmanyam',
]);

function decodeEntities(s) {
  return String(s)
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'");
}

function sqlEsc(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

function extractArray(src, className) {
  // The legacy files are huge single-line JSON embedded inside `static SONGS_DB = [ ... ]`.
  // Find the opening bracket after the class declaration and walk matching brackets.
  const needle = `class ${className}`;
  const start = src.indexOf(needle);
  if (start < 0) throw new Error(`${className} not found`);
  const arrStart = src.indexOf('[', start);
  if (arrStart < 0) throw new Error(`SONGS_DB array start not found for ${className}`);

  let depth = 0;
  let inStr = false;
  let strCh = '';
  let escape = false;
  let end = -1;
  for (let i = arrStart; i < src.length; i++) {
    const ch = src[i];
    if (escape) { escape = false; continue; }
    if (inStr) {
      if (ch === '\\') { escape = true; continue; }
      if (ch === strCh) { inStr = false; }
      continue;
    }
    if (ch === '"' || ch === "'") { inStr = true; strCh = ch; continue; }
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end < 0) throw new Error('array end not found');
  const jsonSrc = src.slice(arrStart, end + 1);
  return JSON.parse(jsonSrc);
}

function normalise(raw, langOverride) {
  const year = Number.parseInt(String(raw.year ?? '').slice(0, 4), 10);
  if (!Number.isFinite(year) || year < YEAR_MIN || year > YEAR_MAX) return null;

  const duration = Number(raw.duration ?? 0);
  if (!Number.isFinite(duration) || duration < 30 || duration > 1200) return null;

  const name = decodeEntities(raw.name ?? '').trim();
  const artists = decodeEntities(raw.artists ?? '').trim();
  if (!name || !artists || !raw.id || !raw.audio) return null;

  const album = raw.album ? decodeEntities(raw.album).trim() : null;
  const language = (langOverride || raw.language || 'hindi').toLowerCase();
  if (language !== 'hindi' && language !== 'telugu') return null;

  const tags = Array.isArray(raw.tags) ? raw.tags.filter(Boolean) : [];

  // Seed popularity: curated hit + freshness. 0..100.
  let popularity = 0;
  const artistsLc = artists.toLowerCase();
  for (const c of CURATED) {
    if (artistsLc.includes(c)) { popularity += 25; break; }
  }
  if (year >= 2024) popularity += 15;
  else if (year >= 2020) popularity += 10;
  else if (year >= 2010) popularity += 5;
  popularity = Math.min(100, popularity);

  return {
    id: raw.id,
    name,
    artists,
    album,
    year,
    duration,
    language,
    audio_url: raw.audio,
    image_url: raw.image || null,
    tags: tags.length ? JSON.stringify(tags) : null,
    popularity,
  };
}

function dedupeKey(s) {
  return `${s.name.toLowerCase()}|${(s.album ?? '').toLowerCase()}|${s.artists.toLowerCase()}|${s.duration}`;
}

function main() {
  console.log('[migrate] reading legacy DBs...');
  const teluguSrc = fs.readFileSync(TELUGU_FILE, 'utf8');
  const hindiSrc = fs.readFileSync(HINDI_FILE, 'utf8');

  const telugu = extractArray(teluguSrc, 'SongsDB');
  const hindi = extractArray(hindiSrc, 'BollywoodSongsDB');
  console.log(`[migrate] parsed telugu=${telugu.length} hindi=${hindi.length}`);

  const all = [];
  for (const raw of telugu) { const n = normalise(raw, 'telugu'); if (n) all.push(n); }
  for (const raw of hindi) { const n = normalise(raw, 'hindi'); if (n) all.push(n); }

  console.log(`[migrate] after year/language filter: ${all.length}`);

  const byKey = new Map();
  for (const s of all) {
    const k = dedupeKey(s);
    const cur = byKey.get(k);
    if (!cur || s.popularity > cur.popularity) byKey.set(k, s);
  }
  const deduped = [...byKey.values()];
  console.log(`[migrate] after dedupe: ${deduped.length}`);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const cols = [
    'id', 'name', 'artists', 'album', 'year', 'duration', 'language',
    'audio_url', 'image_url', 'tags', 'popularity',
  ];

  const lines = [];
  lines.push('-- Generated by scripts/migrate-to-d1.mjs — do not edit by hand.');
  lines.push('BEGIN TRANSACTION;');
  lines.push('DELETE FROM songs;'); // idempotent reseed

  for (let i = 0; i < deduped.length; i += CHUNK_SIZE) {
    const chunk = deduped.slice(i, i + CHUNK_SIZE);
    const values = chunk
      .map((s) =>
        `(${cols.map((c) => sqlEsc(s[c])).join(',')})`,
      )
      .join(',\n');
    lines.push(`INSERT INTO songs (${cols.join(',')}) VALUES\n${values};`);
  }
  lines.push('COMMIT;');
  lines.push(`-- total rows inserted: ${deduped.length}`);

  fs.writeFileSync(OUT_FILE, lines.join('\n'), 'utf8');
  console.log(`[migrate] wrote ${OUT_FILE} (${(fs.statSync(OUT_FILE).size / 1024 / 1024).toFixed(1)} MB)`);
  console.log('[migrate] next: npm run migrate:local');
}

main();
