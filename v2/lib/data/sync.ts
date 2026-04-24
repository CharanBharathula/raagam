// ============================================================
// Device sync — pulls the user's D1 liked + history rows and
// merges them into Dexie so the Library page stays instant while
// the cloud remains the source of truth across devices.
// ------------------------------------------------------------
// Merge rules:
//   - Liked: if the song already exists locally, keep the earlier
//     likedAt (so streaks / ordering don't shift). Otherwise insert.
//   - History: insert any remote play_at that isn't present.
// ============================================================

import { api } from '@/lib/api/client';
import { getDB } from './dexie';

const LAST_SYNC_KEY = 'raagam_last_sync';
const MIN_INTERVAL_MS = 30_000; // don't hammer on every nav

export async function syncLibrary(force = false): Promise<{ liked: number; history: number }> {
  const last = Number(localStorage.getItem(LAST_SYNC_KEY) ?? 0);
  if (!force && Date.now() - last < MIN_INTERVAL_MS) {
    return { liked: 0, history: 0 };
  }
  localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));

  let data: Awaited<ReturnType<typeof api.library>>;
  try {
    data = await api.library();
  } catch {
    return { liked: 0, history: 0 }; // offline or unauth — Dexie remains
  }

  const db = getDB();
  let addedLiked = 0;
  let addedHistory = 0;

  await db.transaction('rw', db.liked, db.history, async () => {
    // Liked
    for (const row of data.liked ?? []) {
      const existing = await db.liked.get(row.song.id);
      if (!existing) {
        await db.liked.put({ id: row.song.id, likedAt: row.likedAt, song: row.song });
        addedLiked++;
      } else if (row.likedAt < existing.likedAt) {
        await db.liked.update(row.song.id, { likedAt: row.likedAt });
      }
    }

    // History — dedupe on (songId, playedAt)
    const seenKeys = new Set<string>();
    const localHist = await db.history.toArray();
    for (const h of localHist) seenKeys.add(`${h.songId}:${h.playedAt}`);

    for (const row of data.history ?? []) {
      const key = `${row.song.id}:${row.playedAt}`;
      if (seenKeys.has(key)) continue;
      await db.history.add({
        songId: row.song.id,
        playedAt: row.playedAt,
        completed: (row.completed ? 1 : 0) as 0 | 1,
        song: row.song,
      });
      addedHistory++;
    }
  });

  return { liked: addedLiked, history: addedHistory };
}
