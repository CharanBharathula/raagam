// app.js — Raagam v6: Auth-gated Telugu & Bollywood Music Player with Offline Support
const audio = new Audio();
audio.crossOrigin = 'anonymous';
let currentSong = null;
let isPlaying = false;
let history = [];
let historyIndex = -1;
let lyricsVisible = false;
let isLoadingNext = false;
let syncedLyrics = [];
let lyricsTimer = null;
let activeLanguage = 'telugu';
let consecutiveErrors = 0;
const VOICE_MODE_KEY = 'raagam_voice_mode';
const VOCAL_ALT_CACHE_KEY = 'raagam_vocal_alt_cache_v1';
const VOICE_MODE_LABELS = {
  normal: 'Normal',
  vocal: 'Vocal Hide'
};
let voiceMode = 'normal';
let vocalAltCache = {};
let vocalHideOriginalSong = null;
let vocalHideSourceSongId = null;
let vocalHideTransitioning = false;
let vocalTargetTime = null;

let homeFeed = null;
let homeFeedLoaded = false;
let homeFeedLoading = null;
const HOME_FEED_URL = 'data/home-feed.json';
const HOME_FEED_CACHE_KEY = 'raagam_home_feed_cache_v1';
const HOME_FEED_TTL_MS = 6 * 60 * 60 * 1000;

let searchResultCache = new Map();
let lastSearchQueryNorm = '';
let lastSearchEntryPool = [];
let searchWarmupStarted = false;
let lyricManualSeekAt = 0;

// Smart shuffle state
const DECADE_WEIGHTS = { '2020s': 30, '2010s': 25, '2000s': 20, '1990s': 15, '1980s': 8, 'pre1980': 2 };
const RECENTLY_PLAYED_WINDOW = 200;
const RECENT_ALBUM_WINDOW = 3;
const MIN_SONG_DURATION = 60;
let recentlyPlayedIds = new Set();
let recentAlbums = [];
let eraLock = null; // null = all decades, or '2020s', '2010s', etc.
let currentUser = null;
let authMode = 'login';
let currentAudioFallbackUrls = [];
let currentAudioFallbackIndex = 0;
let currentSongStreamRefreshed = false;
const RELEASE_MARKER = '29';
const AAC_CODEC = 'audio/mp4; codecs="mp4a.40.2"';
let hasShownCodecWarning = false;

function supportsAacMp4() {
  try {
    const probe = document.createElement('audio');
    return !!probe.canPlayType && probe.canPlayType(AAC_CODEC) !== '';
  } catch (e) {
    return true;
  }
}

// Offline download tracking
let downloadedSongs = {}; // { songId: { name, artists, image, audio, album, year, language } }
let downloadingUrls = new Set(); // Currently downloading URLs

// Song preview (Spotify-like hover) state
const previewAudio = new Audio();
previewAudio.crossOrigin = 'anonymous';
let previewSongId = null;
let previewShowTimeout = null;
let previewFadeInTimer = null;
let previewFadeOutTimer = null;
let previewsInitialized = false;
const PREVIEW_MAX_VOLUME = 0.38;
const PREVIEW_FADE_IN_STEP = 0.04;
const PREVIEW_FADE_OUT_STEP = 0.08;

const IS_MOBILE = (() => {
  try {
    return /Android|iPhone|iPad|iPod|Mobile|Opera Mini|IEMobile/i.test(navigator.userAgent || '')
      || (window.matchMedia && window.matchMedia('(max-width: 900px)').matches);
  } catch (e) {
    return false;
  }
})();

let homeShelvesRendered = { telugu: false, hindi: false };
let fallbackHomeCache = {};
let latestTimeUiUpdateAt = 0;
let latestMediaSyncAt = 0;

// Player media mode state (audio artwork / video)
let currentMediaMode = 'audio';
let currentVideoUrl = '';
let currentVideoContent = 'visualizer'; // 'visualizer' | 'video' | 'youtube'
let ytPrewarmed = false; // true when yt-iframe is silently pre-buffering with mute=1
let pendingVideoSearch = null; // Promise for the current song's video ID search
let lastYouTubeSyncAt = 0;

const PIPED_INSTANCES = [
  'pipedapi.kavin.rocks',
  'pipedapi.tokhmi.xyz',
  'pipedapi.moomoo.me',
  'pipedapi.adminforge.de',
  'api.piped.yt',
  'piped-api.garudalinux.org',
  'pipedapi.in.projectsegfau.lt'
];
const INVIDIOUS_INSTANCES = [
  'invidious.privacydev.net',
  'vid.puffyan.us',
  'yt.artemislena.eu',
  'invidious.flokinet.to',
  'invidious.fdn.fr',
  'yewtu.be'
];
const PIPED_TIMEOUT_MS = IS_MOBILE ? 2600 : 4200;
let youtubeApiQuotaExhausted = false;
// songId → { videoId: string|null, searched: boolean }
const videoSearchCache = {};

const LRCLIB_API = 'https://lrclib.net/api/search';

const MATCH_STOP_WORDS = new Set([
  'the', 'a', 'an', 'song', 'songs', 'video', 'official', 'audio', 'full', 'lyrical', 'lyrics',
  'from', 'movie', 'film', 'hd', 'hq', 'ft', 'feat', 'featuring', 'and', 'with'
]);

let searchIndex = [];
let searchIndexCount = -1;
let searchEntryById = new Map();

function normalizeForMatch(value) {
  return decodeHtml(String(value || ''))
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeForMatch(value) {
  return normalizeForMatch(value)
    .split(' ')
    .filter(Boolean)
    .filter(token => token.length > 1 && !MATCH_STOP_WORDS.has(token));
}

function overlapScore(sourceTokens, targetTokens) {
  if (!sourceTokens.length || !targetTokens.length) return 0;
  const targetSet = new Set(targetTokens);
  let matched = 0;
  for (const token of sourceTokens) {
    if (targetSet.has(token)) matched++;
  }
  return matched / sourceTokens.length;
}

function getSongArtistSeed(song) {
  return decodeHtml((song?.artists || '').split(',')[0] || '').trim();
}

function buildVideoSearchQueries(song) {
  const name = decodeHtml(song?.name || '').trim();
  const album = decodeHtml(song?.album || '').trim();
  const artist = getSongArtistSeed(song);
  const langHint = (song?.language || '').toLowerCase() === 'hindi' ? 'hindi' : 'telugu';
  return [
    `${name} ${artist} official video`,
    `${name} ${artist} ${album} video`,
    `${name} ${artist} ${langHint} movie song`,
    `${name} ${langHint} song video`,
    `${name} ${artist} song`,
    `${name} official song`
  ];
}

function scoreYouTubeCandidate(song, candidate) {
  const songNameTokens = tokenizeForMatch(song?.name || '');
  const artistTokens = tokenizeForMatch(getSongArtistSeed(song));
  const albumTokens = tokenizeForMatch(song?.album || '');

  const titleNorm = normalizeForMatch(candidate?.title || '');
  const titleTokens = tokenizeForMatch(candidate?.title || '');
  const channelTokens = tokenizeForMatch(candidate?.channel || '');

  const titleMatch = overlapScore(songNameTokens, titleTokens);
  const artistMatch = Math.max(overlapScore(artistTokens, titleTokens), overlapScore(artistTokens, channelTokens));
  const albumMatch = overlapScore(albumTokens, titleTokens);

  let score = titleMatch * 0.62 + artistMatch * 0.3 + albumMatch * 0.08;

  if (/karaoke|cover|remix|nightcore|sped up|slowed|instrumental|dj/i.test(titleNorm)) score -= 0.35;
  if (/teaser|trailer|reaction|review|status|shorts/i.test(titleNorm)) score -= 0.25;
  if (/scene|bgm|theme|trending|teaser|promo/i.test(titleNorm)) score -= 0.18;
  if (/official|video|4k|hd|lyrics?/i.test(titleNorm)) score += 0.08;

  const songTitleNorm = normalizeForMatch(song?.name || '');
  const artistNorm = normalizeForMatch(getSongArtistSeed(song));
  if (songTitleNorm && titleNorm.includes(songTitleNorm)) score += 0.2;
  if (artistNorm && (titleNorm.includes(artistNorm) || normalizeForMatch(candidate?.channel || '').includes(artistNorm))) {
    score += 0.12;
  }

  return score;
}

function bestVideoCandidate(song, candidates) {
  let best = null;
  for (const candidate of candidates || []) {
    const id = String(candidate?.videoId || '').trim();
    if (!id || id.length !== 11) continue;
    const score = scoreYouTubeCandidate(song, candidate);
    const hasMeta = !!String(candidate?.title || '').trim() || !!String(candidate?.channel || '').trim();
    if (!best || score > best.score) {
      best = { id, score, hasMeta };
    }
  }
  return best;
}

function pickVideoIdFromCandidates(song, candidates, minScore = 0.34) {
  const best = bestVideoCandidate(song, candidates);
  if (!best) return null;
  if (best.score >= minScore) return best.id;

  // Proxy results may not include title/channel metadata; prefer availability in that case.
  if (!best.hasMeta && best.score >= 0.08) return best.id;

  const allNoMeta = (candidates || []).every(c => !String(c?.title || '').trim() && !String(c?.channel || '').trim());
  if (allNoMeta) {
    const fallback = (candidates || []).find(c => String(c?.videoId || '').trim().length === 11);
    return fallback?.videoId || null;
  }
  return null;
}

function fallbackVideoIdFromCandidates(song, candidates) {
  const nameNorm = normalizeForMatch(song?.name || '');
  const artistNorm = normalizeForMatch(getSongArtistSeed(song));
  for (const candidate of candidates || []) {
    const id = String(candidate?.videoId || '').trim();
    if (id.length !== 11) continue;
    const titleNorm = normalizeForMatch(candidate?.title || '');
    const channelNorm = normalizeForMatch(candidate?.channel || '');
    if (nameNorm && titleNorm.includes(nameNorm)) {
      if (!artistNorm || titleNorm.includes(artistNorm) || channelNorm.includes(artistNorm)) return id;
    }
  }
  const first = (candidates || []).find(c => String(c?.videoId || '').trim().length === 11);
  return first?.videoId || null;
}

function updateVideoAvailability(hasVideo) {
  const switchEl = document.getElementById('media-switch');
  if (!switchEl) return;
  switchEl.classList.toggle('hidden', !hasVideo);
  if (!hasVideo && currentMediaMode === 'video') {
    switchToAudioMode();
  }
}

function syncYouTubeTime(force = false) {
  if (currentVideoContent !== 'youtube') return;
  const ytFrame = document.getElementById('yt-iframe');
  if (!ytFrame || ytFrame.classList.contains('hidden')) return;

  const now = Date.now();
  if (force || now - lastYouTubeSyncAt > 1600) {
    _ytPostMessage('seekTo', [Math.floor(audio.currentTime || 0), true]);
    lastYouTubeSyncAt = now;
  }
}

function buildYouTubeEmbedUrl(videoId, startSeconds = 0) {
  const start = startSeconds > 0 ? `&start=${Math.floor(startSeconds)}` : '';
  return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&rel=0&playsinline=1&enablejsapi=1&controls=0&iv_load_policy=3&modestbranding=1&disablekb=1&fs=0&cc_load_policy=0&origin=${encodeURIComponent(location.origin)}${start}`;
}

function loadVocalAltCache() {
  try {
    vocalAltCache = JSON.parse(localStorage.getItem(VOCAL_ALT_CACHE_KEY) || '{}');
  } catch (e) {
    vocalAltCache = {};
  }
}

function saveVocalAltCache() {
  try {
    localStorage.setItem(VOCAL_ALT_CACHE_KEY, JSON.stringify(vocalAltCache));
  } catch (e) {}
}

function normalizeVocalAltCandidate(raw, fallbackLanguage) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || '').trim();
  const name = decodeHtml(String(raw.name || raw.title || '')).trim();
  const audioUrl = pickBestDownloadUrl(raw.downloadUrl || raw.download_url || raw.media_url);
  if (!id || !name || !audioUrl) return null;
  return {
    id,
    name,
    artists: decodeHtml(String(raw.primaryArtists || raw.artists || raw.artist || '')).trim(),
    album: decodeHtml(String(typeof raw.album === 'object' ? raw.album?.name : raw.album || '')).trim(),
    image: pickBestDownloadUrl(raw.image || raw.images || []),
    year: String(raw.year || '').trim(),
    duration: Number(raw.duration || 0) || 0,
    audio: String(audioUrl).trim().replace(/^http:\/\//i, 'https://'),
    language: String(raw.language || fallbackLanguage || 'telugu').toLowerCase() === 'hindi' ? 'hindi' : 'telugu'
  };
}

function scoreVocalAltCandidate(song, candidate) {
  const text = normalizeForMatch(`${candidate.name} ${candidate.album} ${candidate.artists}`);
  const songTokens = tokenizeForMatch(song?.name || '');
  const artistTokens = tokenizeForMatch(getSongArtistSeed(song));
  const candTokens = tokenizeForMatch(text);

  let score = 0;
  if (/karaoke|instrumental|minus one|backing track|bgm|music track/.test(text)) score += 0.65;
  if (/remix|cover|sped|slowed|nightcore|dj/.test(text)) score -= 0.35;
  score += overlapScore(songTokens, candTokens) * 0.5;
  score += overlapScore(artistTokens, candTokens) * 0.2;

  const baseDuration = Number(song?.duration || 0) || 0;
  const altDuration = Number(candidate?.duration || 0) || 0;
  if (baseDuration > 30 && altDuration > 30) {
    const diff = Math.abs(baseDuration - altDuration) / baseDuration;
    if (diff <= 0.04) score += 0.25;
    else if (diff <= 0.08) score += 0.12;
    else if (diff > 0.25) score -= 0.2;
  }

  return score;
}

function mapTimeBetweenDurations(fromTime, fromDuration, toDuration) {
  const t = Math.max(0, Number(fromTime) || 0);
  const fromDur = Number(fromDuration || 0) || 0;
  const toDur = Number(toDuration || 0) || 0;
  if (!(fromDur > 20 && toDur > 20)) return t;
  const ratio = toDur / fromDur;
  if (Math.abs(1 - ratio) < 0.02) return t;
  return Math.max(0, Math.min(toDur - 0.25, t * ratio));
}

async function fetchVocalAltResults(query) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  const endpoint = `https://jiosaavn-api-privatecvc2.vercel.app/search/songs?query=${encodeURIComponent(query)}&limit=10`;
  try {
    const res = await fetch(endpoint, { signal: controller.signal });
    if (!res.ok) return [];
    const payload = await res.json();
    return payload?.data?.results || [];
  } catch (e) {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function findVocalHideAlternative(song) {
  if (!song?.id) return null;

  const cached = vocalAltCache[song.id];
  if (cached?.status === 'hit' && cached.song?.audio) return cached.song;
  if (cached?.status === 'miss' && cached.retryAfter && Date.now() < cached.retryAfter) return null;

  const title = decodeHtml(song.name || '').trim();
  const artist = getSongArtistSeed(song);
  const queries = [
    `${title} ${artist} karaoke`,
    `${title} ${artist} instrumental`,
    `${title} minus one`
  ];

  let best = null;
  for (const query of queries) {
    const rows = await fetchVocalAltResults(query);
    for (const row of rows) {
      const candidate = normalizeVocalAltCandidate(row, song.language || 'telugu');
      if (!candidate) continue;
      const score = scoreVocalAltCandidate(song, candidate);
      if (!best || score > best.score) best = { score, song: candidate };
    }
  }

  if (best && best.score >= 0.55) {
    vocalAltCache[song.id] = { status: 'hit', song: best.song, cachedAt: Date.now() };
    saveVocalAltCache();
    return best.song;
  }

  vocalAltCache[song.id] = { status: 'miss', retryAfter: Date.now() + 12 * 60 * 60 * 1000 };
  saveVocalAltCache();
  return null;
}

function setAudioSourceKeepingPosition(url, targetTime, shouldPlay) {
  const urls = getAudioFallbackUrls(url);
  if (!urls.length) return false;

  currentSong.audio = urls[0];
  currentAudioFallbackUrls = urls;
  currentAudioFallbackIndex = 0;
  currentSongStreamRefreshed = false;

  const desired = Math.max(0, Number(targetTime) || 0);
  vocalTargetTime = desired;
  const onMeta = () => {
    audio.removeEventListener('loadedmetadata', onMeta);
    if (desired > 0) {
      try { audio.currentTime = desired; } catch (e) {}
    }
    if (shouldPlay) audio.play().catch(() => {});
  };

  audio.addEventListener('loadedmetadata', onMeta, { once: true });
  audio.src = urls[0];
  isPlaying = shouldPlay;
  updatePlayBtn();
  audio.load();
  return true;
}

function clearVocalHideState() {
  vocalHideOriginalSong = null;
  vocalHideSourceSongId = null;
  vocalHideTransitioning = false;
  vocalTargetTime = null;
}

function applyFineSync(afterMs = 220, attempts = 3) {
  if (!attempts || !currentSong) return;
  setTimeout(() => {
    if (!currentSong || isNaN(audio.duration) || audio.duration <= 0) return;
    const target = Number(vocalTargetTime || 0);
    if (!target) return;
    const delta = Math.abs((audio.currentTime || 0) - target);
    if (delta > 0.12) {
      try { audio.currentTime = target; } catch (e) {}
    }
    if (attempts > 1) applyFineSync(260, attempts - 1);
  }, afterMs);
}

function restoreVocalHideSource(showModeToast = false) {
  if (!vocalHideOriginalSong || !currentSong || vocalHideSourceSongId !== currentSong.id) {
    clearVocalHideState();
    return;
  }

  const desiredTime = mapTimeBetweenDurations(audio.currentTime || 0, currentSong.duration || 0, vocalHideOriginalSong.duration || 0);
  const shouldPlay = !audio.paused;
  setAudioSourceKeepingPosition(vocalHideOriginalSong.audio, desiredTime, shouldPlay);
  applyFineSync();
  clearVocalHideState();
  if (showModeToast) showToast('Voice mode: Normal');
}

async function applyVocalHideForCurrentSong() {
  if (voiceMode !== 'vocal' || !currentSong || vocalHideTransitioning) return;
  if (vocalHideOriginalSong && vocalHideSourceSongId === currentSong.id) return;

  vocalHideTransitioning = true;
  const sourceId = currentSong.id;
  const desiredTime = audio.currentTime || 0;
  const shouldPlay = !audio.paused;

  const alt = await findVocalHideAlternative(currentSong);
  if (!currentSong || currentSong.id !== sourceId || voiceMode !== 'vocal') {
    vocalHideTransitioning = false;
    return;
  }

  if (!alt?.audio) {
    voiceMode = 'normal';
    localStorage.setItem(VOICE_MODE_KEY, voiceMode);
    updateVoiceModeButton();
    showToast('Vocal-hide track unavailable for this song');
    vocalHideTransitioning = false;
    return;
  }

  vocalHideOriginalSong = {
    audio: currentSong.audio,
    duration: Number(currentSong.duration || audio.duration || 0) || 0
  };
  vocalHideSourceSongId = currentSong.id;

  const adjusted = mapTimeBetweenDurations(desiredTime, vocalHideOriginalSong.duration, alt.duration || 0);
  const ok = setAudioSourceKeepingPosition(alt.audio, adjusted, shouldPlay);
  if (!ok) {
    clearVocalHideState();
    voiceMode = 'normal';
    localStorage.setItem(VOICE_MODE_KEY, voiceMode);
    updateVoiceModeButton();
    showToast('Vocal-hide source unavailable');
  } else {
    showToast('Voice mode: Vocal Hide');
    applyFineSync();
  }

  vocalHideTransitioning = false;
}

function shouldResetVocalHideForSong(song) {
  if (voiceMode !== 'vocal') return false;
  if (!song?.id) return false;
  return vocalHideSourceSongId !== song.id;
}

function applyVoiceMode() {
  if (voiceMode === 'normal') {
    restoreVocalHideSource(true);
  } else {
    applyVocalHideForCurrentSong();
  }
}

function updateVoiceModeButton() {
  const btn = document.getElementById('voice-mode-btn');
  if (!btn) return;
  btn.classList.toggle('active', voiceMode !== 'normal');
  const label = `Voice mode: ${VOICE_MODE_LABELS[voiceMode] || 'Normal'}`;
  btn.title = label;
  btn.setAttribute('aria-label', label);
}

function loadVoiceMode() {
  const saved = localStorage.getItem(VOICE_MODE_KEY);
  if (saved && VOICE_MODE_LABELS[saved]) {
    voiceMode = saved;
  } else {
    voiceMode = 'normal';
  }
  updateVoiceModeButton();
}

function cycleVoiceMode() {
  const next = voiceMode === 'normal' ? 'vocal' : 'normal';
  voiceMode = next;
  localStorage.setItem(VOICE_MODE_KEY, voiceMode);
  updateVoiceModeButton();
  if (voiceMode === 'normal') {
    applyVoiceMode();
    return;
  }
  showToast('Finding vocal-hide track...');
  applyVocalHideForCurrentSong();
}

function unlockAudioGraph() {
  // No-op: retained for backward compatibility with existing calls.
}

function getAudioFallbackUrls(url) {
  const clean = String(url || '').trim().replace(/^http:\/\//i, 'https://');
  if (!clean) return [];

  const match = clean.match(/_(\d+)\.mp4(\?.*)?$/i);
  if (!match) return [clean];

  const currentQ = parseInt(match[1], 10);
  const preferred = [320, 160, 96, 48];
  const nextQualities = [currentQ, ...preferred.filter(q => q !== currentQ)];
  const suffix = match[2] || '';

  const urls = [];
  const seen = new Set();
  for (const q of nextQualities) {
    const candidate = clean.replace(/_\d+\.mp4(\?.*)?$/i, `_${q}.mp4${suffix}`);
    if (!seen.has(candidate)) {
      seen.add(candidate);
      urls.push(candidate);
    }
  }
  return urls;
}

function tryNextAudioFallback() {
  if (!currentSong || !currentAudioFallbackUrls.length) return false;
  if (currentAudioFallbackIndex >= currentAudioFallbackUrls.length - 1) return false;

  currentAudioFallbackIndex++;
  const nextUrl = currentAudioFallbackUrls[currentAudioFallbackIndex];
  audio.src = nextUrl;
  audio.play().catch(() => {});
  showToast('Trying alternate stream quality...');
  return true;
}

function pickBestDownloadUrl(downloadList) {
  if (!Array.isArray(downloadList) || !downloadList.length) return '';

  const normalized = downloadList
    .map(item => {
      if (!item) return null;
      if (typeof item === 'string') return { link: item, quality: 0 };
      const link = item.link || item.url || item.src || '';
      const qualityRaw = String(item.quality || item.bitrate || '').match(/\d+/);
      return link ? { link, quality: qualityRaw ? parseInt(qualityRaw[0], 10) : 0 } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.quality - a.quality);

  return normalized[0]?.link || '';
}

function extractFreshUrlFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return '';

  const roots = [];
  if (Array.isArray(payload.data)) roots.push(...payload.data);
  if (payload.data && typeof payload.data === 'object') roots.push(payload.data);
  roots.push(payload);

  for (const root of roots) {
    if (!root || typeof root !== 'object') continue;
    const directList = root.downloadUrl || root.download_url;
    const picked = pickBestDownloadUrl(directList);
    if (picked) return picked;

    const direct = root.media_url || root.audio || root.url || '';
    if (typeof direct === 'string' && direct.startsWith('http')) return direct;
  }

  return '';
}

async function fetchFreshAudioUrl(song) {
  if (!song?.id) return '';

  const id = encodeURIComponent(song.id);
  const endpoints = [
    `https://saavn.dev/api/songs/${id}`,
    `https://saavn.dev/api/song/${id}`,
    `https://saavn.dev/api/songs?id=${id}`,
    `https://saavn.dev/api/songs?ids=${id}`
  ];

  for (const endpoint of endpoints) {
    try {
      const resp = await fetch(endpoint);
      if (!resp.ok) continue;
      const payload = await resp.json();
      const url = extractFreshUrlFromPayload(payload);
      if (url) return String(url).trim().replace(/^http:\/\//i, 'https://');
    } catch (e) {
      // Try next endpoint
    }
  }

  return '';
}

async function tryRefreshCurrentSongStream() {
  if (!currentSong || currentSongStreamRefreshed) return false;

  currentSongStreamRefreshed = true;
  showToast('Refreshing stream URL...');

  const freshUrl = await fetchFreshAudioUrl(currentSong);
  if (!freshUrl) return false;

  currentSong.audio = freshUrl;
  currentAudioFallbackUrls = getAudioFallbackUrls(freshUrl);
  currentAudioFallbackIndex = 0;

  try {
    audio.src = currentAudioFallbackUrls[currentAudioFallbackIndex] || freshUrl;
    await audio.play();
    isPlaying = true;
    isLoadingNext = false;
    showLoading(false);
    consecutiveErrors = 0;
    updatePlayBtn();
    document.querySelector('.album-art-container')?.classList.add('playing');
    showToast('Recovered stream. Playing now.');
    return true;
  } catch (e) {
    return false;
  }
}

// ═══ AUTH ═══
function showLanding() {
  document.getElementById('landing').classList.remove('hidden');
  document.getElementById('auth-page').classList.add('hidden');
}

function showAuth(mode) {
  authMode = mode;
  document.getElementById('landing').classList.add('hidden');
  document.getElementById('auth-page').classList.remove('hidden');
  const isSignup = mode === 'signup';
  document.getElementById('auth-title').textContent = isSignup ? 'Create Account' : 'Sign In';
  document.getElementById('auth-subtitle').textContent = isSignup ? 'Start your Telugu music journey' : 'Welcome back to Raagam';
  document.getElementById('auth-submit').textContent = isSignup ? 'Create Account' : 'Sign In';
  document.getElementById('signup-fields').classList.toggle('hidden', !isSignup);
  document.getElementById('auth-switch-text').textContent = isSignup ? 'Already have an account?' : "Don't have an account?";
  document.getElementById('auth-switch-btn').textContent = isSignup ? 'Sign In' : 'Sign Up';
  document.getElementById('auth-error').classList.add('hidden');
  document.getElementById('auth-username').value = '';
  document.getElementById('auth-password').value = '';
  document.getElementById('auth-display').value = '';
  setTimeout(() => document.getElementById('auth-username').focus(), 100);
}

function toggleAuthMode() {
  showAuth(authMode === 'login' ? 'signup' : 'login');
}

async function submitAuth() {
  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value;
  const display = document.getElementById('auth-display').value.trim();
  const errEl = document.getElementById('auth-error');

  if (!username || !password) {
    errEl.textContent = 'Please fill in all fields';
    errEl.classList.remove('hidden');
    return;
  }
  if (authMode === 'signup' && username.length < 3) {
    errEl.textContent = 'Username must be at least 3 characters';
    errEl.classList.remove('hidden');
    return;
  }

  try {
    document.getElementById('auth-submit').textContent = 'Loading...';
    document.getElementById('auth-submit').disabled = true;
    const token = await hashToken(username, password);
    const storedUsers = JSON.parse(localStorage.getItem('raagam_users') || '{}');

    if (authMode === 'signup') {
      if (storedUsers[username]) {
        errEl.textContent = 'Username already taken';
        errEl.classList.remove('hidden');
        document.getElementById('auth-submit').textContent = 'Create Account';
        document.getElementById('auth-submit').disabled = false;
        return;
      }
      storedUsers[username] = { token, displayName: display || username };
      localStorage.setItem('raagam_users', JSON.stringify(storedUsers));
    } else {
      if (storedUsers[username] && storedUsers[username].token !== token) {
        errEl.textContent = 'Wrong password';
        errEl.classList.remove('hidden');
        document.getElementById('auth-submit').textContent = 'Sign In';
        document.getElementById('auth-submit').disabled = false;
        return;
      }
      if (!storedUsers[username]) {
        storedUsers[username] = { token, displayName: username };
        localStorage.setItem('raagam_users', JSON.stringify(storedUsers));
      }
    }

    currentUser = { username, displayName: storedUsers[username].displayName || username, token };
    localStorage.setItem('raagam_session', JSON.stringify(currentUser));
    enterApp();
  } catch(e) {
    console.error('Auth error:', e);
    errEl.textContent = 'Error — ' + (e.message || 'try again');
    errEl.classList.remove('hidden');
    document.getElementById('auth-submit').textContent = authMode === 'signup' ? 'Create Account' : 'Sign In';
    document.getElementById('auth-submit').disabled = false;
  }
}

async function hashToken(username, password) {
  function simpleHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
    return Math.abs(h).toString(16).padStart(8, '0');
  }
  return simpleHash(`raagam:${password}`);
}

function signOut() {
  currentUser = null;
  localStorage.removeItem('raagam_session');
  audio.pause();
  isPlaying = false;
  currentSong = null;
  document.getElementById('app-container').classList.add('hidden');
  document.getElementById('landing').classList.remove('hidden');
}

function ensureReleaseMarker() {
  const homeLogo = document.querySelector('#page-home .home-logo');
  if (!homeLogo) return;

  let marker = homeLogo.querySelector('.release-marker');
  if (!marker) {
    marker = document.createElement('span');
    marker.className = 'release-marker';
    homeLogo.appendChild(document.createTextNode(' '));
    homeLogo.appendChild(marker);
  }
  marker.textContent = RELEASE_MARKER;
}

function enterApp() {
  document.getElementById('landing').classList.add('hidden');
  document.getElementById('auth-page').classList.add('hidden');
  document.getElementById('app-container').classList.remove('hidden');
  document.getElementById('auth-submit').disabled = false;

  ensureReleaseMarker();
  if (!supportsAacMp4() && !hasShownCodecWarning) {
    hasShownCodecWarning = true;
    showToast('This browser cannot decode AAC streams. Open Raagam in Chrome or Edge.');
  }
  
  document.getElementById('profile-name').textContent = currentUser.displayName || currentUser.username;
  document.getElementById('profile-sub-text').innerHTML = `@${escHtml(currentUser.username)} <span class="sync-badge">💾 Local</span>`;
  
  const h = new Date().getHours();
  const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('home-greeting').textContent = `${greeting}, ${currentUser.displayName || currentUser.username}`;
  
  loadDownloadedSongs();
  loadVocalAltCache();
  loadVoiceMode();
  renderDynamicHomeContent(false);
  if (!IS_MOBILE) warmSearchIndex();
  showPage('home');
  updateHomeStats();
  renderRecent();
  restoreLastPlayed();
  updateCacheSize();
  initSongPreviews();
}

// ═══ OFFLINE / DOWNLOAD ═══
function normalizeDownloadedSong(song, fallbackId = '') {
  if (!song) return null;
  const id = String(song.id || fallbackId || '').trim();
  if (!id) return null;
  return {
    id,
    name: song.name || 'Unknown song',
    artists: song.artists || '',
    image: song.image || '',
    audio: song.audio || '',
    album: song.album || '',
    year: song.year || '',
    language: song.language || 'telugu',
    downloadedAt: Number(song.downloadedAt || 0)
  };
}

function getDownloadedSongsList() {
  return Object.values(downloadedSongs)
    .map(song => normalizeDownloadedSong(song))
    .filter(Boolean)
    .sort((a, b) => (b.downloadedAt || 0) - (a.downloadedAt || 0));
}

function loadDownloadedSongs() {
  try {
    const parsed = JSON.parse(localStorage.getItem('raagam_downloads') || '{}');
    const normalized = {};
    Object.entries(parsed || {}).forEach(([key, value]) => {
      const song = normalizeDownloadedSong(value, key);
      if (song) normalized[song.id] = song;
    });
    downloadedSongs = normalized;
  } catch(e) {
    downloadedSongs = {};
  }
}

function saveDownloadedSongs() {
  localStorage.setItem('raagam_downloads', JSON.stringify(downloadedSongs));
}

function isSongDownloaded(song) {
  if (!song) return false;
  return !!downloadedSongs[song.id];
}

function downloadSong(song) {
  if (!song || !song.audio) return;
  if (isSongDownloaded(song)) return;
  if (downloadingUrls.has(song.audio)) return;
  
  downloadingUrls.add(song.audio);
  updateDownloadButton(song, 'downloading');
  showToast('Downloading for offline...');

  if (navigator.serviceWorker && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'CACHE_AUDIO',
      audioUrl: song.audio,
      imageUrl: song.image || null
    });
    // Store song metadata
    downloadedSongs[song.id] = {
      id: song.id, name: song.name, artists: song.artists,
      image: song.image, audio: song.audio, album: song.album,
      year: song.year, language: song.language || 'telugu',
      downloadedAt: Date.now()
    };
    saveDownloadedSongs();
  } else {
    // Fallback: use Cache API directly
    caches.open('raagam-audio-v1').then(async cache => {
      try {
        await cache.add(song.audio);
        if (song.image) await caches.open('raagam-v2').then(c => c.add(song.image)).catch(() => {});
        downloadedSongs[song.id] = {
          id: song.id, name: song.name, artists: song.artists,
          image: song.image, audio: song.audio, album: song.album,
          year: song.year, language: song.language || 'telugu',
          downloadedAt: Date.now()
        };
        saveDownloadedSongs();
        downloadingUrls.delete(song.audio);
        updateDownloadButton(song, 'downloaded');
        showToast('Downloaded!');
        updateCacheSize();
      } catch(e) {
        downloadingUrls.delete(song.audio);
        updateDownloadButton(song, 'failed');
        showToast('Download failed');
      }
    });
  }
}

function removeDownload(songId) {
  const song = downloadedSongs[songId];
  if (!song) return;
  
  if (navigator.serviceWorker && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'UNCACHE_AUDIO',
      audioUrl: song.audio,
      imageUrl: song.image || null
    });
  } else {
    caches.open('raagam-audio-v1').then(cache => cache.delete(song.audio)).catch(() => {});
  }
  
  delete downloadedSongs[songId];
  if (Array.isArray(activeCollectionPool) && activeCollectionPool.length) {
    activeCollectionPool = activeCollectionPool.filter(s => s?.id !== songId);
    if (!activeCollectionPool.length) activeCollectionPool = null;
  }
  saveDownloadedSongs();
  showToast('Removed from downloads');
  updateCacheSize();
  // Re-render if on library page
  if (document.getElementById('page-library')?.classList.contains('active')) renderLibrary();
}

function updateDownloadButton(song, state) {
  // Update all download buttons for this song across the UI
  document.querySelectorAll(`[data-download-id="${song.id}"]`).forEach(btn => {
    if (state === 'downloading') {
      btn.innerHTML = '<span class="dl-spinner"></span>';
      btn.classList.add('downloading');
      btn.disabled = true;
    } else if (state === 'downloaded') {
      btn.innerHTML = '✓';
      btn.classList.remove('downloading');
      btn.classList.add('downloaded');
      btn.disabled = false;
    } else {
      btn.innerHTML = '↓';
      btn.classList.remove('downloading', 'downloaded');
      btn.disabled = false;
    }
  });
  // Update player download button
  updatePlayerDownloadBtn();
}

function updatePlayerDownloadBtn() {
  const btn = document.getElementById('download-btn');
  if (!btn || !currentSong) return;
  if (downloadingUrls.has(currentSong.audio)) {
    btn.innerHTML = '<span class="dl-spinner"></span>';
    btn.title = 'Downloading...';
  } else if (isSongDownloaded(currentSong)) {
    btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="var(--success)" stroke="none"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>';
    btn.title = 'Downloaded — tap to remove';
    btn.onclick = () => { removeDownload(currentSong.id); updatePlayerDownloadBtn(); };
  } else {
    btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
    btn.title = 'Download for offline';
    btn.onclick = () => downloadSong(currentSong);
  }
}

function updateCacheSize() {
  if (navigator.serviceWorker && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'GET_CACHE_SIZE' });
  } else {
    // Direct cache check
    caches.open('raagam-audio-v1').then(async cache => {
      const keys = await cache.keys();
      let totalSize = 0;
      for (const req of keys) {
        const resp = await cache.match(req);
        if (resp) { const blob = await resp.clone().blob(); totalSize += blob.size; }
      }
      renderCacheSize(totalSize, keys.length);
    }).catch(() => {});
  }
}

function renderCacheSize(bytes, count) {
  const el = document.getElementById('cache-size-info');
  if (!el) return;
  const dlCount = Object.keys(downloadedSongs).length;
  if (dlCount === 0) {
    el.textContent = 'No downloads';
  } else {
    const mb = (bytes / (1024 * 1024)).toFixed(1);
    el.textContent = `${dlCount} song${dlCount !== 1 ? 's' : ''} • ${mb} MB`;
  }
}

// Listen for SW messages
if (navigator.serviceWorker) {
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data.type === 'CACHE_COMPLETE') {
      const url = e.data.audioUrl;
      downloadingUrls.delete(url);
      // Find song by audio URL
      const song = Object.values(downloadedSongs).find(s => s.audio === url);
      if (song) updateDownloadButton(song, 'downloaded');
      showToast('Downloaded!');
      updateCacheSize();
    }
    if (e.data.type === 'UNCACHE_COMPLETE') {
      updateCacheSize();
    }
    if (e.data.type === 'CACHE_SIZE') {
      renderCacheSize(e.data.size, e.data.count);
    }
  });
}

// ═══ PLAYBACK ═══
function playRandomSong() {
  unlockAudioGraph();
  if (isLoadingNext) return;
  bollywoodCategoryPool = null;
  activeCollectionPool = null;
  activeLanguage = 'telugu';
  eraLock = null; // Clear era lock when explicitly playing random
  updateEraLockBadge();
  const excludeId = currentSong ? currentSong.id : null;
  const teluguDb = (typeof SongsDB !== 'undefined' && Array.isArray(SongsDB.SONGS_DB)) ? SongsDB.SONGS_DB : [];
  let song = smartPickRandom(teluguDb, excludeId);
  if (!song) {
    song = pickRandomSongFromList(teluguDb, excludeId);
  }
  if (!song) {
    const fallback = pickRandomSongFromList(getAllSongs().filter(s => (s?.language || '').toLowerCase() !== 'hindi'), excludeId)
      || pickRandomSongFromList(getRecentSongsSafe().filter(s => (s?.language || '').toLowerCase() !== 'hindi'), excludeId);
    if (!fallback) { showToast('Songs database not loaded yet'); return; }
    song = fallback;
  }
  if (currentSong && historyIndex >= 0 && historyIndex < history.length - 1) {
    history = history.slice(0, historyIndex + 1);
  }
  history.push(song);
  historyIndex = history.length - 1;
  playSong(song);
}

function getActiveDB() {
  if (activeLanguage === 'hindi' && typeof BollywoodSongsDB !== 'undefined' && Array.isArray(BollywoodSongsDB.SONGS_DB)) return BollywoodSongsDB.SONGS_DB;
  return (typeof SongsDB !== 'undefined' && Array.isArray(SongsDB.SONGS_DB) ? SongsDB.SONGS_DB : []);
}

function pickRandomSongFromList(list, excludeId) {
  if (!Array.isArray(list) || !list.length) return null;
  const pool = excludeId ? list.filter(s => s && s.id !== excludeId) : list;
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)] || null;
}

function getRecentSongsSafe() {
  try {
    const recent = JSON.parse(localStorage.getItem('raagam_recent') || '[]');
    return Array.isArray(recent) ? recent : [];
  } catch (e) {
    return [];
  }
}

function _getDecadeKey(year) {
  const y = parseInt(year);
  if (isNaN(y)) return 'pre1980';
  if (y >= 2020) return '2020s';
  if (y >= 2010) return '2010s';
  if (y >= 2000) return '2000s';
  if (y >= 1990) return '1990s';
  if (y >= 1980) return '1980s';
  return 'pre1980';
}

function smartPickRandom(db, excludeId) {
  if (!Array.isArray(db) || !db.length) return null;

  // Filter: exclude recently played, recent albums, short songs
  let pool = db.filter(s => {
    if (!s || !s.id) return false;
    if (s.id === excludeId) return false;
    if (recentlyPlayedIds.has(s.id)) return false;
    if (s.duration && s.duration < MIN_SONG_DURATION) return false;
    if (recentAlbums.length > 0 && recentAlbums.includes(s.album)) return false;
    return true;
  });

  // If pool too small after filtering, relax constraints
  if (pool.length < 10) {
    pool = db.filter(s => s && s.id && s.id !== excludeId && (!s.duration || s.duration >= MIN_SONG_DURATION));
  }
  if (!pool.length) return pickRandomSongFromList(db, excludeId);

  // Era lock: restrict to locked decade
  if (eraLock) {
    const eraPool = pool.filter(s => _getDecadeKey(s.year) === eraLock);
    if (eraPool.length > 0) pool = eraPool;
  }

  // Group by decade
  const decades = {};
  for (const s of pool) {
    const dk = _getDecadeKey(s.year);
    if (!decades[dk]) decades[dk] = [];
    decades[dk].push(s);
  }

  // Weighted decade selection (skip decades with no songs in pool)
  const available = Object.keys(decades);
  if (!available.length) return pickRandomSongFromList(db, excludeId);

  let totalWeight = 0;
  const weighted = [];
  for (const dk of available) {
    const w = DECADE_WEIGHTS[dk] || 2;
    totalWeight += w;
    weighted.push({ decade: dk, weight: w });
  }

  let roll = Math.random() * totalWeight;
  let selectedDecade = weighted[0].decade;
  for (const entry of weighted) {
    roll -= entry.weight;
    if (roll <= 0) { selectedDecade = entry.decade; break; }
  }

  // Pick uniformly from selected decade
  const decadePool = decades[selectedDecade];
  const song = decadePool[Math.floor(Math.random() * decadePool.length)];

  // Update anti-repetition state
  if (song) {
    recentlyPlayedIds.add(song.id);
    if (recentlyPlayedIds.size > RECENTLY_PLAYED_WINDOW) {
      const first = recentlyPlayedIds.values().next().value;
      recentlyPlayedIds.delete(first);
    }
    if (song.album) {
      recentAlbums.push(song.album);
      if (recentAlbums.length > RECENT_ALBUM_WINDOW) recentAlbums.shift();
    }
  }

  return song;
}

function stableHash(str) {
  const s = String(str || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function getSongVideoUrl(song) {
  if (!song) return '';
  if (song.videoUrl) return song.videoUrl;
  if (song.video) return song.video;
  return '';
}

function syncSongVideoTime() {
  const video = document.getElementById('song-video');
  if (!video || !video.src || currentMediaMode !== 'video' || currentVideoContent !== 'video' || !audio.duration) return;

  const timeDiff = Math.abs(video.currentTime - audio.currentTime);
  if (timeDiff > 0.35) {
    try {
      video.currentTime = audio.currentTime;
    } catch (e) {
      console.warn('Video sync failed:', e);
    }
  }
}

function switchToAudioMode() {
  currentMediaMode = 'audio';
  const audioBtn = document.getElementById('media-audio-btn');
  const videoBtn = document.getElementById('media-video-btn');
  const art = document.getElementById('album-art');
  const videoWrap = document.getElementById('song-video-container');
  const video = document.getElementById('song-video');
  const ytFrame = document.getElementById('yt-iframe');
  audioBtn?.classList.add('active');
  videoBtn?.classList.remove('active');
  audioBtn?.setAttribute('aria-selected', 'true');
  videoBtn?.setAttribute('aria-selected', 'false');
  art?.classList.remove('hidden');
  videoWrap?.classList.add('hidden');
  if (video) video.pause();
  if (ytFrame) {
    if (ytPrewarmed) {
      // Keep iframe buffered — mute, pause, hide (src preserved for instant re-entry)
      _ytPostMessage('mute', []);
      _ytPostMessage('pauseVideo', []);
      ytFrame.classList.add('hidden');
    } else {
      ytFrame.src = 'about:blank';
      ytFrame.classList.add('hidden');
    }
  }
  syncYouTubeTime(true);
}

function switchToVideoMode() {
  if (!currentSong) return;
  if (currentVideoContent !== 'video' && currentVideoContent !== 'youtube') {
    showToast('Video not available for this song');
    return;
  }

  currentMediaMode = 'video';
  const audioBtn   = document.getElementById('media-audio-btn');
  const videoBtn   = document.getElementById('media-video-btn');
  const art        = document.getElementById('album-art');
  const videoWrap  = document.getElementById('song-video-container');
  const video      = document.getElementById('song-video');
  const visualizer = document.getElementById('song-visualizer');
  const ytFrame    = document.getElementById('yt-iframe');
  const badge      = document.getElementById('video-mode-badge');

  audioBtn?.classList.remove('active');
  videoBtn?.classList.add('active');
  audioBtn?.setAttribute('aria-selected', 'false');
  videoBtn?.setAttribute('aria-selected', 'true');
  art?.classList.add('hidden');
  videoWrap?.classList.remove('hidden');

  if (currentVideoContent === 'video' && video && currentVideoUrl) {
    // Direct mp4 video
    video.classList.remove('hidden');
    visualizer?.classList.add('hidden');
    ytFrame?.classList.add('hidden');
    video.muted = true;
    syncSongVideoTime();
    if (!audio.paused) {
      video.play().catch(() => {
        currentVideoContent = 'visualizer';
        video.classList.add('hidden');
        visualizer?.classList.remove('hidden');
        if (badge) badge.textContent = 'CANVAS';
      });
    }
  } else if (currentVideoContent === 'youtube') {
    // YouTube iframe — videoId is already known
    const cached = videoSearchCache[currentSong?.id];
    const cachedLocal = JSON.parse(localStorage.getItem('raagam_video_cache') || '{}');
    const videoId = cached?.videoId || cachedLocal[currentSong?.id];
    if (videoId) {
      _activateYouTubeIframe(videoId, audio.currentTime);
    } else {
      currentVideoContent = 'visualizer';
      video?.classList.add('hidden');
      ytFrame?.classList.add('hidden');
      visualizer?.classList.remove('hidden');
      if (badge) badge.textContent = 'CANVAS';
    }
  } else {
    // Search still in progress — keep showing canvas while waiting
    video?.classList.add('hidden');
    ytFrame?.classList.add('hidden');
    visualizer?.classList.remove('hidden');
    if (badge) badge.textContent = 'SEARCHING...';

    // If there's a pending search, wait for it and activate immediately
    if (pendingVideoSearch) {
      const songIdAtSwitch = currentSong?.id;
      pendingVideoSearch.then(videoId => {
        // Only activate if user is still on the same song and still in video mode
        if (!currentSong || currentSong.id !== songIdAtSwitch) return;
        if (currentMediaMode !== 'video') return;
        if (videoId) {
          currentVideoContent = 'youtube';
          _activateYouTubeIframe(videoId, audio.currentTime);
        } else if (badge) {
          badge.textContent = 'CANVAS';
        }
      }).catch(() => {
        if (badge) badge.textContent = 'CANVAS';
      });
    }
  }
}

function _ytPostMessage(func, args) {
  const ytFrame = document.getElementById('yt-iframe');
  if (!ytFrame || !ytFrame.contentWindow) return;
  if (ytFrame.getAttribute('src') === 'about:blank') return;
  ytFrame.contentWindow.postMessage(
    JSON.stringify({ event: 'command', func, args: args || [] }), '*'
  );
}

function _prewarmYouTubeIframe(videoId) {
  const ytFrame = document.getElementById('yt-iframe');
  if (!ytFrame || !videoId) return;
  const newSrc = buildYouTubeEmbedUrl(videoId, 0);
  if (ytFrame.src === newSrc) { ytPrewarmed = true; return; }
  ytFrame.src = newSrc;
  ytPrewarmed = true;
  // container stays hidden — video buffers silently in background
}

function _activateYouTubeIframe(videoId, startSeconds) {
  const ytFrame    = document.getElementById('yt-iframe');
  const visualizer = document.getElementById('song-visualizer');
  const video      = document.getElementById('song-video');
  const badge      = document.getElementById('video-mode-badge');
  if (!ytFrame) return;

  const expectedSrc = buildYouTubeEmbedUrl(videoId, 0);
  const isPrewarmed = ytPrewarmed && ytFrame.src === expectedSrc;

  // Keep audio as source-of-truth. YouTube stays muted and follows audio timeline.
  _ytPostMessage('mute', []);

  if (isPrewarmed) {
    // FAST PATH: already buffered — just unmute, seek, play
    ytFrame.classList.remove('hidden');
    visualizer?.classList.add('hidden');
    video?.classList.add('hidden');
    currentVideoContent = 'youtube';
    if (badge) badge.textContent = 'YOUTUBE';
    setTimeout(() => {
      if (startSeconds > 0) _ytPostMessage('seekTo', [Math.floor(startSeconds), true]);
      _ytPostMessage('mute', []);
      _ytPostMessage('playVideo', []);
    }, 50);
  } else {
    // COLD PATH: not yet pre-warmed — load with autoplay
    ytFrame.src = buildYouTubeEmbedUrl(videoId, startSeconds);
    ytFrame.classList.remove('hidden');
    visualizer?.classList.add('hidden');
    video?.classList.add('hidden');
    currentVideoContent = 'youtube';
    if (badge) badge.textContent = 'YOUTUBE';
  }

  if (!audio.paused) {
    _ytPostMessage('playVideo', []);
  }
  syncYouTubeTime(true);
}

async function _fetchFromInnerTube(query, limit = 8) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), IS_MOBILE ? 2600 : 3800);
  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        context: { client: { clientName: 'WEB', clientVersion: '2.20240101' } },
        query: query
      })
    });
    clearTimeout(t);
    if (!res.ok) throw new Error('bad');
    const data = await res.json();
    const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
    const candidates = [];
    for (const section of contents) {
      const items = section?.itemSectionRenderer?.contents || [];
      for (const item of items) {
        const renderer = item?.videoRenderer;
        const videoId = renderer?.videoId;
        const title = renderer?.title?.runs?.map(r => r?.text || '').join(' ') || renderer?.title?.simpleText || '';
        const channel = renderer?.ownerText?.runs?.[0]?.text || '';
        if (videoId && videoId.length === 11) {
          candidates.push({ videoId, title, channel });
          if (candidates.length >= limit) return candidates;
        }
      }
    }
    if (!candidates.length) throw new Error('not found');
    return candidates;
  } catch (e) { clearTimeout(t); throw e; }
}

async function _fetchFromYouTubeAPI(query, limit = 8) {
  if (typeof YOUTUBE_API_KEY === 'undefined' || !YOUTUBE_API_KEY || youtubeApiQuotaExhausted) throw new Error('no key');
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(query)}&maxResults=${limit}&key=${YOUTUBE_API_KEY}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), IS_MOBILE ? 2600 : 3600);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (res.status === 403) {
      // Only mark quota exhausted for actual quota errors, not API-not-enabled
      const data = await res.json().catch(() => ({}));
      const reason = data?.error?.errors?.[0]?.reason || '';
      if (reason === 'quotaExceeded' || reason === 'rateLimitExceeded') {
        youtubeApiQuotaExhausted = true;
      }
      throw new Error('api-error');
    }
    if (res.status === 429) { youtubeApiQuotaExhausted = true; throw new Error('quota'); }
    if (!res.ok) throw new Error('bad');
    const data = await res.json();
    const items = Array.isArray(data?.items) ? data.items : [];
    const candidates = items
      .map(item => ({
        videoId: item?.id?.videoId || '',
        title: item?.snippet?.title || '',
        channel: item?.snippet?.channelTitle || ''
      }))
      .filter(item => item.videoId && item.videoId.length === 11);
    if (!candidates.length) throw new Error('not found');
    return candidates;
  } catch (e) { clearTimeout(t); throw e; }
}

async function _fetchFromPiped(instance, query) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), PIPED_TIMEOUT_MS); // 3.5s timeout for Piped
  try {
    const res = await fetch(
      `https://${instance}/search?q=${encodeURIComponent(query)}&filter=videos`,
      { signal: ctrl.signal }
    );
    clearTimeout(t);
    if (!res.ok) throw new Error('bad');
    const data = await res.json();
    const items = Array.isArray(data?.items) ? data.items : [];
    const candidates = items.map(item => ({
      videoId: String(item?.url || '').replace('/watch?v=', '').split('&')[0].trim(),
      title: item?.title || '',
      channel: item?.uploaderName || item?.uploader || ''
    })).filter(item => item.videoId && item.videoId.length === 11);
    if (!candidates.length) throw new Error('no id');
    return candidates;
  } catch (e) { clearTimeout(t); throw e; }
}

async function _fetchFromInvidious(instance, query) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), PIPED_TIMEOUT_MS); // 3.5s timeout for Invidious
  try {
    const res = await fetch(
      `https://${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video`,
      { signal: ctrl.signal }
    );
    clearTimeout(t);
    if (!res.ok) throw new Error('bad');
    const data = await res.json();
    const candidates = (Array.isArray(data) ? data : []).map(item => ({
      videoId: String(item?.videoId || '').trim(),
      title: item?.title || '',
      channel: item?.author || item?.authorId || ''
    })).filter(item => item.videoId && item.videoId.length === 11);
    if (!candidates.length) throw new Error('no id');
    return candidates;
  } catch (e) { clearTimeout(t); throw e; }
}

async function _fetchFromCORSProxy(query) {
  const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(ytUrl)}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), PIPED_TIMEOUT_MS); // 3.5s timeout for scraper
  try {
    const res = await fetch(proxyUrl, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error('bad');
    const html = await res.text();
    const seen = new Set();
    const candidates = [];
    const regex = /"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/g;
    let m;
    while ((m = regex.exec(html)) !== null && candidates.length < 10) {
      if (!seen.has(m[1])) {
        seen.add(m[1]);
        candidates.push({ videoId: m[1], title: '', channel: '' });
      }
    }
    if (!candidates.length) throw new Error('no id');
    return candidates;
  } catch (e) { clearTimeout(t); throw e; }
}

function _cacheVideoId(songId, videoId) {
  try {
    const cache = JSON.parse(localStorage.getItem('raagam_video_cache') || '{}');
    cache[songId] = videoId;
    // LRU eviction: keep max 2000 entries
    const keys = Object.keys(cache);
    if (keys.length > 2000) {
      keys.slice(0, keys.length - 2000).forEach(k => delete cache[k]);
    }
    localStorage.setItem('raagam_video_cache', JSON.stringify(cache));
  } catch (e) {}
}

async function fetchYouTubeVideoId(song) {
  // 0. Check if video URL/ID is already provided in the song object (DB override)
  if (song?.video) {
    const match = String(song.video).match(/(?:v=|youtu\.be\/|\/embed\/|\/v\/|shorts\/)([^#\&\?]*).*/);
    const videoId = match ? match[1] : song.video;
    if (videoId && videoId.length > 5) return videoId;
  }

  // 1. Check persistent localStorage cache
  const cache = JSON.parse(localStorage.getItem('raagam_video_cache') || '{}');
  if (cache[song?.id]) return cache[song.id];
  if (!song?.id) return null;

  // 2. Check in-memory session cache
  const cached = videoSearchCache[song.id];
  if (cached?.searched && cached.videoId) return cached.videoId;
  if (cached?.searched && !cached.videoId && cached.retryAfter && Date.now() < cached.retryAfter) {
    return null;
  }
  videoSearchCache[song.id] = { videoId: null, searched: false };

  const queries = buildVideoSearchQueries(song);

  for (const query of queries) {
    // Try InnerTube first (no key needed, most reliable)
    try {
      const candidates = await _fetchFromInnerTube(query, 8);
      const videoId = pickVideoIdFromCandidates(song, candidates, 0.36);
      if (videoId) {
        videoSearchCache[song.id] = { videoId, searched: true };
        _cacheVideoId(song.id, videoId);
        return videoId;
      }
    } catch { /* InnerTube failed — try YouTube Data API */ }

    // Try YouTube Data API (needs key, has quota)
    try {
      const candidates = await _fetchFromYouTubeAPI(query, 8);
      const videoId = pickVideoIdFromCandidates(song, candidates, 0.36);
      if (videoId) {
        videoSearchCache[song.id] = { videoId, searched: true };
        _cacheVideoId(song.id, videoId);
        return videoId;
      }
    } catch { /* API unavailable or quota exhausted — fall through to proxies */ }

    // Fallback: gather candidates from public proxies, then score for best match
    const allFetches = [
      _fetchFromCORSProxy(query),
      ...PIPED_INSTANCES.map(i => _fetchFromPiped(i, query)),
      ...INVIDIOUS_INSTANCES.map(i => _fetchFromInvidious(i, query))
    ];
    try {
      const settled = await Promise.allSettled(allFetches);
      const allCandidates = settled
        .filter(entry => entry.status === 'fulfilled')
        .flatMap(entry => Array.isArray(entry.value) ? entry.value : []);
      const videoId = pickVideoIdFromCandidates(song, allCandidates, 0.22);
      if (videoId) {
        videoSearchCache[song.id] = { videoId, searched: true };
        _cacheVideoId(song.id, videoId);
        return videoId;
      }

      const fallbackVideoId = fallbackVideoIdFromCandidates(song, allCandidates);
      if (fallbackVideoId) {
        videoSearchCache[song.id] = { videoId: fallbackVideoId, searched: true };
        _cacheVideoId(song.id, fallbackVideoId);
        return fallbackVideoId;
      }
    } catch { /* all instances failed, try next query */ }
  }

  videoSearchCache[song.id] = { videoId: null, searched: true, retryAfter: Date.now() + 10 * 60 * 1000 };
  return null;
}

function setupSongMedia(song) {
  const switchEl   = document.getElementById('media-switch');
  const video      = document.getElementById('song-video');
  const visualizer = document.getElementById('song-visualizer');
  const vizBg      = document.getElementById('visualizer-bg');
  const vizArt     = document.getElementById('visualizer-art');
  const badge      = document.getElementById('video-mode-badge');
  const ytFrame    = document.getElementById('yt-iframe');

  currentVideoUrl = getSongVideoUrl(song);
  currentVideoContent = currentVideoUrl ? 'video' : 'visualizer';
  currentMediaMode = 'audio';
  const cachedVideos = JSON.parse(localStorage.getItem('raagam_video_cache') || '{}');
  const cachedVideoId = cachedVideos[song?.id] || null;
  if (!currentVideoUrl && cachedVideoId) {
    currentVideoContent = 'youtube';
  }
  // Clear pre-warm state for new song before switchToAudioMode runs
  ytPrewarmed = false;
  const ytFrameReset = document.getElementById('yt-iframe');
  if (ytFrameReset) { ytFrameReset.src = 'about:blank'; ytFrameReset.classList.add('hidden'); }
  switchToAudioMode();

  // Only show media switch when a real video source exists.
  updateVideoAvailability(!!currentVideoUrl || !!cachedVideoId);

  // Update the canvas visualizer with this song's album art
  const imgUrl = song?.image || '';
  if (vizBg) vizBg.style.backgroundImage = imgUrl ? `url('${imgUrl}')` : '';
  if (vizArt) { vizArt.src = imgUrl; vizArt.style.display = imgUrl ? 'block' : 'none'; }

  if (currentMediaMode === 'video') {
    if (currentVideoContent === 'video') {
      video.classList.remove('hidden');
      visualizer.classList.add('hidden');
    } else {
      const cachedId = cachedVideoId || song.video;
      
      if (cachedId) {
        currentVideoContent = 'youtube';
        _activateYouTubeIframe(cachedId, audio.currentTime);
      } else {
        if (video) video.classList.add('hidden');
        if (visualizer) visualizer.classList.remove('hidden');
      }
    }
  }

  if (!video) return;

  // Reset video element
  try { video.pause(); video.currentTime = 0; } catch (e) {}

  if (currentVideoUrl) {
    video.src = currentVideoUrl;
    video.muted = true;
    video.onloadedmetadata = () => {
      if (audio.currentTime > 0) {
        try { video.currentTime = audio.currentTime; } catch (e) {}
      }
    };
    video.onerror = () => {
      currentVideoContent = 'visualizer';
      if (badge) badge.textContent = 'CANVAS';
      if (currentMediaMode === 'video') {
        video.classList.add('hidden');
        visualizer?.classList.remove('hidden');
        ytFrame?.classList.add('hidden');
      }
    };
  } else {
    video.removeAttribute('src');
    video.load();
  }

  // Background search (always runs, upgrades CANVAS → YOUTUBE when found)
  const songIdAtSearch = song.id;
  pendingVideoSearch = fetchYouTubeVideoId(song);
  pendingVideoSearch.then(videoId => {
    if (!currentSong || currentSong.id !== songIdAtSearch) return;
    if (currentVideoContent === 'video') return; // Local video file priority

    if (videoId) {
      currentVideoContent = 'youtube';
      updateVideoAvailability(true);
      if (currentMediaMode === 'video') {
        // User is already in video mode — upgrade seamlessly
        _activateYouTubeIframe(videoId, audio.currentTime);
      } else {
        // Still in audio mode — silently pre-warm so Video click will be instant
        _prewarmYouTubeIframe(videoId);
      }
    } else {
      updateVideoAvailability(!!currentVideoUrl || !!cachedVideoId);
    }
  }).catch(() => {
    updateVideoAvailability(!!currentVideoUrl || !!cachedVideoId);
  });
}

function playByEra(era) {
  unlockAudioGraph();
  if (typeof SongsDB === 'undefined' || !SongsDB.SONGS_DB) { showToast('Loading...'); return; }
  activeLanguage = 'telugu';
  bollywoodCategoryPool = null;
  activeCollectionPool = null;
  const eraToDecadeKey = { 'classics': '1980s', '1990s': '1990s', '2000s': '2000s', '2010s': '2010s', '2020s': '2020s' };
  eraLock = eraToDecadeKey[era] || null;
  updateEraLockBadge();
  const ranges = { 'classics':[1980,1989], '1990s':[1990,1999], '2000s':[2000,2009], '2010s':[2010,2019], '2020s':[2020,2030] };
  const r = ranges[era];
  if (!r) { playRandomSong(); return; }
  const pool = SongsDB.SONGS_DB.filter(s => { const y = parseInt(s.year); return y >= r[0] && y <= r[1]; });
  if (!pool.length) { playRandomSong(); return; }
  const song = smartPickRandom(pool, currentSong?.id) || pool[Math.floor(Math.random() * pool.length)];
  history.push(song); historyIndex = history.length - 1;
  playSong(song); showPage('player');
}

function playSong(song) {
  if (!song || !song.audio) {
    showToast('This song has no playable audio source');
    isLoadingNext = false;
    showLoading(false);
    return;
  }

  if (isLoadingNext && currentSong?.id !== song.id) {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }
  isLoadingNext = true;
  currentSongStreamRefreshed = false;
  if (shouldResetVocalHideForSong(song)) {
    clearVocalHideState();
  }
  currentSong = song;
  activeLanguage = (song.language === 'hindi') ? 'hindi' : 'telugu';
  showLoading(true);
  syncedLyrics = [];
  clearInterval(lyricsTimer);

  const songName = decodeHtml(song.name);
  const artistName = decodeHtml(song.artists || 'Unknown Artist');
  
  document.getElementById('song-title').textContent = songName;
  document.getElementById('song-artist').textContent = artistName;
  document.getElementById('song-album').textContent = song.album ? `${decodeHtml(song.album)} • ${song.year || ''}` : (song.year || '');

  const artEl = document.getElementById('album-art');
  if (song.image) {
    artEl.innerHTML = `<img class="album-art" src="${escAttr(song.image)}" alt="" onerror="this.parentElement.innerHTML='<div class=\\'album-art-placeholder\\'>🎵</div>'" />`;
    document.getElementById('player-bg').style.backgroundImage = `url(${escAttr(song.image)})`;
  } else {
    artEl.innerHTML = '<div class="album-art-placeholder">🎵</div>';
    document.getElementById('player-bg').style.backgroundImage = '';
  }

  setupSongMedia(song);

  document.getElementById('npb-title').textContent = songName;
  document.getElementById('npb-artist').textContent = artistName;
  const npbArt = document.getElementById('npb-art');
  npbArt.src = song.image || ''; npbArt.style.display = song.image ? 'block' : 'none';
  
  const onPlayer = document.getElementById('page-player')?.classList.contains('active');
  const npbEl = document.querySelector('.now-playing-bar');
  if (onPlayer) npbEl.classList.add('hidden');
  else npbEl.classList.remove('hidden');

  updateHeartBtn(); updateNpbHeart(); updatePlayerDownloadBtn();

  // Update MediaSession API for lock screen controls
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: songName, artist: artistName,
      album: song.album ? decodeHtml(song.album) : '',
      artwork: song.image ? [{ src: song.image, sizes: '500x500', type: 'image/jpeg' }] : []
    });
  }

  const fallbackUrls = getAudioFallbackUrls(song.audio);
  if (!fallbackUrls.length) {
    showToast('This song has an invalid audio source');
    isLoadingNext = false;
    showLoading(false);
    return;
  }

  currentAudioFallbackUrls = fallbackUrls;
  currentAudioFallbackIndex = 0;

  if (!supportsAacMp4()) {
    showToast('Playback blocked: this browser lacks AAC codec support. Use Chrome or Edge.');
    isLoadingNext = false;
    showLoading(false);
    isPlaying = false;
    updatePlayBtn();
    return;
  }

  audio.src = currentAudioFallbackUrls[currentAudioFallbackIndex];
  audio.play().then(() => {
    isPlaying = true; isLoadingNext = false; showLoading(false);
    consecutiveErrors = 0;
    updatePlayBtn();
    document.querySelector('.album-art-container')?.classList.add('playing');
    saveRecent(song);
    fetchLyrics(song);
    if (window.aiEngine) window.aiEngine.trackPlay(song);
    if (voiceMode === 'vocal') {
      applyVocalHideForCurrentSong();
    }
  }).catch(e => {
    console.error('Play failed:', e);
    // Don't retry here — let the audio 'error' event handler deal with retries
    // This prevents double-firing (both .catch and error event) causing rapid cycling
    isLoadingNext = false; showLoading(false);
  });
}

function togglePlay() {
  unlockAudioGraph();
  if (!currentSong) { playRandomSong(); return; }
  if (!audio.src || audio.src === location.href) {
    playSong(currentSong); return;
  }
  if (isPlaying) { audio.pause(); isPlaying = false; }
  else { audio.play().catch(() => {}); isPlaying = true; }
  updatePlayBtn();
  document.querySelector('.album-art-container')?.classList.toggle('playing', isPlaying);
}

function playNext() {
  unlockAudioGraph();
  if (isLoadingNext) return;
  if (activeCollectionPool && activeCollectionPool.length > 1) {
    const idx = activeCollectionPool.findIndex(s => s.id === currentSong?.id);
    const next = (idx >= 0 && idx < activeCollectionPool.length - 1) ? activeCollectionPool[idx + 1] : activeCollectionPool[0];
    const lookaheadIdx = activeCollectionPool.indexOf(next) + 1;
    if (lookaheadIdx < activeCollectionPool.length) {
      fetchYouTubeVideoId(activeCollectionPool[lookaheadIdx]).catch(() => {});
    }
    history.push(next);
    historyIndex = history.length - 1;
    playSong(next);
    return;
  }
  // Bollywood category pool override
  if (bollywoodCategoryPool && activeLanguage === 'hindi') {
    const idx = bollywoodCategoryPool.findIndex(s => s.id === currentSong?.id);
    const next = (idx >= 0 && idx < bollywoodCategoryPool.length - 1) ? bollywoodCategoryPool[idx + 1] : bollywoodCategoryPool[0];
    // Look-ahead: pre-fetch video ID for the song after next in pool
    const lookaheadIdx = bollywoodCategoryPool.indexOf(next) + 1;
    if (lookaheadIdx < bollywoodCategoryPool.length) {
      fetchYouTubeVideoId(bollywoodCategoryPool[lookaheadIdx]).catch(() => {});
    }
    history.push(next); historyIndex = history.length - 1;
    playSong(next); return;
  }
  // Smart shuffle: use smartPickRandom with era lock support
  const db = getActiveDB();
  const song = smartPickRandom(db, currentSong?.id);
  if (song) {
    history.push(song); historyIndex = history.length - 1;
    playSong(song);
  } else if (activeLanguage === 'hindi' && typeof BollywoodSongsDB !== 'undefined') {
    playRandomBollywood();
  } else {
    playRandomSong();
  }
}

function playPrev() {
  unlockAudioGraph();
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  if (historyIndex > 0) { historyIndex--; playSong(history[historyIndex]); }
}

function updatePlayBtn() {
  const playSvg = '<svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  const pauseSvg = '<svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6zm8-14v14h4V5z"/></svg>';
  const npbPlaySvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  const npbPauseSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6zm8-14v14h4V5z"/></svg>';
  document.getElementById('play-btn').innerHTML = isPlaying ? pauseSvg : playSvg;
  document.getElementById('npb-play').innerHTML = isPlaying ? npbPauseSvg : npbPlaySvg;
}

function updateEraLockBadge() {
  const badge = document.getElementById('era-lock-badge');
  const text = document.getElementById('era-lock-text');
  if (!badge) return;
  if (eraLock) {
    const labels = { '2020s': '2020s Hits', '2010s': '2010s Hits', '2000s': '2000s Hits', '1990s': '90s Classics', '1980s': '80s Classics', 'pre1980': 'Vintage' };
    if (text) text.textContent = labels[eraLock] || eraLock;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function clearEraLock() {
  eraLock = null;
  bollywoodCategoryPool = null;
  activeCollectionPool = null;
  updateEraLockBadge();
  showToast('Playing all decades');
}

// ═══ LYRICS (LRCLIB time-synced) ═══
function toggleLyrics() {
  lyricsVisible = !lyricsVisible;
  document.getElementById('lyrics-panel').classList.toggle('hidden', !lyricsVisible);
  document.getElementById('lyrics-toggle').style.color = lyricsVisible ? 'var(--accent)' : '';
}

function seekToLyric(index) {
  if (!Array.isArray(syncedLyrics) || index < 0 || index >= syncedLyrics.length) return;
  const target = Number(syncedLyrics[index]?.time);
  if (!Number.isFinite(target) || !audio.duration) return;
  audio.currentTime = Math.max(0, Math.min(target, audio.duration));
  lyricManualSeekAt = Date.now();
  syncSongVideoTime();
  syncYouTubeTime(true);
}

function parseLRC(lrc) {
  return lrc.split('\n').map(line => {
    const m = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.*)/);
    if (!m) return null;
    return { time: parseInt(m[1])*60 + parseInt(m[2]) + parseInt(m[3])/(m[3].length===3?1000:100), text: m[4].trim() };
  }).filter(l => l && l.text).sort((a,b) => a.time - b.time);
}

async function fetchLyrics(song) {
  const el = document.getElementById('lyrics-content');
  syncedLyrics = []; clearInterval(lyricsTimer);
  el.innerHTML = '<div class="lyrics-placeholder">Searching lyrics...</div>';
  const name = decodeHtml(song.name).replace(/\(From.*?\)/gi,'').replace(/\(.*?Version\)/gi,'').trim();
  const artist = decodeHtml(song.artists||'').split(',')[0].trim();
  const songLang = song.language || 'telugu';
  try {
    const resp = await fetch(`${LRCLIB_API}?q=${encodeURIComponent(`${name} ${artist}`.substring(0,80))}`);
    if (!resp.ok) throw new Error('Network error');
    const results = await resp.json();
    if (results?.length) {
      // Filter: prefer results matching the song's language context
      // For Telugu songs, try to find results with artist name match (since LRCLIB doesn't have language tags)
      let filtered = results;
      if (songLang === 'telugu') {
        // Filter out results that look like Hindi/English covers of the same title
        const artistLower = artist.toLowerCase();
        const nameWords = name.toLowerCase().split(/\s+/);
        filtered = results.filter(r => {
          const rArtist = (r.artistName || '').toLowerCase();
          const rTrack = (r.trackName || '').toLowerCase();
          // Prefer if artist name partially matches, or track name closely matches
          return rArtist.includes(artistLower) || artistLower.includes(rArtist.split(',')[0]?.trim()) ||
                 nameWords.every(w => rTrack.includes(w));
        });
        if (!filtered.length) filtered = []; // No good match — don't show wrong lyrics
      }
      const synced = filtered.find(r => r.syncedLyrics);
      const plain = filtered.find(r => r.plainLyrics);
      if (synced?.syncedLyrics) {
        syncedLyrics = parseLRC(synced.syncedLyrics);
        el.innerHTML = syncedLyrics.map((l,i) => `<div class="lyric-line" data-idx="${i}">${escHtml(l.text)}</div>`).join('');
        el.querySelectorAll('.lyric-line').forEach(line => {
          line.addEventListener('click', () => {
            const idx = parseInt(line.getAttribute('data-idx') || '-1', 10);
            seekToLyric(idx);
          });
        });
        startLyricsSync(); return;
      }
      if (plain?.plainLyrics) { el.innerHTML = escHtml(plain.plainLyrics).replace(/\n/g,'<br>'); return; }
    }
    el.innerHTML = '<div class="lyrics-placeholder">♪ No lyrics found</div>';
  } catch(e) { el.innerHTML = '<div class="lyrics-placeholder">♪ Could not load lyrics</div>'; }
}

function startLyricsSync() {
  clearInterval(lyricsTimer);
  lyricsTimer = setInterval(() => {
    if (!syncedLyrics.length || !audio.currentTime) return;
    let activeIdx = -1;
    for (let i = syncedLyrics.length-1; i >= 0; i--) { if (syncedLyrics[i].time <= audio.currentTime) { activeIdx = i; break; } }
    const lines = document.querySelectorAll('.lyric-line');
    lines.forEach((line,i) => {
      line.classList.toggle('lyric-active', i === activeIdx);
      line.classList.toggle('lyric-past', i < activeIdx);
    });
    if (activeIdx >= 0 && lines[activeIdx] && (Date.now() - lyricManualSeekAt > 1200)) {
      lines[activeIdx].scrollIntoView({behavior:'smooth',block:'center'});
    }
  }, 200);
}

// ═══ AUDIO EVENTS ═══
audio.addEventListener('ended', () => playNext());
audio.addEventListener('error', async () => {
  const mediaErr = audio.error;
  const errorCode = mediaErr?.code || 0;
  const src = audio.currentSrc || audio.src || '';
  const errorLabels = {
    1: 'aborted',
    2: 'network',
    3: 'decode',
    4: 'src_not_supported'
  };
  const label = errorLabels[errorCode] || 'unknown';
  console.error('Audio playback error', {
    code: errorCode,
    label,
    src,
    networkState: audio.networkState,
    readyState: audio.readyState
  });

  if (errorCode === 4 && !supportsAacMp4()) {
    isLoadingNext = false;
    showLoading(false);
    isPlaying = false;
    updatePlayBtn();
    showToast('Codec unsupported in this browser (AAC/MP4). Please use Chrome or Edge.');
    return;
  }

  if (tryNextAudioFallback()) {
    isLoadingNext = false;
    showLoading(false);
    return;
  }

  if (await tryRefreshCurrentSongStream()) {
    return;
  }

  isLoadingNext = false;
  showLoading(false);
  consecutiveErrors++;
  if (consecutiveErrors > 3) {
    consecutiveErrors = 0;
    isPlaying = false;
    updatePlayBtn();
    showToast('Multiple songs unavailable — tap play to try again');
    return;
  }
  showToast(`Song unavailable, skipping... (${consecutiveErrors}/3)`);
  setTimeout(() => {
    if (activeLanguage === 'hindi') playRandomBollywood();
    else playNext();
  }, 1500);
});
audio.addEventListener('timeupdate', () => {
  if (!audio.duration || isNaN(audio.duration)) return;
  const now = Date.now();
  const uiTick = IS_MOBILE ? 170 : 95;
  if (now - latestTimeUiUpdateAt >= uiTick) {
    const pct = (audio.currentTime/audio.duration)*100;
    document.getElementById('progress-fill').style.width = pct+'%';
    document.getElementById('progress-knob').style.left = pct+'%';
    document.getElementById('time-current').textContent = fmtTime(audio.currentTime);
    document.getElementById('time-total').textContent = fmtTime(audio.duration);
    latestTimeUiUpdateAt = now;
  }

  const mediaTick = IS_MOBILE ? 250 : 120;
  if (now - latestMediaSyncAt >= mediaTick) {
    syncSongVideoTime();
    if (currentVideoContent === 'youtube' && !audio.paused) {
      syncYouTubeTime(false);
    }
    latestMediaSyncAt = now;
  }
});
audio.addEventListener('pause', () => {
  isPlaying = false; updatePlayBtn();
  document.querySelector('.album-art-container')?.classList.remove('playing');
  document.getElementById('song-video')?.pause();
  if (currentVideoContent === 'youtube') {
    _ytPostMessage('pauseVideo', []);
  }
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
});
audio.addEventListener('play', () => {
  isPlaying = true; updatePlayBtn();
  document.querySelector('.album-art-container')?.classList.add('playing');
  if (currentMediaMode === 'video' && currentVideoContent === 'video') {
    const video = document.getElementById('song-video');
    syncSongVideoTime();
    video?.play().catch(() => {});
  }
  if (currentVideoContent === 'youtube') {
    _ytPostMessage('mute', []);
    _ytPostMessage('playVideo', []);
    syncYouTubeTime(true);
  }
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
});

// Video element event listeners for sync (only for real music video content)
const video = document.getElementById('song-video');
if (video) {
  video.addEventListener('timeupdate', () => {
    if (currentMediaMode === 'video' && currentVideoContent === 'video' && Math.abs(video.currentTime - audio.currentTime) > 0.5) {
      try { video.currentTime = audio.currentTime; } catch (e) {}
    }
  });
  video.addEventListener('play', () => {
    if (currentVideoContent === 'video' && !audio.paused && Math.abs(video.currentTime - audio.currentTime) > 0.2) {
      try { video.currentTime = audio.currentTime; } catch (e) {}
    }
  });
}

function fmtTime(s) { if (isNaN(s)) return '0:00'; const m=Math.floor(s/60), sec=Math.floor(s%60); return m+':'+(sec<10?'0':'')+sec; }

function seekTo(e) {
  if (!audio.duration || isNaN(audio.duration)) return;
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const bar = document.getElementById('progress-bar');
  if (!bar) return;
  const rect = bar.getBoundingClientRect();
  audio.currentTime = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * audio.duration;
  syncSongVideoTime();
  syncYouTubeTime(true);
}

function initProgressDrag() {
  const bar = document.getElementById('progress-bar');
  if (!bar) return;
  let dragging = false;

  function onMove(e) {
    if (!dragging) return;
    e.preventDefault();
    seekTo(e);
  }
  function onEnd() {
    if (!dragging) return;
    dragging = false;
    bar.classList.remove('dragging');
  }

  bar.addEventListener('mousedown', e => { dragging = true; bar.classList.add('dragging'); seekTo(e); });
  bar.addEventListener('touchstart', e => { dragging = true; bar.classList.add('dragging'); seekTo(e); }, { passive: false });
  document.addEventListener('mousemove', onMove);
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('mouseup', onEnd);
  document.addEventListener('touchend', onEnd);
}

// MediaSession API for lock screen controls
if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('play', () => togglePlay());
  navigator.mediaSession.setActionHandler('pause', () => togglePlay());
  navigator.mediaSession.setActionHandler('previoustrack', () => playPrev());
  navigator.mediaSession.setActionHandler('nexttrack', () => playNext());
  navigator.mediaSession.setActionHandler('seekto', (details) => {
    if (details.seekTime !== undefined && !isNaN(audio.duration) && audio.duration > 0) {
      audio.currentTime = Math.max(0, Math.min(details.seekTime, audio.duration));
      syncSongVideoTime();
      syncYouTubeTime(true);
    }
  });
}

// ═══ HEART / LIKE ═══
function toggleLike() {
  if (!currentSong) return;
  if (window.aiEngine.isLiked(currentSong.id)) window.aiEngine.unlikeSong(currentSong.id);
  else window.aiEngine.likeSong(currentSong);
  updateHeartBtn(); updateNpbHeart();
  window.aiEngine.rebuildProfile(); window.aiEngine.save();
  if (document.getElementById('page-profile')?.classList.contains('active')) renderProfile();
}
function updateHeartBtn() {
  const btn = document.getElementById('heart-btn');
  const heartEmpty = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
  const heartFilled = '<svg width="24" height="24" viewBox="0 0 24 24" fill="var(--heart, #e74c3c)" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
  if (!currentSong) { btn.classList.remove('liked'); btn.innerHTML=heartEmpty; return; }
  const liked = window.aiEngine.isLiked(currentSong.id);
  btn.classList.toggle('liked', liked); btn.innerHTML = liked ? heartFilled : heartEmpty;
}
function updateNpbHeart() {
  const btn = document.getElementById('npb-heart');
  const heartEmpty = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
  const heartFilled = '<svg width="18" height="18" viewBox="0 0 24 24" fill="var(--heart, #e74c3c)" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
  if (!currentSong) return;
  const liked = window.aiEngine.isLiked(currentSong.id);
  btn.innerHTML = liked ? heartFilled : heartEmpty; btn.style.color = liked ? 'var(--heart)' : '';
}

// ═══ RECENT ═══
function saveRecent(song) {
  try {
    let recent = JSON.parse(localStorage.getItem('raagam_recent')||'[]');
    recent = recent.filter(s => s.id !== song.id);
    recent.unshift({id:song.id,name:song.name,artists:song.artists,image:song.image,audio:song.audio,year:song.year,album:song.album,language:song.language});
    recent = recent.slice(0,30);
    localStorage.setItem('raagam_recent', JSON.stringify(recent));
  } catch(e) {}
}
function renderRecent() {
  try {
    const recent = JSON.parse(localStorage.getItem('raagam_recent')||'[]');
    const section = document.getElementById('recently-played-section');
    const grid = document.getElementById('recent-grid');
    if (!recent.length) { section.style.display='none'; return; }
    section.style.display='block';
    grid.innerHTML = recent.slice(0,10).map(s => {
      const previewData = _buildPreviewAttr(s);
      return `<div class="recent-card" onclick="playFromRecent('${escAttr(s.id)}')" data-preview-song="${previewData}">
        <div class="thumb-wrap">
          <img src="${escAttr(s.image||'')}" alt="" onerror="this.style.display='none'" loading="lazy" />
          <div class="thumb-hover-overlay"><div class="thumb-play-icon">▶</div></div>
        </div>
        <div class="recent-title">${escHtml(decodeHtml(s.name))}</div>
        <div class="recent-artist">${escHtml(decodeHtml(s.artists||''))}</div>
      </div>`;
    }).join('');
  } catch(e) {}
}
function playFromRecent(id) {
  unlockAudioGraph();
  try {
    const song = JSON.parse(localStorage.getItem('raagam_recent')||'[]').find(s=>s.id===id);
    if (song) {
      activeCollectionPool = null;
      bollywoodCategoryPool = null;
      history.push(song);
      historyIndex=history.length-1;
      playSong(song);
      showPage('player');
    }
  } catch(e) {}
}

// ═══ NAVIGATION ═══
function showPage(name) {
  document.querySelectorAll('#app-container .page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn[data-page]').forEach(b => b.classList.remove('active'));
  document.getElementById('page-'+name)?.classList.add('active');
  document.querySelector(`.nav-btn[data-page="${name}"]`)?.classList.add('active');
  const npb = document.querySelector('.now-playing-bar');
  if (npb && currentSong) npb.classList.toggle('hidden', name==='player');
  if (name==='library') renderLibrary();
  if (name==='profile') renderProfile();
  if (name==='home') {
    renderRecent();
    updateHomeStats();
    if (!homeShelvesRendered.telugu) renderDynamicHomeContent(false);
  }
  if (name==='search') { setTimeout(() => document.getElementById('search-input')?.focus(), 50); }
  if (name==='bollywood') {
    renderBollywoodList();
    if (!homeShelvesRendered.hindi) renderDynamicHomeContent(false);
  }
  if (name==='player') updatePlayerDownloadBtn();
}

// ═══ LIBRARY (Liked + Offline) ═══
function renderLibrary() {
  const songs = window.aiEngine ? window.aiEngine.getLikedSongs() : [];
  const container = document.getElementById('library-list');
  const dlSongs = getDownloadedSongsList();
  
  let html = '';
  
  // Offline Songs section
  if (dlSongs.length > 0) {
    html += '<div class="library-section-header"><h3>📥 Downloaded Songs</h3><span class="library-section-count">' + dlSongs.length + '</span></div>';
    html += dlSongs.map(s => {
      const previewData = _buildPreviewAttr(s);
      return `<div class="library-item" data-preview-song="${previewData}">
        <img class="library-thumb" src="${escAttr(s.image||'')}" alt="" onerror="this.style.display='none'" loading="lazy" onclick="playDownloaded('${escAttr(s.id)}')" />
        <div class="library-info" onclick="playDownloaded('${escAttr(s.id)}')">
          <h4>${escHtml(decodeHtml(s.name))}</h4>
          <p>${escHtml(decodeHtml(s.artists||s.album||''))} <span class="dl-badge">Downloaded</span></p>
        </div>
        <button class="lib-remove-btn" onclick="removeDownload('${escAttr(s.id)}')" title="Remove download">✕</button>
      </div>`;
    }).join('');
  }
  
  // Liked Songs section
  const likedLabel = dlSongs.length > 0 ? '<div class="library-section-header"><h3>❤️ Liked Songs</h3><span class="library-section-count">' + songs.length + '</span></div>' : '';
  document.getElementById('library-count').textContent = songs.length ? `${songs.length} liked` : '';
  
  if (songs.length > 0) {
    html += likedLabel;
    html += songs.slice().reverse().map(s => {
      const isDl = isSongDownloaded(s);
      const previewData = _buildPreviewAttr(s);
      return `<div class="library-item" onclick="playSongFromLib('${escAttr(s.id)}')" data-preview-song="${previewData}">
        <img class="library-thumb" src="${escAttr(s.image||'')}" alt="" onerror="this.style.display='none'" loading="lazy" />
        <div class="library-info">
          <h4>${escHtml(decodeHtml(s.name))} ${isDl ? '<span class="dl-badge">↓</span>' : ''}</h4>
          <p>${escHtml(decodeHtml(s.artists||s.album||''))}</p>
        </div>
        <button class="lib-dl-btn" data-download-id="${escAttr(s.id)}" onclick="event.stopPropagation(); ${isDl ? `removeDownload('${escAttr(s.id)}')` : `downloadSongById('${escAttr(s.id)}')`}" title="${isDl ? 'Remove download' : 'Download for offline'}">${isDl ? '✓' : '↓'}</button>
      </div>`;
    }).join('');
  }
  
  if (!html) {
    container.innerHTML = '<div class="empty-state"><div class="icon">♡</div><p>Songs you heart will appear here</p><p style="font-size:12px;margin-top:8px">Downloaded songs for offline listening will also show here</p></div>';
    return;
  }
  container.innerHTML = html;
}

function downloadSongById(id) {
  // Find song in liked songs or DBs
  let song = window.aiEngine?.getLikedSongs().find(s => s.id === id);
  if (!song && typeof SongsDB !== 'undefined') song = SongsDB.SONGS_DB.find(s => s.id === id);
  if (!song && typeof BollywoodSongsDB !== 'undefined') song = BollywoodSongsDB.SONGS_DB.find(s => s.id === id);
  if (song) downloadSong(song);
}

function playDownloaded(id) {
  unlockAudioGraph();
  const song = normalizeDownloadedSong(downloadedSongs[id], id);
  if (song) {
    downloadedSongs[song.id] = song;
    activeCollectionPool = getDownloadedSongsList();
    bollywoodCategoryPool = null;
    activeLanguage = (song.language === 'hindi') ? 'hindi' : 'telugu';
    history.push(song);
    historyIndex = history.length - 1;
    playSong(song);
    showPage('player');
  }
}

function playSongFromLib(id) {
  unlockAudioGraph();
  const song = window.aiEngine.getLikedSongs().find(s=>s.id===id);
  if (song) {
    activeCollectionPool = null;
    bollywoodCategoryPool = null;
    history.push(song);
    historyIndex=history.length-1;
    playSong(song);
    showPage('player');
  }
}

// ═══ PROFILE ═══
function renderProfile() {
  if (!window.aiEngine) return;
  window.aiEngine.rebuildProfile();
  
  const p = window.aiEngine.getPreferences();
  const liked = window.aiEngine.getLikedSongs();
  const colors = AIEngine.GENRE_COLORS;
  const topGenre = p.topGenre || 'unknown';
  const genreColor = colors[topGenre] || colors.unknown;

  const glow = document.getElementById('profile-hero-glow');
  if (genreColor) {
    glow.style.background = `radial-gradient(circle, ${genreColor.color}66 0%, transparent 70%)`;
    document.querySelector('.profile-avatar-ring').style.background = genreColor.gradient;
  }

  const personalityEl = document.getElementById('profile-personality');
  if (p.personality && liked.length > 0) {
    personalityEl.textContent = `${p.personalityEmoji} ${p.personality}`;
    personalityEl.style.display = 'inline-block';
  } else {
    personalityEl.style.display = 'none';
  }

  const stats = p.stats || {};
  document.getElementById('profile-stats').innerHTML = `
    <div class="stat-card"><div class="stat-num">${stats.totalLiked || 0}</div><div class="stat-label">Liked Songs</div></div>
    <div class="stat-card"><div class="stat-num">${stats.hoursEstimated || '0'}</div><div class="stat-label">Hours Est.</div></div>
    <div class="stat-card"><div class="stat-num">${stats.uniqueArtists || 0}</div><div class="stat-label">Artists</div></div>
    <div class="stat-card"><div class="stat-num">${stats.decadesSpanned || 0}</div><div class="stat-label">Decades</div></div>`;

  const dnaBar = document.getElementById('profile-dna-bar');
  const dnaLegend = document.getElementById('profile-dna-legend');
  const genreDist = p.genreDistribution || {};
  const genreEntries = Object.entries(genreDist).sort((a, b) => b[1] - a[1]);
  
  if (genreEntries.length > 0) {
    dnaBar.innerHTML = genreEntries.map(([genre, pct]) => {
      const c = colors[genre] || colors.unknown;
      return `<div class="dna-segment" style="width:${Math.max(pct, 3)}%;background:${c.gradient}"></div>`;
    }).join('');
    dnaLegend.innerHTML = genreEntries.map(([genre, pct]) => {
      const c = colors[genre] || colors.unknown;
      return `<div class="dna-legend-item"><div class="dna-legend-dot" style="background:${c.color}"></div>${escHtml(genre)} ${pct}%</div>`;
    }).join('');
  } else {
    dnaBar.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:4px 0">Like songs to see your DNA!</div>';
    dnaLegend.innerHTML = '';
  }

  const badges = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];

  const singersEl = document.getElementById('profile-singers');
  const singersCard = document.getElementById('profile-singers-card');
  if (p.topSingers && p.topSingers.length > 0) {
    singersCard.style.display = '';
    singersEl.innerHTML = p.topSingers.slice(0, 5).map((s, i) =>
      `<div class="rank-item"><span class="rank-badge">${badges[i] || ''}</span><span class="rank-name">${escHtml(s.name)}</span><span class="rank-count">${s.count} song${s.count > 1 ? 's' : ''}</span></div>`
    ).join('');
  } else {
    singersCard.style.display = 'none';
  }

  const mdEl = document.getElementById('profile-music-directors');
  const mdCard = document.getElementById('profile-md-card');
  if (p.topMusicDirectors && p.topMusicDirectors.length > 0) {
    mdCard.style.display = '';
    mdEl.innerHTML = p.topMusicDirectors.slice(0, 5).map((s, i) =>
      `<div class="rank-item"><span class="rank-badge">${badges[i] || ''}</span><span class="rank-name">${escHtml(s.name)}</span><span class="rank-count">${s.count} song${s.count > 1 ? 's' : ''}</span></div>`
    ).join('');
  } else {
    mdCard.style.display = 'none';
  }

  const genreBadge = document.getElementById('profile-genre-badge');
  const genreCard = document.getElementById('profile-genre-card');
  if (p.topGenres && p.topGenres.length > 0) {
    const g = p.topGenres[0];
    const gc = colors[g.name] || colors.unknown;
    const genreIcons = { romantic: '💕', mass: '🔥', melody: '🎵', folk: '🌾', devotional: '🙏', classical: '🎻', dance: '💃', sad: '🥺' };
    genreCard.style.display = '';
    genreBadge.innerHTML = `
      <div class="genre-badge" style="background:${gc.gradient}">
        <div class="genre-badge-icon">${genreIcons[g.name] || '🎶'}</div>
        <div class="genre-badge-label">Favorite Genre</div>
        <div class="genre-badge-name">${escHtml(g.name)}</div>
      </div>`;
  } else {
    genreCard.style.display = 'none';
  }

  const decadesEl = document.getElementById('profile-decades');
  const decadeData = p.topDecades || [];
  if (decadeData.length > 0) {
    const maxCount = Math.max(...decadeData.map(d => d.count));
    const allDecades = ['1950s', '1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'];
    const decadeMap = {};
    decadeData.forEach(d => { decadeMap[d.decade] = d.count; });
    const relevantDecades = allDecades.filter(d => decadeMap[d]);
    decadesEl.innerHTML = relevantDecades.map(d => {
      const count = decadeMap[d] || 0;
      const h = maxCount > 0 ? Math.max((count / maxCount) * 70, 4) : 4;
      return `<div class="decade-bar-col">
        <div class="decade-bar" style="height:${h}px"><span class="decade-bar-count">${count}</span></div>
        <div class="decade-label">${d.replace('s','')}</div>
      </div>`;
    }).join('');
  } else {
    decadesEl.innerHTML = '<div style="color:var(--text-muted);font-size:13px">No data yet</div>';
  }

  const recentCard = document.getElementById('profile-recent-card');
  const recentLikes = document.getElementById('profile-recent-likes');
  if (liked.length > 0) {
    recentCard.style.display = '';
    const last5 = liked.slice(-5).reverse();
    recentLikes.innerHTML = last5.map(s =>
      `<div class="recent-like-card" onclick="playSongFromLib('${escAttr(s.id)}')">
        <img class="recent-like-art" src="${escAttr(s.image || '')}" alt="" onerror="this.style.display='none'" loading="lazy" />
        <div class="recent-like-name">${escHtml(decodeHtml(s.name))}</div>
      </div>`
    ).join('');
  } else {
    recentCard.style.display = 'none';
  }

  document.getElementById('profile-insights').innerHTML = p.insights && p.insights.length
    ? p.insights.map(i => `<div class="insight-item"><span>✨</span>${escHtml(i)}</div>`).join('')
    : '<div class="insight-item" style="color:var(--text-muted)">Like 3+ songs to unlock AI insights</div>';
  
  // Cache size
  updateCacheSize();
}

function updateHomeStats() {
  const el = document.getElementById('stat-songs');
  if (el && typeof SongsDB !== 'undefined' && SongsDB.SONGS_DB) {
    let total = SongsDB.SONGS_DB.length;
    if (typeof BollywoodSongsDB !== 'undefined' && BollywoodSongsDB.SONGS_DB) total += BollywoodSongsDB.SONGS_DB.length;
    el.textContent = total.toLocaleString();
  } else if (el) {
    setTimeout(updateHomeStats, 1000);
  }
}

function getSongLanguage(song) {
  const lang = String(song?.language || '').toLowerCase();
  return lang === 'hindi' ? 'hindi' : 'telugu';
}

function getSongPlaySubline(song) {
  const artist = decodeHtml(song?.artists || '').trim();
  const year = String(song?.year || '').trim();
  return [artist, year].filter(Boolean).join(' • ');
}

function findSongByIdAndLanguage(id, language) {
  if (homeFeed?.songs?.length) {
    const fromFeed = homeFeed.songs.find(song => song?.id === id && getSongLanguage(song) === (language === 'hindi' ? 'hindi' : 'telugu'));
    if (fromFeed) return fromFeed;
  }
  if (!id) return null;
  if (language === 'hindi' && typeof BollywoodSongsDB !== 'undefined' && Array.isArray(BollywoodSongsDB.SONGS_DB)) {
    const inHindi = BollywoodSongsDB.SONGS_DB.find(s => s.id === id);
    if (inHindi) return inHindi;
  }
  if (typeof SongsDB !== 'undefined' && Array.isArray(SongsDB.SONGS_DB)) {
    const inTelugu = SongsDB.SONGS_DB.find(s => s.id === id);
    if (inTelugu) return inTelugu;
  }
  if (typeof BollywoodSongsDB !== 'undefined' && Array.isArray(BollywoodSongsDB.SONGS_DB)) {
    return BollywoodSongsDB.SONGS_DB.find(s => s.id === id) || null;
  }
  return null;
}

function playSongById(id, language = 'telugu') {
  unlockAudioGraph();
  const song = findSongByIdAndLanguage(id, language);
  if (!song) {
    showToast('Song unavailable in current catalog');
    return;
  }
  activeCollectionPool = null;
  bollywoodCategoryPool = null;
  activeLanguage = getSongLanguage(song);
  history.push(song);
  historyIndex = history.length - 1;
  playSong(song);
  showPage('player');
}

function renderShelfSongs(containerId, songs, language) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!songs || !songs.length) {
    container.innerHTML = '<div class="home-song-sub">No songs available yet</div>';
    return;
  }
  container.innerHTML = songs.slice(0, 12).map(song => {
    const sub = getSongPlaySubline(song);
    return `<div class="home-song-card" onclick="playSongById('${escAttr(song.id)}','${escAttr(language)}')" data-preview-song="${_buildPreviewAttr(song)}">
      <img class="home-song-art" src="${escAttr(song.image || '')}" alt="" loading="lazy" onerror="this.style.display='none'" />
      <div class="home-song-meta">
        <div class="home-song-name">${escHtml(decodeHtml(song.name || ''))}</div>
        <div class="home-song-sub">${escHtml(sub)}</div>
      </div>
    </div>`;
  }).join('');
}

function renderCollections(containerId, collections, language) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!window.__raagamCollections) window.__raagamCollections = {};
  Object.keys(window.__raagamCollections)
    .filter(key => key.startsWith(`${containerId}:`))
    .forEach(key => delete window.__raagamCollections[key]);
  if (!collections || !collections.length) {
    container.innerHTML = '<div class="home-song-sub">Collections will appear after refresh</div>';
    return;
  }
  container.innerHTML = collections.slice(0, 8).map((col, idx) => {
    const key = `${containerId}:${idx}`;
    window.__raagamCollections[key] = {
      language,
      songIds: (col.songIds || []).slice(0, 120)
    };
    const title = decodeHtml(col.title || 'Collection');
    const subtitle = decodeHtml(col.subtitle || '');
    const count = Number(col.count || (col.songIds || []).length || 0);
    return `<div class="home-collection-card" onclick="playCollectionByKey('${escAttr(key)}')">
      <div class="home-collection-title">${escHtml(title)}</div>
      <div class="home-collection-sub">${escHtml(subtitle)}</div>
      <div class="home-collection-count">${count} songs • Play all</div>
    </div>`;
  }).join('');
}

function playCollectionByKey(key) {
  const payload = window.__raagamCollections?.[key];
  if (!payload) return;
  playCollection(payload.songIds, payload.language);
}

function playCollection(songIdsJson, language = 'telugu') {
  unlockAudioGraph();
  let ids = [];
  try {
    ids = typeof songIdsJson === 'string' ? JSON.parse(songIdsJson) : (Array.isArray(songIdsJson) ? songIdsJson : []);
  } catch (e) {
    ids = [];
  }
  const songs = ids.map(id => findSongByIdAndLanguage(id, language)).filter(Boolean);
  if (!songs.length) {
    showToast('Collection songs unavailable');
    return;
  }
  activeCollectionPool = songs.slice();
  eraLock = null;
  updateEraLockBadge();
  if (language === 'hindi') {
    bollywoodCategoryPool = songs.slice();
    activeLanguage = 'hindi';
  } else {
    bollywoodCategoryPool = null;
    activeLanguage = 'telugu';
  }
  history = [songs[0]];
  historyIndex = 0;
  playSong(songs[0]);
  showPage('player');
}

function mergeCatalogFromFeed(feedSongs = []) {
  const byId = new Map();
  getAllSongs().forEach(song => {
    if (song?.id) byId.set(song.id, song);
  });
  (feedSongs || []).forEach(song => {
    if (song?.id && !byId.has(song.id)) byId.set(song.id, song);
  });
  return byId;
}

function resolveFeedSongIds(ids, language, byIdMap) {
  const resolved = [];
  for (const id of ids || []) {
    if (!id) continue;
    const song = byIdMap.get(id) || findSongByIdAndLanguage(id, language);
    if (song) resolved.push(song);
  }
  return resolved;
}

function fallbackHomeData(language) {
  if (fallbackHomeCache[language]) return fallbackHomeCache[language];
  const source = language === 'hindi'
    ? ((typeof BollywoodSongsDB !== 'undefined' && Array.isArray(BollywoodSongsDB.SONGS_DB)) ? BollywoodSongsDB.SONGS_DB : [])
    : ((typeof SongsDB !== 'undefined' && Array.isArray(SongsDB.SONGS_DB)) ? SongsDB.SONGS_DB : []);
  const sortedByYear = source.slice().sort((a, b) => parseInt(b.year || 0) - parseInt(a.year || 0));
  const byArtist = {};
  source.forEach(song => {
    const primary = decodeHtml(String(song?.artists || '').split(',')[0] || '').trim();
    if (!primary) return;
    if (!byArtist[primary]) byArtist[primary] = [];
    byArtist[primary].push(song);
  });

  const collections = Object.entries(byArtist)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 6)
    .map(([artist, songs]) => ({
      title: artist,
      subtitle: language === 'hindi' ? 'Popular Bollywood singer hits' : 'Popular Telugu singer hits',
      count: songs.length,
      songIds: songs.slice(0, 30).map(song => song.id)
    }));

  const data = {
    newReleases: sortedByYear.slice(0, 12),
    top50: source.slice(0, 50),
    collections
  };
  fallbackHomeCache[language] = data;
  return data;
}

function renderHomeLanguageShelves(language, payload, byIdMap) {
  const isHindi = language === 'hindi';
  const newIds = payload?.newReleases || [];
  const topIds = payload?.top50 || [];
  const collections = payload?.collections || [];

  const newSongs = resolveFeedSongIds(newIds, language, byIdMap);
  const topSongs = resolveFeedSongIds(topIds, language, byIdMap);

  const fallback = fallbackHomeData(language);
  const finalNew = newSongs.length ? newSongs : fallback.newReleases;
  const finalTop = topSongs.length ? topSongs : fallback.top50;

  renderShelfSongs(isHindi ? 'home-hindi-new' : 'home-telugu-new', finalNew, language);
  renderShelfSongs(isHindi ? 'home-hindi-top' : 'home-telugu-top', finalTop, language);
  const finalCollections = (collections && collections.length) ? collections : fallback.collections;
  renderCollections(isHindi ? 'home-hindi-collections' : 'home-telugu-collections', finalCollections, language);
}

function readFeedCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(HOME_FEED_CACHE_KEY) || '{}');
    if (!cached?.timestamp || !cached?.payload) return null;
    if (Date.now() - cached.timestamp > HOME_FEED_TTL_MS) return null;
    return cached.payload;
  } catch (e) {
    return null;
  }
}

function writeFeedCache(payload) {
  try {
    localStorage.setItem(HOME_FEED_CACHE_KEY, JSON.stringify({
      timestamp: Date.now(),
      payload
    }));
  } catch (e) {}
}

async function fetchHomeFeed(force = false) {
  if (homeFeedLoaded && !force) return homeFeed;
  if (homeFeedLoading) return homeFeedLoading;

  const cached = readFeedCache();
  if (cached && !force) {
    homeFeed = cached;
    homeFeedLoaded = true;
    return homeFeed;
  }

  homeFeedLoading = fetch(HOME_FEED_URL, { cache: 'no-store' })
    .then(res => {
      if (!res.ok) throw new Error('feed unavailable');
      return res.json();
    })
    .then(payload => {
      homeFeed = payload;
      homeFeedLoaded = true;
      writeFeedCache(payload);
      return payload;
    })
    .catch(() => {
      const fallback = readFeedCache();
      if (fallback) {
        homeFeed = fallback;
        homeFeedLoaded = true;
        return fallback;
      }
      return null;
    })
    .finally(() => {
      homeFeedLoading = null;
    });

  return homeFeedLoading;
}

async function renderDynamicHomeContent(force = false) {
  if (!force && homeShelvesRendered.telugu && homeShelvesRendered.hindi) return;
  const payload = await fetchHomeFeed(force);
  const byIdMap = mergeCatalogFromFeed(payload?.songs || []);

  if (payload?.languages?.telugu) {
    renderHomeLanguageShelves('telugu', payload.languages.telugu, byIdMap);
    homeShelvesRendered.telugu = true;
  } else {
    renderHomeLanguageShelves('telugu', null, byIdMap);
    homeShelvesRendered.telugu = true;
  }

  if (payload?.languages?.hindi) {
    renderHomeLanguageShelves('hindi', payload.languages.hindi, byIdMap);
    homeShelvesRendered.hindi = true;
  } else {
    renderHomeLanguageShelves('hindi', null, byIdMap);
    homeShelvesRendered.hindi = true;
  }
}

// ═══ CLOUD SYNC (static mode — all data in localStorage) ═══
async function cloudSave() { /* data already in localStorage via aiEngine.save() */ }
async function cloudLoad() { /* data already in localStorage */ }

// ═══ TOAST ═══
function showToast(msg) {
  let el = document.getElementById('toast-msg');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast-msg';
    el.className = 'toast-msg';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.remove('show');
  // Force reflow for animation restart
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 3000);
}

// ═══ HELPERS ═══
function showLoading(show) { document.getElementById('loading').style.display = show ? 'flex' : 'none'; }
function escHtml(s) { const d=document.createElement('div'); d.textContent=s||''; return d.innerHTML; }
function decodeHtml(s) { const d=document.createElement('textarea'); d.innerHTML=s||''; return d.value; }
function escAttr(s) { return (s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ═══ RESTORE LAST PLAYED ═══
function restoreLastPlayed() {
  try {
    const recent = JSON.parse(localStorage.getItem('raagam_recent') || '[]');
    if (recent.length > 0 && !currentSong) {
      const song = recent[0];
      document.getElementById('npb-title').textContent = decodeHtml(song.name);
      document.getElementById('npb-artist').textContent = decodeHtml(song.artists || '');
      const npbArt = document.getElementById('npb-art');
      npbArt.src = song.image || ''; npbArt.style.display = song.image ? 'block' : 'none';
      document.querySelector('.now-playing-bar').classList.remove('hidden');
      currentSong = song;
      updateHeartBtn(); updateNpbHeart();
    }
  } catch(e) {}
}

// ═══ SWIPE GESTURES ═══
let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;
let swiping = false;

function initSwipe() {
  const artContainer = document.querySelector('.album-art-container');
  if (!artContainer) return;

  artContainer.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchStartTime = Date.now();
    swiping = true;
    artContainer.style.transition = 'none';
  }, { passive: true });

  artContainer.addEventListener('touchmove', (e) => {
    if (!swiping) return;
    const dx = e.touches[0].clientX - touchStartX;
    const dy = Math.abs(e.touches[0].clientY - touchStartY);
    if (dy > Math.abs(dx)) { swiping = false; artContainer.style.transform = ''; artContainer.style.opacity = '1'; return; }
    const clamped = Math.max(-120, Math.min(120, dx));
    const opacity = 1 - Math.abs(clamped) / 200;
    artContainer.style.transform = `translateX(${clamped}px) rotate(${clamped * 0.05}deg)`;
    artContainer.style.opacity = opacity;
  }, { passive: true });

  artContainer.addEventListener('touchend', (e) => {
    if (!swiping) return;
    swiping = false;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const elapsed = Date.now() - touchStartTime;
    const velocity = Math.abs(dx) / Math.max(elapsed, 1);

    artContainer.style.transition = 'transform 0.3s ease, opacity 0.3s ease';

    if (Math.abs(dx) > 80 || velocity > 0.5) {
      const dir = dx > 0 ? 1 : -1;
      artContainer.style.transform = `translateX(${dir * 300}px) rotate(${dir * 15}deg)`;
      artContainer.style.opacity = '0';
      setTimeout(() => {
        if (dir > 0) playPrev(); else playNext();
        artContainer.style.transition = 'none';
        artContainer.style.transform = `translateX(${-dir * 200}px)`;
        artContainer.style.opacity = '0';
        requestAnimationFrame(() => {
          artContainer.style.transition = 'transform 0.35s ease, opacity 0.35s ease';
          artContainer.style.transform = '';
          artContainer.style.opacity = '1';
        });
      }, 200);
    } else {
      artContainer.style.transform = '';
      artContainer.style.opacity = '1';
    }
  }, { passive: true });
}

// ═══ SEARCH ═══
function getAllSongs() {
  // Try to access SONGS_DB from the global scope with multiple fallback strategies
  let telugu = [];
  let bollywood = [];
  
  // Try direct access (if exported as static or global)
  if (typeof SongsDB !== 'undefined') {
    telugu = SongsDB.SONGS_DB || telugu;
  }
  if (typeof BollywoodSongsDB !== 'undefined') {
    bollywood = BollywoodSongsDB.SONGS_DB || bollywood;
  }
  
  // Fallback: try accessing from window if not found
  if (!telugu || telugu.length === 0) {
    telugu = (window.SongsDB && window.SongsDB.SONGS_DB) || [];
  }
  if (!bollywood || bollywood.length === 0) {
    bollywood = (window.BollywoodSongsDB && window.BollywoodSongsDB.SONGS_DB) || [];
  }
  
  const allSongs = [...(telugu || []), ...(bollywood || [])];
  const byId = new Map();
  for (const song of allSongs) {
    if (song?.id) byId.set(song.id, song);
  }
  if (homeFeed?.songs?.length) {
    for (const song of homeFeed.songs) {
      if (song?.id && !byId.has(song.id)) {
        byId.set(song.id, song);
      }
    }
  }
  return Array.from(byId.values());
}

function ensureSearchIndex() {
  const all = getAllSongs();
  if (searchIndexCount === all.length && searchIndex.length) return searchIndex;

  searchResultCache = new Map();
  lastSearchQueryNorm = '';
  lastSearchEntryPool = [];
  searchEntryById = new Map();

  searchIndex = all.map(song => {
    const name = decodeHtml(song?.name || '');
    const artists = decodeHtml(song?.artists || '');
    const album = decodeHtml(song?.album || '');
    const nameNorm = normalizeForMatch(name);
    const artistsNorm = normalizeForMatch(artists);
    const albumNorm = normalizeForMatch(album);
    return {
      song,
      nameNorm,
      artistsNorm,
      albumNorm,
      nameTokens: tokenizeForMatch(nameNorm),
      artistTokens: tokenizeForMatch(artistsNorm),
      albumTokens: tokenizeForMatch(albumNorm)
    };
  });
  for (const entry of searchIndex) {
    if (entry?.song?.id) searchEntryById.set(entry.song.id, entry);
  }

  searchIndexCount = all.length;
  return searchIndex;
}

function warmSearchIndex() {
  if (searchWarmupStarted) return;
  searchWarmupStarted = true;
  const runner = () => {
    try { ensureSearchIndex(); } catch (e) {}
  };
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(runner, { timeout: 800 });
  } else {
    setTimeout(runner, 150);
  }
}

function scoreSearchEntry(entry, queryNorm, queryTokens) {
  let score = 0;

  if (entry.nameNorm.includes(queryNorm)) score += 140;
  if (entry.artistsNorm.includes(queryNorm)) score += 95;
  if (entry.albumNorm.includes(queryNorm)) score += 70;

  const titleOverlap = overlapScore(queryTokens, entry.nameTokens);
  const artistOverlap = overlapScore(queryTokens, entry.artistTokens);
  const albumOverlap = overlapScore(queryTokens, entry.albumTokens);

  score += titleOverlap * 90;
  score += artistOverlap * 65;
  score += albumOverlap * 40;

  if (!entry.nameNorm.includes(queryNorm) && titleOverlap === 0 && artistOverlap === 0 && albumOverlap === 0) {
    return 0;
  }

  return score;
}

function performSearch(query) {
  if (!query || query.length < 2) {
    lastSearchQueryNorm = '';
    lastSearchEntryPool = [];
    return [];
  }
  const queryNorm = normalizeForMatch(query);
  const queryTokens = tokenizeForMatch(queryNorm);
  if (!queryNorm) return [];

  const cached = searchResultCache.get(queryNorm);
  if (cached) return cached;

  const index = ensureSearchIndex();
  const isIncremental = lastSearchQueryNorm && queryNorm.startsWith(lastSearchQueryNorm) && lastSearchEntryPool.length;
  const sourceEntries = isIncremental ? lastSearchEntryPool : index;
  const ranked = [];
  for (const entry of sourceEntries) {
    const score = scoreSearchEntry(entry, queryNorm, queryTokens);
    if (score > 0) ranked.push({ song: entry.song, score });
  }

  ranked.sort((a, b) => b.score - a.score);
  const result = ranked.slice(0, 80).map(item => item.song);

  const nextPoolLimit = isIncremental ? 4500 : 6500;
  const nextPool = ranked.slice(0, nextPoolLimit).map(item => {
    const id = item.song?.id;
    if (!id) return null;
    return searchEntryById.get(id) || null;
  }).filter(Boolean);

  lastSearchQueryNorm = queryNorm;
  lastSearchEntryPool = nextPool.length ? nextPool : index;

  searchResultCache.set(queryNorm, result);
  if (searchResultCache.size > 40) {
    const oldestKey = searchResultCache.keys().next().value;
    searchResultCache.delete(oldestKey);
  }

  return result;
}

function renderSearchResults(results, query) {
  const container = document.getElementById('search-results');
  if (!query || query.length < 2) {
    container.innerHTML = '<div class="search-empty-state"><div class="search-empty-icon">🎶</div><p>Search for your favourite songs</p><p class="search-hint">Try "Tum Hi Ho", "Pushpa", or "Arijit Singh"</p></div>';
    return;
  }
  if (!results.length) {
    container.innerHTML = `<div class="search-empty-state"><div class="search-empty-icon">😔</div><p>No results for "${escHtml(query)}"</p><p class="search-hint">Try a different spelling or keyword</p></div>`;
    return;
  }
  container.innerHTML = results.map(s => {
    const isDl = isSongDownloaded(s);
    const previewData = _buildPreviewAttr(s);
    return `<div class="search-result-item" onclick="playSongFromSearch('${escAttr(s.id)}','${escAttr(s.language||'telugu')}')" data-preview-song="${previewData}">
      <img class="search-thumb" src="${escAttr(s.image||'')}" alt="" onerror="this.style.display='none'" loading="lazy" />
      <div class="search-info">
        <h4>${escHtml(decodeHtml(s.name))} ${isDl ? '<span class="dl-badge">↓</span>' : ''}</h4>
        <p>${escHtml(decodeHtml(s.artists||''))} ${s.language==='hindi'?'<span class=search-lang>Hindi</span>':'<span class=search-lang>Telugu</span>'}</p>
      </div>
      <button class="search-dl-btn" data-download-id="${escAttr(s.id)}" onclick="event.stopPropagation(); ${isDl ? `removeDownload('${escAttr(s.id)}')` : `downloadSongById('${escAttr(s.id)}')`}" title="${isDl ? 'Remove' : 'Download'}">${isDl ? '✓' : '↓'}</button>
    </div>`;
  }).join('');
}

function playSongFromSearch(id, lang) {
  unlockAudioGraph();
  activeCollectionPool = null;
  bollywoodCategoryPool = null;
  let song;
  if (lang === 'hindi' && typeof BollywoodSongsDB !== 'undefined') {
    song = BollywoodSongsDB.SONGS_DB.find(s => s.id === id);
  }
  if (!song && homeFeed?.songs?.length) {
    song = homeFeed.songs.find(s => s.id === id);
  }
  if (!song && typeof SongsDB !== 'undefined') song = SongsDB.SONGS_DB.find(s => s.id === id);
  if (!song && typeof BollywoodSongsDB !== 'undefined') song = BollywoodSongsDB.SONGS_DB.find(s => s.id === id);
  if (song) {
    history.push(song);
    historyIndex = history.length - 1;
    playSong(song);
    showPage('player');
  }
}

function clearSearch() {
  const input = document.getElementById('search-input');
  input.value = '';
  document.getElementById('search-clear').style.display = 'none';
  renderSearchResults([], '');
  input.focus();
}

function initSearch() {
  const input = document.getElementById('search-input');
  const clearBtn = document.getElementById('search-clear');
  if (!input) return;

  input.addEventListener('focus', () => {
    warmSearchIndex();
  }, { once: true });
  let debounce;
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    const q = input.value.trim();
    clearBtn.style.display = q ? 'block' : 'none';
    debounce = setTimeout(() => {
      renderSearchResults(performSearch(q), q);
    }, IS_MOBILE ? 180 : 120);
  });
}

// ═══ BOLLYWOOD ═══
let bollywoodCategoryPool = null;
let activeCollectionPool = null;

function playRandomBollywood() {
  unlockAudioGraph();
  activeLanguage = 'hindi';
  bollywoodCategoryPool = null;
  activeCollectionPool = null;
  eraLock = null;
  updateEraLockBadge();
  const excludeId = currentSong ? currentSong.id : null;
  const hindiDb = (typeof BollywoodSongsDB !== 'undefined' && Array.isArray(BollywoodSongsDB.SONGS_DB)) ? BollywoodSongsDB.SONGS_DB : [];
  let song = smartPickRandom(hindiDb, excludeId);
  if (!song) {
    song = pickRandomSongFromList(hindiDb, excludeId);
  }
  if (!song) {
    song = pickRandomSongFromList(getAllSongs().filter(s => (s?.language || '').toLowerCase() === 'hindi'), excludeId)
      || pickRandomSongFromList(getRecentSongsSafe().filter(s => (s?.language || '').toLowerCase() === 'hindi'), excludeId);
  }
  if (song) {
    history.push(song);
    historyIndex = history.length - 1;
    playSong(song);
  }
}

function playBollywoodByEra(era) {
  unlockAudioGraph();
  if (typeof BollywoodSongsDB === 'undefined') return;
  activeCollectionPool = null;
  const eraToDecadeKey = { 'classics': '1980s', '1990s': '1990s', '2000s': '2000s', '2010s': '2010s', '2020s': '2020s' };
  eraLock = eraToDecadeKey[era] || null;
  updateEraLockBadge();
  const ranges = { '2020s': [2020,2030], '2010s': [2010,2019], '2000s': [2000,2009], '1990s': [1990,1999], 'classics': [1980,1989] };
  const r = ranges[era];
  if (!r) { playRandomBollywood(); return; }
  const pool = BollywoodSongsDB.SONGS_DB.filter(s => { const y = parseInt(s.year); return y >= r[0] && y <= r[1]; });
  if (!pool.length) { playRandomBollywood(); return; }
  bollywoodCategoryPool = pool.slice().sort(() => Math.random() - 0.5);
  activeLanguage = 'hindi';
  const song = smartPickRandom(pool, currentSong?.id) || bollywoodCategoryPool[0];
  history = [song]; historyIndex = 0;
  playSong(song); showPage('player');
}

const BOLLYWOOD_CATEGORIES = [
  { key: '2020s', emoji: '🔥', name: '2020s Hits', desc: 'Latest Bollywood bangers', gradient: 'linear-gradient(135deg, #ff6b35, #f7c948)', filter: s => parseInt(s.year) >= 2020 },
  { key: '2010s', emoji: '💫', name: '2010s Hits', desc: 'Arijit Singh era', gradient: 'linear-gradient(135deg, #6c5ce7, #a29bfe)', filter: s => { const y = parseInt(s.year); return y >= 2010 && y <= 2019; } },
  { key: '2000s', emoji: '✨', name: '2000s Hits', desc: 'Golden Bollywood', gradient: 'linear-gradient(135deg, #00b894, #55efc4)', filter: s => { const y = parseInt(s.year); return y >= 2000 && y <= 2009; } },
  { key: '1990s', emoji: '🎭', name: '90s Classics', desc: 'SRK & romance era', gradient: 'linear-gradient(135deg, #e17055, #fab1a0)', filter: s => { const y = parseInt(s.year); return y >= 1990 && y <= 1999; } },
  { key: 'classics', emoji: '🏛️', name: '80s Blockbusters', desc: 'Golden era hits & blockbusters', gradient: 'linear-gradient(135deg, #636e72, #b2bec3)', filter: s => { const y = parseInt(s.year); return y >= 1980 && y <= 1989; } },
  { key: 'romantic', emoji: '💕', name: 'Romantic', desc: 'Love songs across all eras', gradient: 'linear-gradient(135deg, #fd79a8, #e84393)', filter: s => s.tags && s.tags.includes('romantic') },
  { key: 'party', emoji: '🎉', name: 'Party & Dance', desc: 'Upbeat party tracks', gradient: 'linear-gradient(135deg, #fdcb6e, #e17055)', filter: s => s.tags && s.tags.includes('party') },
  { key: 'sad', emoji: '😢', name: 'Sad & Emotional', desc: 'Heartbreak anthems', gradient: 'linear-gradient(135deg, #74b9ff, #0984e3)', filter: s => s.tags && s.tags.includes('sad') },
  { key: 'sufi', emoji: '🕌', name: 'Sufi & Soulful', desc: 'Qawwalis and sufi rock', gradient: 'linear-gradient(135deg, #a29bfe, #6c5ce7)', filter: s => s.tags && s.tags.includes('sufi') },
];

function playBollywoodCategory(categoryKey) {
  unlockAudioGraph();
  if (typeof BollywoodSongsDB === 'undefined') return;
  activeCollectionPool = null;
  const cat = BOLLYWOOD_CATEGORIES.find(c => c.key === categoryKey);
  if (!cat) { playRandomBollywood(); return; }
  const pool = BollywoodSongsDB.SONGS_DB.filter(cat.filter);
  if (!pool.length) { showToast('No songs in this category'); return; }
  bollywoodCategoryPool = pool.slice().sort(() => Math.random() - 0.5);
  activeLanguage = 'hindi';
  const song = bollywoodCategoryPool[0];
  history = [song]; historyIndex = 0;
  playSong(song); showPage('player');
}

function renderBollywoodList() {
  if (typeof BollywoodSongsDB === 'undefined') return;
  const container = document.getElementById('bollywood-categories');
  if (!container) return;
  container.innerHTML = BOLLYWOOD_CATEGORIES.map(cat => {
    const count = BollywoodSongsDB.SONGS_DB.filter(cat.filter).length;
    if (count === 0) return '';
    return `<div class="bw-category-card" style="background:${cat.gradient}" onclick="playBollywoodCategory('${cat.key}')">
      <div class="bw-cat-emoji">${cat.emoji}</div>
      <div class="bw-cat-info">
        <div class="bw-cat-name">${cat.name}</div>
        <div class="bw-cat-desc">${cat.desc}</div>
        <div class="bw-cat-count">${count} songs</div>
      </div>
      <button class="bw-cat-play" onclick="event.stopPropagation(); playBollywoodCategory('${cat.key}')">▶ Play All</button>
    </div>`;
  }).join('');
}

// ═══ SPOTIFY-LIKE SONG PREVIEW (hover floating card) ═══

/** Serialize a song's preview data into a safe HTML attribute value. */
function _buildPreviewAttr(s) {
  return escAttr(JSON.stringify({ id: s.id, name: s.name, artists: s.artists, image: s.image, audio: s.audio }));
}

function initSongPreviews() {
  if (previewsInitialized) return;
  if (IS_MOBILE) return;
  // Only activate on devices with fine pointer (desktop/mouse), not touch screens
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  previewsInitialized = true;

  // Create the shared floating preview card once
  const card = document.createElement('div');
  card.id = 'song-preview-card';
  card.className = 'song-preview-card';
  card.setAttribute('aria-hidden', 'true');
  card.innerHTML = `
    <div class="song-preview-art">
      <img id="preview-art-img" src="" alt="" />
      <div class="preview-bars">
        <div class="preview-bar"></div>
        <div class="preview-bar"></div>
        <div class="preview-bar"></div>
        <div class="preview-bar"></div>
        <div class="preview-bar"></div>
      </div>
    </div>
    <div class="song-preview-info">
      <div class="song-preview-name" id="preview-name"></div>
      <div class="song-preview-artist" id="preview-artist"></div>
    </div>`;
  document.body.appendChild(card);

  // Use event delegation on document for efficient hover tracking
  document.addEventListener('mouseover', _previewOver);
  document.addEventListener('mouseout', _previewOut);
}

function _previewOver(e) {
  const el = e.target.closest('[data-preview-song]');
  if (!el) return;
  try {
    const song = JSON.parse(el.dataset.previewSong);
    if (previewSongId === song.id) return;
    clearTimeout(previewShowTimeout);
    previewShowTimeout = setTimeout(() => _showSongPreview(song, el), 380);
  } catch(err) {}
}

function _previewOut(e) {
  const el = e.target.closest('[data-preview-song]');
  if (!el) return;
  // Only hide if mouse actually left the card element
  if (el.contains(e.relatedTarget)) return;
  clearTimeout(previewShowTimeout);
  _hideSongPreview();
}

function _showSongPreview(song, triggerEl) {
  const card = document.getElementById('song-preview-card');
  if (!card) return;
  previewSongId = song.id;

  // Update content
  const imgEl = document.getElementById('preview-art-img');
  document.getElementById('preview-name').textContent = decodeHtml(song.name || '');
  document.getElementById('preview-artist').textContent = decodeHtml(song.artists || '');

  // Reset Ken Burns animation for a fresh start on each new song
  imgEl.src = '';
  imgEl.style.animation = 'none';
  void imgEl.offsetWidth; // reflow to restart animation
  imgEl.style.animation = '';
  imgEl.src = song.image || '';

  // Position the card near the trigger element using actual measured dimensions
  const rect = triggerEl.getBoundingClientRect();
  const cardW = card.offsetWidth || 188;
  const cardH = card.offsetHeight || 218;
  const gap = 10;
  let left = rect.left + rect.width / 2 - cardW / 2;
  let top  = rect.top - cardH - gap;
  // Flip to below the element if not enough space above
  if (top < 8) top = rect.bottom + gap;
  // Clamp within viewport
  left = Math.max(8, Math.min(left, window.innerWidth  - cardW - 8));
  top  = Math.max(8, Math.min(top,  window.innerHeight - cardH - 8));
  card.style.left = left + 'px';
  card.style.top  = top  + 'px';

  // Trigger the zoom-in appearance animation
  card.classList.remove('visible');
  void card.offsetWidth;
  card.classList.add('visible');

  // Start audio preview at low volume, fade in
  _startPreviewAudio(song.audio);
}

function _hideSongPreview() {
  const card = document.getElementById('song-preview-card');
  if (card) card.classList.remove('visible');
  previewSongId = null;
  _stopPreviewAudio();
}

function _startPreviewAudio(audioUrl) {
  if (!audioUrl) return;
  clearInterval(previewFadeInTimer);
  clearInterval(previewFadeOutTimer);
  try {
    previewAudio.pause();
    previewAudio.src = audioUrl;
    previewAudio.currentTime = 0;
    previewAudio.volume = 0;
    previewAudio.play().then(() => {
      previewFadeInTimer = setInterval(() => {
        if (previewAudio.volume < PREVIEW_MAX_VOLUME) {
          previewAudio.volume = Math.min(PREVIEW_MAX_VOLUME, previewAudio.volume + PREVIEW_FADE_IN_STEP);
        } else {
          clearInterval(previewFadeInTimer);
        }
      }, 80);
    }).catch(() => {});
  } catch(err) {}
}

function _stopPreviewAudio() {
  clearInterval(previewFadeInTimer);
  clearInterval(previewFadeOutTimer);
  if (!previewAudio.src) return;
  let vol = previewAudio.volume;
  previewFadeOutTimer = setInterval(() => {
    vol = Math.max(0, vol - PREVIEW_FADE_OUT_STEP);
    try { previewAudio.volume = vol; } catch(e) {}
    if (vol <= 0) {
      clearInterval(previewFadeOutTimer);
      previewAudio.pause();
      previewAudio.src = '';
    }
  }, 40);
}

// ═══ INIT ═══
document.addEventListener('DOMContentLoaded', () => {
  // Set up all event listeners
  document.querySelectorAll('.nav-btn[data-page]').forEach(btn => btn.addEventListener('click', () => showPage(btn.dataset.page)));
  document.getElementById('play-btn')?.addEventListener('click', togglePlay);
  document.getElementById('next-btn')?.addEventListener('click', () => playNext());
  document.getElementById('prev-btn')?.addEventListener('click', () => playPrev());
  document.getElementById('heart-btn')?.addEventListener('click', toggleLike);
  document.getElementById('npb-heart')?.addEventListener('click', toggleLike);
  document.getElementById('npb-play')?.addEventListener('click', togglePlay);
  document.getElementById('npb-next')?.addEventListener('click', () => playNext());
  document.getElementById('progress-bar')?.addEventListener('click', seekTo);
  document.getElementById('voice-mode-btn')?.addEventListener('click', unlockAudioGraph);
  initProgressDrag();
  loadVoiceMode();
  if (!IS_MOBILE) warmSearchIndex();
  
  ['auth-username','auth-password','auth-display'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => { if (e.key==='Enter') submitAuth(); });
  });

  initSwipe();
  initSearch();

  // Check existing session
  try {
    const s = JSON.parse(localStorage.getItem('raagam_session'));
    if (s?.username && s?.token) {
      currentUser = s;
      enterApp();
      return;
    }
  } catch(e) {}
  
  showLanding();
});

// Clean up lyrics timer on page unload
window.addEventListener('beforeunload', () => { clearInterval(lyricsTimer); });
