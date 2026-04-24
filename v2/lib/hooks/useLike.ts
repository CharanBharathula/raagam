'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { api } from '@/lib/api/client';
import { getDB, likeLocal } from '@/lib/data/dexie';
import type { Song } from '@/lib/types';

/**
 * Single hook that covers the "is this song liked?" state plus a toggle.
 * Writes to Dexie first (instant UI feedback) then fires the D1 write in
 * the background. If D1 fails we don't roll back locally — Dexie wins,
 * the next `syncLibrary()` pass reconciles.
 */
export function useLike(song: Song | null | undefined) {
  const liked = useLiveQuery(
    () => (song ? getDB().liked.get(song.id) : undefined),
    [song?.id],
  );
  const [pending, setPending] = useState(false);

  const toggle = async () => {
    if (!song) return;
    setPending(true);
    const willLike = !liked;
    try {
      await likeLocal(song, willLike);
      api.like(song.id, willLike).catch(() => {});
    } finally {
      setPending(false);
    }
  };

  return { liked: !!liked, toggle, pending };
}
