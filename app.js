// app.js — Raagam v5: Auth-gated Telugu Music Player
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
let currentUser = null;
let authMode = 'login';

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

  // Static mode: localStorage-only auth (no server needed)
  try {
    document.getElementById('auth-submit').textContent = 'Loading...';
    const token = await hashToken(username, password);
    const storedUsers = JSON.parse(localStorage.getItem('raagam_users') || '{}');

    if (authMode === 'signup') {
      if (storedUsers[username]) {
        errEl.textContent = 'Username already taken';
        errEl.classList.remove('hidden');
        document.getElementById('auth-submit').textContent = 'Create Account';
        return;
      }
      storedUsers[username] = { token, displayName: display || username };
      localStorage.setItem('raagam_users', JSON.stringify(storedUsers));
    } else {
      // Login: check if user exists. If not, auto-create for convenience
      if (storedUsers[username] && storedUsers[username].token !== token) {
        errEl.textContent = 'Wrong password';
        errEl.classList.remove('hidden');
        document.getElementById('auth-submit').textContent = 'Sign In';
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
  }
}

async function hashToken(username, password) {
  // Simple but consistent token: use the password hash as the session token
  // Works on both HTTP and HTTPS (crypto.subtle requires secure context)
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
  
  // Update profile
  document.getElementById('profile-name').textContent = currentUser.displayName || currentUser.username;
  document.getElementById('profile-sub-text').innerHTML = `@${currentUser.username} <span class="sync-badge">☁️ Synced</span>`;
  
  // Update greeting
  const h = new Date().getHours();
  const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('home-greeting').textContent = `${greeting}, ${currentUser.displayName || currentUser.username}`;
  
  showPage('home');
  updateHomeStats();
  renderRecent();
  restoreLastPlayed();
}

// ═══ PLAYBACK ═══
function playRandomSong() {
  if (isLoadingNext) return;
  const prefs = window.aiEngine ? window.aiEngine.getPreferences() : null;
  const hasPrefs = window.aiEngine && window.aiEngine.getLikedSongs().length >= 5;
  const excludeId = currentSong ? currentSong.id : null;
  const song = SongsDB.getRandomSong(excludeId, hasPrefs ? prefs : null);
  if (!song) return;
  if (currentSong) {
    if (historyIndex >= 0 && historyIndex < history.length - 1) history = history.slice(0, historyIndex + 1);
  }
  history.push(song);
  historyIndex = history.length - 1;
  playSong(song);
}

function playByEra(era) {
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
  isLoadingNext = true;
  currentSong = song;
  showLoading(true);
  syncedLyrics = [];
  clearInterval(lyricsTimer);

  document.getElementById('song-title').textContent = decodeHtml(song.name);
  document.getElementById('song-artist').textContent = decodeHtml(song.artists || 'Unknown Artist');
  document.getElementById('song-album').textContent = song.album ? `${decodeHtml(song.album)} • ${song.year || ''}` : (song.year || '');

  const artEl = document.getElementById('album-art');
  if (song.image) {
    artEl.innerHTML = `<img class="album-art" src="${song.image}" alt="" onerror="this.parentElement.innerHTML='<div class=\\'album-art-placeholder\\'>🎵</div>'" />`;
    document.getElementById('player-bg').style.backgroundImage = `url(${song.image})`;
  } else {
    artEl.innerHTML = '<div class="album-art-placeholder">🎵</div>';
  }

  document.getElementById('npb-title').textContent = decodeHtml(song.name);
  document.getElementById('npb-artist').textContent = decodeHtml(song.artists || '');
  const npbArt = document.getElementById('npb-art');
  npbArt.src = song.image || ''; npbArt.style.display = song.image ? 'block' : 'none';
  // Only show NPB if not on player page
  const onPlayer = document.getElementById('page-player')?.classList.contains('active');
  const npbEl = document.querySelector('.now-playing-bar');
  if (onPlayer) npbEl.classList.add('hidden');
  else npbEl.classList.remove('hidden');

  updateHeartBtn(); updateNpbHeart();

  audio.src = song.audio;
  audio.play().then(() => {
    isPlaying = true; isLoadingNext = false; showLoading(false);
    updatePlayBtn();
    document.querySelector('.album-art-container')?.classList.add('playing');
    saveRecent(song);
    fetchLyrics(song);
  }).catch(e => {
    console.error('Play failed:', e);
    isLoadingNext = false; showLoading(false);
    setTimeout(playRandomSong, 300);
  });
}

function togglePlay() {
  if (!currentSong) { playRandomSong(); return; }
  if (!audio.src || !audio.src.startsWith('http')) {
    // Restored song — need to actually load and play it
    playSong(currentSong); return;
  }
  if (isPlaying) { audio.pause(); isPlaying = false; }
  else { audio.play(); isPlaying = true; }
  updatePlayBtn();
  document.querySelector('.album-art-container')?.classList.toggle('playing', isPlaying);
}

function playNext() {
  if (!shuffleOn && currentSong) {
    const idx = SongsDB.SONGS_DB.findIndex(s => s.id === currentSong.id);
    if (idx >= 0 && idx < SongsDB.SONGS_DB.length - 1) {
      const song = SongsDB.SONGS_DB[idx + 1];
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
  const icon = isPlaying ? '⏸' : '▶';
  document.getElementById('play-btn').textContent = icon;
  document.getElementById('npb-play').textContent = icon;
}

function toggleShuffle() {
  shuffleOn = !shuffleOn;
  document.getElementById('shuffle-btn').classList.toggle('active', shuffleOn);
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
    const results = await resp.json();
    if (results?.length) {
      const synced = results.find(r => r.syncedLyrics);
      const plain = results.find(r => r.plainLyrics);
      if (synced?.syncedLyrics) {
        syncedLyrics = parseLRC(synced.syncedLyrics);
        el.innerHTML = syncedLyrics.map((l,i) => `<div class="lyric-line" data-idx="${i}">${escHtml(l.text)}</div>`).join('');
        startLyricsSync(); return;
      }
      if (plain?.plainLyrics) { el.innerHTML = plain.plainLyrics.replace(/\n/g,'<br>'); return; }
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
    document.querySelectorAll('.lyric-line').forEach((line,i) => {
      line.classList.toggle('lyric-active', i === activeIdx);
      line.classList.toggle('lyric-past', i < activeIdx);
    });
    if (activeIdx >= 0) document.querySelectorAll('.lyric-line')[activeIdx]?.scrollIntoView({behavior:'smooth',block:'center'});
  }, 200);
}

// ═══ AUDIO EVENTS ═══
audio.addEventListener('ended', playNext);
audio.addEventListener('error', () => { isLoadingNext = false; setTimeout(playNext, 300); });
audio.addEventListener('timeupdate', () => {
  if (!audio.duration) return;
  const pct = (audio.currentTime/audio.duration)*100;
  document.getElementById('progress-fill').style.width = pct+'%';
  document.getElementById('progress-knob').style.left = pct+'%';
  document.getElementById('time-current').textContent = fmtTime(audio.currentTime);
  document.getElementById('time-total').textContent = fmtTime(audio.duration);
});
function fmtTime(s) { const m=Math.floor(s/60), sec=Math.floor(s%60); return m+':'+(sec<10?'0':'')+sec; }
function seekTo(e) {
  if (!audio.duration) return;
  const rect = e.currentTarget.getBoundingClientRect();
  audio.currentTime = Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width)) * audio.duration;
}

// ═══ HEART / LIKE ═══
function toggleLike() {
  if (!currentSong) return;
  if (window.aiEngine.isLiked(currentSong.id)) window.aiEngine.unlikeSong(currentSong.id);
  else window.aiEngine.likeSong(currentSong);
  updateHeartBtn(); updateNpbHeart(); cloudSave();
  // Always rebuild profile on like/unlike so it's ready when user visits
  window.aiEngine.rebuildProfile(); window.aiEngine.save();
  if (document.getElementById('page-profile')?.classList.contains('active')) renderProfile();
}
function updateHeartBtn() {
  const btn = document.getElementById('heart-btn');
  if (!currentSong) { btn.classList.remove('liked'); btn.textContent='♡'; return; }
  const liked = window.aiEngine.isLiked(currentSong.id);
  btn.classList.toggle('liked', liked); btn.textContent = liked ? '♥' : '♡';
}
function updateNpbHeart() {
  const btn = document.getElementById('npb-heart');
  if (!currentSong) return;
  const liked = window.aiEngine.isLiked(currentSong.id);
  btn.textContent = liked ? '♥' : '♡'; btn.style.color = liked ? 'var(--heart)' : '';
}

// ═══ RECENT ═══
function saveRecent(song) {
  try {
    let recent = JSON.parse(localStorage.getItem('raagam_recent')||'[]');
    recent = recent.filter(s => s.id !== song.id);
    recent.unshift({id:song.id,name:song.name,artists:song.artists,image:song.image,audio:song.audio,year:song.year,album:song.album});
    recent = recent.slice(0,30);
    localStorage.setItem('raagam_recent', JSON.stringify(recent));
  } catch(e) {}
  clearTimeout(window._syncTimer);
  window._syncTimer = setTimeout(cloudSave, 5000);
}
function renderRecent() {
  try {
    const recent = JSON.parse(localStorage.getItem('raagam_recent')||'[]');
    const section = document.getElementById('recently-played-section');
    const grid = document.getElementById('recent-grid');
    if (!recent.length) { section.style.display='none'; return; }
    section.style.display='block';
    grid.innerHTML = recent.slice(0,10).map(s => `
      <div class="recent-card" onclick="playFromRecent('${s.id}')">
        <img src="${s.image||''}" alt="" onerror="this.style.display='none'" />
        <div class="recent-title">${escHtml(s.name)}</div>
        <div class="recent-artist">${escHtml(s.artists||'')}</div>
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
}

// ═══ LIBRARY ═══
function renderLibrary() {
  const songs = window.aiEngine.getLikedSongs();
  const container = document.getElementById('library-list');
  document.getElementById('library-count').textContent = songs.length ? `${songs.length} songs` : '';
  if (!songs.length) { container.innerHTML='<div class="empty-state"><div class="icon">♡</div><p>Songs you heart will appear here</p></div>'; return; }
  container.innerHTML = songs.slice().reverse().map(s => `
    <div class="library-item" onclick="playSongFromLib('${s.id}')">
      <img class="library-thumb" src="${s.image||''}" alt="" onerror="this.style.display='none'" />
      <div class="library-info"><h4>${escHtml(s.name)}</h4><p>${escHtml(s.artists||s.album||'')}</p></div>
    </div>`).join('');
}
function playSongFromLib(id) {
  const song = window.aiEngine.getLikedSongs().find(s=>s.id===id);
  if (song) { history.push(song); historyIndex=history.length-1; playSong(song); showPage('player'); }
}

// ═══ PROFILE ═══
function renderProfile() {
  // Always rebuild before rendering
  window.aiEngine.rebuildProfile();
  
  const p = window.aiEngine.getPreferences();
  const liked = window.aiEngine.getLikedSongs();
  const colors = AIEngine.GENRE_COLORS;
  const topGenre = p.topGenre || 'unknown';
  const genreColor = colors[topGenre] || colors.unknown;

  // Hero gradient based on top genre
  const hero = document.getElementById('profile-hero');
  const glow = document.getElementById('profile-hero-glow');
  if (genreColor) {
    glow.style.background = `radial-gradient(circle, ${genreColor.color}66 0%, transparent 70%)`;
    document.querySelector('.profile-avatar-ring').style.background = genreColor.gradient;
  }

  // Personality
  const personalityEl = document.getElementById('profile-personality');
  if (p.personality && liked.length > 0) {
    personalityEl.textContent = `${p.personalityEmoji} ${p.personality}`;
    personalityEl.style.display = 'inline-block';
  } else {
    personalityEl.style.display = 'none';
  }

  // Stats
  const stats = p.stats || {};
  document.getElementById('profile-stats').innerHTML = `
    <div class="stat-card"><div class="stat-num">${stats.totalLiked || 0}</div><div class="stat-label">Liked Songs</div></div>
    <div class="stat-card"><div class="stat-num">${stats.hoursEstimated || '0'}</div><div class="stat-label">Hours Est.</div></div>
    <div class="stat-card"><div class="stat-num">${stats.uniqueArtists || 0}</div><div class="stat-label">Artists</div></div>
    <div class="stat-card"><div class="stat-num">${stats.decadesSpanned || 0}</div><div class="stat-label">Decades</div></div>`;

  // Music DNA bar
  const dnaBar = document.getElementById('profile-dna-bar');
  const dnaLegend = document.getElementById('profile-dna-legend');
  const genreDist = p.genreDistribution || {};
  const genreEntries = Object.entries(genreDist).sort((a, b) => b[1] - a[1]);
  
  if (genreEntries.length > 0) {
    dnaBar.innerHTML = genreEntries.map(([genre, pct]) => {
      const c = colors[genre] || colors.unknown;
      return `<div class="dna-segment" style="width:${Math.max(pct, 3)}%;background:${c.gradient};animation:dnaGrow 1s ease forwards"></div>`;
    }).join('');
    dnaLegend.innerHTML = genreEntries.map(([genre, pct]) => {
      const c = colors[genre] || colors.unknown;
      return `<div class="dna-legend-item"><div class="dna-legend-dot" style="background:${c.color}"></div>${genre} ${pct}%</div>`;
    }).join('');
  } else {
    dnaBar.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:4px 0">Like songs to see your DNA!</div>';
    dnaLegend.innerHTML = '';
  }

  // Rank badges
  const badges = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];

  // Top Singers
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

  // Top Music Directors
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

  // Favorite genre badge
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
        <div class="genre-badge-name">${g.name}</div>
      </div>`;
  } else {
    genreCard.style.display = 'none';
  }

  // Decades timeline
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

  // Recent likes
  const recentCard = document.getElementById('profile-recent-card');
  const recentLikes = document.getElementById('profile-recent-likes');
  if (liked.length > 0) {
    recentCard.style.display = '';
    const last5 = liked.slice(-5).reverse();
    recentLikes.innerHTML = last5.map(s =>
      `<div class="recent-like-card" onclick="playSongFromLib('${s.id}')">
        <img class="recent-like-art" src="${s.image || ''}" alt="" onerror="this.style.display='none'" />
        <div class="recent-like-name">${escHtml(s.name)}</div>
      </div>`
    ).join('');
  } else {
    recentCard.style.display = 'none';
  }

  // Insights
  document.getElementById('profile-insights').innerHTML = p.insights && p.insights.length
    ? p.insights.map(i => `<div class="insight-item"><span>✨</span>${escHtml(i)}</div>`).join('')
    : '<div class="insight-item" style="color:var(--text-muted)">Like 3+ songs to unlock AI insights</div>';
}

function updateHomeStats() {
  const el = document.getElementById('stat-songs');
  if (el && window.SongsDB && SongsDB.SONGS_DB) {
    el.textContent = SongsDB.SONGS_DB.length.toLocaleString();
  } else if (el) {
    // DB not loaded yet, retry
    setTimeout(updateHomeStats, 1000);
  }
}

// ═══ CLOUD SYNC (static mode — all data in localStorage) ═══
async function cloudSave() { /* data already in localStorage via aiEngine.save() */ }
async function cloudLoad() { /* data already in localStorage */ }

// ═══ HELPERS ═══
function showLoading(show) { document.getElementById('loading').style.display = show ? 'flex' : 'none'; }
function escHtml(s) { const d=document.createElement('div'); d.textContent=s||''; return d.innerHTML; }
function decodeHtml(s) { const d=document.createElement('textarea'); d.innerHTML=s||''; return d.value; }

// ═══ RESTORE LAST PLAYED ═══
function restoreLastPlayed() {
  try {
    const recent = JSON.parse(localStorage.getItem('raagam_recent') || '[]');
    if (recent.length > 0 && !currentSong) {
      const song = recent[0];
      // Update NPB without playing
      document.getElementById('npb-title').textContent = decodeHtml(song.name);
      document.getElementById('npb-artist').textContent = decodeHtml(song.artists || '');
      const npbArt = document.getElementById('npb-art');
      npbArt.src = song.image || ''; npbArt.style.display = song.image ? 'block' : 'none';
      document.querySelector('.now-playing-bar').classList.remove('hidden');
      // Store ref so tapping NPB can resume
      currentSong = song;
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
    // Only horizontal swipe
    if (dy > Math.abs(dx)) { swiping = false; artContainer.style.transform = ''; return; }
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
    const velocity = Math.abs(dx) / elapsed;

    artContainer.style.transition = 'transform 0.3s ease, opacity 0.3s ease';

    if (Math.abs(dx) > 80 || velocity > 0.5) {
      // Swipe detected — animate out
      const dir = dx > 0 ? 1 : -1;
      artContainer.style.transform = `translateX(${dir * 300}px) rotate(${dir * 15}deg)`;
      artContainer.style.opacity = '0';
      setTimeout(() => {
        if (dir > 0) playPrev(); else playNext();
        // Reset with slide-in from opposite side
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
      // Snap back
      artContainer.style.transform = '';
      artContainer.style.opacity = '1';
    }
  }, { passive: true });
}

// ═══ INIT ═══
document.addEventListener('DOMContentLoaded', () => {
  // Check existing session
  try {
    const s = JSON.parse(localStorage.getItem('raagam_session'));
    if (s?.username && s?.token) {
      currentUser = s;
      enterApp();
      cloudLoad();
      return;
    }
  } catch(e) {}
  
  // Show landing
  showLanding();
});

// Bind events after DOM ready
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.nav-btn[data-page]').forEach(btn => btn.addEventListener('click', () => showPage(btn.dataset.page)));
  document.getElementById('play-btn')?.addEventListener('click', togglePlay);
  document.getElementById('next-btn')?.addEventListener('click', playNext);
  document.getElementById('prev-btn')?.addEventListener('click', playPrev);
  document.getElementById('heart-btn')?.addEventListener('click', toggleLike);
  document.getElementById('npb-heart')?.addEventListener('click', toggleLike);
  document.getElementById('npb-play')?.addEventListener('click', togglePlay);
  document.getElementById('npb-next')?.addEventListener('click', playNext);
  document.getElementById('progress-bar')?.addEventListener('click', seekTo);
  document.getElementById('shuffle-btn')?.classList.add('active');
  
  // Enter key on auth inputs
  ['auth-username','auth-password','auth-display'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => { if (e.key==='Enter') submitAuth(); });
  });

  initSwipe();
});
