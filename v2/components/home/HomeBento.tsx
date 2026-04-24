'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Play, Compass, Music4, Sparkles } from 'lucide-react';
import { useNewReleases } from '@/lib/api/hooks';
import { SongCard } from '@/components/SongCard';
import { SkeletonCard } from '@/components/motion/SkeletonCard';
import { TiltCard } from '@/components/motion/TiltCard';
import { getGreeting } from '@/lib/utils';
import { Stagger, StaggerItem } from '@/components/motion/StaggerChildren';
import { AuroraBackground } from '@/components/motion/AuroraBackground';
import { usePlayer } from '@/lib/store/player';
import { api } from '@/lib/api/client';
import { useState } from 'react';

export function HomeBento() {
  const hindi = useNewReleases('hindi');
  const telugu = useNewReleases('telugu');
  const play = usePlayer((s) => s.play);
  const settings = usePlayer((s) => s.settings);
  const [busy, setBusy] = useState(false);

  const onBigPlay = async () => {
    setBusy(true);
    try {
      const { song } = await api.pick({
        years: [settings.yearMin, settings.yearMax],
        langBlend: settings.langBlend,
      });
      await play(song);
      window.location.assign('/player');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative mx-auto max-w-6xl px-5 pt-10 pb-20 md:px-10 md:pt-14">
      <AuroraBackground variant="hero" />
      <div className="relative">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="label-mono"
        >
          {getGreeting()}
        </motion.p>
        <h1
          className="mt-3 font-display text-[clamp(2.8rem,8vw,5.5rem)] leading-[0.9]"
          style={{ fontVariationSettings: "'opsz' 144, 'wght' 460", letterSpacing: '-0.03em' }}
        >
          <motion.span
            initial={{ opacity: 0, y: 12, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="inline-block"
          >
            a music room
          </motion.span>
          <br />
          <motion.span
            initial={{ opacity: 0, y: 12, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.7, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
            className="text-gradient italic"
            style={{ fontVariationSettings: "'opsz' 144, 'wght' 420, 'SOFT' 100" }}
          >
            for the night.
          </motion.span>
        </h1>
      </div>

      {/* Big bento grid */}
      <div className="mt-12 grid grid-cols-12 gap-4">
        {/* Tonight — the headline card. Takes 8 cols on desktop. */}
        <TiltCard
          className="col-span-12 aspect-[16/9] md:col-span-8 md:aspect-[16/10]"
          intensity={0.5}
        >
          <button
            type="button"
            onClick={onBigPlay}
            disabled={busy}
            className="group relative h-full w-full overflow-hidden rounded-asym-lg text-left"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-saffron via-magenta to-indigo-glow" />
            <div className="absolute inset-0 opacity-50 mix-blend-overlay">
              <div className="aurora-static" />
            </div>
            <div className="relative flex h-full flex-col justify-between p-8 md:p-10">
              <div>
                <p className="label-mono text-cream/80">Tonight · {settings.yearMin}–{settings.yearMax}</p>
                <h2
                  className="mt-3 max-w-md font-display text-[clamp(1.8rem,4vw,3rem)] leading-[1] text-cream"
                  style={{ fontVariationSettings: "'opsz' 144, 'wght' 500" }}
                >
                  A blockbuster, picked for <em className="not-italic text-cream">you</em>.
                </h2>
              </div>
              <div className="flex items-center justify-between">
                <span className="label-mono text-cream/70">
                  Taste-weighted · Anti-repeat · Era-balanced
                </span>
                <span className="flex size-14 items-center justify-center rounded-full bg-cream text-ink shadow-glow transition-transform group-hover:scale-110 group-active:scale-95">
                  <Play size={22} fill="currentColor" />
                </span>
              </div>
            </div>
          </button>
        </TiltCard>

        {/* Quick links column */}
        <div className="col-span-12 flex flex-col gap-4 md:col-span-4">
          <LinkCard
            href="/discover"
            icon={<Compass size={22} strokeWidth={1.5} />}
            title="Discover"
            subtitle="Spin the dial"
            accent="from-saffron to-magenta"
          />
          <LinkCard
            href="/moods"
            icon={<Music4 size={22} strokeWidth={1.5} />}
            title="Moods"
            subtitle="Eight vibes. One tap."
            accent="from-magenta to-indigo-glow"
          />
          <LinkCard
            href="/library"
            icon={<Sparkles size={22} strokeWidth={1.5} />}
            title="Library"
            subtitle="Liked · History · Downloads"
            accent="from-indigo-glow to-saffron"
          />
        </div>
      </div>

      {/* Rails */}
      <Shelf
        title="Fresh Bollywood"
        subtitle="New drops 2024–2026"
        loading={hindi.isLoading}
        data={hindi.data ?? []}
      />
      <Shelf
        title="Fresh Telugu"
        subtitle="కొత్త పాటలు"
        loading={telugu.isLoading}
        data={telugu.data ?? []}
      />
    </div>
  );
}

function LinkCard({
  href,
  icon,
  title,
  subtitle,
  accent,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  accent: string;
}) {
  return (
    <TiltCard className="h-full flex-1" intensity={0.6}>
      <Link
        href={href}
        className="glass group relative flex h-full flex-col justify-between overflow-hidden rounded-asym-md p-5"
      >
        <div
          className={`pointer-events-none absolute -inset-1 bg-gradient-to-br ${accent} opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-40`}
        />
        <div className="relative grid size-10 place-items-center rounded-xl bg-cream/8 text-cream">{icon}</div>
        <div className="relative">
          <div
            className="font-display text-xl"
            style={{ fontVariationSettings: "'opsz' 96, 'wght' 480" }}
          >
            {title}
          </div>
          <div className="label-mono mt-1">{subtitle}</div>
        </div>
      </Link>
    </TiltCard>
  );
}

function Shelf({
  title,
  subtitle,
  loading,
  data,
}: {
  title: string;
  subtitle: string;
  loading: boolean;
  data: import('@/lib/types').Song[];
}) {
  return (
    <section className="mt-16">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <p className="label-mono">{subtitle}</p>
          <h3
            className="mt-1 font-display text-3xl leading-none"
            style={{ fontVariationSettings: "'opsz' 144, 'wght' 480", letterSpacing: '-0.02em' }}
          >
            {title}
          </h3>
        </div>
        <div className="fine-divider hidden flex-1 mx-6 mb-3 sm:block" />
      </div>
      <Stagger className="flex gap-4 overflow-x-auto pb-4 no-scrollbar snap-x snap-mandatory">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="w-52 shrink-0 snap-start">
                <SkeletonCard />
              </div>
            ))
          : data.slice(0, 12).map((song, i) => (
              <StaggerItem key={song.id} className="snap-start">
                <SongCard song={song} index={i} />
              </StaggerItem>
            ))}
      </Stagger>
    </section>
  );
}
