#!/usr/bin/env python3
"""Massive song fetcher using artist pagination + album fetching + year searches."""
import requests, json, time, os, sys, re
from datetime import datetime

API = "https://jiosaavn-api-privatecvc2.vercel.app"
DELAY = 0.25
WORKDIR = "/home/azureuser/.openclaw/workspace/raagam"

# Load existing IDs
existing_telugu = set(json.load(open("/tmp/existing_ids_songs.json")))
existing_bollywood = set(json.load(open("/tmp/existing_ids_bollywood.json")))
all_existing = existing_telugu | existing_bollywood

new_telugu = []
new_bollywood = []
stats = {"requests": 0, "errors": 0, "skipped_dup": 0}

def api_get(path, params=None, retries=3):
    for attempt in range(retries):
        try:
            stats["requests"] += 1
            r = requests.get(f"{API}{path}", params=params, timeout=15)
            time.sleep(DELAY)
            if r.status_code == 200:
                return r.json()
            elif r.status_code == 429:
                time.sleep(2 * (attempt + 1))
                continue
            else:
                stats["errors"] += 1
                return None
        except Exception as e:
            stats["errors"] += 1
            time.sleep(1)
    return None

def extract_song(s, default_lang="hindi"):
    """Extract song from API response format."""
    if not s or not s.get("id"):
        return None
    sid = s["id"]
    if sid in all_existing:
        stats["skipped_dup"] += 1
        return None
    
    # Get best audio URL
    audio = ""
    if s.get("downloadUrl"):
        urls = s["downloadUrl"]
        if isinstance(urls, list):
            # Pick highest quality
            for q in ["320kbps", "160kbps", "96kbps", "48kbps", "12kbps"]:
                for u in urls:
                    if isinstance(u, dict) and u.get("quality") == q and u.get("url"):
                        audio = u["url"]
                        break
                if audio: break
            if not audio and urls:
                last = urls[-1]
                audio = last.get("url", "") if isinstance(last, dict) else str(last)
        elif isinstance(urls, str):
            audio = urls
    
    if not audio:
        return None
    
    # Get image
    image = ""
    if s.get("image"):
        imgs = s["image"]
        if isinstance(imgs, list):
            image = imgs[-1].get("url", "") if imgs and isinstance(imgs[-1], dict) else (imgs[-1] if imgs else "")
        elif isinstance(imgs, str):
            image = imgs
    
    # Artists
    artists = ""
    if s.get("artists") and isinstance(s["artists"], dict) and s["artists"].get("primary"):
        artists = ", ".join(a.get("name","") for a in s["artists"]["primary"] if a.get("name"))
    if not artists:
        artists = s.get("primaryArtists", "") or s.get("artist", "") or ""
    if isinstance(artists, list):
        artists = ", ".join(str(a) for a in artists)
    
    lang = (s.get("language") or default_lang).lower()
    
    song = {
        "id": sid,
        "name": s.get("name", ""),
        "artists": artists,
        "album": s.get("album", {}).get("name", "") if isinstance(s.get("album"), dict) else str(s.get("album", "")),
        "year": str(s.get("year", "") or s.get("releaseDate", "")[:4] if s.get("releaseDate") else ""),
        "duration": int(s.get("duration", 0) or 0),
        "audio": audio,
        "image": image,
        "language": lang
    }
    
    all_existing.add(sid)
    return song

def add_song(song):
    if not song: return
    lang = song.get("language", "").lower()
    if lang in ("telugu", "tamil", "kannada", "malayalam"):
        new_telugu.append(song)
    else:
        new_bollywood.append(song)

def search_artist_id(name):
    """Search for an artist and return their ID."""
    data = api_get("/search/artists", {"query": name, "limit": 5})
    if data and data.get("data") and data["data"].get("results"):
        results = data["data"]["results"]
        if results:
            return results[0].get("id")
    return None

def fetch_artist_songs(artist_id, default_lang="hindi"):
    """Paginate through all artist songs."""
    page = 0
    total_added = 0
    while True:
        data = api_get(f"/artists/{artist_id}/songs", {"page": page, "limit": 50})
        if not data or not data.get("data") or not data["data"].get("songs"):
            break
        songs = data["data"]["songs"]
        if not songs:
            break
        for s in songs:
            song = extract_song(s, default_lang)
            if song:
                add_song(song)
                total_added += 1
        # Check if more pages
        total = data["data"].get("total", 0)
        if (page + 1) * 50 >= total:
            break
        page += 1
    return total_added

def fetch_album(album_id, default_lang="hindi"):
    """Fetch all songs from an album."""
    data = api_get(f"/albums", {"id": album_id})
    if not data or not data.get("data") or not data["data"].get("songs"):
        return 0
    added = 0
    for s in data["data"]["songs"]:
        song = extract_song(s, default_lang)
        if song:
            add_song(song)
            added += 1
    return added

def search_songs(query, default_lang="hindi"):
    """Search songs by query."""
    data = api_get("/search/songs", {"query": query, "limit": 40})
    if not data or not data.get("data") or not data["data"].get("results"):
        return 0
    added = 0
    for s in data["data"]["results"]:
        song = extract_song(s, default_lang)
        if song:
            add_song(song)
            added += 1
    return added

def search_albums_and_fetch(query, default_lang="hindi"):
    """Search albums by query, then fetch each album's songs."""
    data = api_get("/search/albums", {"query": query, "limit": 40})
    if not data or not data.get("data") or not data["data"].get("results"):
        return 0
    added = 0
    for album in data["data"]["results"]:
        aid = album.get("id")
        if aid:
            added += fetch_album(aid, default_lang)
    return added

def save_progress():
    """Save intermediate results."""
    ts = datetime.now().strftime("%H%M%S")
    if new_telugu:
        json.dump(new_telugu, open(f"/tmp/new_telugu_{ts}.json", "w"))
    if new_bollywood:
        json.dump(new_bollywood, open(f"/tmp/new_bollywood_{ts}.json", "w"))
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Progress: +{len(new_telugu)} Telugu, +{len(new_bollywood)} Bollywood | Total new: {len(new_telugu)+len(new_bollywood)} | Requests: {stats['requests']} | Errors: {stats['errors']} | Dups skipped: {stats['skipped_dup']}")
    sys.stdout.flush()

# ===================== MAIN EXECUTION =====================
start_time = time.time()

TELUGU_ARTISTS = [
    "S.P. Balasubrahmanyam", "S. Janaki", "P. Susheela", "Ghantasala",
    "Sid Sriram", "Anurag Kulkarni", "Haricharan", "Chinmayi", "Sunitha",
    "Mano", "K.S. Chithra", "S.S. Thaman", "Devi Sri Prasad", "Mani Sharma",
    "M.M. Keeravani", "Ilaiyaraaja", "Koti", "R.P. Patnaik", "Anup Rubens",
    "Mickey J Meyer", "Sri Krishna", "Shankar Mahadevan", "Shreya Ghoshal",
    "Karthik", "Vijay Prakash", "Rahul Nambiar", "Hemachandra",
    "Sravana Bhargavi", "Mangli", "Roll Rida", "Revanth", "Rahul Sipligunj",
    "Usha", "Tippu", "Andrea Jeremiah", "Yazin Nizar", "Armaan Malik",
    "Jonita Gandhi", "Nutana Mohan", "Sri Kommineni",
    # Additional Telugu artists
    "Ramesh Naidu", "Raj-Koti", "Vandemataram Srinivas", "Kalyani Malik",
    "Chakri", "Bhaskarabhatla", "Veturi", "Sirivennela", "S.A. Rajkumar",
    "Vidyasagar", "Harris Jayaraj", "Yuvan Shankar Raja",
    "GV Prakash Kumar", "D Imman", "Sagar", "Nakash Aziz",
    "Geetha Madhuri", "Ramya Behara", "Mohana Bhogaraju",
]

BOLLYWOOD_ARTISTS = [
    "Arijit Singh", "Lata Mangeshkar", "Kishore Kumar", "Mohammed Rafi",
    "Mukesh", "Asha Bhosle", "Kumar Sanu", "Udit Narayan", "Sonu Nigam",
    "Shreya Ghoshal", "Neha Kakkar", "Jubin Nautiyal", "Atif Aslam",
    "Rahat Fateh Ali Khan", "KK", "Mohit Chauhan", "Alka Yagnik",
    "Kavita Krishnamurthy", "Sunidhi Chauhan", "Shaan", "Himesh Reshammiya",
    "Mika Singh", "Badshah", "Yo Yo Honey Singh", "Armaan Malik",
    "Darshan Raval", "B Praak", "Sachet Tandon", "Vishal Mishra",
    "Stebin Ben", "Papon", "Mohd. Irfan", "Palak Muchhal", "Monali Thakur",
    "Pritam", "A.R. Rahman", "Vishal-Shekhar", "Shankar-Ehsaan-Loy",
    "Salim-Sulaiman", "Jatin-Lalit", "Nadeem-Shravan", "Anu Malik",
    "Anand-Milind", "Laxmikant-Pyarelal", "R.D. Burman", "S.D. Burman",
    "Madan Mohan", "O.P. Nayyar",
    # Additional
    "Amit Trivedi", "Sachin-Jigar", "Tanishk Bagchi", "Rochak Kohli",
    "Tulsi Kumar", "Dhvani Bhanushali", "Guru Randhawa", "Harrdy Sandhu",
    "Jasleen Royal", "Asees Kaur", "Nikhita Gandhi", "Jonita Gandhi",
    "Benny Dayal", "Nakash Aziz", "Dev Negi", "Ash King",
    "Ankit Tiwari", "Meet Bros", "Mithoon", "Sajid-Wajid",
    "Abhijeet", "Babul Supriyo", "Hariharan", "Sukhwinder Singh",
    "Kailash Kher", "Lucky Ali", "Shankar Mahadevan", "Srinivas",
    "Javed Ali", "Wajid", "Bappi Lahiri", "Neeraj Shridhar",
]

print("=" * 60)
print("MASSIVE SONG FETCH - Starting")
print(f"Existing: {len(existing_telugu)} Telugu + {len(existing_bollywood)} Bollywood")
print("=" * 60)
sys.stdout.flush()

# Phase 1: Telugu Artists
print("\n--- PHASE 1: Telugu Artists ---")
sys.stdout.flush()
for i, artist in enumerate(TELUGU_ARTISTS):
    elapsed = time.time() - start_time
    if elapsed > 2100:  # 35 min limit
        print("Time limit approaching, moving to save phase")
        break
    
    print(f"[{i+1}/{len(TELUGU_ARTISTS)}] Searching artist: {artist}")
    sys.stdout.flush()
    
    aid = search_artist_id(artist)
    if aid:
        added = fetch_artist_songs(aid, "telugu")
        print(f"  -> Artist ID {aid}: +{added} songs")
    else:
        # Fallback: direct song search
        added = search_songs(f"{artist} telugu songs", "telugu")
        added += search_albums_and_fetch(f"{artist} telugu", "telugu")
        print(f"  -> Search fallback: +{added} songs")
    sys.stdout.flush()
    
    if (i + 1) % 5 == 0:
        save_progress()

save_progress()

# Phase 2: Bollywood Artists
print("\n--- PHASE 2: Bollywood Artists ---")
sys.stdout.flush()
for i, artist in enumerate(BOLLYWOOD_ARTISTS):
    elapsed = time.time() - start_time
    if elapsed > 2100:
        print("Time limit approaching, moving to save phase")
        break
    
    print(f"[{i+1}/{len(BOLLYWOOD_ARTISTS)}] Searching artist: {artist}")
    sys.stdout.flush()
    
    aid = search_artist_id(artist)
    if aid:
        added = fetch_artist_songs(aid, "hindi")
        print(f"  -> Artist ID {aid}: +{added} songs")
    else:
        added = search_songs(f"{artist} hindi songs", "hindi")
        added += search_albums_and_fetch(f"{artist} bollywood", "hindi")
        print(f"  -> Search fallback: +{added} songs")
    sys.stdout.flush()
    
    if (i + 1) % 5 == 0:
        save_progress()

save_progress()

# Phase 3: Year-based searches
print("\n--- PHASE 3: Year-based searches ---")
sys.stdout.flush()
for year in range(2025, 1949, -1):
    elapsed = time.time() - start_time
    if elapsed > 2100:
        break
    
    # Telugu
    search_songs(f"telugu songs {year}", "telugu")
    search_albums_and_fetch(f"telugu {year}", "telugu")
    
    # Hindi
    search_songs(f"hindi songs {year}", "hindi")
    search_albums_and_fetch(f"bollywood {year}", "hindi")
    
    if year % 10 == 0:
        save_progress()
        print(f"  Year {year} done")
        sys.stdout.flush()

save_progress()

# Phase 4: Popular movie/album searches
print("\n--- PHASE 4: Popular movie searches ---")
sys.stdout.flush()
telugu_movies = [
    "Baahubali", "RRR", "Pushpa", "Arjun Reddy", "Ala Vaikunthapurramuloo",
    "Geetha Govindam", "Eega", "Magadheera", "Pokiri", "Athadu",
    "Khaleja", "Dookudu", "Julayi", "Srimanthudu", "Rangasthalam",
    "Jersey", "Mahanati", "Fidaa", "Nenu Local", "Sarileru Neekevvaru",
    "Bheeshma", "Uppena", "Love Story", "Shyam Singha Roy", "DJ Tillu",
    "Kushi 2023", "Hi Nanna", "Salaar", "Guntur Kaaram", "Tillu Square",
    "Devara", "Pushpa 2", "Game Changer", "Saripodha Sanivaaram",
    "Premalu Telugu", "Lucky Bhaskar", "Sye", "Chatrapathi", "Simhadri",
    "Nuvvostanante Nenoddantana", "Happy", "Bommarillu", "Ready",
    "Businessman", "Race Gurram", "Attarintiki Daredi", "S/O Satyamurthy",
    "A Aa", "Khaidi No 150", "Duvvada Jagannadham", "Agnyaathavaasi",
    "Bharat Ane Nenu", "Maharshi", "Saaho", "Vakeel Saab",
    "Bheemla Nayak", "Sarkaru Vaari Paata", "Waltair Veerayya",
    "Veera Simha Reddy", "Dasara", "Virupaksha", "Agent",
    "Miss Shetty Mr Polishetty", "Skanda", "Leo Telugu",
]
hindi_movies = [
    "Dilwale Dulhania Le Jayenge", "Sholay", "Mughal-e-Azam", "Lagaan",
    "Dil Chahta Hai", "Rang De Basanti", "3 Idiots", "PK", "Dangal",
    "Bajrangi Bhaijaan", "Sultan", "Tiger Zinda Hai", "War", "Pathaan",
    "Jawan", "Animal", "Dunki", "Fighter 2024", "Stree 2",
    "Kabir Singh", "Tanhaji", "Sooryavanshi", "Gangubai Kathiawadi",
    "Brahmastra", "Rocky Aur Rani", "Tu Jhoothi Main Makkaar",
    "Jab We Met", "Yeh Jawaani Hai Deewani", "Ae Dil Hai Mushkil",
    "Rockstar", "Aashiqui 2", "Ek Villain", "Badlapur", "Raees",
    "Padmaavat", "Gully Boy", "Chhichhore", "Shershaah",
    "Drishyam 2", "Gadar 2", "OMG 2", "12th Fail",
    "Amar Prem", "Aradhana", "Guide", "Anand", "Hum Dil De Chuke Sanam",
    "Devdas 2002", "Veer-Zaara", "Jodhaa Akbar", "My Name Is Khan",
    "Chennai Express", "Happy New Year", "Dilwale 2015", "Raabta",
    "Kalank", "Love Aaj Kal 2", "Malang", "Ludo", "Roohi",
    "Bell Bottom", "Bhool Bhulaiyaa 2", "Jugjugg Jeeyo", "Darlings",
    "Dil To Pagal Hai", "Kuch Kuch Hota Hai", "Kabhi Khushi Kabhie Gham",
    "Kal Ho Naa Ho", "Main Hoon Na", "Om Shanti Om", "Dostana",
]

for movie in telugu_movies:
    elapsed = time.time() - start_time
    if elapsed > 2100: break
    search_albums_and_fetch(movie, "telugu")
    search_songs(movie, "telugu")

for movie in hindi_movies:
    elapsed = time.time() - start_time
    if elapsed > 2100: break
    search_albums_and_fetch(movie, "hindi")
    search_songs(movie, "hindi")

save_progress()

# ===================== FINAL SAVE =====================
print("\n" + "=" * 60)
print(f"FETCH COMPLETE")
print(f"New Telugu: {len(new_telugu)}")
print(f"New Bollywood: {len(new_bollywood)}")
print(f"Total new: {len(new_telugu) + len(new_bollywood)}")
print(f"Requests: {stats['requests']}, Errors: {stats['errors']}, Dups: {stats['skipped_dup']}")
print(f"Time: {(time.time()-start_time)/60:.1f} minutes")
print("=" * 60)

# Save final intermediate files
json.dump(new_telugu, open("/tmp/final_new_telugu.json", "w"))
json.dump(new_bollywood, open("/tmp/final_new_bollywood.json", "w"))
print("Saved to /tmp/final_new_telugu.json and /tmp/final_new_bollywood.json")
sys.stdout.flush()
