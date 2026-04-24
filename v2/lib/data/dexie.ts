'use client';

import Dexie, { type Table } from 'dexie';
import type { Song } from '@/lib/types';

export interface LikedRow {
  id: string; // song id
  likedAt: number;
  song: Song;
}

export interface HistoryRow {
  id?: number; // autoincrement
  songId: string;
  playedAt: number;
  completed: 0 | 1;
  song: Song;
}

export interface DownloadRow {
  id: string;
  song: Song;
  blob: Blob;
  bytes: number;
  downloadedAt: number;
}

export interface LyricsRow {
  id: number; // lyricsId
  plain: string | null;
  synced: string | null;
  cachedAt: number;
}

export interface PeaksRow {
  id: string;           // song id
  peaks: number[];      // normalised 0..1, length 120
  cachedAt: number;
}

class RaagamDB extends Dexie {
  liked!: Table<LikedRow, string>;
  history!: Table<HistoryRow, number>;
  downloads!: Table<DownloadRow, string>;
  lyrics!: Table<LyricsRow, number>;
  peaks!: Table<PeaksRow, string>;

  constructor() {
    super('raagam-v2');
    this.version(1).stores({
      liked: 'id, likedAt',
      history: '++id, songId, playedAt',
      downloads: 'id, downloadedAt, bytes',
      lyrics: 'id, cachedAt',
    });
    this.version(2).stores({
      liked: 'id, likedAt',
      history: '++id, songId, playedAt',
      downloads: 'id, downloadedAt, bytes',
      lyrics: 'id, cachedAt',
      peaks: 'id, cachedAt',
    });
  }
}

let db: RaagamDB | null = null;
export function getDB(): RaagamDB {
  if (!db) db = new RaagamDB();
  return db;
}

// ---------- helpers ----------

export async function likeLocal(song: Song, liked: boolean): Promise<void> {
  const d = getDB();
  if (liked) {
    await d.liked.put({ id: song.id, likedAt: Date.now(), song });
  } else {
    await d.liked.delete(song.id);
  }
}

export async function getLiked(): Promise<Song[]> {
  const rows = await getDB().liked.orderBy('likedAt').reverse().toArray();
  return rows.map((r) => r.song);
}

export async function pushHistoryLocal(song: Song, completed: boolean): Promise<void> {
  await getDB().history.add({
    songId: song.id,
    playedAt: Date.now(),
    completed: completed ? 1 : 0,
    song,
  });
  // Trim to last 500 rows.
  const count = await getDB().history.count();
  if (count > 500) {
    const excess = count - 500;
    const oldest = await getDB().history.orderBy('playedAt').limit(excess).primaryKeys();
    await getDB().history.bulkDelete(oldest);
  }
}

export async function recentHistory(n = 50): Promise<Song[]> {
  const rows = await getDB().history.orderBy('playedAt').reverse().limit(n).toArray();
  const seen = new Set<string>();
  const out: Song[] = [];
  for (const r of rows) {
    if (!seen.has(r.songId)) {
      seen.add(r.songId);
      out.push(r.song);
    }
  }
  return out;
}

export async function cacheLyrics(id: number, plain: string | null, synced: string | null): Promise<void> {
  await getDB().lyrics.put({ id, plain, synced, cachedAt: Date.now() });
}

export async function getCachedLyrics(id: number): Promise<LyricsRow | undefined> {
  return getDB().lyrics.get(id);
}

export async function getPeaks(id: string): Promise<number[] | null> {
  const r = await getDB().peaks.get(id);
  return r?.peaks ?? null;
}

export async function savePeaks(id: string, peaks: number[]): Promise<void> {
  await getDB().peaks.put({ id, peaks, cachedAt: Date.now() });
}

// ---------- downloads (offline audio) ----------

export async function saveDownload(song: Song, blob: Blob): Promise<void> {
  await getDB().downloads.put({
    id: song.id,
    song,
    blob,
    bytes: blob.size,
    downloadedAt: Date.now(),
  });
}

export async function getDownload(id: string): Promise<DownloadRow | undefined> {
  return getDB().downloads.get(id);
}

export async function deleteDownload(id: string): Promise<void> {
  await getDB().downloads.delete(id);
}

export async function totalDownloadedBytes(): Promise<number> {
  const rows = await getDB().downloads.toArray();
  return rows.reduce((n, r) => n + r.bytes, 0);
}
