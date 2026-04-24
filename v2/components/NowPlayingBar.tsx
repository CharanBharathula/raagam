'use client';

import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { Play, Pause, SkipForward, Heart } from 'lucide-react';
import { usePlayer } from '@/lib/store/player';
import { formatTime } from '@/lib/utils';
import { useEffect, useState } from 'react';

export function NowPlayingBar() {
  const current = usePlayer((s) => s.current);
  const status = usePlayer((s) => s.status);
  const progress = usePlayer((s) => s.progress);
  const duration = usePlayer((s) => s.duration);
  const toggle = usePlayer((s) => s.toggle);
  const next = usePlayer((s) => s.next);

  const [liked, setLiked] = useState(false);
  useEffect(() => setLiked(false), [current?.id]);

  if (!current) return null;
  const pct = duration ? Math.min(100, (progress / duration) * 100) : 0;

  return (
    <AnimatePresence>
      <motion.div
        key="now-playing"
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 30 }}
        className="fixed inset-x-0 bottom-[72px] z-30 mx-auto flex w-[min(96vw,720px)] md:bottom-5 md:left-[248px] md:right-4 md:mx-0 md:w-auto md:max-w-[760px]"
      >
        <div className="glass-warm relative flex w-full items-center gap-3 rounded-full p-2 pr-5 shadow-card">
          <Link
            href="/player"
            className="flex flex-1 items-center gap-3 rounded-full"
            style={{ viewTransitionName: 'np-container' }}
          >
            <div
              className="relative size-12 overflow-hidden rounded-full ring-1 ring-cream/15"
              style={{ viewTransitionName: 'np-art' }}
            >
              {current.imageUrl && (
                <Image
                  src={current.imageUrl}
                  alt=""
                  fill
                  sizes="48px"
                  className="object-cover"
                  unoptimized
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-display text-sm" style={{ fontVariationSettings: "'opsz' 24, 'wght' 500" }}>
                {current.name}
              </div>
              <div className="truncate text-[11px] text-cream-muted font-mono tracking-wide">
                {current.artists.slice(0, 2).join(' · ')}
              </div>
            </div>
            <div className="hidden md:flex shrink-0 items-center gap-2 text-[10px] font-mono text-cream-muted tabular-nums">
              <span>{formatTime(progress)}</span>
              <span>/</span>
              <span>{formatTime(duration)}</span>
            </div>
          </Link>

          <button
            type="button"
            onClick={() => setLiked((v) => !v)}
            className="shrink-0 p-2 text-cream-muted hover:text-magenta-glow transition-colors"
            aria-label={liked ? 'Unlike' : 'Like'}
          >
            <Heart
              size={18}
              strokeWidth={1.6}
              className={liked ? 'fill-magenta-glow text-magenta-glow' : ''}
            />
          </button>
          <button
            type="button"
            onClick={toggle}
            aria-label={status === 'playing' ? 'Pause' : 'Play'}
            className="group relative size-11 shrink-0 rounded-full bg-gradient-to-br from-saffron to-magenta text-ink shadow-glow transition-transform hover:scale-105 active:scale-95"
          >
            <span className="absolute inset-0 rounded-full bg-gradient-to-br from-saffron to-magenta blur-lg opacity-60 group-hover:opacity-100 transition-opacity" />
            <span className="relative flex h-full w-full items-center justify-center">
              {status === 'playing' ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
            </span>
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Next"
            className="shrink-0 p-2 text-cream-dim hover:text-cream transition-colors"
          >
            <SkipForward size={18} strokeWidth={1.6} />
          </button>

          <div className="pointer-events-none absolute inset-x-4 -bottom-px h-[2px] overflow-hidden rounded-full">
            <div
              className="h-full bg-gradient-to-r from-saffron via-magenta to-indigo-glow transition-[width] duration-150 ease-linear"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
