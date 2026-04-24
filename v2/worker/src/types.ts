export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  YOUTUBE_API_KEY?: string;
  LRCLIB_ENDPOINT: string;
  YT_PROXY_ENDPOINT: string;
  CLERK_JWT_ISSUER?: string;
  WORKER_ADMIN_SECRET?: string;
  MEILI_HOST?: string;
  MEILI_ADMIN_KEY?: string;
}

export interface SongRow {
  id: string;
  name: string;
  artists: string;
  album: string | null;
  year: number;
  duration: number;
  language: 'hindi' | 'telugu';
  audio_url: string;
  image_url: string | null;
  tags: string | null;
  video_id: string | null;
  lyrics_id: number | null;
  color_primary: string | null;
  color_dark: string | null;
  color_light: string | null;
  popularity: number;
  play_count: number;
  like_count: number;
  source: string;
  enriched_at: number | null;
  created_at: number;
}

export interface Song {
  id: string;
  name: string;
  artists: string[];
  album: string | null;
  year: number;
  duration: number;
  language: 'hindi' | 'telugu';
  audioUrl: string;
  imageUrl: string | null;
  tags: string[];
  videoId: string | null;
  lyricsId: number | null;
  colors: { primary: string | null; dark: string | null; light: string | null };
  popularity: number;
}

export interface UserRow {
  id: string;
  display_name: string | null;
  email: string | null;
  locale: string | null;
  taste_vector: string;
  lang_blend: number;
  year_min: number;
  year_max: number;
  created_at: number;
  updated_at: number;
}

export interface TasteVector {
  artists: Record<string, number>;
  decades: Record<string, number>;
  moods: Record<string, number>;
  langs: Record<string, number>;
}

export interface PickRequest {
  userId?: string;
  years?: [number, number];
  langs?: Array<'hindi' | 'telugu'>;
  langBlend?: number;
  moods?: string[];
  excludeIds?: string[];
}

export interface PickResult {
  song: Song;
  reason: string;
  score: number;
}

export function rowToSong(row: SongRow): Song {
  return {
    id: row.id,
    name: row.name,
    artists: row.artists.split(',').map((s) => s.trim()).filter(Boolean),
    album: row.album,
    year: row.year,
    duration: row.duration,
    language: row.language,
    audioUrl: row.audio_url,
    imageUrl: row.image_url,
    tags: row.tags ? safeParse<string[]>(row.tags, []) : [],
    videoId: row.video_id,
    lyricsId: row.lyrics_id,
    colors: { primary: row.color_primary, dark: row.color_dark, light: row.color_light },
    popularity: row.popularity,
  };
}

export function safeParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
