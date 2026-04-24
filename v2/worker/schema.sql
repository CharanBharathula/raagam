-- ============================================================
-- Raagam v2 — D1 schema
-- ============================================================
-- Run:
--   wrangler d1 execute raagam --local  --file=worker/schema.sql
--   wrangler d1 execute raagam --remote --file=worker/schema.sql
-- ============================================================

-- ---------- songs ----------
CREATE TABLE IF NOT EXISTS songs (
  id            TEXT PRIMARY KEY,            -- Saavn id (8-char)
  name          TEXT NOT NULL,
  artists       TEXT NOT NULL,               -- comma-separated
  album         TEXT,
  year          INTEGER NOT NULL,            -- parsed from legacy string
  duration      INTEGER NOT NULL,            -- seconds
  language      TEXT NOT NULL,               -- 'hindi' | 'telugu'
  audio_url     TEXT NOT NULL,
  image_url     TEXT,
  tags          TEXT,                        -- JSON array, e.g. '["romantic","party"]'
  video_id      TEXT,                        -- YouTube id, pre-resolved by cron
  lyrics_id     INTEGER,                     -- LRCLib id, pre-resolved
  color_primary TEXT,                        -- '#rrggbb' extracted from image
  color_dark    TEXT,
  color_light   TEXT,
  popularity    REAL NOT NULL DEFAULT 0,     -- 0..100 proxy score
  play_count    INTEGER NOT NULL DEFAULT 0,  -- global, updated by /track endpoint
  like_count    INTEGER NOT NULL DEFAULT 0,
  source        TEXT NOT NULL DEFAULT 'saavn',
  enriched_at   INTEGER,                     -- unix sec of last nightly pass
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_songs_year          ON songs(year);
CREATE INDEX IF NOT EXISTS idx_songs_lang_year     ON songs(language, year);
CREATE INDEX IF NOT EXISTS idx_songs_pop           ON songs(popularity DESC);
CREATE INDEX IF NOT EXISTS idx_songs_lang_pop      ON songs(language, popularity DESC);
CREATE INDEX IF NOT EXISTS idx_songs_enriched_at   ON songs(enriched_at);
CREATE INDEX IF NOT EXISTS idx_songs_duration      ON songs(duration);

-- ---------- users (minimal — real user row keyed by Clerk id) ----------
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,            -- Clerk user id
  display_name  TEXT,
  email         TEXT,
  locale        TEXT,
  -- taste vector (JSON); updated on every played song
  taste_vector  TEXT NOT NULL DEFAULT '{"artists":{},"decades":{},"moods":{},"langs":{}}',
  lang_blend    REAL NOT NULL DEFAULT 0.6,   -- 0.0 = all Telugu, 1.0 = all Hindi
  year_min      INTEGER NOT NULL DEFAULT 2000,
  year_max      INTEGER NOT NULL DEFAULT 2026,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ---------- likes ----------
CREATE TABLE IF NOT EXISTS likes (
  user_id  TEXT NOT NULL,
  song_id  TEXT NOT NULL,
  liked_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, song_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_likes_user ON likes(user_id, liked_at DESC);

-- ---------- history (rolling) ----------
CREATE TABLE IF NOT EXISTS history (
  user_id    TEXT NOT NULL,
  song_id    TEXT NOT NULL,
  played_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  completed  INTEGER NOT NULL DEFAULT 0,     -- 0|1 — did the user finish it
  PRIMARY KEY (user_id, played_at, song_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_history_user ON history(user_id, played_at DESC);

-- ---------- curated artists (popularity proxy source) ----------
CREATE TABLE IF NOT EXISTS curated_artists (
  name      TEXT PRIMARY KEY COLLATE NOCASE, -- lowercase
  language  TEXT NOT NULL,                   -- 'hindi' | 'telugu' | 'both'
  weight    REAL NOT NULL DEFAULT 1.0,       -- extra boost (1.0 = normal, 2.0 = superstar)
  kind      TEXT                             -- 'singer' | 'composer' | 'both'
);

-- ---------- mood keywords (seed for tagging Telugu songs that lack tags) ----------
CREATE TABLE IF NOT EXISTS mood_keywords (
  mood     TEXT NOT NULL,                    -- 'romantic' | 'party' | ...
  keyword  TEXT NOT NULL COLLATE NOCASE,
  lang     TEXT NOT NULL,                    -- 'hindi' | 'telugu' | 'both'
  PRIMARY KEY (mood, keyword, lang)
);
