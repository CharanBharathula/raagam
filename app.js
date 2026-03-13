// app.js — Raagam v6: Auth-gated Telugu & Bollywood Music Player with Offline Support
const audio = new Audio();
let currentSong = null;
let isPlaying = false;
let history = [];
let historyIndex = -1;
let lyricsVisible = false;
let isLoadingNext = false;
let syncedLyrics = [];
let lyricsTimer = null;
let shuffleOn = true;
let activeLanguage = 'telugu';
let consecutiveErrors = 0;
let currentUser = null;
let authMode = 'login';

// Offline download tracking
let downloadedSongs = {}; // { songId: { name, artists, image, audio, album, year, language } }
let downloadingUrls = new Set(); // Currently downloading URLs

const LRCLIB_API = 'https://lrclib.net/api/search';

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

function enterApp() {
  document.getElementById('landing').classList.add('hidden');
  document.getElementById('auth-page').classList.add('hidden');
  document.getElementById('app-container').classList.remove('hidden');
  document.getElementById('auth-submit').disabled = false;
  
  document.getElementById('profile-name').textContent = currentUser.displayName || currentUser.username;
  document.getElementById('profile-sub-text').innerHTML = `@${escHtml(currentUser.username)} <span class="sync-badge">☁️ Synced</span>`;
  
  const h = new Date().getHours();
  const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('home-greeting').textContent = `${greeting}, ${currentUser.displayName || currentUser.username}`;
  
  loadDownloadedSongs();
  showPage('home');
  updateHomeStats();
  renderRecent();
  restoreLastPlayed();
  updateCacheSize();
}

// ═══ OFFLINE / DOWNLOAD ═══
function loadDownloadedSongs() {
  try {
    downloadedSongs = JSON.parse(localStorage.getItem('raagam_downloads') || '{}');
  } catch(e) { downloadedSongs = {}; }
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
      year: song.year, language: song.language || 'telugu'
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
          year: song.year, language: song.language || 'telugu'
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
  if (isLoadingNext) return;
  if (activeLanguage === 'hindi' && typeof BollywoodSongsDB !== 'undefined') {
    playRandomBollywood(); return;
  }
  if (typeof SongsDB === 'undefined' || !SongsDB.SONGS_DB || !SongsDB.SONGS_DB.length) {
    showToast('Songs database not loaded yet'); return;
  }
  const excludeId = currentSong ? currentSong.id : null;
  const song = SongsDB.getRandomSong(excludeId);
  if (!song) return;
  if (currentSong && historyIndex >= 0 && historyIndex < history.length - 1) {
    history = history.slice(0, historyIndex + 1);
  }
  history.push(song);
  historyIndex = history.length - 1;
  playSong(song);
}

function getActiveDB() {
  if (activeLanguage === 'hindi' && typeof BollywoodSongsDB !== 'undefined') return BollywoodSongsDB.SONGS_DB;
  return (typeof SongsDB !== 'undefined' ? SongsDB.SONGS_DB : []);
}

function playByEra(era) {
  if (typeof SongsDB === 'undefined' || !SongsDB.SONGS_DB) { showToast('Loading...'); return; }
  const ranges = { 'classics':[0,1989], '1990s':[1990,1999], '2000s':[2000,2009], '2010s':[2010,2019], '2020s':[2020,2030] };
  const r = ranges[era];
  if (!r) { playRandomSong(); return; }
  const pool = SongsDB.SONGS_DB.filter(s => { const y = parseInt(s.year); return y >= r[0] && y <= r[1]; });
  if (!pool.length) { playRandomSong(); return; }
  const song = pool[Math.floor(Math.random() * pool.length)];
  history.push(song); historyIndex = history.length - 1;
  playSong(song); showPage('player');
}

function playSong(song) {
  if (isLoadingNext && currentSong?.id !== song.id) {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }
  isLoadingNext = true;
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

  audio.src = song.audio;
  audio.play().then(() => {
    isPlaying = true; isLoadingNext = false; showLoading(false);
    consecutiveErrors = 0;
    updatePlayBtn();
    document.querySelector('.album-art-container')?.classList.add('playing');
    saveRecent(song);
    fetchLyrics(song);
    if (window.aiEngine) window.aiEngine.trackPlay(song);
  }).catch(e => {
    console.error('Play failed:', e);
    isLoadingNext = false; showLoading(false);
    consecutiveErrors++;
    if (consecutiveErrors > 3) {
      consecutiveErrors = 0;
      showToast('Song unavailable — please try another');
      return;
    }
    setTimeout(() => {
      if (activeLanguage === 'hindi') playRandomBollywood();
      else playRandomSong();
    }, 500);
  });
}

function togglePlay() {
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
  if (isLoadingNext) return;
  // Bollywood category pool override
  if (bollywoodCategoryPool && activeLanguage === 'hindi') {
    const idx = bollywoodCategoryPool.findIndex(s => s.id === currentSong?.id);
    const next = (idx >= 0 && idx < bollywoodCategoryPool.length - 1) ? bollywoodCategoryPool[idx + 1] : bollywoodCategoryPool[0];
    history.push(next); historyIndex = history.length - 1;
    playSong(next); return;
  }
  if (!shuffleOn && currentSong) {
    const db = getActiveDB();
    const idx = db.findIndex(s => s.id === currentSong.id);
    if (idx >= 0 && idx < db.length - 1) {
      const song = db[idx + 1];
      history.push(song); historyIndex = history.length - 1;
      playSong(song); return;
    }
  }
  playRandomSong();
}

function playPrev() {
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

function toggleShuffle() {
  shuffleOn = !shuffleOn;
  document.getElementById('shuffle-btn').classList.toggle('active', shuffleOn);
  showToast(shuffleOn ? 'Shuffle on' : 'Shuffle off');
}

// ═══ LYRICS (LRCLIB time-synced) ═══
function toggleLyrics() {
  lyricsVisible = !lyricsVisible;
  document.getElementById('lyrics-panel').classList.toggle('hidden', !lyricsVisible);
  document.getElementById('lyrics-toggle').style.color = lyricsVisible ? 'var(--accent)' : '';
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
  try {
    const resp = await fetch(`${LRCLIB_API}?q=${encodeURIComponent(`${name} ${artist}`.substring(0,80))}`);
    if (!resp.ok) throw new Error('Network error');
    const results = await resp.json();
    if (results?.length) {
      const synced = results.find(r => r.syncedLyrics);
      const plain = results.find(r => r.plainLyrics);
      if (synced?.syncedLyrics) {
        syncedLyrics = parseLRC(synced.syncedLyrics);
        el.innerHTML = syncedLyrics.map((l,i) => `<div class="lyric-line" data-idx="${i}">${escHtml(l.text)}</div>`).join('');
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
    if (activeIdx >= 0 && lines[activeIdx]) lines[activeIdx].scrollIntoView({behavior:'smooth',block:'center'});
  }, 200);
}

// ═══ AUDIO EVENTS ═══
audio.addEventListener('ended', () => playNext());
audio.addEventListener('error', () => {
  isLoadingNext = false;
  consecutiveErrors++;
  if (consecutiveErrors > 2) {
    consecutiveErrors = 0;
    showToast('Song unavailable — try another');
    showLoading(false);
    return;
  }
  setTimeout(() => {
    if (activeLanguage === 'hindi') playRandomBollywood();
    else playNext();
  }, 1000);
});
audio.addEventListener('timeupdate', () => {
  if (!audio.duration || isNaN(audio.duration)) return;
  const pct = (audio.currentTime/audio.duration)*100;
  document.getElementById('progress-fill').style.width = pct+'%';
  document.getElementById('progress-knob').style.left = pct+'%';
  document.getElementById('time-current').textContent = fmtTime(audio.currentTime);
  document.getElementById('time-total').textContent = fmtTime(audio.duration);
});
audio.addEventListener('pause', () => {
  isPlaying = false; updatePlayBtn();
  document.querySelector('.album-art-container')?.classList.remove('playing');
});
audio.addEventListener('play', () => {
  isPlaying = true; updatePlayBtn();
  document.querySelector('.album-art-container')?.classList.add('playing');
});

function fmtTime(s) { if (isNaN(s)) return '0:00'; const m=Math.floor(s/60), sec=Math.floor(s%60); return m+':'+(sec<10?'0':'')+sec; }

function seekTo(e) {
  if (!audio.duration || isNaN(audio.duration)) return;
  const rect = e.currentTarget.getBoundingClientRect();
  audio.currentTime = Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width)) * audio.duration;
}

// MediaSession API for lock screen controls
if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('play', () => togglePlay());
  navigator.mediaSession.setActionHandler('pause', () => togglePlay());
  navigator.mediaSession.setActionHandler('previoustrack', () => playPrev());
  navigator.mediaSession.setActionHandler('nexttrack', () => playNext());
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
    grid.innerHTML = recent.slice(0,10).map(s => `
      <div class="recent-card" onclick="playFromRecent('${escAttr(s.id)}')">
        <img src="${escAttr(s.image||'')}" alt="" onerror="this.style.display='none'" loading="lazy" />
        <div class="recent-title">${escHtml(decodeHtml(s.name))}</div>
        <div class="recent-artist">${escHtml(decodeHtml(s.artists||''))}</div>
      </div>`).join('');
  } catch(e) {}
}
function playFromRecent(id) {
  try {
    const song = JSON.parse(localStorage.getItem('raagam_recent')||'[]').find(s=>s.id===id);
    if (song) { history.push(song); historyIndex=history.length-1; playSong(song); showPage('player'); }
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
  if (name==='home') { renderRecent(); updateHomeStats(); }
  if (name==='search') { setTimeout(() => document.getElementById('search-input')?.focus(), 50); }
  if (name==='bollywood') renderBollywoodList();
  if (name==='player') updatePlayerDownloadBtn();
}

// ═══ LIBRARY (Liked + Offline) ═══
function renderLibrary() {
  const songs = window.aiEngine ? window.aiEngine.getLikedSongs() : [];
  const container = document.getElementById('library-list');
  const dlSongs = Object.values(downloadedSongs);
  
  let html = '';
  
  // Offline Songs section
  if (dlSongs.length > 0) {
    html += '<div class="library-section-header"><h3>📥 Downloaded Songs</h3><span class="library-section-count">' + dlSongs.length + '</span></div>';
    html += dlSongs.map(s => `
      <div class="library-item">
        <img class="library-thumb" src="${escAttr(s.image||'')}" alt="" onerror="this.style.display='none'" loading="lazy" onclick="playDownloaded('${escAttr(s.id)}')" />
        <div class="library-info" onclick="playDownloaded('${escAttr(s.id)}')">
          <h4>${escHtml(decodeHtml(s.name))}</h4>
          <p>${escHtml(decodeHtml(s.artists||s.album||''))} <span class="dl-badge">Downloaded</span></p>
        </div>
        <button class="lib-remove-btn" onclick="removeDownload('${escAttr(s.id)}')" title="Remove download">✕</button>
      </div>`).join('');
  }
  
  // Liked Songs section
  const likedLabel = dlSongs.length > 0 ? '<div class="library-section-header"><h3>❤️ Liked Songs</h3><span class="library-section-count">' + songs.length + '</span></div>' : '';
  document.getElementById('library-count').textContent = songs.length ? `${songs.length} liked` : '';
  
  if (songs.length > 0) {
    html += likedLabel;
    html += songs.slice().reverse().map(s => {
      const isDl = isSongDownloaded(s);
      return `<div class="library-item" onclick="playSongFromLib('${escAttr(s.id)}')">
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
  const song = downloadedSongs[id];
  if (song) { history.push(song); historyIndex = history.length - 1; playSong(song); showPage('player'); }
}

function playSongFromLib(id) {
  const song = window.aiEngine.getLikedSongs().find(s=>s.id===id);
  if (song) { history.push(song); historyIndex=history.length-1; playSong(song); showPage('player'); }
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
  const telugu = (typeof SongsDB !== 'undefined' ? SongsDB.SONGS_DB : []) || [];
  const bollywood = (typeof BollywoodSongsDB !== 'undefined' ? BollywoodSongsDB.SONGS_DB : []) || [];
  return [...telugu, ...bollywood];
}

function performSearch(query) {
  if (!query || query.length < 2) return [];
  // Decode HTML entities in query for matching
  const q = decodeHtml(query).toLowerCase();
  const all = getAllSongs();
  const results = [];
  for (let i = 0; i < all.length && results.length < 50; i++) {
    const s = all[i];
    const name = decodeHtml(s.name || '').toLowerCase();
    const artists = decodeHtml(s.artists || '').toLowerCase();
    const album = decodeHtml(s.album || '').toLowerCase();
    if (name.includes(q) || artists.includes(q) || album.includes(q)) {
      results.push(s);
    }
  }
  return results;
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
    return `<div class="search-result-item" onclick="playSongFromSearch('${escAttr(s.id)}','${escAttr(s.language||'telugu')}')">
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
  let song;
  if (lang === 'hindi' && typeof BollywoodSongsDB !== 'undefined') {
    song = BollywoodSongsDB.SONGS_DB.find(s => s.id === id);
  }
  if (!song && typeof SongsDB !== 'undefined') song = SongsDB.SONGS_DB.find(s => s.id === id);
  if (!song && typeof BollywoodSongsDB !== 'undefined') song = BollywoodSongsDB.SONGS_DB.find(s => s.id === id);
  if (song) { history.push(song); historyIndex = history.length - 1; playSong(song); showPage('player'); }
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
  let debounce;
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    const q = input.value.trim();
    clearBtn.style.display = q ? 'block' : 'none';
    debounce = setTimeout(() => {
      renderSearchResults(performSearch(q), q);
    }, 300); // 300ms debounce for 16k+ songs
  });
}

// ═══ BOLLYWOOD ═══
let bollywoodCategoryPool = null;

function playRandomBollywood() {
  if (typeof BollywoodSongsDB === 'undefined' || !BollywoodSongsDB.SONGS_DB?.length) return;
  const song = BollywoodSongsDB.getRandomSong(currentSong?.id);
  if (song) { history.push(song); historyIndex = history.length - 1; playSong(song); }
}

function playBollywoodByEra(era) {
  if (typeof BollywoodSongsDB === 'undefined') return;
  const ranges = { '2020s': [2020,2029], '2010s': [2010,2019], '2000s': [2000,2009], '1990s': [1990,1999], 'classics': [1950,1989] };
  const r = ranges[era];
  if (!r) { playRandomBollywood(); return; }
  const pool = BollywoodSongsDB.SONGS_DB.filter(s => { const y = parseInt(s.year); return y >= r[0] && y <= r[1]; });
  if (!pool.length) { playRandomBollywood(); return; }
  const song = pool[Math.floor(Math.random() * pool.length)];
  history.push(song); historyIndex = history.length - 1;
  playSong(song); showPage('player');
}

const BOLLYWOOD_CATEGORIES = [
  { key: '2020s', emoji: '🔥', name: '2020s Hits', desc: 'Latest Bollywood bangers', gradient: 'linear-gradient(135deg, #ff6b35, #f7c948)', filter: s => parseInt(s.year) >= 2020 },
  { key: '2010s', emoji: '💫', name: '2010s Hits', desc: 'Arijit Singh era', gradient: 'linear-gradient(135deg, #6c5ce7, #a29bfe)', filter: s => { const y = parseInt(s.year); return y >= 2010 && y <= 2019; } },
  { key: '2000s', emoji: '✨', name: '2000s Hits', desc: 'Golden Bollywood', gradient: 'linear-gradient(135deg, #00b894, #55efc4)', filter: s => { const y = parseInt(s.year); return y >= 2000 && y <= 2009; } },
  { key: '1990s', emoji: '🎭', name: '90s Classics', desc: 'SRK & romance era', gradient: 'linear-gradient(135deg, #e17055, #fab1a0)', filter: s => { const y = parseInt(s.year); return y >= 1990 && y <= 1999; } },
  { key: 'classics', emoji: '🏛️', name: 'Evergreen Classics', desc: 'Timeless legends', gradient: 'linear-gradient(135deg, #636e72, #b2bec3)', filter: s => parseInt(s.year) < 1990 },
  { key: 'romantic', emoji: '💕', name: 'Romantic', desc: 'Love songs across all eras', gradient: 'linear-gradient(135deg, #fd79a8, #e84393)', filter: s => s.tags && s.tags.includes('romantic') },
  { key: 'party', emoji: '🎉', name: 'Party & Dance', desc: 'Upbeat party tracks', gradient: 'linear-gradient(135deg, #fdcb6e, #e17055)', filter: s => s.tags && s.tags.includes('party') },
  { key: 'sad', emoji: '😢', name: 'Sad & Emotional', desc: 'Heartbreak anthems', gradient: 'linear-gradient(135deg, #74b9ff, #0984e3)', filter: s => s.tags && s.tags.includes('sad') },
  { key: 'sufi', emoji: '🕌', name: 'Sufi & Soulful', desc: 'Qawwalis and sufi rock', gradient: 'linear-gradient(135deg, #a29bfe, #6c5ce7)', filter: s => s.tags && s.tags.includes('sufi') },
];

function playBollywoodCategory(categoryKey) {
  if (typeof BollywoodSongsDB === 'undefined') return;
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

// ═══ INIT ═══
document.addEventListener('DOMContentLoaded', () => {
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

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.nav-btn[data-page]').forEach(btn => btn.addEventListener('click', () => showPage(btn.dataset.page)));
  document.getElementById('play-btn')?.addEventListener('click', togglePlay);
  document.getElementById('next-btn')?.addEventListener('click', () => playNext());
  document.getElementById('prev-btn')?.addEventListener('click', () => playPrev());
  document.getElementById('heart-btn')?.addEventListener('click', toggleLike);
  document.getElementById('npb-heart')?.addEventListener('click', toggleLike);
  document.getElementById('npb-play')?.addEventListener('click', togglePlay);
  document.getElementById('npb-next')?.addEventListener('click', () => playNext());
  document.getElementById('progress-bar')?.addEventListener('click', seekTo);
  document.getElementById('shuffle-btn')?.classList.add('active');
  
  ['auth-username','auth-password','auth-display'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => { if (e.key==='Enter') submitAuth(); });
  });

  initSwipe();
  initSearch();
});

// Clean up lyrics timer on page unload
window.addEventListener('beforeunload', () => { clearInterval(lyricsTimer); });
