'use client';

import { motion } from 'framer-motion';
import { useEffect, useMemo, useRef } from 'react';
import { useLyrics } from '@/lib/api/hooks';
import { findActiveLyricIndex, parseSyncedLyrics } from '@/lib/utils';
import { usePlayer } from '@/lib/store/player';

export function LyricsPanel() {
  const song = usePlayer((s) => s.current);
  const progress = usePlayer((s) => s.progress);
  const { data } = useLyrics(song?.lyricsId);

  const lines = useMemo(() => {
    if (!data?.synced) return [] as Array<{ time: number; text: string }>;
    return parseSyncedLyrics(data.synced);
  }, [data?.synced]);

  const active = findActiveLyricIndex(lines, progress);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (active < 0 || !listRef.current) return;
    const el = listRef.current.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [active]);

  if (!song) return null;

  if (!data?.synced) {
    return (
      <div className="glass rounded-asym-md p-6 text-center">
        <p className="font-display text-lg text-cream-dim" style={{ fontVariationSettings: "'opsz' 96, 'wght' 400" }}>
          {data?.plain ? data.plain.split('\n').slice(0, 3).join(' · ') : 'No synced lyrics yet — listen & we\'ll find them.'}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      className="relative h-[min(60vh,540px)] overflow-y-auto no-scrollbar px-6 py-10 text-center"
      style={{
        maskImage: 'linear-gradient(180deg, transparent, #000 15%, #000 85%, transparent)',
      }}
    >
      {lines.map((line, i) => {
        const distance = Math.abs(i - active);
        return (
          <motion.div
            key={i}
            animate={{
              opacity: active < 0 ? 0.4 : distance === 0 ? 1 : Math.max(0.15, 0.9 - distance * 0.12),
              scale: distance === 0 ? 1.05 : 1,
              filter: distance === 0 ? 'blur(0px)' : `blur(${Math.min(3, distance * 0.5)}px)`,
            }}
            transition={{ type: 'spring', stiffness: 240, damping: 32 }}
            className="py-3 font-display leading-tight text-cream"
            style={{
              fontSize: distance === 0 ? '2rem' : '1.35rem',
              fontVariationSettings: distance === 0
                ? "'opsz' 144, 'wght' 540"
                : "'opsz' 96, 'wght' 400",
              letterSpacing: '-0.02em',
              textShadow: distance === 0
                ? '0 0 24px rgba(245,158,11,0.4), 0 0 48px rgba(225,29,116,0.3)'
                : undefined,
            }}
          >
            {line.text}
          </motion.div>
        );
      })}
    </div>
  );
}
