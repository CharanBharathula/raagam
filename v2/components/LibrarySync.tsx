'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect } from 'react';
import { syncLibrary } from '@/lib/data/sync';

/**
 * Runs a best-effort D1 -> Dexie library merge on mount (throttled to 30 s).
 * Also reruns on visibility change so switching back to the tab catches up.
 */
export function LibrarySync() {
  const { isSignedIn } = useAuth();

  useEffect(() => {
    if (!isSignedIn) return;
    syncLibrary().catch(() => {});

    const onVisible = () => {
      if (document.visibilityState === 'visible') syncLibrary().catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [isSignedIn]);

  return null;
}
