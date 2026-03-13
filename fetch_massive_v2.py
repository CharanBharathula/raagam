#!/usr/bin/env python3
"""Massive song fetcher v2 - fixed API format."""
import requests, json, time, sys, os
from datetime import datetime

API = "https://jiosaavn-api-privatecvc2.vercel.app"
DELAY = 0.22

# Load existing IDs
existing_telugu = set(json.load(open("/tmp/existing_ids_songs.json")))
existing_bollywood = set(json.load(open("/tmp/existing_ids_bollywood.json")))
all_existing = existing_telugu | existing_bollywood

new_telugu = []
new_bollywood = []
fetched_albums = set()
stats = {"req": 0, "err": 0, "dup": 0}

def api_get(path, params=None):
    for attempt in range(3):
        try:
            stats["req"] += 1
            r = requests.get(f"{API}{path}", params=params, timeout=15)
            time.sleep(DELAY)
            if r.status_code == 200:
                d = r.json()
                if d.get("status") == "SUCCESS":
                    return d.get("data")
            elif r.status_code == 429:
                time.sleep(3 * (attempt + 1))
                continue
            else:
                stats["err"] += 1
                return None
        except:
            stats["err"] += 1
            time.sleep(1)
    return None

def extract_song(s, default_lang="hindi"):
    if not s or not s.get("id"): return None
    sid = s["id"]
    if sid in all_existing:
        stats["dup"] += 1
        return None
    
    audio = ""
    dl = s.get("downloadUrl", [])
    if isinstance(dl, list):
        for q in ["320kbps", "160kbps", "96kbps", "48kbps"]:
            for u in dl:
                if isinstance(u, dict) and u.get("quality") == q and u.get("link"):
                    audio = u["link"]; break
            if audio: break
        if not audio and dl:
            last = dl[-1]
            audio = last.get("link", "") if isinstance(last, dict) else ""
    if not audio: return None
    
    image = ""
    imgs = s.get("image", [])
    if isinstance(imgs, list) and imgs:
        last = imgs[-1]
        image = last.get("link", "") if isinstance(last, dict) else str(last)
    elif isinstance(imgs, str):
        image = imgs
    
    artists = s.get("primaryArtists", "") or ""
    if isinstance(artists, list):
        artists = ", ".join(str(a) for a in artists)
    
    album_name = ""
    album_obj = s.get("album")
    if isinstance(album_obj, dict):
        album_name = album_obj.get("name", "")
    elif isinstance(album_obj, str):
        album_name = album_obj
    
    lang = (s.get("language") or default_lang).lower().strip()
    
    song = {
        "id": sid, "name": s.get("name", ""), "artists": artists,
        "album": album_name,
        "year": str(s.get("year", "") or ""),
        "duration": int(s.get("duration", 0) or 0),
        "audio": audio, "image": image, "language": lang
    }
    all_existing.add(sid)
    return song

def add_song(song):
    if not song: return False
    lang = song.get("language", "")
    if lang in ("telugu", "tamil", "kannada", "malayalam"):
        new_telugu.append(song)
    else:
        new_bollywood.append(song)
    return True

def search_songs(query, default_lang="hindi"):
    data = api_get("/search/songs", {"query": query, "limit": 40})
    if not data or not data.get("results"): return 0
    added = 0
    album_ids = set()
    for s in data["results"]:
        song = extract_song(s, default_lang)
        if add_song(song): added += 1
        # Collect album IDs for bulk fetch
        alb = s.get("album")
        if isinstance(alb, dict) and alb.get("id"):
            album_ids.add(alb["id"])
    # Fetch albums we haven't seen
    for aid in album_ids:
        if aid not in fetched_albums:
            fetched_albums.add(aid)
            added += fetch_album(aid, default_lang)
    return added

def fetch_album(album_id, default_lang="hindi"):
    if album_id in fetched_albums: return 0
    fetched_albums.add(album_id)
    data = api_get("/albums", {"id": album_id})
    if not data or not data.get("songs"): return 0
    added = 0
    for s in data["songs"]:
        song = extract_song(s, default_lang)
        if add_song(song): added += 1
    return added

def search_albums_fetch(query, default_lang="hindi"):
    data = api_get("/search/albums", {"query": query, "limit": 40})
    if not data or not data.get("results"): return 0
    added = 0
    for album in data["results"]:
        aid = album.get("id")
        if aid and aid not in fetched_albums:
            added += fetch_album(aid, default_lang)
    return added

def artist_paginate(artist_id, default_lang, max_pages=50):
    """Paginate artist songs (10 per page)."""
    added = 0
    for page in range(max_pages):
        data = api_get(f"/artists/{artist_id}/songs", {"page": page})
        if not data or not data.get("results"): break
        results = data["results"]
        if not results: break
        album_ids = set()
        for s in results:
            song = extract_song(s, default_lang)
            if add_song(song): added += 1
            alb = s.get("album")
            if isinstance(alb, dict) and alb.get("id"):
                album_ids.add(alb["id"])
        # Fetch albums from this page
        for aid in album_ids:
            if aid not in fetched_albums:
                added += fetch_album(aid, default_lang)
        if data.get("lastPage", True): break
    return added

def search_artist_id(name):
    data = api_get("/search/artists", {"query": name, "limit": 5})
    if not data or not data.get("results"): return None
    results = data["results"]
    return results[0].get("id") if results else None

def save_progress():
    if new_telugu: json.dump(new_telugu, open("/tmp/final_new_telugu.json", "w"))
    if new_bollywood: json.dump(new_bollywood, open("/tmp/final_new_bollywood.json", "w"))
    print(f"[{datetime.now().strftime('%H:%M:%S')}] +{len(new_telugu)}T +{len(new_bollywood)}B = {len(new_telugu)+len(new_bollywood)} new | req:{stats['req']} err:{stats['err']} dup:{stats['dup']}")
    sys.stdout.flush()

# ===================== MAIN =====================
start = time.time()
print(f"Starting. Existing: {len(existing_telugu)}T + {len(existing_bollywood)}B = {len(all_existing)}")
sys.stdout.flush()

# Phase 1: Telugu Artists - paginate + album fetch
TELUGU_ARTISTS = [
    "S.P. Balasubrahmanyam", "S. Janaki", "P. Susheela", "Ghantasala",
    "Sid Sriram", "Anurag Kulkarni", "Haricharan", "Chinmayi", "Sunitha",
    "Mano", "K.S. Chithra", "S.S. Thaman", "Devi Sri Prasad", "Mani Sharma",
    "M.M. Keeravani", "Ilaiyaraaja", "Koti", "R.P. Patnaik", "Anup Rubens",
    "Mickey J Meyer", "Shankar Mahadevan", "Shreya Ghoshal", "Karthik",
    "Vijay Prakash", "Hemachandra", "Sravana Bhargavi", "Mangli",
    "Revanth", "Rahul Sipligunj", "Tippu", "Yazin Nizar", "Armaan Malik",
    "Ramesh Naidu", "Vandemataram Srinivas", "Kalyani Malik", "Chakri",
    "S.A. Rajkumar", "Vidyasagar", "Harris Jayaraj", "D Imman",
    "Nakash Aziz", "Geetha Madhuri", "Ramya Behara", "Mohana Bhogaraju",
    "GV Prakash Kumar", "Yuvan Shankar Raja", "Sagar",
]

print("\n--- Phase 1: Telugu Artists ---")
for i, artist in enumerate(TELUGU_ARTISTS):
    if time.time() - start > 1800: break
    aid = search_artist_id(artist)
    if aid:
        # Paginate up to 30 pages (300 songs) + albums
        n = artist_paginate(aid, "telugu", max_pages=30)
        print(f"  [{i+1}] {artist} (id:{aid}): +{n}")
    else:
        n = search_songs(f"{artist} telugu", "telugu")
        print(f"  [{i+1}] {artist} (search): +{n}")
    sys.stdout.flush()
    if (i+1) % 5 == 0: save_progress()

save_progress()

# Phase 2: Bollywood Artists
BOLLYWOOD_ARTISTS = [
    "Arijit Singh", "Lata Mangeshkar", "Kishore Kumar", "Mohammed Rafi",
    "Mukesh", "Asha Bhosle", "Kumar Sanu", "Udit Narayan", "Sonu Nigam",
    "Shreya Ghoshal", "Neha Kakkar", "Jubin Nautiyal", "Atif Aslam",
    "Rahat Fateh Ali Khan", "KK", "Mohit Chauhan", "Alka Yagnik",
    "Kavita Krishnamurthy", "Sunidhi Chauhan", "Shaan", "Himesh Reshammiya",
    "Mika Singh", "Badshah", "Yo Yo Honey Singh", "Armaan Malik",
    "Darshan Raval", "B Praak", "Sachet Tandon", "Vishal Mishra",
    "Stebin Ben", "Papon", "Palak Muchhal", "Monali Thakur",
    "Pritam", "A.R. Rahman", "Amit Trivedi", "Sachin-Jigar",
    "Tanishk Bagchi", "Rochak Kohli", "Tulsi Kumar", "Dhvani Bhanushali",
    "Guru Randhawa", "Jasleen Royal", "Asees Kaur", "Nikhita Gandhi",
    "Benny Dayal", "Ankit Tiwari", "Mithoon", "Abhijeet",
    "Hariharan", "Sukhwinder Singh", "Kailash Kher", "Lucky Ali",
    "Javed Ali", "Bappi Lahiri", "Shankar-Ehsaan-Loy", "Vishal-Shekhar",
    "Salim-Sulaiman", "Jatin-Lalit", "Nadeem-Shravan", "Anu Malik",
    "Laxmikant-Pyarelal", "R.D. Burman", "S.D. Burman", "Madan Mohan",
]

print("\n--- Phase 2: Bollywood Artists ---")
for i, artist in enumerate(BOLLYWOOD_ARTISTS):
    if time.time() - start > 1800: break
    aid = search_artist_id(artist)
    if aid:
        n = artist_paginate(aid, "hindi", max_pages=30)
        print(f"  [{i+1}] {artist} (id:{aid}): +{n}")
    else:
        n = search_songs(f"{artist} hindi", "hindi")
        print(f"  [{i+1}] {artist} (search): +{n}")
    sys.stdout.flush()
    if (i+1) % 5 == 0: save_progress()

save_progress()

# Phase 3: Year-based album searches (very efficient - gets whole albums)
print("\n--- Phase 3: Year searches ---")
for year in range(2025, 1959, -1):
    if time.time() - start > 2000: break
    n = search_albums_fetch(f"telugu {year}", "telugu")
    n += search_songs(f"telugu hit songs {year}", "telugu")
    n += search_albums_fetch(f"hindi {year}", "hindi")  
    n += search_songs(f"bollywood hit songs {year}", "hindi")
    if year % 5 == 0:
        print(f"  Year {year}: +{n}")
        sys.stdout.flush()
    if year % 10 == 0: save_progress()

save_progress()

# Phase 4: Movie/album searches
print("\n--- Phase 4: Movie searches ---")
movies_telugu = [
    "Baahubali", "RRR", "Pushpa", "Pushpa 2", "Arjun Reddy", "Ala Vaikunthapurramuloo",
    "Geetha Govindam", "Eega", "Magadheera", "Pokiri", "Athadu", "Khaleja",
    "Dookudu", "Julayi", "Srimanthudu", "Rangasthalam", "Jersey", "Mahanati",
    "Fidaa", "Sarileru Neekevvaru", "Bheeshma", "Uppena", "Love Story",
    "Hi Nanna", "Salaar", "Devara", "Game Changer", "Lucky Bhaskar",
    "Chatrapathi", "Simhadri", "Bommarillu", "Ready Telugu", "Businessman",
    "Race Gurram", "Attarintiki Daredi", "S/O Satyamurthy", "A Aa",
    "Bharat Ane Nenu", "Maharshi", "Bheemla Nayak", "Dasara", "Virupaksha",
    "Nuvvostanante Nenoddantana", "Happy Telugu", "Nuvvu Naku Nachav",
    "Varsham", "Okkadu", "Murari", "Manmadhudu", "Nuvve Kavali",
    "Tholi Prema", "Ninne Pelladatha", "Premam Telugu", "Arya Telugu",
    "Gudumba Shankar", "Naa Autograph", "Jalsa", "Parugu", "Kotha Bangaru Lokam",
    "Ye Maaya Chesave", "Orange Telugu", "Mr Perfect", "Eega",
    "Seethamma Vakitlo Sirimalle Chettu", "Mirchi Telugu", "1 Nenokkadine",
    "Manam", "Srimanthudu", "Baahubali 2", "Khaidi No 150",
    "Agnyaathavaasi", "Saaho Telugu", "Vakeel Saab", "Sarkaru Vaari Paata",
    "Waltair Veerayya", "Veera Simha Reddy", "Skanda", "Tillu Square",
    "Guntur Kaaram", "Saripodha Sanivaaram", "Kalki 2898 AD Telugu",
]
movies_hindi = [
    "DDLJ", "Sholay", "Lagaan", "3 Idiots", "PK", "Dangal",
    "Bajrangi Bhaijaan", "Pathaan", "Jawan", "Animal", "Stree 2",
    "Kabir Singh", "Brahmastra", "Jab We Met", "Yeh Jawaani Hai Deewani",
    "Ae Dil Hai Mushkil", "Rockstar", "Aashiqui 2", "Shershaah",
    "Drishyam 2", "Gadar 2", "12th Fail", "Tere Naam", "Dil Se",
    "Dil To Pagal Hai", "Kuch Kuch Hota Hai", "K3G", "Kal Ho Naa Ho",
    "Om Shanti Om", "Devdas", "Veer-Zaara", "Jodhaa Akbar",
    "Chennai Express", "Bajirao Mastani", "Padmaavat", "Gully Boy",
    "Tum Hi Ho Aashiqui", "Raanjhanaa", "Ek Villain", "Badlapur",
    "Kalank", "War", "Sooryavanshi", "Gangubai", "Tu Jhoothi Main Makkaar",
    "Rocky Aur Rani", "Dunki", "Fighter 2024", "Pushpa Hindi",
    "RRR Hindi", "KGF Hindi", "Baahubali Hindi", "Bhool Bhulaiyaa 2",
    "Stree", "Fukrey", "Golmaal", "Singham", "Dabangg",
    "Rowdy Rathore", "Kick", "Race", "Dhoom", "Don",
    "Hum Dil De Chuke Sanam", "Dil Chahta Hai", "Rang De Basanti",
    "Zindagi Na Milegi Dobara", "Yeh Jawaani Hai Deewani",
    "Tamasha", "Ranbir Kapoor hits", "Shah Rukh Khan hits",
    "Salman Khan hits", "Aamir Khan hits", "Akshay Kumar hits",
]

for movie in movies_telugu:
    if time.time() - start > 2100: break
    search_albums_fetch(movie, "telugu")
    search_songs(movie, "telugu")

for movie in movies_hindi:
    if time.time() - start > 2100: break
    search_albums_fetch(movie, "hindi")
    search_songs(movie, "hindi")

save_progress()

# Phase 5: Genre/mood searches
print("\n--- Phase 5: Genre searches ---")
queries = [
    # Telugu
    "telugu romantic songs", "telugu sad songs", "telugu melody songs",
    "telugu folk songs", "telugu devotional songs", "telugu item songs",
    "telugu love songs", "telugu duet songs", "telugu classical songs",
    "telugu 90s hits", "telugu 80s hits", "telugu 2000s hits",
    "telugu evergreen songs", "telugu new songs 2024", "telugu new songs 2025",
    "telugu super hit songs", "telugu blockbuster songs", "tollywood hits",
    "telugu wedding songs", "telugu dance songs", "telugu party songs",
    # Hindi
    "hindi romantic songs", "hindi sad songs", "hindi melody songs",
    "bollywood love songs", "bollywood party songs", "bollywood wedding songs",
    "hindi devotional songs", "bollywood 90s hits", "bollywood 80s hits",
    "bollywood retro songs", "bollywood new songs 2024", "bollywood new songs 2025",
    "hindi unplugged songs", "bollywood dance songs", "hindi ghazals",
    "bollywood evergreen songs", "hindi sufi songs", "bollywood item songs",
    "90s bollywood romantic", "2000s bollywood hits", "bollywood rain songs",
]
for q in queries:
    if time.time() - start > 2200: break
    lang = "telugu" if "telugu" in q or "tollywood" in q else "hindi"
    search_songs(q, lang)
    search_albums_fetch(q, lang)

save_progress()

# Final summary
elapsed = (time.time() - start) / 60
print(f"\n{'='*60}")
print(f"DONE in {elapsed:.1f}min")
print(f"New: +{len(new_telugu)}T +{len(new_bollywood)}B = {len(new_telugu)+len(new_bollywood)}")
print(f"Total will be: {len(existing_telugu)+len(new_telugu)}T + {len(existing_bollywood)+len(new_bollywood)}B = {len(all_existing)}")
print(f"Requests: {stats['req']}, Errors: {stats['err']}, Dups: {stats['dup']}")
print(f"Albums fetched: {len(fetched_albums)}")
print("Saved to /tmp/final_new_telugu.json and /tmp/final_new_bollywood.json")
