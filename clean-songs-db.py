#!/usr/bin/env python3
"""
clean-songs-db.py — Cleans both song database files for the Raagam project.

1. songs-db.js (Telugu DB):
   - Reads UTF-8 with BOM
   - Extracts all song JSON objects via regex
   - Filters to keep only Telugu songs
   - De-duplicates by id
   - Writes clean JS class structure

2. bollywood-songs-db.js (Bollywood DB):
   - Reads UTF-16LE
   - Extracts all song JSON objects (from main array AND broken method body)
   - Filters to keep only Hindi songs
   - De-duplicates by id
   - Writes as UTF-8 (halving file size)
"""

import json
import re
import os
import sys

# ─── Song extraction regex ───
# Matches JSON objects starting with {"id": and ending with "language":"..."}
# Handles optional extra fields like "tags":[...] after language
# Uses a non-greedy approach to match individual song objects
SONG_PATTERN = re.compile(
    r'\{["\s]*id["\s]*:["\s]*[^"]*"[^}]*"language"\s*:\s*"[^"]*"'
    r'(?:\s*,\s*"tags"\s*:\s*\[[^\]]*\])?'
    r'\s*\}',
    re.DOTALL
)


def extract_songs(text):
    """Extract all song JSON objects from text using regex, parse each as JSON."""
    matches = SONG_PATTERN.findall(text)
    songs = []
    parse_errors = 0
    for m in matches:
        try:
            song = json.loads(m)
            songs.append(song)
        except json.JSONDecodeError:
            parse_errors += 1
            # Try to fix common issues
            try:
                # Some fields might have unescaped characters
                fixed = m.replace('\n', ' ').replace('\r', ' ').replace('\t', ' ')
                song = json.loads(fixed)
                songs.append(song)
                parse_errors -= 1  # Successfully recovered
            except json.JSONDecodeError:
                if parse_errors <= 5:
                    print(f"  WARNING: Could not parse song object: {m[:120]}...")
    if parse_errors > 0:
        print(f"  WARNING: {parse_errors} song objects could not be parsed")
    return songs


def deduplicate_by_id(songs):
    """Remove duplicate songs based on id field, keeping first occurrence."""
    seen = set()
    unique = []
    for song in songs:
        sid = song.get('id')
        if sid and sid not in seen:
            seen.add(sid)
            unique.append(song)
    return unique


def format_song_json(song):
    """Format a song object as compact JSON on one line."""
    return json.dumps(song, ensure_ascii=False, separators=(',', ':'))


def count_by_language(songs):
    """Count songs grouped by language."""
    counts = {}
    for s in songs:
        lang = s.get('language', 'unknown')
        counts[lang] = counts.get(lang, 0) + 1
    return counts


# ═══════════════════════════════════════════════════════════════════════════════
# STEP 1: Clean Telugu songs-db.js
# ═══════════════════════════════════════════════════════════════════════════════
def clean_telugu_db():
    filepath = '/workspaces/raagam/songs-db.js'
    print("=" * 70)
    print("CLEANING TELUGU DB: songs-db.js")
    print("=" * 70)

    # Read with UTF-8 BOM
    print(f"\nReading {filepath}...")
    with open(filepath, 'r', encoding='utf-8-sig') as f:
        content = f.read()
    original_size = os.path.getsize(filepath)
    print(f"  Original file size: {original_size:,} bytes ({original_size/1024/1024:.1f} MB)")

    # Extract all songs
    print("\nExtracting songs via regex...")
    all_songs = extract_songs(content)
    print(f"  Total song objects found: {len(all_songs)}")

    # Show language breakdown before filtering
    lang_counts = count_by_language(all_songs)
    print("\n  Language breakdown (before filtering):")
    for lang, count in sorted(lang_counts.items(), key=lambda x: -x[1]):
        print(f"    {lang}: {count}")

    # Filter to Telugu only
    telugu_songs = [s for s in all_songs if s.get('language') == 'telugu']
    non_telugu_count = len(all_songs) - len(telugu_songs)
    print(f"\n  Telugu songs: {len(telugu_songs)}")
    print(f"  Non-Telugu removed: {non_telugu_count}")

    # De-duplicate
    before_dedup = len(telugu_songs)
    telugu_songs = deduplicate_by_id(telugu_songs)
    dupes_removed = before_dedup - len(telugu_songs)
    print(f"  Duplicates removed: {dupes_removed}")
    print(f"  Final Telugu songs: {len(telugu_songs)}")

    # Write clean file
    print(f"\nWriting clean file...")
    song_lines = []
    for song in telugu_songs:
        song_lines.append(f"    {format_song_json(song)}")
    songs_block = ",\n".join(song_lines)

    output = f"""class SongsDB {{
  static SONGS_DB = [
{songs_block}
  ];

  static getRandomSong(excludeId) {{
    const pool = this.SONGS_DB.filter(s => s.id !== excludeId);
    return pool[Math.floor(Math.random() * pool.length)];
  }}
}}
"""

    with open(filepath, 'w', encoding='utf-8', newline='\n') as f:
        f.write(output)

    new_size = os.path.getsize(filepath)
    print(f"  New file size: {new_size:,} bytes ({new_size/1024/1024:.1f} MB)")
    print(f"  Size reduction: {original_size - new_size:,} bytes ({(1 - new_size/original_size)*100:.1f}%)")

    # Verify
    print("\nVerification:")
    with open(filepath, 'r', encoding='utf-8') as f:
        verify_content = f.read()

    # Check no triple ];
    if '];' * 2 in verify_content.replace('\n', '').replace(' ', ''):
        print("  FAIL: Multiple ]; found!")
    else:
        print("  PASS: No duplicate ]; closings")

    # Check no non-Telugu
    verify_songs = extract_songs(verify_content)
    non_telugu = [s for s in verify_songs if s.get('language') != 'telugu']
    if non_telugu:
        print(f"  FAIL: {len(non_telugu)} non-Telugu songs still present!")
    else:
        print("  PASS: All songs are Telugu")

    # Check no duplicate IDs
    ids = [s['id'] for s in verify_songs]
    if len(ids) != len(set(ids)):
        print(f"  FAIL: {len(ids) - len(set(ids))} duplicate IDs found!")
    else:
        print("  PASS: No duplicate IDs")

    # Check structure
    if 'class SongsDB {' in verify_content and 'static SONGS_DB = [' in verify_content:
        print("  PASS: Valid class structure")
    else:
        print("  FAIL: Invalid class structure")

    if 'getRandomSong(excludeId)' in verify_content:
        print("  PASS: getRandomSong method present")
    else:
        print("  FAIL: getRandomSong method missing")

    print(f"\n  Final song count in file: {len(verify_songs)}")
    return len(telugu_songs)


# ═══════════════════════════════════════════════════════════════════════════════
# STEP 2: Clean Bollywood songs-db.js
# ═══════════════════════════════════════════════════════════════════════════════
def clean_bollywood_db():
    filepath = '/workspaces/raagam/bollywood-songs-db.js'
    print("\n" + "=" * 70)
    print("CLEANING BOLLYWOOD DB: bollywood-songs-db.js")
    print("=" * 70)

    # Read with UTF-16LE encoding
    print(f"\nReading {filepath}...")
    original_size = os.path.getsize(filepath)
    print(f"  Original file size: {original_size:,} bytes ({original_size/1024/1024:.1f} MB)")

    content = None
    for encoding in ['utf-16', 'utf-16-le', 'utf-16le']:
        try:
            with open(filepath, 'r', encoding=encoding) as f:
                content = f.read()
            print(f"  Successfully read with encoding: {encoding}")
            break
        except (UnicodeDecodeError, UnicodeError) as e:
            print(f"  Failed with {encoding}: {e}")
            continue

    if content is None:
        print("  ERROR: Could not read file with any UTF-16 encoding!")
        return 0

    # Extract all songs
    print("\nExtracting songs via regex...")
    all_songs = extract_songs(content)
    print(f"  Total song objects found: {len(all_songs)}")

    # Show language breakdown before filtering
    lang_counts = count_by_language(all_songs)
    print("\n  Language breakdown (before filtering):")
    for lang, count in sorted(lang_counts.items(), key=lambda x: -x[1]):
        print(f"    {lang}: {count}")

    # Filter to Hindi only
    hindi_songs = [s for s in all_songs if s.get('language') == 'hindi']
    non_hindi_count = len(all_songs) - len(hindi_songs)
    print(f"\n  Hindi songs: {len(hindi_songs)}")
    print(f"  Non-Hindi removed: {non_hindi_count}")

    # De-duplicate
    before_dedup = len(hindi_songs)
    hindi_songs = deduplicate_by_id(hindi_songs)
    dupes_removed = before_dedup - len(hindi_songs)
    print(f"  Duplicates removed: {dupes_removed}")
    print(f"  Final Hindi songs: {len(hindi_songs)}")

    # Write clean file as UTF-8
    print(f"\nWriting clean file as UTF-8...")
    song_lines = []
    for song in hindi_songs:
        song_lines.append(f"    {format_song_json(song)}")
    songs_block = ",\n".join(song_lines)

    output = f"""class BollywoodSongsDB {{
  static SONGS_DB = [
{songs_block}
  ];

  static getRandomSong(excludeId) {{
    const pool = this.SONGS_DB.filter(s => s.id !== excludeId);
    return pool[Math.floor(Math.random() * pool.length)];
  }}
}}
"""

    with open(filepath, 'w', encoding='utf-8', newline='\n') as f:
        f.write(output)

    new_size = os.path.getsize(filepath)
    print(f"  New file size: {new_size:,} bytes ({new_size/1024/1024:.1f} MB)")
    print(f"  Size reduction: {original_size - new_size:,} bytes ({(1 - new_size/original_size)*100:.1f}%)")

    # Verify
    print("\nVerification:")
    with open(filepath, 'r', encoding='utf-8') as f:
        verify_content = f.read()

    # Check encoding
    file_info = os.popen(f'file "{filepath}"').read()
    print(f"  File type: {file_info.strip()}")

    # Check structure
    verify_songs = extract_songs(verify_content)

    non_hindi = [s for s in verify_songs if s.get('language') != 'hindi']
    if non_hindi:
        print(f"  FAIL: {len(non_hindi)} non-Hindi songs still present!")
    else:
        print("  PASS: All songs are Hindi")

    ids = [s['id'] for s in verify_songs]
    if len(ids) != len(set(ids)):
        print(f"  FAIL: {len(ids) - len(set(ids))} duplicate IDs found!")
    else:
        print("  PASS: No duplicate IDs")

    if 'class BollywoodSongsDB {' in verify_content and 'static SONGS_DB = [' in verify_content:
        print("  PASS: Valid class structure")
    else:
        print("  FAIL: Invalid class structure")

    if 'getRandomSong(excludeId)' in verify_content:
        print("  PASS: getRandomSong method present")
    else:
        print("  FAIL: getRandomSong method missing")

    # Check no duplicate ]; closings
    # Count occurrences of ]; in the file
    bracket_count = verify_content.count('];')
    if bracket_count > 1:
        print(f"  FAIL: Found {bracket_count} occurrences of ]; (expected 1)")
    else:
        print("  PASS: Single ]; closing")

    print(f"\n  Final song count in file: {len(verify_songs)}")
    return len(hindi_songs)


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════
if __name__ == '__main__':
    print("Raagam Song Database Cleaner")
    print("=" * 70)

    telugu_count = clean_telugu_db()
    hindi_count = clean_bollywood_db()

    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print(f"  Telugu DB (songs-db.js):       {telugu_count:,} songs")
    print(f"  Bollywood DB (bollywood-songs-db.js): {hindi_count:,} songs")
    print(f"  Total songs across both files: {telugu_count + hindi_count:,}")
    print("\nDone!")
