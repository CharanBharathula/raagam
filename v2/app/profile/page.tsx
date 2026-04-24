'use client';

import { motion } from 'framer-motion';
import { useUser, SignOutButton } from '@clerk/nextjs';
import { useLiveQuery } from 'dexie-react-hooks';
import { getDB } from '@/lib/data/dexie';
import { usePlayer } from '@/lib/store/player';
import { AuroraBackground } from '@/components/motion/AuroraBackground';
import { Slider } from '@/components/ui/Slider';
import { Button } from '@/components/ui/Button';
import { useMemo } from 'react';

export default function ProfilePage() {
  const { user } = useUser();
  const settings = usePlayer((s) => s.settings);
  const setSettings = usePlayer((s) => s.setSettings);

  const history = useLiveQuery(() => getDB().history.toArray(), []);
  const liked = useLiveQuery(() => getDB().liked.toArray(), []);

  const dna = useMemo(() => computeDna(history ?? []), [history]);

  return (
    <div className="relative min-h-[calc(100vh-72px)] px-6 py-14 md:px-10">
      <AuroraBackground variant="hero" />
      <div className="relative mx-auto max-w-4xl">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-5">
          <div className="grid size-20 place-items-center rounded-full bg-gradient-to-br from-saffron via-magenta to-indigo-glow text-ink shadow-glow">
            <span className="font-display text-3xl" style={{ fontVariationSettings: "'opsz' 144, 'wght' 500" }}>
              {(user?.firstName?.[0] ?? user?.username?.[0] ?? '★').toUpperCase()}
            </span>
          </div>
          <div>
            <p className="label-mono">You</p>
            <h1
              className="mt-1 font-display text-5xl leading-none"
              style={{ fontVariationSettings: "'opsz' 144, 'wght' 460", letterSpacing: '-0.025em' }}
            >
              {user?.firstName ?? user?.username ?? 'Music lover'}
            </h1>
            <p className="mt-2 text-sm text-cream-dim">{user?.primaryEmailAddress?.emailAddress}</p>
          </div>
        </motion.div>

        {/* DNA bar */}
        <div className="mt-14">
          <div className="flex items-end justify-between">
            <div>
              <p className="label-mono">your music dna</p>
              <h2
                className="mt-1 font-display text-3xl"
                style={{ fontVariationSettings: "'opsz' 144, 'wght' 480" }}
              >
                {dna.verdict}
              </h2>
            </div>
          </div>
          <div className="mt-5 h-5 overflow-hidden rounded-full bg-ink-100 ring-1 ring-cream/5 flex">
            {dna.bars.map((b, i) => (
              <div
                key={i}
                className="h-full transition-all"
                style={{
                  width: `${b.pct}%`,
                  background: b.color,
                }}
                title={`${b.label} · ${b.pct.toFixed(0)}%`}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-cream-muted font-mono">
            {dna.bars.map((b) => (
              <span key={b.label} className="flex items-center gap-1.5">
                <span className="size-2 rounded-sm" style={{ background: b.color }} />
                {b.label}
              </span>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="mt-12 grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="Songs played" value={(history?.length ?? 0).toString()} />
          <Stat label="Liked" value={(liked?.length ?? 0).toString()} />
          <Stat label="Artists" value={Object.keys(dna.artists).length.toString()} />
          <Stat label="Top decade" value={dna.topDecade ?? '—'} />
        </div>

        {/* Settings */}
        <div className="mt-14 glass rounded-asym-md p-6">
          <h3
            className="font-display text-xl"
            style={{ fontVariationSettings: "'opsz' 96, 'wght' 480" }}
          >
            Pick preferences
          </h3>
          <div className="mt-6 space-y-6">
            <div>
              <div className="flex justify-between text-xs">
                <span className="label-mono">Year range</span>
                <span className="num-mono text-cream">{settings.yearMin} → {settings.yearMax}</span>
              </div>
              <div className="mt-3 space-y-2">
                <Slider
                  min={2000}
                  max={2026}
                  step={1}
                  value={[settings.yearMin, settings.yearMax]}
                  onValueChange={([a, b]) => setSettings({ yearMin: a!, yearMax: b! })}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs">
                <span className="label-mono">Language blend</span>
                <span className="num-mono text-cream">
                  {Math.round((1 - settings.langBlend) * 100)}% తెలుగు · {Math.round(settings.langBlend * 100)}% हिन्दी
                </span>
              </div>
              <div className="mt-3">
                <Slider
                  min={0}
                  max={100}
                  step={1}
                  value={[Math.round(settings.langBlend * 100)]}
                  onValueChange={([v]) => setSettings({ langBlend: (v ?? 60) / 100 })}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 flex justify-end">
          <SignOutButton>
            <Button variant="ghost" size="sm">
              Sign out
            </Button>
          </SignOutButton>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="label-mono">{label}</div>
      <div
        className="mt-2 font-display text-3xl"
        style={{ fontVariationSettings: "'opsz' 144, 'wght' 500" }}
      >
        {value}
      </div>
    </div>
  );
}

function computeDna(history: Array<{ song: import('@/lib/types').Song }>) {
  const decades: Record<string, number> = {};
  const artists: Record<string, number> = {};
  const langs: Record<string, number> = {};
  for (const h of history) {
    const y = h.song.year;
    const dec = y >= 2020 ? '2020s' : y >= 2010 ? '2010s' : '2000s';
    decades[dec] = (decades[dec] ?? 0) + 1;
    for (const a of h.song.artists) artists[a] = (artists[a] ?? 0) + 1;
    langs[h.song.language] = (langs[h.song.language] ?? 0) + 1;
  }
  const total = history.length || 1;
  const bars = [
    { label: '2020s', color: '#F59E0B', pct: ((decades['2020s'] ?? 0) / total) * 100 },
    { label: '2010s', color: '#E11D74', pct: ((decades['2010s'] ?? 0) / total) * 100 },
    { label: '2000s', color: '#4F39E8', pct: ((decades['2000s'] ?? 0) / total) * 100 },
  ];
  const topDecade = bars.sort((a, b) => b.pct - a.pct)[0]?.label;
  const verdict = total < 5
    ? 'Still listening in…'
    : topDecade === '2020s'
      ? 'Latest-fire listener'
      : topDecade === '2010s'
        ? 'Golden-era heart'
        : 'Millennium classicist';
  return { bars, artists, topDecade, verdict };
}
