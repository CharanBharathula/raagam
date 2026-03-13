#!/usr/bin/env python3
"""v4 - Pure search approach, maximize throughput. Also selective album fetching."""
import requests, json, time, sys, concurrent.futures, threading
from datetime import datetime

API = "https://jiosaavn-api-privatecvc2.vercel.app"

existing_telugu = set(json.load(open("/tmp/existing_ids_songs.json")))
existing_bollywood = set(json.load(open("/tmp/existing_ids_bollywood.json")))
all_existing = existing_telugu | existing_bollywood
lock = threading.Lock()

new_telugu = []
new_bollywood = []
fetched_albums = set()
stats = {"req": 0, "err": 0, "dup": 0, "added": 0}
session = requests.Session()

def extract_song(s, default_lang="hindi"):
    if not s or not s.get("id"): return None
    sid = s["id"]
    with lock:
        if sid in all_existing:
            stats["dup"] += 1; return None
        all_existing.add(sid)
    
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
    
    return {"id": sid, "name": s.get("name", ""), "artists": artists,
            "album": album_name, "year": str(s.get("year", "") or ""),
            "duration": int(s.get("duration", 0) or 0),
            "audio": audio, "image": image, "language": lang}

def add_song(song):
    if not song: return 0
    with lock:
        if song["language"] in ("telugu", "tamil", "kannada", "malayalam"):
            new_telugu.append(song)
        else:
            new_bollywood.append(song)
        stats["added"] += 1
    return 1

def do_search(query, default_lang="hindi"):
    """Single search, returns count added + list of album IDs found."""
    try:
        with lock: stats["req"] += 1
        r = session.get(f"{API}/search/songs", params={"query": query, "limit": 40}, timeout=15)
        if r.status_code != 200:
            with lock: stats["err"] += 1
            return 0, []
        d = r.json()
        if d.get("status") != "SUCCESS": return 0, []
        results = d.get("data", {}).get("results", [])
        added = 0
        album_ids = []
        for s in results:
            added += add_song(extract_song(s, default_lang))
            alb = s.get("album")
            if isinstance(alb, dict) and alb.get("id"):
                album_ids.append(alb["id"])
        return added, album_ids
    except:
        with lock: stats["err"] += 1
        return 0, []

def do_album(aid, default_lang="hindi"):
    with lock:
        if aid in fetched_albums: return 0
        fetched_albums.add(aid)
        stats["req"] += 1
    try:
        r = session.get(f"{API}/albums", params={"id": aid}, timeout=15)
        if r.status_code != 200: return 0
        d = r.json()
        if d.get("status") != "SUCCESS": return 0
        songs = d.get("data", {}).get("songs", [])
        return sum(add_song(extract_song(s, default_lang)) for s in songs)
    except:
        return 0

def save():
    with lock:
        if new_telugu: json.dump(new_telugu, open("/tmp/final_new_telugu.json", "w"))
        if new_bollywood: json.dump(new_bollywood, open("/tmp/final_new_bollywood.json", "w"))
        t = len(new_telugu); b = len(new_bollywood)
        print(f"[{datetime.now().strftime('%H:%M:%S')}] +{t}T +{b}B = {t+b} | req:{stats['req']} dup:{stats['dup']} alb:{len(fetched_albums)}")
        sys.stdout.flush()

start = time.time()
print(f"Starting. Existing: {len(all_existing)}")

# Build massive query list
queries = []

# Telugu artists
for a in ["S.P. Balasubrahmanyam", "S P Balasubrahmanyam", "SPB songs", "SPB telugu hits",
    "S. Janaki", "S Janaki songs", "P. Susheela", "P Susheela songs",
    "Ghantasala songs", "Ghantasala telugu", "Sid Sriram", "Sid Sriram telugu",
    "Anurag Kulkarni songs", "Haricharan songs", "Chinmayi songs",
    "Sunitha singer", "Mano singer telugu", "K.S. Chithra", "Chithra telugu",
    "S.S. Thaman hits", "Thaman songs", "Devi Sri Prasad", "DSP songs",
    "DSP telugu hits", "Mani Sharma", "Mani Sharma hits",
    "M.M. Keeravani", "Keeravani songs", "Ilaiyaraaja telugu",
    "Ilaiyaraaja songs", "Koti songs", "R.P. Patnaik songs",
    "Anup Rubens songs", "Mickey J Meyer songs", "Shankar Mahadevan telugu",
    "Shreya Ghoshal telugu", "Karthik singer", "Vijay Prakash",
    "Hemachandra songs", "Sravana Bhargavi songs", "Mangli songs",
    "Revanth singer", "Rahul Sipligunj songs", "Tippu singer",
    "Yazin Nizar", "Armaan Malik telugu", "Ramesh Naidu songs",
    "Vandemataram Srinivas songs", "Chakri music director",
    "S.A. Rajkumar songs", "Vidyasagar telugu", "Harris Jayaraj",
    "D Imman songs", "GV Prakash", "Yuvan Shankar Raja",
    "Geetha Madhuri songs", "Ramya Behara songs", "Mohana Bhogaraju songs",
    "Roll Rida songs", "Nutana Mohan songs", "Andrea Jeremiah songs",
    "Jonita Gandhi songs", "Nakash Aziz songs",
    "NTR songs telugu", "Mahesh Babu songs", "Pawan Kalyan songs",
    "Chiranjeevi songs", "Allu Arjun songs", "Ram Charan songs",
    "Prabhas songs telugu", "Ravi Teja songs", "Nani songs",
    "Vijay Devarakonda songs", "Nagarjuna songs", "Venkatesh songs",
    "Balakrishna songs", "Prabhas songs", "Jr NTR songs",
    "Sai Pallavi songs telugu", "Samantha songs", "Rashmika songs",
    "Pooja Hegde songs telugu", "Shruti Haasan telugu",
]:
    queries.append((a, "telugu"))

# Hindi artists
for a in ["Arijit Singh", "Arijit Singh romantic", "Arijit Singh sad",
    "Arijit Singh new songs", "Arijit Singh best", "Arijit Singh unplugged",
    "Lata Mangeshkar", "Lata Mangeshkar hits", "Lata old songs",
    "Lata Mangeshkar 60s", "Lata Mangeshkar 70s", "Lata Mangeshkar 80s",
    "Kishore Kumar", "Kishore Kumar hits", "Kishore Kumar romantic",
    "Kishore Kumar 70s", "Kishore Kumar sad", "Mohammed Rafi",
    "Mohammed Rafi hits", "Rafi old songs", "Asha Bhosle songs",
    "Asha Bhosle hits", "Kumar Sanu songs", "Kumar Sanu 90s",
    "Kumar Sanu romantic", "Udit Narayan songs", "Udit Narayan hits",
    "Sonu Nigam songs", "Sonu Nigam hits", "Shreya Ghoshal hindi",
    "Shreya Ghoshal hits", "Neha Kakkar songs", "Neha Kakkar hits",
    "Jubin Nautiyal songs", "Jubin Nautiyal hits", "Atif Aslam songs",
    "Atif Aslam hits", "Rahat Fateh Ali Khan songs", "KK songs", "KK hits",
    "Mohit Chauhan songs", "Alka Yagnik songs", "Alka Yagnik 90s",
    "Kavita Krishnamurthy songs", "Sunidhi Chauhan songs", "Shaan songs",
    "Himesh Reshammiya songs", "Mika Singh songs", "Badshah songs",
    "Honey Singh songs", "Armaan Malik songs", "Darshan Raval songs",
    "B Praak songs", "Sachet Tandon songs", "Vishal Mishra songs",
    "Stebin Ben songs", "Papon songs", "Palak Muchhal songs",
    "Pritam songs", "Pritam hits", "A.R. Rahman songs", "A.R. Rahman hits",
    "Amit Trivedi songs", "Sachin-Jigar songs", "Tanishk Bagchi songs",
    "Tulsi Kumar songs", "Dhvani Bhanushali songs", "Guru Randhawa songs",
    "Jasleen Royal songs", "Asees Kaur songs", "Benny Dayal songs",
    "Ankit Tiwari songs", "Mithoon songs", "Abhijeet songs",
    "Hariharan songs", "Sukhwinder Singh songs", "Kailash Kher songs",
    "Lucky Ali songs", "Javed Ali songs", "Bappi Lahiri songs",
    "Shankar Ehsaan Loy songs", "Vishal Shekhar songs",
    "Salim Sulaiman songs", "Jatin Lalit songs", "Nadeem Shravan songs",
    "Laxmikant Pyarelal songs", "R.D. Burman songs", "R D Burman hits",
    "S.D. Burman songs", "Madan Mohan songs", "Mukesh songs", "Mukesh old",
    "O.P. Nayyar songs", "Anu Malik songs",
    "Shah Rukh Khan songs", "Salman Khan songs", "Aamir Khan songs",
    "Ranbir Kapoor songs", "Ranveer Singh songs", "Hrithik Roshan songs",
    "Deepika Padukone songs", "Alia Bhatt songs", "Katrina Kaif songs",
]:
    queries.append((a, "hindi"))

# Year searches  
for y in range(2026, 1949, -1):
    queries.append((f"telugu {y} songs", "telugu"))
    queries.append((f"hindi {y} songs", "hindi"))
for y in range(2026, 1969, -1):
    queries.append((f"telugu hits {y}", "telugu"))
    queries.append((f"bollywood {y} hits", "hindi"))
for y in range(2026, 1989, -1):
    queries.append((f"telugu movies {y}", "telugu"))
    queries.append((f"bollywood movies {y}", "hindi"))

# Movies
tel_movies = [
    "Baahubali", "Baahubali 2", "RRR", "Pushpa", "Pushpa 2", "Arjun Reddy",
    "Ala Vaikunthapurramuloo", "Geetha Govindam", "Eega", "Magadheera",
    "Pokiri", "Athadu", "Khaleja", "Dookudu", "Julayi", "Srimanthudu",
    "Rangasthalam", "Jersey", "Mahanati", "Fidaa", "Sarileru Neekevvaru",
    "Bheeshma", "Uppena", "Love Story Telugu", "Hi Nanna", "Salaar",
    "Devara", "Game Changer", "Lucky Bhaskar", "Chatrapathi", "Simhadri",
    "Bommarillu", "Ready Telugu", "Race Gurram", "Attarintiki Daredi",
    "Bharat Ane Nenu", "Maharshi", "Bheemla Nayak", "Dasara",
    "Nuvvostanante Nenoddantana", "Okkadu", "Murari", "Manmadhudu",
    "Nuvve Kavali", "Tholi Prema", "Ninne Pelladatha", "Jalsa",
    "Ye Maaya Chesave", "Orange Telugu", "Mirchi Telugu", "Manam",
    "Sarkaru Vaari Paata", "Kalki 2898 AD", "Kushi 2023",
    "Sita Ramam", "Ante Sundaraniki", "DJ Tillu", "Tillu Square",
    "Saripodha Sanivaaram", "Premalu Telugu", "Mr Perfect",
    "Kotha Bangaru Lokam", "Parugu", "Varsham", "Nuvvu Naku Nachav",
    "Happy Days", "Businessman Telugu", "S/O Satyamurthy", "A Aa",
    "Agnyaathavaasi", "Saaho Telugu", "Vakeel Saab",
    "Waltair Veerayya", "Veera Simha Reddy", "Guntur Kaaram",
    "Skanda", "Virupaksha", "Bimbisara", "Karthikeya 2",
    "Miss Shetty Mr Polishetty", "Shyam Singha Roy", "Nenu Local",
    "Arya Telugu", "Naa Autograph", "Gudumba Shankar", "1 Nenokkadine",
    "Khaidi No 150", "SVSC", "Mr Majnu", "Brochevarevaru Ra",
    "Akhanda", "Krack", "Jathi Ratnalu", "Naandhi", "Tuck Jagadish",
    "Republic Telugu", "Bangarraju", "Radhe Shyam", "Acharya Telugu",
    "Liger Telugu", "Custody Telugu", "Dhamaka Telugu",
]
hin_movies = [
    "DDLJ", "Sholay", "Lagaan", "3 Idiots", "PK", "Dangal",
    "Bajrangi Bhaijaan", "Pathaan", "Jawan", "Animal", "Stree 2",
    "Kabir Singh", "Brahmastra", "Jab We Met", "YJHD",
    "Ae Dil Hai Mushkil", "Rockstar", "Aashiqui 2", "Shershaah",
    "Gadar 2", "12th Fail", "Dil Se", "Dil To Pagal Hai",
    "Kuch Kuch Hota Hai", "K3G", "Kal Ho Naa Ho", "Om Shanti Om",
    "Devdas 2002", "Veer-Zaara", "Jodhaa Akbar", "Chennai Express",
    "Bajirao Mastani", "Padmaavat", "Gully Boy", "Raanjhanaa",
    "War", "Sooryavanshi", "Tu Jhoothi Main Makkaar",
    "Rocky Aur Rani", "Dunki", "Fighter 2024", "Bhool Bhulaiyaa 2",
    "Stree", "Dabangg", "Singham", "Hum Dil De Chuke Sanam",
    "Dil Chahta Hai", "Rang De Basanti", "ZNMD", "Tamasha",
    "Barfi", "Queen", "Tanu Weds Manu", "Sultan", "Tiger Zinda Hai",
    "Dhoom", "Dhoom 2", "Dhoom 3", "Don 2", "Krrish",
    "Agneepath 2012", "Tere Naam", "Murder 2004", "Aashiqui 1990",
    "Maine Pyar Kiya", "Hum Aapke Hain Koun", "Dilwale 2015",
    "Chhichhore", "Bhool Bhulaiyaa 3", "Singham Again",
    "Baby John", "Pushpa Hindi", "RRR Hindi", "KGF Hindi",
    "Raees", "Ek Villain", "Badlapur", "Kalank",
    "Happy New Year", "Kick", "Race 2", "Bang Bang",
    "Gangs of Wasseypur", "Piku", "Dear Zindagi", "Kapoor and Sons",
    "Dhadak", "Sairat Hindi", "Luka Chuppi", "De De Pyaar De",
    "Malang", "Love Aaj Kal", "Shubh Mangal", "Dream Girl",
    "Good Newwz", "Pati Patni Aur Woh", "Street Dancer",
]
for m in tel_movies: queries.append((m, "telugu"))
for m in hin_movies: queries.append((m, "hindi"))

# Genres
for q, l in [
    ("telugu romantic", "telugu"), ("telugu sad songs", "telugu"),
    ("telugu melody", "telugu"), ("telugu folk", "telugu"),
    ("telugu devotional", "telugu"), ("telugu love", "telugu"),
    ("telugu duets", "telugu"), ("telugu classical", "telugu"),
    ("telugu 90s hits", "telugu"), ("telugu 80s hits", "telugu"),
    ("telugu evergreen", "telugu"), ("tollywood hits", "telugu"),
    ("telugu wedding", "telugu"), ("telugu dance", "telugu"),
    ("telugu party songs", "telugu"), ("telugu rain songs", "telugu"),
    ("telugu friendship songs", "telugu"), ("telugu mothers songs", "telugu"),
    ("telugu patalu", "telugu"), ("telugu old songs", "telugu"),
    ("telugu latest", "telugu"), ("telugu trending", "telugu"),
    ("hindi romantic", "hindi"), ("hindi sad songs", "hindi"),
    ("bollywood love", "hindi"), ("bollywood party", "hindi"),
    ("bollywood wedding", "hindi"), ("hindi devotional", "hindi"),
    ("bollywood 90s", "hindi"), ("bollywood 80s", "hindi"),
    ("bollywood retro", "hindi"), ("bollywood 2024", "hindi"),
    ("bollywood 2025", "hindi"), ("hindi unplugged", "hindi"),
    ("bollywood dance", "hindi"), ("hindi ghazals", "hindi"),
    ("bollywood evergreen", "hindi"), ("hindi sufi", "hindi"),
    ("bollywood rain", "hindi"), ("hindi qawwali", "hindi"),
    ("bollywood friendship", "hindi"), ("bollywood patriotic", "hindi"),
    ("hindi lofi", "hindi"), ("bollywood workout", "hindi"),
    ("hindi chill", "hindi"), ("bollywood road trip", "hindi"),
]:
    queries.append((q, l))

print(f"Total queries: {len(queries)}")
sys.stdout.flush()

# Process queries - collect album IDs but batch album fetches
all_album_ids_telugu = set()
all_album_ids_hindi = set()

for i, (q, lang) in enumerate(queries):
    if time.time() - start > 1800: break
    
    added, aids = do_search(q, lang)
    for aid in aids:
        if lang == "telugu":
            all_album_ids_telugu.add(aid)
        else:
            all_album_ids_hindi.add(aid)
    time.sleep(0.15)  # rate limit
    
    if (i+1) % 50 == 0:
        save()

save()
print(f"Search phase done. Albums discovered: {len(all_album_ids_telugu)}T + {len(all_album_ids_hindi)}H")
sys.stdout.flush()

# Now fetch all discovered albums
print("\n--- Album fetch phase ---")
count = 0
for aid in all_album_ids_telugu:
    if time.time() - start > 2100: break
    do_album(aid, "telugu")
    time.sleep(0.15)
    count += 1
    if count % 50 == 0: save()

for aid in all_album_ids_hindi:
    if time.time() - start > 2100: break
    do_album(aid, "hindi")
    time.sleep(0.15)
    count += 1
    if count % 50 == 0: save()

save()

# Also do album searches
print("\n--- Album search phase ---")
album_queries = []
for a in ["telugu", "tollywood", "telugu hit", "telugu romantic", "telugu melody"]:
    for y in range(2025, 1989, -1):
        album_queries.append((f"{a} {y}", "telugu"))
for a in ["bollywood", "hindi", "hindi hit", "bollywood romantic"]:
    for y in range(2025, 1989, -1):
        album_queries.append((f"{a} {y}", "hindi"))

for i, (q, lang) in enumerate(album_queries):
    if time.time() - start > 2200: break
    try:
        with lock: stats["req"] += 1
        r = session.get(f"{API}/search/albums", params={"query": q, "limit": 40}, timeout=15)
        time.sleep(0.15)
        if r.status_code == 200:
            d = r.json()
            if d.get("status") == "SUCCESS":
                for alb in d.get("data", {}).get("results", []):
                    aid = alb.get("id")
                    if aid:
                        do_album(aid, lang)
                        time.sleep(0.1)
    except:
        pass
    if (i+1) % 30 == 0: save()

save()

elapsed = (time.time() - start) / 60
print(f"\n{'='*60}")
print(f"DONE in {elapsed:.1f}min")
print(f"New: +{len(new_telugu)}T +{len(new_bollywood)}B = {len(new_telugu)+len(new_bollywood)}")
print(f"Grand total: {len(existing_telugu)+len(new_telugu)}T + {len(existing_bollywood)+len(new_bollywood)}B")
print(f"Stats: {stats}")
print(f"Albums fetched: {len(fetched_albums)}")
