# Planned Fixes for Raagam Video Playback Issues

## Goals
1. **Seamless Video Playback:** Ensure near-instant playback of music videos for songs, similar to Spotify Canvas.
2. **Enhanced Reliability:** Improve resilience of video ID fetches by optimizing API usage.
3. **Better User Experience:** Provide polished fallback visuals for when video does not load.

---

## Fix Details
### 1. Reduce Timeout for API Requests
- **Current:** Timeout duration is set to `PIPED_TIMEOUT_MS`.
- **Problem:** Prolonged timeouts delay failover to other APIs.
- **Fix:** Reduce timeout to 3000ms to ensure quick retries.
  
#### Affected Functions:
- `_fetchFromPiped`
- `_fetchFromInvidious`

---
### 2. Cache YouTube Video IDs
- **Current:** Video IDs are fetched every time a song is played in video mode.
- **Problem:** Causes repeated API requests for the same song.
- **Fix:** Cache video IDs in `localStorage` so repeat plays are instant.
  - Add `raagam_video_cache` item to `localStorage`.
  - Check cache for existing video ID before API request.
  
#### Affected Functions:
- `fetchYouTubeVideoId`
- `setupSongMedia`

---
### 3. Prefetch Video IDs for Upcoming Songs
- **Current:** Video IDs are only fetched when the current song plays.
- **Problem:** Causes delay in video availability for upcoming songs.
- **Fix:** 
  - Start prefetching video IDs for the next two songs in the queue during playback of the current song.
  - Use `Promise.any()` for concurrent lookups to improve performance.