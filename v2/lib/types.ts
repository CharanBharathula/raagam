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
  colors: SongColors;
  popularity: number;
}

export interface SongColors {
  primary: string | null;
  dark: string | null;
  light: string | null;
}

export interface PickRequest {
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

export interface LyricsPayload {
  id: number;
  plain: string | null;
  synced: string | null;
}

export type Mood =
  | 'romantic'
  | 'party'
  | 'chill'
  | 'sad'
  | 'workout'
  | 'focus'
  | 'monsoon'
  | 'late-night';

export interface UserSettings {
  langBlend: number; // 0 = all Telugu, 1 = all Hindi
  yearMin: number;
  yearMax: number;
}

export interface SyncedLyricLine {
  time: number; // seconds
  text: string;
}

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export interface ApiEnvelope<T> {
  songs?: T;
  song?: T;
  error?: string;
}
