const https = require('https');
const http = require('http');
const fs = require('fs');

const API_BASE = 'https://jiosaavn-api-privatecvc2.vercel.app';
const DELAY = 250; // ms between requests

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fetch(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: 15000 }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch(e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

function decodeHtml(s) {
  if (!s) return '';
  return s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&#x27;/g,"'");
}

function extractSong(s) {
  if (!s || !s.id) return null;
  // Get 320kbps audio
  let audio = '';
  if (s.downloadUrl) {
    if (Array.isArray(s.downloadUrl)) {
      const q320 = s.downloadUrl.find(d => d.quality === '320kbps');
      audio = q320 ? q320.link : (s.downloadUrl[s.downloadUrl.length-1]||{}).link || '';
    } else if (typeof s.downloadUrl === 'string') {
      audio = s.downloadUrl;
    }
  }
  if (!audio) return null;

  // Get 500x500 image
  let image = '';
  if (s.image) {
    if (Array.isArray(s.image)) {
      const q500 = s.image.find(i => i.quality === '500x500');
      image = q500 ? q500.link : (s.image[s.image.length-1]||{}).link || '';
    } else if (typeof s.image === 'string') {
      image = s.image;
    }
  }

  const name = decodeHtml(s.name || '');
  const artists = decodeHtml(s.primaryArtists || s.artists || s.artist || '');
  const album = decodeHtml(typeof s.album === 'object' ? (s.album.name || '') : (s.album || ''));
  const year = s.year || '';
  const duration = parseInt(s.duration) || 0;
  const language = (s.language || '').toLowerCase();

  if (!name || duration < 30) return null; // skip very short clips

  return { id: s.id, name, artists, album, year: String(year), duration, audio, image, language };
}

// Dedup maps
const teluguById = new Map();
const bollyById = new Map();
const teluguByName = new Set();
const bollyByName = new Set();

function normName(n) {
  return n.toLowerCase().replace(/\(from\s+[""].*?[""]\)/gi,'').replace(/\(.*?\)/g,'').replace(/[^a-z0-9]/g,'').trim();
}

function addSong(song, lang) {
  if (!song) return false;
  const map = lang === 'telugu' ? teluguById : bollyById;
  const nameSet = lang === 'telugu' ? teluguByName : bollyByName;
  if (map.has(song.id)) return false;
  const nn = normName(song.name);
  if (nn.length < 2) return false;
  // Allow same normalized name from different albums (could be different versions)
  // but skip exact id dupes
  map.set(song.id, song);
  nameSet.add(nn);
  return true;
}

// Load existing songs
function loadExisting() {
  try {
    const content = fs.readFileSync('songs-db.js', 'utf8');
    const match = content.match(/static SONGS_DB = (\[[\s\S]*?\]);/);
    if (match) {
      const songs = eval(match[1]);
      songs.forEach(s => { if (s.id) { teluguById.set(s.id, s); teluguByName.add(normName(s.name)); }});
    }
  } catch(e) { console.log('No existing Telugu DB'); }
  
  try {
    const content = fs.readFileSync('bollywood-songs-db.js', 'utf8');
    const match = content.match(/static SONGS_DB = (\[[\s\S]*?\]);/);
    if (match) {
      const songs = eval(match[1]);
      songs.forEach(s => { if (s.id) { bollyById.set(s.id, s); bollyByName.add(normName(s.name)); }});
    }
  } catch(e) { console.log('No existing Bollywood DB'); }
  
  console.log(`Loaded: Telugu=${teluguById.size}, Bollywood=${bollyById.size}`);
}

async function searchSongs(query, limit=40) {
  const url = `${API_BASE}/search/songs?query=${encodeURIComponent(query)}&limit=${limit}`;
  const res = await fetch(url);
  if (!res || !res.data || !res.data.results) return [];
  return res.data.results;
}

async function searchAlbums(query, limit=40) {
  const url = `${API_BASE}/search/albums?query=${encodeURIComponent(query)}&limit=${limit}`;
  const res = await fetch(url);
  if (!res || !res.data || !res.data.results) return [];
  return res.data.results;
}

async function getAlbum(albumId) {
  const url = `${API_BASE}/albums?id=${albumId}`;
  const res = await fetch(url);
  if (!res || !res.data) return [];
  return res.data.songs || [];
}

async function searchAndAdd(query, targetLang, tag) {
  const songs = await searchSongs(query);
  let added = 0;
  for (const s of songs) {
    const song = extractSong(s);
    if (!song) continue;
    const lang = song.language || targetLang;
    const effectiveLang = (lang === 'telugu') ? 'telugu' : 'hindi';
    if (tag && effectiveLang === 'hindi') song.tags = [tag];
    song.language = effectiveLang;
    if (addSong(song, effectiveLang)) added++;
  }
  return added;
}

async function searchAlbumsAndAdd(query, targetLang, tag) {
  const albums = await searchAlbums(query);
  let added = 0;
  for (const album of albums) {
    if (!album.id) continue;
    await sleep(DELAY);
    const songs = await getAlbum(album.id);
    for (const s of songs) {
      const song = extractSong(s);
      if (!song) continue;
      const lang = song.language || targetLang;
      const effectiveLang = (lang === 'telugu') ? 'telugu' : 'hindi';
      if (tag && effectiveLang === 'hindi') song.tags = [tag];
      song.language = effectiveLang;
      if (addSong(song, effectiveLang)) added++;
    }
  }
  return added;
}

function saveProgress() {
  const teluguSongs = Array.from(teluguById.values());
  const bollySongs = Array.from(bollyById.values());
  
  // Telugu DB
  const teluguContent = `class SongsDB {
  static SONGS_DB = ${JSON.stringify(teluguSongs)};
  static getRandomSong(excludeId, preferences) {
    const pool = this.SONGS_DB.filter(s => s.id !== excludeId);
    return pool[Math.floor(Math.random() * pool.length)];
  }
}`;
  fs.writeFileSync('songs-db.js', teluguContent);
  
  // Bollywood DB
  const bollyContent = `class BollywoodSongsDB {
  static SONGS_DB = ${JSON.stringify(bollySongs)};
  static getRandomSong(excludeId) {
    const pool = this.SONGS_DB.filter(s => s.id !== excludeId);
    return pool[Math.floor(Math.random() * pool.length)];
  }
}`;
  fs.writeFileSync('bollywood-songs-db.js', bollyContent);
  
  console.log(`SAVED: Telugu=${teluguSongs.length}, Bollywood=${bollySongs.length}, Total=${teluguSongs.length+bollySongs.length}`);
}

async function main() {
  loadExisting();

  // ========= TELUGU STRATEGIES =========
  
  // 1. Telugu songs by year
  const teluguYearQueries = [];
  for (let y = 2026; y >= 1950; y--) {
    teluguYearQueries.push(`telugu songs ${y}`);
    teluguYearQueries.push(`telugu movie ${y}`);
  }
  
  // 2. Telugu movies
  const teluguMovies = [
    'Baahubali', 'Baahubali 2', 'RRR', 'Pushpa', 'Pushpa 2', 'Arjun Reddy', 
    'Ala Vaikunthapurramuloo', 'Sarileru Neekevvaru', 'Bheemla Nayak', 'Sita Ramam',
    'Jersey', 'Fidaa', 'Geetha Govindam', 'Mahanati', 'Eega', 'Magadheera',
    'Athadu', 'Pokiri', 'Bommarillu', 'Happy Days', 'Oye', 'Khaleja',
    'Dookudu', 'Businessman', 'Julayi', 'Attarintiki Daredi', 'Srimanthudu',
    'Bharat Ane Nenu', 'Maharshi', 'Rangasthalam', 'Robo', 'Chatrapathi',
    'Simhadri', 'Yamadonga', 'Mirchi', 'Temper', 'Nannaku Prematho',
    'Janatha Garage', 'Aravinda Sametha', 'Saaho', 'Akhanda', 'Waltair Veerayya',
    'Kushi', 'Hi Nanna', 'Guntur Kaaram', 'Tillu Square', 'Devara',
    'Game Changer', 'Salaar', 'Kalki 2898 AD', 'OG', 'Sye', 'Varsham',
    'Nuvvostanante Nenoddantana', 'Bommarillu', 'Parugu', 'Kotha Bangaru Lokam',
    'Ye Maaya Chesave', 'Darling', 'Orange', 'Mr Perfect', '100% Love',
    'Eega', 'Gabbar Singh', 'Race Gurram', 'Manam', 'S/O Satyamurthy',
    'Srimanthudu', 'A Aa', 'Fidaa', 'Arjun Reddy', 'Rangasthalam',
    'Geetha Govindam', 'Mahanati', 'iSmart Shankar', 'Sarileru Neekevvaru',
    'Bheeshma', 'Uppena', 'Love Story', 'Pushpa', 'RRR', 'Sita Ramam',
    'Karthikeya 2', 'Ante Sundaraniki', 'Dasara', 'Hi Nanna', 'Salaar',
    'Hanu Man', 'Kalki', 'Tillu Square', 'Lucky Bhaskar', 'Daaku Maharaaj',
    'Sankranthiki Vasthunnam', 'Vishwambhara', 'Akhanda 2',
    'Premam Telugu', 'Arya', 'Arya 2', 'Prasthanam', 'Kick', 'Kick 2',
    'Balupu', 'Legend', 'Sarrainodu', 'Dictator', 'Khaidi No 150',
    'Jai Lava Kusa', 'Agnyaathavaasi', 'Aravinda Sametha', 'NTR Kathanayakudu',
    'iSmart Shankar', 'Gaddalakonda Ganesh', 'Bheeshma', 'Ala Vaikunthapurramuloo',
    'V', 'Krack', 'Vakeel Saab', 'Naandhi', 'Jathi Ratnalu', 'DJ Tillu',
    'Sarkaru Vaari Paata', 'Major', 'Liger', 'Godfather', 'Dhamaka',
    'Waltair Veerayya', 'Veera Simha Reddy', 'Dasara', 'Virupaksha',
    'Custody', 'Agent', 'Bhagavanth Kesari', 'Leo Telugu', 'Naa Saami Ranga',
    'Committee Kurrollu', 'Premalu Telugu', 'Guntur Kaaram', 'Eagle',
    'Hanu Man', 'Kalki 2898 AD', 'Devara Part 1', 'Lucky Bhaskar',
    'Pushpa 2 The Rule', 'Game Changer', 'Daaku Maharaaj', 'Sankranthiki Vasthunnam',
    'Rajasaab', 'Retro', 'Thandel', 'Vishwambhara', 'Akhanda 2',
    'Indra', 'Narasimha Naidu', 'Tagore', 'Super', 'Chhatrapati',
    'Vikramarkudu', 'Yamadonga', 'King', 'Jalsa', 'Ready',
    'Khaleja', 'Brindavanam', 'Dookudu', 'Businessman', 'Julayi',
    'Baadshah', 'Attarintiki Daredi', 'Pataas', 'Srimanthudu', 'Sardaar Gabbar Singh',
    'Tholi Prema', 'Nuvvu Nenu', 'Manmadhudu', 'Okkadu', 'Gudumba Shankar',
    'Murari', 'Nuvve Kavali', 'Jayam', 'Nijam', 'Mass',
    'Chatrapathi', 'Simhadri', 'Anand', 'Nuvvostanante Nenoddantana',
    'Aparichitudu', 'Swamy Ra Ra', 'Pelli Choopulu', 'Arjun Reddy',
    'Mahanubhavudu', 'Ninnu Kori', 'Tholi Prema 2018', 'Goodachari',
    'Aravinda Sametha Veera Raghava', 'Taxiwaala',
    'Shatamanam Bhavati', 'Khaidi No 150', 'Guru', 'Rarandoi Veduka Chudham',
    'Hello', 'MCA Middle Class Abbayi', 'Bharat Ane Nenu',
    'Mahanati', 'Geetha Govindam', 'Aravinda Sametha'
  ];
  
  // 3. Telugu artists
  const teluguArtists = [
    'S.P. Balasubrahmanyam', 'S. Janaki', 'P. Susheela', 'Ghantasala',
    'Shreya Ghoshal Telugu', 'Sid Sriram Telugu', 'Anurag Kulkarni',
    'Haricharan Telugu', 'Chinmayi Telugu', 'Sunitha Telugu', 'Mano Telugu',
    'K.S. Chithra Telugu', 'A.R. Rahman Telugu', 'S.S. Thaman',
    'Devi Sri Prasad', 'Mani Sharma', 'M.M. Keeravani', 'Ilaiyaraaja Telugu',
    'Koti Telugu', 'R.P. Patnaik', 'Anup Rubens', 'Mickey J Meyer',
    'Anirudh Telugu', 'Armaan Malik Telugu', 'Javed Ali Telugu',
    'Sonu Nigam Telugu', 'KK Telugu', 'Arijit Singh Telugu',
    'Rahul Sipligunj', 'Mangli', 'Ram Miriyala', 'Hemachandra',
    'Mohana Bhogaraju', 'Kaala Bhairava', 'Dhanunjay', 'Revanth',
    'Benny Dayal Telugu', 'Karthik Telugu', 'Vijay Prakash Telugu',
    'Shankar Mahadevan Telugu', 'Hariharan Telugu', 'Unni Krishnan Telugu',
    'Tippu Telugu', 'Usha Telugu', 'Chitra Telugu',
    'Bheems Ceciroleo', 'Sri Krishna', 'Madhu Priya',
    'Saketh Komanduri', 'Deepak Blue', 'Nakash Aziz Telugu',
    'Yazin Nizar Telugu', 'Sricharan Pakala', 'Chaitan Bharadwaj',
    'Leon James Telugu', 'Vivek Mervin', 'Radhan', 'Gopi Sunder Telugu',
    'Saicharan Bhaskaruni', 'Lipsika', 'Shweta Mohan Telugu'
  ];

  // 4. Telugu genre/category queries
  const teluguGenres = [
    'telugu movie songs', 'telugu devotional songs', 'telugu folk songs',
    'telugu love songs', 'telugu sad songs', 'telugu party songs',
    'telugu romantic songs', 'telugu classical songs', 'telugu melody songs',
    'telugu dance songs', 'telugu mass songs', 'telugu item songs',
    'telugu wedding songs', 'telugu friendship songs', 'telugu patriotic songs',
    'telugu bhakti songs', 'telugu lord shiva songs', 'telugu lord krishna songs',
    'telugu annamayya keerthanalu', 'telugu tyagaraja keerthanalu',
    'telugu lullaby songs', 'telugu hits', 'telugu super hits',
    'telugu all time hits', 'telugu evergreen hits', 'telugu blockbuster',
    'tollywood hits', 'tollywood party', 'tollywood melody', 'tollywood romantic',
    'telugu 90s hits', 'telugu 80s hits', 'telugu 2000s hits',
    'telugu chartbusters', 'telugu trending songs', 'telugu new releases',
    'telugu unplugged', 'telugu lofi', 'telugu remix',
    'telugu duet songs', 'telugu solo songs', 'telugu female hits',
    'telugu carnatic', 'telugu ghazal', 'telugu qawwali',
    'Telangana folk songs', 'Telangana janapadalu', 'telugu janapadalu',
    'tollywood 2024', 'tollywood 2023', 'tollywood 2022', 'tollywood 2021',
    'tollywood 2020', 'tollywood 2019', 'tollywood 2018', 'tollywood 2017'
  ];

  // ========= BOLLYWOOD STRATEGIES =========
  
  // 1. Hindi songs by year
  const hindiYearQueries = [];
  for (let y = 2026; y >= 1950; y--) {
    hindiYearQueries.push(`hindi songs ${y}`);
    hindiYearQueries.push(`bollywood ${y}`);
  }
  
  // 2. Bollywood movies  
  const bollyMovies = [
    'Dilwale Dulhania Le Jayenge', 'Kuch Kuch Hota Hai', 'Kabhi Khushi Kabhie Gham',
    'Dil To Pagal Hai', 'Mohabbatein', 'Kal Ho Naa Ho', 'Veer Zaara',
    'Kabhi Alvida Naa Kehna', 'Om Shanti Om', 'Rab Ne Bana Di Jodi',
    'Jab We Met', 'Love Aaj Kal', 'Band Baaja Baaraat', 'Rockstar',
    '3 Idiots', 'PK', 'Dangal', 'Bajrangi Bhaijaan', 'Sultan', 'Tiger',
    'War', 'Pathaan', 'Jawan', 'Tiger 3', 'Fighter', 'Animal',
    'Stree', 'Stree 2', 'Pushpa Hindi', 'RRR Hindi', 'Baahubali Hindi',
    'KGF Hindi', 'KGF 2 Hindi', 'Gadar', 'Gadar 2',
    'Tum Hi Ho', 'Aashiqui 2', 'Sanam Re', 'Tere Naam',
    'Hum Aapke Hain Koun', 'Maine Pyar Kiya', 'Dil', 'Qayamat Se Qayamat Tak',
    'Taal', 'Dil Se', 'Bombay', 'Roja Hindi', 'Rangeela',
    'Lagaan', 'Swades', 'Rang De Basanti', 'Delhi 6', 'Rockstar',
    'Highway', 'Tamasha', 'Ranbir Kapoor', 'Ae Dil Hai Mushkil',
    'Yeh Jawaani Hai Deewani', 'Wake Up Sid', 'Barfi', 'Brahmastra',
    'Dhoom', 'Dhoom 2', 'Dhoom 3', 'Race', 'Race 2', 'Race 3',
    'Don', 'Don 2', 'Chennai Express', 'Happy New Year', 'Dilwale',
    'Raees', 'Zero', 'Dunki',
    'Tere Liye', 'Tum Se Hi', 'Chak De India', 'Fan', 'Raees',
    'Bajirao Mastani', 'Padmaavat', 'Goliyon Ki Raasleela Ram-Leela',
    'Gully Boy', 'Simmba', 'Sooryavanshi', 'Singham',
    'Golmaal', 'Hera Pheri', 'Welcome', 'Housefull', 'Dhamaal',
    'Ghajini', 'Taare Zameen Par', 'PK', 'Secret Superstar', 'Thugs',
    'Chhichhore', 'Kabir Singh', 'Sonu Ke Titu Ki Sweety',
    'Badhaai Ho', 'Dream Girl', 'Bala', 'Shubh Mangal Saavdhan',
    'Andhadhun', 'Article 15', 'Bhaag Milkha Bhaag',
    'Mary Kom', 'Neerja', 'Raazi', 'URI', 'Shershaah',
    'Kesari', 'Airlift', 'Akshay Kumar hits',
    'Saaho Hindi', 'War', 'Hrithik Roshan hits',
    'Tanhaji', 'Simmba', 'Ranveer Singh hits',
    'Drishyam', 'Drishyam 2', 'Bhool Bhulaiyaa', 'Bhool Bhulaiyaa 2',
    'Luka Chuppi', 'De De Pyaar De', 'Good Newwz',
    'Laal Singh Chaddha', 'Brahmastra', 'Vikram Vedha Hindi',
    'Tu Jhoothi Main Makkaar', 'Rocky Aur Rani', 'Sam Bahadur',
    '12th Fail', 'Dunki', 'Fighter', 'Crew', 'Kalki Hindi',
    'Stree 2', 'Khel Khel Mein', 'Singham Again', 'Bhool Bhulaiyaa 3',
    'Sholay', 'Mughal E Azam', 'Guide', 'Pakeezah',
    'Amar Akbar Anthony', 'Mr India', 'Dilwale Dulhania Le Jayenge',
    'Devdas', 'Black', 'Swades', 'Rang De Basanti', 'Jodhaa Akbar',
    'My Name Is Khan', '2 States', 'Queen', 'Piku', 'Pink',
    'Raanjhanaa', 'Lootera', 'Barfi', 'Kahaani', 'English Vinglish',
    'Gangs of Wasseypur', 'Masaan', 'Newton',
    'Tumbbad', 'Super 30', 'War', 'Kabir Singh',
    'Saaho Hindi', 'Mission Mangal', 'Batla House', 'Good Newwz',
    'Tanhaji', 'Malang', 'Thappad', 'Gunjan Saxena',
    'Laxmii', 'Coolie No 1', 'Mumbai Saga', 'Roohi',
    'Radhe', 'Bellbottom', 'Sooryavanshi', 'Atrangi Re',
    'Gehraiyaan', 'Gangubai Kathiawadi', 'Jayeshbhai Jordaar',
    'Ek Villain Returns', 'Liger Hindi', 'Brahmastra',
    'An Action Hero', 'Cirkus', 'Pathaan', 'Selfiee',
    'Tu Jhoothi Main Makkaar', 'Rocky Aur Rani', 'Gadar 2',
    'Jawan', 'Tiger 3', 'Sam Bahadur', 'Animal', '12th Fail',
    'Fighter', 'Teri Baaton Mein Aisa Uljha Jiya', 'Crew',
    'Bade Miyan Chote Miyan', 'Amar Prem Katha', 'Khel Khel Mein',
    'Stree 2', 'Auron Mein Kahan Dum Tha', 'Singham Again',
    'Bhool Bhulaiyaa 3', 'Baby John', 'Pushpa 2 Hindi', 'Deva',
    'Sky Force', 'Emergency', 'Chhaava', 'Sikandar',
    'Dilwale 2015', 'Ae Dil Hai Mushkil', 'Befikre', 'Jab Harry Met Sejal',
    'Sui Dhaaga', 'Kalank', 'Bharat', 'Dabangg', 'Dabangg 2', 'Dabangg 3',
    'Kick', 'Ready', 'Bodyguard', 'Ek Tha Tiger', 'Bajrangi Bhaijaan',
    'Prem Ratan Dhan Payo', 'Sultan', 'Tubelight', 'Antim',
    'Rowdy Rathore', 'Jolly LLB', 'Jolly LLB 2', 'Toilet Ek Prem Katha',
    'Pad Man', 'Gold', 'Housefull 4', 'Good Newwz', 'Laxmii',
    'Special 26', 'Holiday', 'Baby', 'Airlift', 'Rustom', 'Kesari',
    'Agneepath', 'Krrish', 'Krrish 3', 'Kaabil', 'Super 30', 'War',
    'Raees', 'Dear Zindagi', 'Piku', 'Badlapur', 'Haider',
    'Dil Dhadakne Do', 'Tamasha', 'Sanju', 'Padmaavat',
    'Ram Leela', 'Bajirao Mastani', '83 Hindi', 'Cirkus',
    'Fukrey', 'Fukrey Returns', 'Fukrey 3',
    'Student of the Year', 'Student of the Year 2',
    'Baaghi', 'Baaghi 2', 'Baaghi 3',
    'Half Girlfriend', 'OK Jaanu', 'Kapoor & Sons',
    'Humpty Sharma Ki Dulhania', 'Badrinath Ki Dulhania'
  ];
  
  // 3. Bollywood artists
  const bollyArtists = [
    'Arijit Singh', 'Lata Mangeshkar', 'Kishore Kumar', 'Mohammed Rafi',
    'Mukesh singer', 'Asha Bhosle', 'Kumar Sanu', 'Udit Narayan',
    'Sonu Nigam Hindi', 'Shreya Ghoshal Hindi', 'Neha Kakkar', 'Jubin Nautiyal',
    'Atif Aslam', 'Rahat Fateh Ali Khan', 'KK singer', 'Mohit Chauhan',
    'Pritam Hindi', 'A.R. Rahman Hindi', 'Vishal Shekhar', 'Shankar Ehsaan Loy',
    'Himesh Reshammiya', 'Mika Singh', 'Badshah rapper', 'Yo Yo Honey Singh',
    'Armaan Malik Hindi', 'Darshan Raval', 'B Praak', 'Sachet Tandon',
    'Tulsi Kumar', 'Palak Muchhal', 'Sunidhi Chauhan', 'Alka Yagnik',
    'Shaan singer', 'Abhijeet singer', 'Kavita Krishnamurthy', 'Sadhana Sargam',
    'Amit Trivedi', 'Sachin Jigar', 'Tanishk Bagchi', 'Guru Randhawa',
    'Harrdy Sandhu', 'Diljit Dosanjh Hindi', 'AP Dhillon', 'King rapper',
    'Stebin Ben', 'Vishal Mishra Hindi', 'Anuv Jain', 'Prateek Kuhad',
    'Benny Dayal Hindi', 'Papon singer', 'Nucleya', 'Ritviz',
    'Jonita Gandhi', 'Asees Kaur', 'Dhvani Bhanushali', 'Nikita Gandhi',
    'Rekha Bhardwaj', 'Monali Thakur', 'Sukhwinder Singh', 'Shankar Mahadevan Hindi',
    'Javed Ali Hindi', 'Raghav Chaitanya', 'Kailash Kher Hindi',
    'Lucky Ali Hindi', 'Strings', 'Rabbi Shergill', 'Indian Ocean band',
    'Ankit Tiwari', 'Meet Bros', 'Tony Kakkar', 'Raftaar',
    'Divine rapper', 'MC Stan'
  ];

  // 4. Bollywood genre queries
  const bollyGenres = [
    'romantic hindi songs', 'party hindi songs', 'sad hindi songs',
    'devotional hindi songs', 'sufi songs', 'ghazal songs', 'qawwali songs',
    'bollywood dance songs', 'bollywood melody songs', 'bollywood unplugged',
    'bollywood 90s hits', 'bollywood 80s hits', 'bollywood 70s hits',
    'bollywood 2000s hits', 'bollywood love songs', 'bollywood wedding songs',
    'bollywood friendship songs', 'bollywood patriotic songs', 'bollywood item songs',
    'bollywood lofi', 'bollywood remix', 'hindi indie songs',
    'bollywood duets', 'bollywood retro', 'hindi pop songs',
    'bollywood rain songs', 'bollywood travel songs',
    'bollywood motivational songs', 'bollywood romantic 2024',
    'bollywood party 2024', 'bollywood hits 2023', 'bollywood hits 2022',
    'bollywood hits 2021', 'bollywood hits 2020', 'bollywood evergreen',
    'hindi chartbusters', 'hindi trending songs', 'bollywood new releases',
    'bollywood 60s hits', 'hindi classical songs', 'filmi songs',
    'hindi bhajan', 'hindi aarti', 'krishna bhajan hindi',
    'shiv bhajan hindi', 'hanuman chalisa', 'hindi bhakti songs',
    'bollywood breakup songs', 'bollywood heartbreak', 'bollywood soulful',
    'bollywood acoustic', 'bollywood chill', 'bollywood workout',
    'bollywood top 50', 'bollywood all time best', 'bollywood superhits',
    'bollywood blockbuster songs', 'hindi romantic duets',
    '60s bollywood', '70s bollywood', '80s bollywood', '90s bollywood',
    '2000s bollywood', '2010s bollywood', '2020s bollywood'
  ];

  // Additional decade queries
  const decadeQueries = [
    'bollywood 60s hits', 'bollywood 70s hits', 'bollywood 80s hits',
    'bollywood 90s hits', 'bollywood 2000s hits', 'bollywood 2010s hits',
    'bollywood 2020s hits'
  ];

  // ========= EXECUTE ALL STRATEGIES =========
  
  let totalQueries = 0;
  const allQueries = [];

  // Build query list with [query, targetLang, tag, useAlbumSearch]
  // Telugu album searches (most efficient - gets many songs per query)
  for (const m of teluguMovies) {
    allQueries.push([m + ' telugu', 'telugu', null, true]);
  }
  for (const a of teluguArtists) {
    allQueries.push([a, 'telugu', null, true]);
  }
  // Telugu song searches
  for (const q of teluguYearQueries) {
    allQueries.push([q, 'telugu', null, false]);
  }
  for (const q of teluguGenres) {
    allQueries.push([q, 'telugu', null, false]);
  }
  for (const q of teluguGenres) {
    allQueries.push([q, 'telugu', null, true]); // also album search
  }

  // Bollywood album searches
  for (const m of bollyMovies) {
    allQueries.push([m, 'hindi', null, true]);
  }
  for (const a of bollyArtists) {
    allQueries.push([a, 'hindi', null, true]);
  }
  // Bollywood song searches
  for (const q of hindiYearQueries) {
    allQueries.push([q, 'hindi', null, false]);
  }
  for (const q of bollyGenres) {
    const tag = q.includes('romantic') ? 'romantic' : q.includes('party') || q.includes('dance') ? 'party' :
                q.includes('sad') || q.includes('breakup') ? 'sad' : q.includes('devotional') || q.includes('bhajan') ? 'devotional' :
                q.includes('sufi') ? 'sufi' : q.includes('ghazal') ? 'ghazal' : q.includes('qawwali') ? 'qawwali' : null;
    allQueries.push([q, 'hindi', tag, false]);
  }
  for (const q of bollyGenres) {
    allQueries.push([q, 'hindi', null, true]);
  }

  console.log(`Total queries to execute: ${allQueries.length}`);
  
  let queryNum = 0;
  for (const [query, lang, tag, isAlbum] of allQueries) {
    queryNum++;
    try {
      let added;
      if (isAlbum) {
        added = await searchAlbumsAndAdd(query, lang, tag);
      } else {
        added = await searchAndAdd(query, lang, tag);
      }
      if (added > 0) {
        console.log(`[${queryNum}/${allQueries.length}] "${query}" +${added} (T:${teluguById.size} B:${bollyById.size})`);
      }
      
      // Save every 100 queries
      if (queryNum % 100 === 0) {
        saveProgress();
      }
    } catch(e) {
      console.log(`[${queryNum}] ERROR: ${e.message}`);
    }
    await sleep(DELAY);
  }

  // Final save
  saveProgress();
  console.log('\n=== DONE ===');
  console.log(`Telugu: ${teluguById.size}`);
  console.log(`Bollywood: ${bollyById.size}`);
  console.log(`Total: ${teluguById.size + bollyById.size}`);
}

main().catch(e => { console.error(e); saveProgress(); });
