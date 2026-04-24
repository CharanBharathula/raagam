'use client';

import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { Heart, Pause, Play, SkipForward, Captions, MonitorPlay } from 'lucide-react';
import { DownloadButton } from '@/components/DownloadButton';
import { useLike } from '@/lib/hooks/useLike';
import { usePlayer } from '@/lib/store/player';
import { WaveScrubber } from './WaveScrubber';
import { LyricsPanel } from './LyricsPanel';
import { cn } from '@/lib/utils';

// R3F + three.js is ~500 KB gzipped; load it only when the player opens
// and never on the server (Canvas touches WebGL globals).
const ParticleField = dynamic(
  () => import('./ParticleField').then((m) => ({ default: m.ParticleField })),
  { ssr: false, loading: () => null },
);

export function PlayerStage() {
  const song = usePlayer((s) => s.current);
  const status = usePlayer((s) => s.status);
  const toggle = usePlayer((s) => s.toggle);
  const next = usePlayer((s) => s.next);
  const showLyrics = usePlayer((s) => s.showLyrics);
  const toggleLyrics = usePlayer((s) => s.toggleLyrics);
  const showVideo = usePlayer((s) => s.showVideo);
  const toggleVideo = usePlayer((s) => s.toggleVideo);

  const { liked, toggle: toggleLike } = useLike(song);

  if (!song) {
    return (
      <div className="relative grid min-h-[calc(100vh-72px)] place-items-center">
        <div className="aurora-static" />
        <div className="relative text-center">
          <p className="label-mono">Nothing playing</p>
          <h2 className="mt-3 font-display text-4xl" style={{ fontVariationSettings: "'opsz' 144, 'wght' 480" }}>
            drop the needle.
          </h2>
        </div>
      </div>
    );
  }

  const primary = song.colors.primary ?? '#F59E0B';

  return (
    <div className="relative min-h-screen overflow-hidden">
      <ParticleField />
      {/* soft color wash keyed to dominant album color */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(70% 50% at 50% 0%, ${primary}33 0%, transparent 60%)`,
        }}
      />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 pt-10 pb-40 md:pt-16">
        {/* top meta */}
        <div className="flex items-center justify-between">
          <div>
            <p className="label-mono">Now spinning</p>
            <p className="mt-1 font-mono text-[11px] text-cream-muted">
              {song.language === 'telugu' ? 'తెలుగు' : 'हिन्दी'} · {song.year}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ToggleChip label="Lyrics" active={showLyrics} onClick={toggleLyrics} icon={<Captions size={14} />} />
            <ToggleChip label="Video" active={showVideo} onClick={toggleVideo} icon={<MonitorPlay size={14} />} />
          </div>
        </div>

        {/* main stage */}
        <div className="mt-10 grid flex-1 grid-cols-1 items-center gap-10 md:mt-16 md:grid-cols-[minmax(0,360px)_1fr]">
          {/* Album art — floats, has aurora halo */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 24 }}
            className="relative mx-auto aspect-square w-[min(72vw,360px)] md:w-full"
            style={{ viewTransitionName: 'np-art' }}
          >
            <div
              className="absolute -inset-6 rounded-full blur-3xl opacity-60 animate-breathe"
              style={{
                background: `conic-gradient(from 180deg, ${primary}, #E11D74, #4F39E8, ${primary})`,
              }}
            />
            <div className="relative size-full overflow-hidden rounded-asym-lg ring-1 ring-cream/20 shadow-[0_40px_120px_-20px_rgba(0,0,0,0.8)]">
              {song.imageUrl && (
                <Image
                  src={song.imageUrl}
                  alt={song.name}
                  fill
                  sizes="400px"
                  priority
                  className={cn(
                    'object-cover transition-transform duration-700',
                    status === 'playing' ? 'scale-105' : 'scale-100',
                  )}
                  unoptimized
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-ink/40" />
            </div>
          </motion.div>

          {/* right: title + controls OR lyrics */}
          <div className="relative flex flex-col gap-8">
            <AnimatePresence mode="wait">
              {showLyrics ? (
                <motion.div
                  key="lyr"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ type: 'spring', stiffness: 220, damping: 26 }}
                >
                  <LyricsPanel />
                </motion.div>
              ) : (
                <motion.div
                  key="info"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ type: 'spring', stiffness: 220, damping: 26 }}
                  className="space-y-3"
                >
                  <h1
                    className="font-display text-[clamp(2rem,5vw,3.75rem)] leading-[0.95] tracking-[-0.025em] text-cream"
                    style={{ fontVariationSettings: "'opsz' 144, 'wght' 480" }}
                  >
                    {song.name}
                  </h1>
                  <div className="text-lg text-cream-dim">
                    {song.artists.slice(0, 3).join(' · ')}
                  </div>
                  {song.album && (
                    <div className="label-mono">from · {song.album}</div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <WaveScrubber />

            {/* Controls */}
            <div className="flex items-center gap-3">
              <IconBtn
                onClick={toggleLike}
                active={liked}
                activeColor="#E11D74"
                label={liked ? 'Unlike' : 'Like'}
              >
                <Heart size={20} fill={liked ? 'currentColor' : 'none'} />
              </IconBtn>

              <div className="flex-1" />

              <button
                type="button"
                onClick={toggle}
                aria-label={status === 'playing' ? 'Pause' : 'Play'}
                className="group relative size-16 rounded-full bg-gradient-to-br from-saffron via-saffron-light to-magenta text-ink shadow-glow transition-transform hover:scale-105 active:scale-95"
              >
                <span className="absolute inset-0 rounded-full bg-gradient-to-br from-saffron to-magenta blur-2xl opacity-70 group-hover:opacity-100 transition-opacity" />
                <span className="relative flex h-full w-full items-center justify-center">
                  {status === 'playing' ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
                </span>
              </button>

              <IconBtn onClick={next} label="Next">
                <SkipForward size={20} />
              </IconBtn>

              <div className="flex-1" />

              <DownloadButton song={song} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  label,
  active,
  activeColor,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  active?: boolean;
  activeColor?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'grid size-11 place-items-center rounded-full border border-cream/10 text-cream-dim transition-all duration-300 ease-raaga',
        'hover:text-cream hover:border-cream/25 hover:bg-cream/5 active:scale-95',
      )}
      style={active && activeColor ? { color: activeColor, borderColor: activeColor } : undefined}
    >
      {children}
    </button>
  );
}

function ToggleChip({
  label,
  active,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 rounded-full border border-cream/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] transition-all',
        active ? 'bg-cream/10 text-cream border-cream/30' : 'text-cream-muted hover:text-cream',
      )}
    >
      {icon}
      {label}
    </button>
  );
}
