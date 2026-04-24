// ============================================================
// Client-side peak extraction.
// ------------------------------------------------------------
// Downloads an audio file, decodes it with OfflineAudioContext,
// reduces the first channel to N buckets (max-abs per bucket),
// normalises to 0..1, and caches in Dexie.
// ============================================================

import { getPeaks, savePeaks } from '@/lib/data/dexie';

const BUCKETS = 120;
const MAX_BYTES = 10 * 1024 * 1024; // don't try to decode > 10 MB

let audioCtx: AudioContext | null = null;
function getCtx(): AudioContext {
  if (!audioCtx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new Ctor();
  }
  return audioCtx;
}

export async function ensurePeaks(songId: string, audioUrl: string): Promise<number[] | null> {
  const cached = await getPeaks(songId);
  if (cached) return cached;

  try {
    const res = await fetch(audioUrl);
    if (!res.ok) return null;
    const len = Number(res.headers.get('content-length') ?? 0);
    if (len > MAX_BYTES) return null;

    const buf = await res.arrayBuffer();
    const ctx = getCtx();
    const audio = await ctx.decodeAudioData(buf.slice(0));

    const channel = audio.getChannelData(0);
    const bucketSize = Math.floor(channel.length / BUCKETS);
    const peaks: number[] = new Array(BUCKETS);

    let maxPeak = 0;
    for (let i = 0; i < BUCKETS; i++) {
      let m = 0;
      const start = i * bucketSize;
      const end = start + bucketSize;
      for (let j = start; j < end; j++) {
        const v = Math.abs(channel[j]);
        if (v > m) m = v;
      }
      peaks[i] = m;
      if (m > maxPeak) maxPeak = m;
    }
    if (maxPeak > 0) {
      for (let i = 0; i < peaks.length; i++) peaks[i] /= maxPeak;
    }

    await savePeaks(songId, peaks);
    return peaks;
  } catch {
    return null;
  }
}
