'use client';

import { motion } from 'framer-motion';
import { Download, Check, Loader2, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import type { Song } from '@/lib/types';
import { downloadSong, isDownloaded, removeDownload } from '@/lib/audio/download';

interface Props {
  song: Song;
  className?: string;
  size?: number;
}

type State = 'idle' | 'downloading' | 'done' | 'error';

export function DownloadButton({ song, className, size = 18 }: Props) {
  const [state, setState] = useState<State>('idle');
  const [pct, setPct] = useState(0);

  useEffect(() => {
    let cancel = false;
    isDownloaded(song.id).then((d) => {
      if (!cancel) setState(d ? 'done' : 'idle');
    });
    return () => {
      cancel = true;
    };
  }, [song.id]);

  const onClick = async () => {
    if (state === 'downloading') return;
    if (state === 'done') {
      await removeDownload(song.id);
      setState('idle');
      return;
    }
    setState('downloading');
    setPct(0);
    try {
      await downloadSong(song, (loaded, total) => {
        if (total > 0) setPct(Math.round((loaded / total) * 100));
      });
      setState('done');
    } catch {
      setState('error');
      setTimeout(() => setState('idle'), 2000);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={
        state === 'done' ? 'Remove download' : state === 'downloading' ? 'Downloading' : 'Download'
      }
      className={cn(
        'relative grid size-11 place-items-center rounded-full border border-cream/10 text-cream-dim transition-all duration-300 ease-raaga',
        'hover:text-cream hover:border-cream/25 hover:bg-cream/5 active:scale-95',
        state === 'done' && 'border-saffron/40 text-saffron',
        className,
      )}
      title={state === 'downloading' ? `Downloading · ${pct}%` : undefined}
    >
      {state === 'downloading' && (
        <svg
          className="absolute inset-0 -rotate-90"
          viewBox="0 0 44 44"
          aria-hidden
        >
          <circle cx="22" cy="22" r="20" stroke="currentColor" strokeOpacity="0.15" strokeWidth="2" fill="none" />
          <motion.circle
            cx="22"
            cy="22"
            r="20"
            stroke="url(#dl-gradient)"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 20}
            animate={{ strokeDashoffset: 2 * Math.PI * 20 * (1 - pct / 100) }}
            transition={{ type: 'tween', duration: 0.2 }}
          />
          <defs>
            <linearGradient id="dl-gradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#F59E0B" />
              <stop offset="100%" stopColor="#E11D74" />
            </linearGradient>
          </defs>
        </svg>
      )}
      <span className="relative">
        {state === 'downloading' ? (
          <Loader2 size={size} className="animate-spin" />
        ) : state === 'done' ? (
          <Check size={size} />
        ) : state === 'error' ? (
          <Trash2 size={size} />
        ) : (
          <Download size={size} />
        )}
      </span>
    </button>
  );
}
