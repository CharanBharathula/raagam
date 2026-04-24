'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import { MoodChips, MOODS } from '@/components/mood/MoodChips';
import { AuroraBackground } from '@/components/motion/AuroraBackground';
import { SongCard } from '@/components/SongCard';
import { SkeletonCard } from '@/components/motion/SkeletonCard';
import { Stagger } from '@/components/motion/StaggerChildren';
import { useMood } from '@/lib/api/hooks';
import { usePlayer } from '@/lib/store/player';
import type { Mood } from '@/lib/types';

export default function MoodsPage() {
  const [mood, setMood] = useState<Mood | null>(null);
  const [lang, setLang] = useState<'hindi' | 'telugu'>('hindi');
  const { data, isLoading } = useMood(mood, lang);
  const setActiveMood = usePlayer((s) => s.setActiveMood);
  const activeMood = usePlayer((s) => s.activeMood);

  const onPick = (m: Mood) => {
    setMood(m);
    setActiveMood(m);
  };

  const meta = MOODS.find((m) => m.id === (mood ?? activeMood));

  return (
    <div className="relative min-h-[calc(100vh-72px)] px-6 py-14 md:px-10">
      <AuroraBackground variant="hero" />
      <div className="relative mx-auto max-w-6xl">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <p className="label-mono">Mood radio</p>
          <h1
            className="mt-3 font-display text-[clamp(2.4rem,6vw,4.5rem)] leading-[0.9]"
            style={{ fontVariationSettings: "'opsz' 144, 'wght' 460", letterSpacing: '-0.03em' }}
          >
            eight vibes.{' '}
            <span className="text-gradient italic" style={{ fontVariationSettings: "'opsz' 144, 'wght' 420, 'SOFT' 100" }}>
              one tap.
            </span>
          </h1>
        </motion.div>

        {/* Language switch */}
        <div className="mt-8 inline-flex rounded-full border border-cream/10 bg-ink-100 p-1 text-sm">
          {(['hindi', 'telugu'] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className={`rounded-full px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors ${
                lang === l ? 'bg-cream text-ink' : 'text-cream-muted hover:text-cream'
              }`}
            >
              {l === 'hindi' ? 'हिन्दी Hindi' : 'తెలుగు Telugu'}
            </button>
          ))}
        </div>

        <div className="mt-10">
          <MoodChips active={mood ?? activeMood} onSelect={onPick} />
        </div>

        {(mood ?? activeMood) && (
          <section className="mt-16">
            <div className="flex items-end justify-between">
              <div>
                <p className="label-mono">Radio · {lang}</p>
                <h2
                  className="mt-1 font-display text-3xl"
                  style={{ fontVariationSettings: "'opsz' 144, 'wght' 480" }}
                >
                  {meta?.label}
                </h2>
              </div>
            </div>
            <Stagger className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {isLoading
                ? Array.from({ length: 10 }).map((_, i) => <SkeletonCard key={i} />)
                : (data ?? []).slice(0, 20).map((song) => <SongCard key={song.id} song={song} />)}
            </Stagger>
          </section>
        )}
      </div>
    </div>
  );
}
