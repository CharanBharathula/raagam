'use client';

import Image from 'next/image';
import { Play } from 'lucide-react';
import type { Song } from '@/lib/types';
import { usePlayer } from '@/lib/store/player';
import { formatTime } from '@/lib/utils';

export function SongRow({ song, index }: { song: Song; index: number }) {
  const play = usePlayer((s) => s.play);
  return (
    <button
      type="button"
      onClick={() => void play(song)}
      className="group grid w-full grid-cols-[32px_48px_1fr_auto] items-center gap-4 rounded-2xl px-3 py-2 text-left transition-colors hover:bg-cream/5"
    >
      <span className="num-mono text-xs text-cream-muted group-hover:text-cream tabular-nums">
        {String(index + 1).padStart(2, '0')}
      </span>
      <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-ink-100 ring-1 ring-cream/5">
        {song.imageUrl && (
          <Image src={song.imageUrl} alt="" fill sizes="48px" className="object-cover" unoptimized />
        )}
        <span className="absolute inset-0 grid place-items-center bg-ink/60 opacity-0 transition-opacity group-hover:opacity-100">
          <Play size={14} className="text-cream" fill="currentColor" />
        </span>
      </div>
      <div className="min-w-0">
        <div
          className="truncate font-display text-sm"
          style={{ fontVariationSettings: "'opsz' 24, 'wght' 500" }}
        >
          {song.name}
        </div>
        <div className="truncate text-[11px] text-cream-muted">
          {song.artists.slice(0, 3).join(' · ')}
        </div>
      </div>
      <div className="hidden sm:flex items-center gap-3 text-[10px] font-mono text-cream-muted">
        <span>{song.year}</span>
        <span>{formatTime(song.duration)}</span>
      </div>
    </button>
  );
}
