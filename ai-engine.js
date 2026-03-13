// ai-engine.js — Recommendation engine for Raagam v5 (Enhanced Profile)
class AIEngine {
  constructor() {
    this.likedSongs = [];
    this.profile = this._emptyProfile();
    this.load();
  }

  _emptyProfile() {
    return {
      topArtists: [], topSingers: [], topMusicDirectors: [], topActors: [],
      topEras: [], topDecades: [], topGenres: [], topMoods: [],
      genreDistribution: {}, decadeDistribution: {},
      personality: '', personalityEmoji: '',
      insights: [], stats: {}
    };
  }

  // Known music directors (normalized lowercase for matching)
  static MUSIC_DIRECTORS = new Set([
    'devi sri prasad', 'dsp', 'thaman s', 's.s. thaman', 'ss thaman', 'thaman',
    'm.m. keeravani', 'mm keeravani', 'keeravani', 'm. m. keeravani',
    'a.r. rahman', 'ar rahman', 'a. r. rahman', 'rahman',
    'ilaiyaraaja', 'ilayaraja', 'ilaiyaraja',
    'anirudh ravichander', 'anirudh',
    'mani sharma', 'manisharma',
    'mickey j meyer', 'mickey j. meyer',
    'anup rubens', 'harris jayaraj',
    'r.p. patnaik', 'rp patnaik', 'r. p. patnaik',
    'vidyasagar', 'yuvan shankar raja', 'yuvan',
    's.a. rajkumar', 'sa rajkumar', 'chakri',
    'koti', 'raj-koti', 'raj koti',
    'pendyala nageswara rao', 'pendyala',
    'ghantasala', // also singer but primarily composer in old era
    't. krishna', 'saluri rajeswara rao', 'master venu',
    'k.v. mahadevan', 'kv mahadevan',
    'ramesh naidu', 'vandemataram srinivas',
    's. thaman', 'leon james', 'gopi sundar',
    'santhosh narayanan', 'hip hop tamizha',
    'rockstar devi sri prasad', 'vishal chandrasekhar'
  ]);

  // Known singers
  static SINGERS = new Set([
    's.p. balasubrahmanyam', 'sp balasubrahmanyam', 'spb', 's. p. balasubrahmanyam',
    'ghantasala', 'k.s. chithra', 'ks chithra', 'k. s. chithra', 'chithra',
    'sid sriram', 'shreya ghoshal', 'sunitha', 'p susheela', 'p. susheela',
    's janaki', 's. janaki', 'anurag kulkarni', 'haricharan', 'mangli',
    'armaan malik', 'arijit singh', 'sonu nigam', 'shankar mahadevan',
    'karthik', 'vijay prakash', 'rahul nambiar', 'deepu', 'hemachandra',
    'andrea jeremiah', 'chinmayi', 'geetha madhuri', 'mohana bhogaraju',
    'anurag kulkarni', 'yazin nizar', 'prudhvi chandra', 'revanth',
    'ramya behara', 'nutana mohan', 'malgudi subha', 'usha',
    'balu', 'chitra', 'jesudas', 'k.j. yesudas', 'yesudas',
    'lata mangeshkar', 'asha bhosle', 'hariharan', 'unni menon',
    'mano', 'swarnalatha', 'tippu', 'rita',
    'sri krishna', 'sagar', 'simha',
    'shweta mohan', 'bombay jayashri', 'sadhana sargam',
    'nakash aziz', 'neha kakkar', 'jonita gandhi',
    'eka', 'sahithi', 'lipsika', 'roll rida', 'rahul sipligunj',
    'kaala bhairava', 'sri raskol', 'benny dayal'
  ]);

  // Genre inference patterns
  static GENRE_PATTERNS = {
    romantic: {
      keywords: ['love', 'prema', 'priya', 'heart', 'ishq', 'romance', 'lover', 'pyaar', 'nuvvu', 'nenu', 'manasu'],
      albumHints: ['love', 'romance', 'prema', 'heart']
    },
    mass: {
      keywords: ['mass', 'power', 'star', 'king', 'boss', 'thaggedhe', 'pushpa', 'sarrainodu', 'akhanda', 'simha', 'lion', 'gabbar'],
      albumHints: ['mass', 'power', 'action']
    },
    melody: {
      keywords: ['melody', 'guitar', 'soft', 'gentle', 'breeze', 'rain', 'wind'],
      albumHints: ['melody']
    },
    folk: {
      keywords: ['folk', 'jathara', 'palle', 'village', 'bathukamma', 'bonalu', 'telangana', 'folk', 'janapada', 'kolatam', 'dappu'],
      albumHints: ['folk', 'village', 'palle']
    },
    devotional: {
      keywords: ['god', 'bhakti', 'temple', 'lord', 'deva', 'swami', 'annamayya', 'sri', 'rama', 'krishna', 'govinda', 'venkateswara', 'shiva', 'ganesh'],
      albumHints: ['devotional', 'bhakti', 'annamayya', 'temple']
    },
    classical: {
      keywords: ['raga', 'raaga', 'classical', 'carnatic', 'keerthana', 'kriti', 'thyagaraja', 'varnam'],
      albumHints: ['classical', 'raga', 'carnatic']
    },
    dance: {
      keywords: ['dance', 'beat', 'party', 'dj', 'club', 'step', 'thumka', 'item'],
      albumHints: ['dance', 'party', 'dj']
    },
    sad: {
      keywords: ['sad', 'pain', 'cry', 'tears', 'miss', 'alone', 'broken', 'heart break', 'viraham', 'baadha'],
      albumHints: ['sad', 'pain']
    }
  };

  static GENRE_COLORS = {
    romantic: { gradient: 'linear-gradient(135deg, #ff6b9d, #c44569)', color: '#ff6b9d' },
    mass: { gradient: 'linear-gradient(135deg, #ff4444, #cc0000)', color: '#ff4444' },
    melody: { gradient: 'linear-gradient(135deg, #4facfe, #00f2fe)', color: '#4facfe' },
    folk: { gradient: 'linear-gradient(135deg, #38ef7d, #11998e)', color: '#38ef7d' },
    devotional: { gradient: 'linear-gradient(135deg, #f7971e, #ffd200)', color: '#f7971e' },
    classical: { gradient: 'linear-gradient(135deg, #f9d423, #e6b800)', color: '#f9d423' },
    dance: { gradient: 'linear-gradient(135deg, #a855f7, #6366f1)', color: '#a855f7' },
    sad: { gradient: 'linear-gradient(135deg, #667eea, #764ba2)', color: '#667eea' },
    unknown: { gradient: 'linear-gradient(135deg, #e8a838, #d4922e)', color: '#e8a838' }
  };

  static PERSONALITIES = {
    romantic: { label: 'The Melody Romantic', emoji: '💕' },
    mass: { label: 'Mass Masala Fan', emoji: '🔥' },
    melody: { label: 'The Melody King', emoji: '🎵' },
    folk: { label: 'Desi Roots Lover', emoji: '🌾' },
    devotional: { label: 'The Devotional Soul', emoji: '🙏' },
    classical: { label: 'Classical Connoisseur', emoji: '🎻' },
    dance: { label: 'Party Animal', emoji: '💃' },
    sad: { label: 'The Emotional One', emoji: '🥺' },
    mixed_old: { label: 'Golden Era Lover', emoji: '✨' },
    mixed_new: { label: 'Modern Trendsetter', emoji: '⚡' },
    allrounder: { label: 'All-Rounder', emoji: '🎭' }
  };

  load() {
    try {
      const data = JSON.parse(localStorage.getItem('raagam_ai') || '{}');
      this.likedSongs = data.likedSongs || [];
      this.profile = data.profile || this._emptyProfile();
    } catch(e) {}
  }

  save() {
    localStorage.setItem('raagam_ai', JSON.stringify({ likedSongs: this.likedSongs, profile: this.profile }));
  }

  likeSong(song) {
    const meta = { ...song, timestamp: Date.now() };
    if (!this.likedSongs.find(s => s.id === song.id)) {
      this.likedSongs.push(meta);
    }
    this.rebuildProfile();
    this.save();
  }

  unlikeSong(songId) {
    this.likedSongs = this.likedSongs.filter(s => s.id !== songId);
    this.rebuildProfile();
    this.save();
  }

  isLiked(songId) {
    return this.likedSongs.some(s => s.id === songId);
  }

  _extractArtistList(song) {
    return (song.artists || '').split(',').map(a => a.trim()).filter(Boolean);
  }

  _getDecade(song) {
    const y = parseInt(song.year);
    if (!y) return '';
    if (y < 1960) return '1950s';
    if (y < 1970) return '1960s';
    if (y < 1980) return '1970s';
    if (y < 1990) return '1980s';
    if (y < 2000) return '1990s';
    if (y < 2010) return '2000s';
    if (y < 2020) return '2010s';
    return '2020s';
  }

  _getEra(song) {
    const y = parseInt(song.year);
    if (!y) return '';
    if (y < 1980) return 'Classics';
    if (y < 1990) return '1980s';
    if (y < 2000) return '1990s';
    if (y < 2010) return '2000s';
    if (y < 2020) return '2010s';
    return '2020s';
  }

  _classifyArtist(name) {
    const lower = name.toLowerCase().trim();
    if (AIEngine.MUSIC_DIRECTORS.has(lower)) return 'md';
    if (AIEngine.SINGERS.has(lower)) return 'singer';
    // Heuristic: if name has common singer patterns
    return 'unknown';
  }

  _inferGenre(song) {
    const text = `${song.name || ''} ${song.album || ''}`.toLowerCase();
    const year = parseInt(song.year) || 2000;
    const artists = (song.artists || '').toLowerCase();
    
    let scores = {};
    for (const [genre, patterns] of Object.entries(AIEngine.GENRE_PATTERNS)) {
      let score = 0;
      for (const kw of patterns.keywords) {
        if (text.includes(kw)) score += 2;
      }
      for (const hint of patterns.albumHints) {
        if (text.includes(hint)) score += 1;
      }
      if (score > 0) scores[genre] = score;
    }

    // Era-based hints
    if (year < 1980) {
      scores['classical'] = (scores['classical'] || 0) + 1;
      scores['melody'] = (scores['melody'] || 0) + 1;
    }
    if (year >= 2015) {
      scores['dance'] = (scores['dance'] || 0) + 0.5;
      scores['mass'] = (scores['mass'] || 0) + 0.5;
    }

    // Pick highest or default to 'melody' (safe default for Telugu)
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0 && sorted[0][1] >= 2) return sorted[0][0];
    
    // Default assignment based on era
    if (year < 1980) return 'classical';
    if (year < 2000) return 'melody';
    return 'romantic'; // most Telugu songs are romantic by default
  }

  _count(arr) {
    const map = {};
    arr.filter(Boolean).forEach(v => { map[v] = (map[v] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }

  _topN(counted, n = 5) {
    // Handle ties: include all items with same count as nth item
    if (counted.length <= n) return counted;
    const cutoff = counted[n - 1][1];
    const result = [];
    for (const entry of counted) {
      if (entry[1] >= cutoff) result.push(entry);
      else break;
    }
    return result;
  }

  rebuildProfile() {
    const songs = this.likedSongs;
    if (songs.length === 0) {
      this.profile = this._emptyProfile();
      return;
    }

    const allArtists = songs.flatMap(s => this._extractArtistList(s));
    const artistCounts = this._count(allArtists);

    // Classify artists
    const singers = [];
    const musicDirectors = [];
    for (const [artist, count] of artistCounts) {
      const type = this._classifyArtist(artist);
      if (type === 'md') musicDirectors.push([artist, count]);
      else if (type === 'singer') singers.push([artist, count]);
      else {
        // Unknown: add to both with lower priority — or guess by frequency
        singers.push([artist, count]);
      }
    }

    // Genre distribution
    const genres = songs.map(s => this._inferGenre(s));
    const genreCounts = this._count(genres);
    const genreDistribution = {};
    const total = genres.length;
    for (const [genre, count] of genreCounts) {
      genreDistribution[genre] = Math.round((count / total) * 100);
    }

    // Decade distribution
    const decades = songs.map(s => this._getDecade(s));
    const decadeCounts = this._count(decades);
    const decadeDistribution = {};
    for (const [decade, count] of decadeCounts) {
      decadeDistribution[decade] = count;
    }

    const eraCounts = this._count(songs.map(s => this._getEra(s)));

    // Determine personality
    const topGenre = genreCounts.length > 0 ? genreCounts[0][0] : 'unknown';
    let personality;
    
    // Check if diverse taste
    const genreCount = genreCounts.length;
    if (genreCount >= 4 && genreCounts[0][1] < total * 0.4) {
      personality = AIEngine.PERSONALITIES.allrounder;
    } else if (topGenre === 'classical' || topGenre === 'melody') {
      // Check if mostly old songs
      const oldSongs = songs.filter(s => (parseInt(s.year) || 2000) < 1990).length;
      if (oldSongs > songs.length * 0.6) {
        personality = AIEngine.PERSONALITIES.mixed_old;
      } else {
        personality = AIEngine.PERSONALITIES[topGenre] || AIEngine.PERSONALITIES.allrounder;
      }
    } else {
      const newSongs = songs.filter(s => (parseInt(s.year) || 2000) >= 2015).length;
      if (newSongs > songs.length * 0.7) {
        personality = AIEngine.PERSONALITIES.mixed_new;
      } else {
        personality = AIEngine.PERSONALITIES[topGenre] || AIEngine.PERSONALITIES.allrounder;
      }
    }

    // Unique artists count
    const uniqueArtists = new Set(allArtists).size;
    const decadesSpanned = new Set(decades.filter(Boolean)).size;
    const totalDurationSec = songs.reduce((sum, s) => sum + (parseInt(s.duration) || 240), 0);
    const hoursEstimated = (totalDurationSec / 3600).toFixed(1);

    // Build insights
    const insights = [];
    if (eraCounts.length > 0) insights.push(`You love ${eraCounts[0][0]} Telugu music`);
    if (singers.length > 0) insights.push(`Top voice: ${singers[0][0]}`);
    if (musicDirectors.length > 0) insights.push(`Favorite composer: ${musicDirectors[0][0]}`);
    if (songs.length >= 10) insights.push(`${songs.length} songs liked — taste profile is strong!`);
    if (decadesSpanned >= 3) insights.push(`Your taste spans ${decadesSpanned} decades — eclectic!`);
    if (uniqueArtists >= 10) insights.push(`${uniqueArtists} unique artists — you explore widely`);

    this.profile = {
      topArtists: this._topN(artistCounts, 5).map(e => ({ name: e[0], count: e[1] })),
      topSingers: this._topN(singers, 5).map(e => ({ name: e[0], count: e[1] })),
      topMusicDirectors: this._topN(musicDirectors, 5).map(e => ({ name: e[0], count: e[1] })),
      topActors: [],
      topEras: eraCounts.slice(0, 3).map(e => e[0]),
      topDecades: decadeCounts.map(e => ({ decade: e[0], count: e[1] })),
      topGenres: genreCounts.slice(0, 5).map(e => ({ name: e[0], count: e[1], pct: genreDistribution[e[0]] })),
      topMoods: [],
      genreDistribution,
      decadeDistribution,
      personality: personality.label,
      personalityEmoji: personality.emoji,
      topGenre,
      insights,
      stats: {
        totalLiked: songs.length,
        hoursEstimated,
        uniqueArtists,
        decadesSpanned
      }
    };
  }

  getPreferences() {
    return this.profile;
  }

  getLikedSongs() {
    return this.likedSongs;
  }
}

window.AIEngine = AIEngine;
window.aiEngine = new AIEngine();
