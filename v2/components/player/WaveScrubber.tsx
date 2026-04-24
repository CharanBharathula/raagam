'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { usePlayer } from '@/lib/store/player';
import { formatTime } from '@/lib/utils';
import { ensurePeaks } from '@/lib/audio/peaks';

/**
 * Synthetic waveform — 120 bars with pseudo-random heights seeded from
 * the song id so the waveform stays consistent per track. Plugging in
 * actual peaks from the audio file would require decoding; we defer
 * that to the v2.1 enrichment cron (peaks stored per song).
 */
export function WaveScrubber() {
  const progress = usePlayer((s) => s.progress);
  const duration = usePlayer((s) => s.duration);
  const seek = usePlayer((s) => s.seek);
  const current = usePlayer((s) => s.current);

  const ref = useRef<HTMLDivElement>(null);
  const [hoverPct, setHoverPct] = useState<number | null>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);

  const pct = duration ? (progress / duration) * 100 : 0;

  // Fetch real waveform peaks in the background; fall back to pseudo-random
  // until they arrive. First play: ~200 ms decode; subsequent plays: instant.
  useEffect(() => {
    let cancel = false;
    setPeaks(null);
    if (!current) return;
    ensurePeaks(current.id, current.audioUrl).then((p) => {
      if (!cancel && p) setPeaks(p);
    });
    return () => {
      cancel = true;
    };
  }, [current]);

  const fallbackBars = useWaveBars(current?.id ?? 'none', 120);
  const bars = peaks ?? fallbackBars;

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current || !duration) return;
    const r = ref.current.getBoundingClientRect();
    const p = (e.clientX - r.left) / r.width;
    seek(p * duration);
  };

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setHoverPct(((e.clientX - r.left) / r.width) * 100);
  };

  return (
    <div className="w-full">
      <div
        ref={ref}
        className="relative h-14 cursor-pointer select-none"
        onClick={onClick}
        onMouseMove={onMove}
        onMouseLeave={() => setHoverPct(null)}
      >
        <div className="flex h-full items-center justify-between gap-[2px]">
          {bars.map((h, i) => {
            const barPct = (i / bars.length) * 100;
            const played = barPct <= pct;
            const hovered = hoverPct !== null && barPct <= hoverPct;
            return (
              <div
                key={i}
                className={cn(
                  'w-[3px] rounded-full transition-colors duration-150',
                  played
                    ? 'bg-gradient-to-t from-saffron via-magenta to-indigo-glow'
                    : hovered
                      ? 'bg-cream/50'
                      : 'bg-cream/20',
                )}
                style={{ height: `${Math.max(6, h * 100)}%` }}
              />
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-cream-muted tabular-nums">
        <span>{formatTime(progress)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}

function useWaveBars(seed: string, count: number): number[] {
  const bars = useRef<number[]>([]);
  const lastSeed = useRef<string>('');
  if (lastSeed.current !== seed) {
    lastSeed.current = seed;
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) h = (h ^ seed.charCodeAt(i)) * 16777619;
    const rand = () => {
      h = (h * 16807) % 2147483647;
      return h / 2147483647;
    };
    bars.current = Array.from({ length: count }, (_, i) => {
      const t = i / count;
      const envelope = Math.sin(t * Math.PI) * 0.6 + 0.25;
      return Math.max(0.12, envelope + (rand() - 0.5) * 0.4);
    });
  }
  return bars.current;
}
