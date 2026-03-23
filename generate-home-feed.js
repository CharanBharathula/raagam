const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const API_BASE = process.env.RAAGAM_API_BASE || 'https://jiosaavn-api-privatecvc2.vercel.app';
const OUTPUT_FILE = path.join(__dirname, 'data', 'home-feed.json');
const LIMIT_PER_QUERY = 35;
const REQUEST_DELAY_MS = 170;
const API_FETCH_LIMIT = 110;

const now = new Date();
const CURRENT_YEAR = now.getUTCFullYear();
const yearStart = Date.UTC(now.getUTCFullYear(), 0, 1);
const daySeed = Math.floor((Date.now() - yearStart) / 86400000);
const monthToken = now.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });

const TELUGU_DISCOVERY_QUERIES = [
  `new telugu songs ${CURRENT_YEAR}`,
  `${monthToken} telugu songs ${CURRENT_YEAR}`,
  `latest telugu songs ${CURRENT_YEAR}`,
  `tollywood songs ${CURRENT_YEAR}`,
  `top telugu songs`,
  `telugu chartbusters`,
  `devi sri prasad hits`,
  `thaman s hits`,
  `sid sriram telugu hits`,
  `sp balasubrahmanyam telugu`,
  `ks chithra telugu songs`,
  `keeravani songs telugu`,
  `anirudh telugu songs`,
  `telugu melody hits`,
  `telugu mass songs`,
  `telugu movie songs`
];

const HINDI_DISCOVERY_QUERIES = [
  `new hindi songs ${CURRENT_YEAR}`,
  `${monthToken} bollywood songs ${CURRENT_YEAR}`,
  `latest bollywood songs ${CURRENT_YEAR}`,
  `hindi top 50 songs`,
  `bollywood chartbusters`,
  `arijit singh hits`,
  `shreya ghoshal hits`,
  `sonu nigam hits`,
  `kishore kumar songs`,
  `lata mangeshkar songs`,
  `shah rukh khan songs`,
  `salman khan songs`,
  `amitabh bachchan songs`,
  `ranbir kapoor songs`,
  `aamir khan songs`,
  `romantic bollywood songs`
];

const TELUGU_COLLECTIONS = [
  { title: 'DSP Essentials', subtitle: 'Devi Sri Prasad blockbuster tracks', keywords: ['devi sri prasad', 'dsp'] },
  { title: 'Thaman Fire', subtitle: 'High-energy Thaman tracks', keywords: ['thaman', 's.s. thaman', 'ss thaman'] },
  { title: 'Sid Sriram Favourites', subtitle: 'Top Telugu songs by Sid Sriram', keywords: ['sid sriram'] },
  { title: 'SPB Classics', subtitle: 'Timeless S.P. Balasubrahmanyam hits', keywords: ['s.p. balasubrahmanyam', 'sp balasubrahmanyam', 'spb'] },
  { title: 'Chitra Evergreen', subtitle: 'K. S. Chithra evergreen melodies', keywords: ['k.s. chithra', 'ks chithra', 'chitra'] },
  { title: 'Keeravani Gold', subtitle: 'Best of M. M. Keeravani', keywords: ['keeravani', 'm.m. keeravani', 'mm keeravani'] }
];

const HINDI_COLLECTIONS = [
  { title: 'Arijit Singh Hits', subtitle: 'Most-loved Arijit songs', keywords: ['arijit singh'] },
  { title: 'SRK Blockbusters', subtitle: 'Popular songs from Shah Rukh Khan films', keywords: ['shah rukh', 'srk', 'pathaan', 'jawan', 'dilwale', 'veer zaara', 'kal ho naa ho', 'ddlj'] },
  { title: 'Salman Khan Essentials', subtitle: 'Popular songs from Salman Khan films', keywords: ['salman khan', 'wanted', 'dabangg', 'tiger', 'bajrangi', 'kick'] },
  { title: 'Amitabh Bachchan Classics', subtitle: 'Evergreen songs from Amitabh films', keywords: ['amitabh bachchan', 'don', 'silsila', 'kabhi kabhie', 'sholay'] },
  { title: 'Shreya Ghoshal Favourites', subtitle: 'Top tracks by Shreya Ghoshal', keywords: ['shreya ghoshal'] },
  { title: 'Golden Voices', subtitle: 'Kishore, Lata and Sonu classics', keywords: ['kishore kumar', 'lata mangeshkar', 'sonu nigam'] }
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: 16000 }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
  });
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function normalizeLanguage(rawLanguage, fallbackLanguage) {
  const lower = String(rawLanguage || '').toLowerCase();
  if (lower.includes('telugu')) return 'telugu';
  if (lower.includes('hindi') || lower.includes('urdu')) return 'hindi';
  return fallbackLanguage;
}

function pickDownloadUrl(downloads) {
  if (!downloads) return '';
  if (typeof downloads === 'string') return downloads;
  if (!Array.isArray(downloads) || !downloads.length) return '';

  const sorted = downloads
    .map(item => {
      if (!item) return null;
      const quality = parseInt(String(item.quality || item.bitrate || '').replace(/\D/g, ''), 10) || 0;
      const link = item.link || item.url || '';
      return link ? { link, quality } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.quality - a.quality);

  return sorted[0]?.link || '';
}

function pickImage(images) {
  if (!images) return '';
  if (typeof images === 'string') return images;
  if (!Array.isArray(images) || !images.length) return '';

  const sorted = images
    .map(item => {
      const quality = parseInt(String(item?.quality || '').replace(/\D/g, ''), 10) || 0;
      const link = item?.link || item?.url || '';
      return link ? { link, quality } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.quality - a.quality);

  return sorted[0]?.link || '';
}

function normalizeSong(raw, fallbackLanguage) {
  if (!raw?.id) return null;

  const language = normalizeLanguage(raw.language, fallbackLanguage);
  if (fallbackLanguage === 'telugu' && language !== 'telugu') return null;
  if (fallbackLanguage === 'hindi' && language !== 'hindi') return null;

  const song = {
    id: String(raw.id),
    name: decodeHtml(raw.name || raw.title || ''),
    artists: decodeHtml(raw.primaryArtists || raw.artists || raw.artist || ''),
    album: decodeHtml(typeof raw.album === 'object' ? raw.album?.name : raw.album || ''),
    year: String(raw.year || ''),
    duration: parseInt(raw.duration || 0, 10) || 0,
    audio: pickDownloadUrl(raw.downloadUrl || raw.media_url),
    image: pickImage(raw.image || raw.images),
    language
  };

  if (!song.name || !song.audio) return null;
  if (song.duration > 0 && song.duration < 30) return null;
  return song;
}

async function searchSongs(query) {
  const url = `${API_BASE}/search/songs?query=${encodeURIComponent(query)}&limit=${API_FETCH_LIMIT}`;
  const payload = await fetchJson(url);
  return payload?.data?.results || [];
}

function rankEntries(scoreMap, songsById) {
  return Array.from(scoreMap.entries())
    .map(([id, score]) => ({ id, score, song: songsById.get(id) }))
    .filter(entry => !!entry.song)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (parseInt(b.song.year || 0, 10) || 0) - (parseInt(a.song.year || 0, 10) || 0);
    });
}

function uniqueIds(ids) {
  const seen = new Set();
  const out = [];
  for (const id of ids || []) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function rotateBySeed(ids, seed, maxShift = 7) {
  const list = uniqueIds(ids);
  if (!list.length) return list;
  const shift = seed % Math.max(1, Math.min(maxShift, list.length));
  return list.slice(shift).concat(list.slice(0, shift));
}

function normalizeForText(value) {
  return decodeHtml(String(value || ''))
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function songText(song) {
  return normalizeForText(`${song?.name || ''} ${song?.artists || ''} ${song?.album || ''}`);
}

function buildCollection(def, rankedSongs, staticSongs) {
  const fromRanked = rankedSongs
    .filter(entry => def.keywords.some(keyword => songText(entry.song).includes(keyword)))
    .map(entry => entry.song.id);

  const fromStatic = staticSongs
    .filter(song => def.keywords.some(keyword => songText(song).includes(keyword)))
    .map(song => song.id);

  const ids = uniqueIds([...fromRanked, ...fromStatic]).slice(0, 30);
  if (ids.length < 6) return null;

  return {
    title: def.title,
    subtitle: def.subtitle,
    count: ids.length,
    songIds: ids
  };
}

function loadStaticDB(fileName, fallbackLanguage) {
  const filePath = path.join(__dirname, fileName);
  if (!fs.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(/static SONGS_DB = (\[[\s\S]*?\]);/);
  if (!match?.[1]) return [];

  let rawSongs = [];
  try {
    rawSongs = JSON.parse(match[1]);
  } catch (e) {
    rawSongs = Function(`return ${match[1]}`)();
  }

  return (rawSongs || [])
    .map(song => normalizeSong(song, fallbackLanguage))
    .filter(Boolean);
}

async function gatherLanguageScores(language, queries, songsById) {
  const scoreMap = new Map();

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    const weight = Math.max(2, queries.length - i);

    try {
      const rows = await searchSongs(query);
      for (let idx = 0; idx < rows.length && idx < LIMIT_PER_QUERY; idx++) {
        const song = normalizeSong(rows[idx], language);
        if (!song) continue;

        songsById.set(song.id, song);
        const year = parseInt(song.year || 0, 10) || 0;
        const recency = year >= CURRENT_YEAR ? 16 : year >= CURRENT_YEAR - 1 ? 10 : year >= CURRENT_YEAR - 2 ? 6 : year >= CURRENT_YEAR - 4 ? 3 : 0;
        const score = (LIMIT_PER_QUERY - idx) * weight + recency;
        scoreMap.set(song.id, (scoreMap.get(song.id) || 0) + score);
      }
    } catch (e) {
      // keep moving so daily feed still gets generated with best effort
    }

    await sleep(REQUEST_DELAY_MS);
  }

  return scoreMap;
}

function buildLanguagePayload(language, ranked, staticSongs, collectionDefs, seed) {
  const rankedSongs = ranked.map(entry => entry.song);
  const rankedIds = rankedSongs.map(song => song.id);

  const recentRanked = rankedSongs
    .filter(song => (parseInt(song.year || 0, 10) || 0) >= CURRENT_YEAR - 1)
    .map(song => song.id);

  const staticRecent = staticSongs
    .slice()
    .sort((a, b) => (parseInt(b.year || 0, 10) || 0) - (parseInt(a.year || 0, 10) || 0))
    .map(song => song.id);

  const newReleases = rotateBySeed(uniqueIds([...recentRanked, ...rankedIds, ...staticRecent]), seed).slice(0, 12);
  const top50 = rotateBySeed(uniqueIds([...rankedIds, ...staticRecent]), seed + 4, 5).slice(0, 50);

  const collections = collectionDefs
    .map(def => buildCollection(def, ranked, staticSongs))
    .filter(Boolean)
    .slice(0, 8);

  return { newReleases, top50, collections };
}

async function main() {
  const songsById = new Map();

  const staticTelugu = loadStaticDB('songs-db.js', 'telugu');
  const staticHindi = loadStaticDB('bollywood-songs-db.js', 'hindi');
  staticTelugu.forEach(song => songsById.set(song.id, song));
  staticHindi.forEach(song => songsById.set(song.id, song));

  const [teluguScores, hindiScores] = await Promise.all([
    gatherLanguageScores('telugu', TELUGU_DISCOVERY_QUERIES, songsById),
    gatherLanguageScores('hindi', HINDI_DISCOVERY_QUERIES, songsById)
  ]);

  const teluguRanked = rankEntries(teluguScores, songsById);
  const hindiRanked = rankEntries(hindiScores, songsById);

  const teluguPayload = buildLanguagePayload('telugu', teluguRanked, staticTelugu, TELUGU_COLLECTIONS, daySeed + 2);
  const hindiPayload = buildLanguagePayload('hindi', hindiRanked, staticHindi, HINDI_COLLECTIONS, daySeed + 11);

  const usedIds = new Set([
    ...teluguPayload.newReleases,
    ...teluguPayload.top50,
    ...hindiPayload.newReleases,
    ...hindiPayload.top50,
    ...teluguPayload.collections.flatMap(item => item.songIds),
    ...hindiPayload.collections.flatMap(item => item.songIds)
  ]);

  const songs = Array.from(usedIds)
    .map(id => songsById.get(id))
    .filter(Boolean)
    .sort((a, b) => {
      if (a.language !== b.language) return a.language.localeCompare(b.language);
      return (parseInt(b.year || 0, 10) || 0) - (parseInt(a.year || 0, 10) || 0);
    });

  const payload = {
    generatedAt: new Date().toISOString(),
    source: API_BASE,
    seed: daySeed,
    songs,
    languages: {
      telugu: teluguPayload,
      hindi: hindiPayload
    }
  };

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(payload, null, 2));

  console.log(`home-feed generated: songs=${songs.length} teluguTop=${teluguPayload.top50.length} hindiTop=${hindiPayload.top50.length}`);
}

main().catch(err => {
  console.error('Failed to generate home feed:', err);
  process.exit(1);
});
