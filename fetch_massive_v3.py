#!/usr/bin/env python3
"""Massive song fetcher v3 - search + album strategy (no broken artist pagination)."""
import requests, json, time, sys
from datetime import datetime

API = "https://jiosaavn-api-privatecvc2.vercel.app"
DELAY = 0.22

existing_telugu = set(json.load(open("/tmp/existing_ids_songs.json")))
existing_bollywood = set(json.load(open("/tmp/existing_ids_bollywood.json")))
all_existing = existing_telugu | existing_bollywood

new_telugu = []
new_bollywood = []
fetched_albums = set()
stats = {"req": 0, "err": 0, "dup": 0}

def api_get(url, params=None):
    for attempt in range(3):
        try:
            stats["req"] += 1
            r = requests.get(url, params=params, timeout=15)
            time.sleep(DELAY)
            if r.status_code == 200:
                d = r.json()
                if d.get("status") == "SUCCESS":
                    return d.get("data")
            elif r.status_code == 429:
                time.sleep(3 * (attempt + 1)); continue
            else:
                stats["err"] += 1; return None
        except:
            stats["err"] += 1; time.sleep(1)
    return None

def extract_song(s, default_lang="hindi"):
    if not s or not s.get("id"): return None
    sid = s["id"]
    if sid in all_existing:
        stats["dup"] += 1; return None
    
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
    
    artists = s.get("primaryArtists", "") or ""
    album_obj = s.get("album")
    album_name = album_obj.get("name", "") if isinstance(album_obj, dict) else str(album_obj or "")
    lang = (s.get("language") or default_lang).lower().strip()
    
    song = {"id": sid, "name": s.get("name", ""), "artists": artists,
            "album": album_name, "year": str(s.get("year", "") or ""),
            "duration": int(s.get("duration", 0) or 0),
            "audio": audio, "image": image, "language": lang}
    all_existing.add(sid)
    return song

def add_song(song):
    if not song: return 0
    lang = song["language"]
    if lang in ("telugu", "tamil", "kannada", "malayalam"):
        new_telugu.append(song)
    else:
        new_bollywood.append(song)
    return 1

def fetch_album(aid, default_lang="hindi"):
    if aid in fetched_albums: return 0
    fetched_albums.add(aid)
    data = api_get(f"{API}/albums", {"id": aid})
    if not data or not data.get("songs"): return 0
    return sum(add_song(extract_song(s, default_lang)) for s in data["songs"])

def search_and_albums(query, default_lang="hindi"):
    """Search songs, then fetch all discovered albums."""
    data = api_get(f"{API}/search/songs", {"query": query, "limit": 40})
    if not data or not data.get("results"): return 0
    added = 0
    album_ids = set()
    for s in data["results"]:
        added += add_song(extract_song(s, default_lang))
        alb = s.get("album")
        if isinstance(alb, dict) and alb.get("id"):
            album_ids.add(alb["id"])
    for aid in album_ids:
        added += fetch_album(aid, default_lang)
    return added

def search_albums(query, default_lang="hindi"):
    data = api_get(f"{API}/search/albums", {"query": query, "limit": 40})
    if not data or not data.get("results"): return 0
    return sum(fetch_album(a["id"], default_lang) for a in data["results"] if a.get("id"))

def save():
    if new_telugu: json.dump(new_telugu, open("/tmp/final_new_telugu.json", "w"))
    if new_bollywood: json.dump(new_bollywood, open("/tmp/final_new_bollywood.json", "w"))
    t = len(new_telugu); b = len(new_bollywood)
    print(f"[{datetime.now().strftime('%H:%M:%S')}] +{t}T +{b}B = {t+b} | req:{stats['req']} err:{stats['err']} dup:{stats['dup']} alb:{len(fetched_albums)}")
    sys.stdout.flush()

start = time.time()
print(f"Starting. Existing: {len(existing_telugu)}T + {len(existing_bollywood)}B = {len(all_existing)}")

# ===== MASSIVE QUERY LIST =====
# Each query: (search_term, language)
queries = []

# Telugu artist searches (multiple variations per artist for max coverage)
tel_artists = [
    "S.P. Balasubrahmanyam", "S P Balasubrahmanyam", "SPB telugu",
    "S. Janaki", "S Janaki telugu", "P. Susheela", "P Susheela telugu",
    "Ghantasala", "Ghantasala telugu songs", "Sid Sriram telugu",
    "Anurag Kulkarni", "Haricharan telugu", "Chinmayi telugu",
    "Sunitha telugu singer", "Mano telugu", "K.S. Chithra telugu",
    "S.S. Thaman", "Thaman telugu", "Devi Sri Prasad", "DSP telugu songs",
    "Mani Sharma telugu", "M.M. Keeravani", "Keeravani telugu",
    "Ilaiyaraaja telugu", "Koti telugu", "R.P. Patnaik",
    "Anup Rubens", "Mickey J Meyer", "Shankar Mahadevan telugu",
    "Shreya Ghoshal telugu", "Karthik telugu singer", "Vijay Prakash telugu",
    "Hemachandra telugu", "Sravana Bhargavi", "Mangli telugu",
    "Revanth telugu", "Rahul Sipligunj", "Tippu telugu",
    "Yazin Nizar telugu", "Armaan Malik telugu", "Ramesh Naidu telugu",
    "Vandemataram Srinivas", "Chakri telugu", "S.A. Rajkumar telugu",
    "Vidyasagar telugu", "Harris Jayaraj telugu", "D Imman telugu",
    "Geetha Madhuri", "Ramya Behara", "Mohana Bhogaraju",
    "GV Prakash telugu", "Yuvan Shankar Raja telugu",
    "Sri Krishna telugu singer", "Roll Rida", "Sri Kommineni",
    "Nutana Mohan", "Usha telugu singer", "Andrea Jeremiah telugu",
    "Jonita Gandhi telugu", "Nakash Aziz telugu",
    # More Telugu searches
    "NTR songs", "Mahesh Babu songs", "Pawan Kalyan songs", "Chiranjeevi songs",
    "Allu Arjun songs", "Ram Charan songs", "Prabhas songs",
    "Ravi Teja songs", "Nani songs telugu", "Vijay Devarakonda songs",
    "Samantha songs telugu", "Rashmika songs telugu",
]

hin_artists = [
    "Arijit Singh", "Arijit Singh romantic", "Arijit Singh sad songs",
    "Lata Mangeshkar", "Lata Mangeshkar hits", "Lata ji old songs",
    "Kishore Kumar", "Kishore Kumar hits", "Kishore Kumar romantic",
    "Mohammed Rafi", "Rafi sahab hits", "Mohammed Rafi old songs",
    "Asha Bhosle", "Asha Bhosle hits", "Kumar Sanu",
    "Kumar Sanu 90s", "Udit Narayan", "Udit Narayan hits",
    "Sonu Nigam", "Sonu Nigam hits", "Shreya Ghoshal hindi",
    "Neha Kakkar", "Neha Kakkar hits", "Jubin Nautiyal",
    "Atif Aslam", "Atif Aslam hits", "Rahat Fateh Ali Khan",
    "KK singer", "KK hindi songs", "Mohit Chauhan",
    "Alka Yagnik", "Alka Yagnik 90s", "Kavita Krishnamurthy",
    "Sunidhi Chauhan", "Shaan hindi", "Himesh Reshammiya",
    "Mika Singh", "Badshah songs", "Yo Yo Honey Singh",
    "Armaan Malik hindi", "Darshan Raval", "B Praak",
    "Sachet Tandon", "Vishal Mishra", "Stebin Ben",
    "Papon hindi", "Palak Muchhal", "Monali Thakur",
    "Pritam hits", "A.R. Rahman hindi", "Amit Trivedi",
    "Sachin-Jigar", "Tanishk Bagchi", "Rochak Kohli",
    "Tulsi Kumar", "Dhvani Bhanushali", "Guru Randhawa",
    "Jasleen Royal", "Asees Kaur", "Nikhita Gandhi",
    "Benny Dayal", "Ankit Tiwari", "Mithoon songs",
    "Abhijeet Bhattacharya", "Hariharan hindi", "Sukhwinder Singh",
    "Kailash Kher", "Lucky Ali", "Javed Ali",
    "Bappi Lahiri", "Shankar Ehsaan Loy", "Vishal Shekhar",
    "Salim Sulaiman", "Jatin Lalit", "Nadeem Shravan",
    "Anu Malik", "Laxmikant Pyarelal", "R.D. Burman",
    "S.D. Burman", "Madan Mohan ghazals", "Mukesh singer",
    # Actor-based
    "Shah Rukh Khan songs", "Salman Khan songs", "Aamir Khan songs",
    "Ranbir Kapoor songs", "Ranveer Singh songs", "Hrithik Roshan songs",
    "Akshay Kumar songs", "Varun Dhawan songs", "Kartik Aaryan songs",
]

for a in tel_artists:
    queries.append((a, "telugu"))
for a in hin_artists:
    queries.append((a, "hindi"))

# Year searches
for y in range(2025, 1949, -1):
    queries.append((f"telugu songs {y}", "telugu"))
    queries.append((f"hindi songs {y}", "hindi"))
    if y >= 1990:
        queries.append((f"telugu hits {y}", "telugu"))
        queries.append((f"bollywood hits {y}", "hindi"))

# Telugu movies
tel_movies = [
    "Baahubali", "Baahubali 2", "RRR", "Pushpa", "Pushpa 2", "Arjun Reddy",
    "Ala Vaikunthapurramuloo", "Geetha Govindam", "Eega", "Magadheera",
    "Pokiri", "Athadu", "Khaleja", "Dookudu", "Julayi", "Srimanthudu",
    "Rangasthalam", "Jersey", "Mahanati", "Fidaa", "Sarileru Neekevvaru",
    "Bheeshma", "Uppena", "Love Story Telugu", "Hi Nanna", "Salaar Telugu",
    "Devara", "Game Changer", "Lucky Bhaskar", "Chatrapathi", "Simhadri",
    "Bommarillu", "Ready Telugu", "Businessman Telugu", "Race Gurram",
    "Attarintiki Daredi", "S/O Satyamurthy", "A Aa", "Bharat Ane Nenu",
    "Maharshi Telugu", "Bheemla Nayak", "Dasara", "Virupaksha",
    "Nuvvostanante Nenoddantana", "Happy Days Telugu", "Nuvvu Naku Nachav",
    "Varsham Telugu", "Okkadu", "Murari", "Manmadhudu", "Nuvve Kavali",
    "Tholi Prema", "Ninne Pelladatha", "Arya Telugu", "Jalsa Telugu",
    "Parugu", "Kotha Bangaru Lokam", "Ye Maaya Chesave", "Orange Telugu",
    "Mr Perfect", "SVSC", "Mirchi Telugu", "1 Nenokkadine", "Manam Telugu",
    "Khaidi No 150", "Saaho Telugu", "Sarkaru Vaari Paata",
    "Waltair Veerayya", "Skanda", "Tillu Square", "Guntur Kaaram",
    "Kalki 2898 AD", "DJ Tillu", "Kushi Telugu 2023",
    "Shyam Singha Roy", "Nenu Local", "Premalu Telugu",
    "Miss Shetty Mr Polishetty", "Saripodha Sanivaaram",
    "Ante Sundaraniki", "Sita Ramam", "Major Telugu", "RRR Telugu",
    "Vakeel Saab", "Veera Simha Reddy", "Agent Telugu",
    "Bimbisara", "Acharya Telugu", "Radhe Shyam", "Liger Telugu",
    "Karthikeya 2", "Dhamaka Telugu", "Custody Telugu",
]
hin_movies = [
    "Dilwale Dulhania Le Jayenge", "Sholay", "Lagaan", "3 Idiots",
    "PK", "Dangal", "Bajrangi Bhaijaan", "Pathaan", "Jawan", "Animal",
    "Stree 2", "Kabir Singh", "Brahmastra", "Jab We Met",
    "Yeh Jawaani Hai Deewani", "Ae Dil Hai Mushkil", "Rockstar",
    "Aashiqui 2", "Shershaah", "Drishyam 2", "Gadar 2", "12th Fail",
    "Dil Se", "Dil To Pagal Hai", "Kuch Kuch Hota Hai",
    "Kabhi Khushi Kabhie Gham", "Kal Ho Naa Ho", "Om Shanti Om",
    "Devdas 2002", "Veer-Zaara", "Jodhaa Akbar", "Chennai Express",
    "Bajirao Mastani", "Padmaavat", "Gully Boy", "Raanjhanaa",
    "Ek Villain", "Kalank", "War", "Sooryavanshi",
    "Tu Jhoothi Main Makkaar", "Rocky Aur Rani", "Dunki", "Fighter 2024",
    "Bhool Bhulaiyaa 2", "Stree", "Dabangg", "Singham",
    "Hum Dil De Chuke Sanam", "Dil Chahta Hai", "Rang De Basanti",
    "Zindagi Na Milegi Dobara", "Tamasha", "Barfi",
    "Queen", "Piku", "Tanu Weds Manu", "Raees", "Sultan",
    "Tiger Zinda Hai", "Dhoom 2", "Dhoom 3", "Don 2",
    "Krrish", "Bang Bang", "Agneepath 2012", "Gangs of Wasseypur",
    "Tere Naam", "Murder", "Aashiqui", "Maine Pyar Kiya",
    "Hum Aapke Hain Koun", "Raja Hindustani", "Dilwale 2015",
    "Happy New Year", "Badlapur", "Chhichhore", "Ludo",
    "Bhool Bhulaiyaa 3", "Singham Again", "Khel Khel Mein",
    "Baby John", "Pushpa Hindi", "Saaho Hindi", "RRR Hindi",
]

for m in tel_movies:
    queries.append((m, "telugu"))
for m in hin_movies:
    queries.append((m, "hindi"))

# Genre searches
genres = [
    ("telugu romantic songs", "telugu"), ("telugu sad songs", "telugu"),
    ("telugu melody", "telugu"), ("telugu folk songs", "telugu"),
    ("telugu devotional", "telugu"), ("telugu love songs", "telugu"),
    ("telugu duets", "telugu"), ("telugu classical", "telugu"),
    ("telugu 90s", "telugu"), ("telugu 80s", "telugu"), ("telugu 70s", "telugu"),
    ("telugu evergreen", "telugu"), ("telugu super hits", "telugu"),
    ("tollywood hits", "telugu"), ("telugu wedding songs", "telugu"),
    ("telugu dance songs", "telugu"), ("telugu party songs", "telugu"),
    ("telugu unplugged", "telugu"), ("telugu rain songs", "telugu"),
    ("telugu mothers day songs", "telugu"), ("telugu friendship songs", "telugu"),
    ("hindi romantic songs", "hindi"), ("hindi sad songs", "hindi"),
    ("bollywood love songs", "hindi"), ("bollywood party songs", "hindi"),
    ("bollywood wedding songs", "hindi"), ("hindi devotional", "hindi"),
    ("bollywood 90s hits", "hindi"), ("bollywood 80s", "hindi"),
    ("bollywood retro", "hindi"), ("bollywood new 2024", "hindi"),
    ("bollywood new 2025", "hindi"), ("hindi unplugged", "hindi"),
    ("bollywood dance", "hindi"), ("hindi ghazals", "hindi"),
    ("bollywood evergreen", "hindi"), ("hindi sufi", "hindi"),
    ("bollywood rain songs", "hindi"), ("bollywood qawwali", "hindi"),
    ("90s bollywood romantic", "hindi"), ("2000s bollywood", "hindi"),
    ("bollywood friendship songs", "hindi"), ("bollywood patriotic", "hindi"),
]
queries.extend(genres)

# ===== EXECUTE =====
print(f"Total queries: {len(queries)}")
sys.stdout.flush()

for i, (q, lang) in enumerate(queries):
    if time.time() - start > 2100: break  # 35 min
    
    # Search songs (gets 40) + discovers albums
    search_and_albums(q, lang)
    # Also search albums directly
    search_albums(q, lang)
    
    if (i+1) % 20 == 0:
        save()

save()

# ===== EXTRA: paginate a few key album searches more deeply =====
# Search for numbered albums/compilations
print("\n--- Extra: compilation searches ---")
extra = []
for prefix in ["telugu hits", "bollywood hits", "telugu songs collection", "hindi songs collection",
               "telugu melody", "bollywood romantic", "90s hindi", "80s hindi", "70s hindi",
               "telugu 2024", "telugu 2023", "telugu 2022", "hindi 2024", "hindi 2023",
               "tollywood 2024", "tollywood 2023", "bollywood 2024", "bollywood 2023"]:
    lang = "telugu" if "telugu" in prefix or "tollywood" in prefix else "hindi"
    extra.append((prefix, lang))
    extra.append((f"{prefix} vol 1", lang))
    extra.append((f"{prefix} vol 2", lang))
    extra.append((f"best of {prefix}", lang))

for i, (q, lang) in enumerate(extra):
    if time.time() - start > 2200: break
    search_and_albums(q, lang)
    search_albums(q, lang)
    if (i+1) % 20 == 0: save()

save()

elapsed = (time.time() - start) / 60
print(f"\n{'='*60}")
print(f"DONE in {elapsed:.1f}min")
print(f"New: +{len(new_telugu)}T +{len(new_bollywood)}B = {len(new_telugu)+len(new_bollywood)}")
print(f"Grand total: {len(existing_telugu)+len(new_telugu)}T + {len(existing_bollywood)+len(new_bollywood)}B")
print(f"Requests: {stats['req']}, Errors: {stats['err']}, Dups: {stats['dup']}, Albums: {len(fetched_albums)}")
