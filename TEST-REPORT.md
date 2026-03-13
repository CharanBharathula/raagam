# Raagam Test Report

## Date: 2026-03-13

---

## Phase 1: Offline Playback Implementation

### Features Implemented:
1. **Download for Offline button** — Added in player view (download-btn), search results, and library items
2. **Cache API integration** — Audio cached via Service Worker message passing with fallback to direct Cache API
3. **Offline Songs section** — Library page now shows "Downloaded Songs" section above "Liked Songs"
4. **Service Worker audio interception** — sw.js intercepts `aac.saavncdn.com` requests and serves from `raagam-audio-v1` cache
5. **Download progress indicator** — Spinner animation on download buttons during caching
6. **Downloaded badge** — `↓` badge with green styling on downloaded songs in search and library
7. **Remove downloaded songs** — ✕ button in library, tap-to-toggle in player
8. **Separate audio cache** — `raagam-audio-v1` for audio, `raagam-v2` for app shell
9. **Cache size display** — Profile page shows "📥 Downloads" card with song count and MB used

### Implementation Details:
- Download metadata stored in `localStorage` as `raagam_downloads`
- SW communicates with app via `postMessage` for CACHE_AUDIO, UNCACHE_AUDIO, GET_CACHE_SIZE
- Images cached in app shell cache (shared), audio in dedicated cache
- Offline navigation fallback: SW returns `/index.html` for navigate requests when offline

---

## Phase 2: Bug Fixes & Code Review

### Bugs Found & Fixed:

1. **XSS vulnerability in song names** — Song names with HTML entities (`&quot;`, `&amp;`) were rendered unsafely in `onclick` handlers. Added `escAttr()` function for attribute escaping. All `onclick` handlers now use `escAttr()` for IDs.

2. **Missing `decodeHtml()` in display** — Search results and library items showed raw HTML entities (`&quot;` etc.) instead of decoded text. Added `decodeHtml()` wrapper around all display names.

3. **Search didn't decode HTML entities** — Songs with `&quot;` in names wouldn't match searches for `"`. Fixed `performSearch()` to `decodeHtml()` song fields before matching.

4. **`audio.src` check was wrong** — `togglePlay()` checked `audio.src.startsWith('http')` but `audio.src` resolves to full URL even for empty. Changed to check against `location.href` (what empty src resolves to).

5. **`fmtTime()` NaN display** — If `audio.duration` is NaN, time showed "NaN:NaN". Added `isNaN()` guard.

6. **Missing `isNaN` guard on timeupdate** — Progress bar could get NaN width. Added check.

7. **Toast message didn't restart animation** — Rapid toasts wouldn't re-trigger because class was already there. Added `void el.offsetWidth` reflow trick and clearTimeout.

8. **Service Worker cached ALL responses** — Old SW cached everything including failed responses. New SW only caches `resp.ok` responses.

9. **SW precached songs-db.js (5.6MB)** — Removed from precache list. This file is huge and will cache on first fetch instead.

10. **SW didn't handle offline navigation** — Added fallback to return cached `/index.html` for navigation requests when offline.

11. **`playNext` function override pattern was fragile** — Original code monkey-patched `playNext` by overriding the function. Moved bollywood category pool logic directly into `playNext()` for cleaner code.

12. **Auth submit button not re-enabled on error** — After auth error, button stayed disabled. Added `disabled = false` in error paths.

13. **Missing language in saveRecent** — Recent songs didn't save `language` field, so playing from recent lost language context. Added `language` to saved data.

14. **`audio.pause()` and `audio.play()` events not synced with UI** — Added `pause` and `play` event listeners on audio element to keep UI in sync even when browser/OS controls are used.

15. **MediaSession API not set** — Added `navigator.mediaSession` metadata and action handlers for lock screen controls (play/pause/prev/next).

16. **Home stats only showed Telugu count** — Updated `updateHomeStats()` to include Bollywood songs count.

17. **Lyrics plain text not escaped** — Plain lyrics were set via `innerHTML` without escaping. Added `escHtml()` wrapper.

18. **Missing null checks for SongsDB** — `playRandomSong()` and `playByEra()` could crash if songs-db.js hadn't loaded yet. Added guards.

19. **Profile username not HTML-escaped** — Could be exploited if username contains HTML. Added `escHtml()`.

20. **Debounce too short for 16k+ songs** — Search debounce was 200ms. Increased to 300ms.

### Edge Cases Tested:

| Edge Case | Status | Notes |
|---|---|---|
| Empty songs DB | ✅ Fixed | Shows toast "Songs database not loaded yet" |
| Audio URL 404s | ✅ OK | Error handler skips after 3 consecutive failures |
| All songs in category fail | ✅ OK | Stops after 3 errors with toast |
| Double-tap play/next rapidly | ✅ OK | `isLoadingNext` guard prevents race conditions |
| Special characters in search | ✅ Fixed | `decodeHtml()` applied to search matching |
| HTML entities in song names | ✅ Fixed | All display points use `decodeHtml()` + `escHtml()` |
| Very long song names | ✅ OK | CSS `-webkit-line-clamp: 2` and `text-overflow: ellipsis` |
| Liked songs persistence | ✅ OK | Stored in localStorage via aiEngine.save() |
| Session restore after clear localStorage | ✅ OK | Shows landing page, fresh start |
| Network offline then online | ✅ Improved | SW serves cached content, audio from cache if downloaded |
| Multiple rapid page switches | ✅ OK | No crashes, renders correctly |
| History navigation (prev after 20+ songs) | ✅ OK | History array unbounded, historyIndex tracks position |
| Shuffle on/off mid-playback | ✅ OK | playNext respects current shuffle state |

### Performance Observations:

1. **songs-db.js is 5.6MB** — Single-line minified. This is parsed on load. On modern devices this takes ~100-200ms. Not a critical issue for a PWA (only loads once, then cached). Removed from SW precache to avoid blocking install.

2. **Search across 16k+ songs** — With 300ms debounce, search is responsive. `includes()` on 16k items is fast (~5ms). Early exit at 50 results helps.

3. **DOM manipulation in search results** — Using `innerHTML` for batch updates is efficient. Max 50 results limits DOM size.

4. **Memory leaks from setInterval** — Lyrics timer (`setInterval` at 200ms) is now properly cleared on `beforeunload` event. Also cleared when new song loads.

5. **Image lazy loading** — Added `loading="lazy"` to search results, library items, and recent cards.

### Enhancement Suggestions for Future:

1. **Virtual scrolling for library** — If user has 500+ liked songs, virtual scroll would help
2. **IndexedDB for song metadata** — Would be faster than localStorage for large datasets
3. **Background sync** — Could sync likes/preferences when coming back online
4. **Audio preloading** — Preload next song audio for gapless playback
5. **Offline indicator** — Show a banner when offline with count of available songs
6. **Playlist support** — Create custom playlists, not just liked songs
7. **Split songs-db.js** — Could lazy-load by era/decade to reduce initial parse time
8. **Web Worker for search** — Move search to Web Worker to avoid blocking main thread on slower devices
9. **Batch download** — "Download all liked songs" button
10. **Storage quota check** — Check navigator.storage.estimate() before downloading
