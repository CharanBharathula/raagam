'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import { Play } from 'lucide-react';
import type { Song } from '@/lib/types';
import { usePlayer } from '@/lib/store/player';
import { TiltCard } from './motion/TiltCard';
import { cn } from '@/lib/utils';

interface Props {
  song: Song;
  size?: 'sm' | 'md' | 'lg';
  index?: number;
  showYear?: boolean;
}

export function SongCard({ song, size = 'md', showYear = true }: Props) {
  const play = usePlayer((s) => s.play);

  const dims = {
    sm: 'w-40 sm:w-44',
    md: 'w-52 sm:w-56',
    lg: 'w-64 sm:w-72',
  }[size];

  return (
    <TiltCard className={cn('shrink-0', dims)} intensity={0.8}>
      <button
        type="button"
        onClick={() => void play(song)}
        className="group relative block w-full overflow-hidden rounded-asym-md bg-ink-100 text-left shadow-card transition-shadow hover:shadow-glow"
      >
        <div className="relative aspect-square w-full overflow-hidden">
          {song.imageUrl ? (
            <Image
              src={song.imageUrl}
              alt=""
              fill
              sizes="(min-width: 640px) 300px, 200px"
              className="object-cover transition-transform duration-700 group-hover:scale-[1.06]"
              unoptimized
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-saffron/30 via-magenta/20 to-indigo-glow/30" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-ink/80" />
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            whileHover={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            className="absolute right-3 bottom-3 flex size-11 items-center justify-center rounded-full bg-gradient-to-br from-saffron to-magenta text-ink shadow-glow"
          >
            <Play size={16} fill="currentColor" />
          </motion.div>
        </div>
        <div className="relative px-3 pt-3 pb-3.5">
          <div
            className="line-clamp-1 font-display text-sm leading-tight"
            style={{ fontVariationSettings: "'opsz' 24, 'wght' 500", letterSpacing: '-0.01em' }}
          >
            {song.name}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="line-clamp-1 text-[11px] text-cream-muted">
              {song.artists[0] ?? 'Unknown'}
            </span>
            {showYear && (
              <>
                <span className="size-1 shrink-0 rounded-full bg-cream-muted/40" aria-hidden />
                <span className="num-mono text-[10px] text-cream-muted">{song.year}</span>
              </>
            )}
          </div>
        </div>
      </button>
    </TiltCard>
  );
}
