'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/Button';
import { Slider } from '@/components/ui/Slider';
import { AuroraBackground } from '@/components/motion/AuroraBackground';
import { ONBOARDING_ARTISTS } from '@/lib/constants/artists';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api/client';
import { usePlayer } from '@/lib/store/player';

type Step = 0 | 1 | 2;

export default function OnboardingPage() {
  const router = useRouter();
  const setSettings = usePlayer((s) => s.setSettings);

  const [step, setStep] = useState<Step>(0);
  const [langs, setLangs] = useState<Array<'hindi' | 'telugu'>>(['hindi', 'telugu']);
  const [years, setYears] = useState<[number, number]>([2000, 2026]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const toggleLang = (l: 'hindi' | 'telugu') => {
    setLangs((prev) => (prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l]));
  };

  const toggleArtist = (q: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(q)) next.delete(q);
      else next.add(q);
      return next;
    });
  };

  const next = () => setStep((s) => (s + 1) as Step);

  const finish = async () => {
    setBusy(true);
    try {
      await api.request('/me/onboard', {
        method: 'POST',
        body: JSON.stringify({
          artists: [...picked],
          langs,
          yearMin: years[0],
          yearMax: years[1],
        }),
      });
      // Sync to local store so the first pick reflects choice immediately.
      setSettings({
        yearMin: years[0],
        yearMax: years[1],
        langBlend: langs.length === 2 ? 0.6 : langs[0] === 'hindi' ? 0.9 : 0.1,
      });
      router.push('/');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden px-6 py-12">
      <AuroraBackground variant="hero" />
      <div className="relative z-10 mx-auto w-full max-w-3xl">
        <div className="mb-10 flex items-center justify-between">
          <Logo mark size={32} />
          <div className="flex items-center gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={cn(
                  'h-1 rounded-full transition-all duration-500',
                  i <= step ? 'w-10 bg-gradient-to-r from-saffron to-magenta' : 'w-4 bg-cream/15',
                )}
              />
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {step === 0 && (
            <Card key="s0">
              <Eyebrow>Step 1 of 3</Eyebrow>
              <Title>
                which tongue <em className="text-gradient not-italic">sings</em> to you?
              </Title>
              <Sub>Pick one or both. You can change this anytime.</Sub>

              <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2">
                <LangCard
                  label="తెలుగు"
                  sub="Telugu"
                  active={langs.includes('telugu')}
                  onClick={() => toggleLang('telugu')}
                  from="from-saffron"
                  to="to-magenta"
                />
                <LangCard
                  label="हिन्दी"
                  sub="Hindi · Bollywood"
                  active={langs.includes('hindi')}
                  onClick={() => toggleLang('hindi')}
                  from="from-magenta"
                  to="to-indigo-glow"
                />
              </div>

              <Footer>
                <Button onClick={next} disabled={langs.length === 0}>
                  Next
                  <ChevronRight size={16} />
                </Button>
              </Footer>
            </Card>
          )}

          {step === 1 && (
            <Card key="s1">
              <Eyebrow>Step 2 of 3</Eyebrow>
              <Title>
                how far back do you <em className="text-gradient not-italic">listen?</em>
              </Title>
              <Sub>Drag the edges. We'll only play songs inside this window.</Sub>

              <div className="mt-12 space-y-6">
                <div className="flex items-end justify-between">
                  <div>
                    <div className="label-mono">From</div>
                    <div
                      className="font-display text-5xl leading-none num-mono text-cream"
                      style={{ fontVariationSettings: "'opsz' 144, 'wght' 500" }}
                    >
                      {years[0]}
                    </div>
                  </div>
                  <div className="h-12 w-px bg-cream/10" />
                  <div className="text-right">
                    <div className="label-mono">Until</div>
                    <div
                      className="font-display text-5xl leading-none num-mono text-cream"
                      style={{ fontVariationSettings: "'opsz' 144, 'wght' 500" }}
                    >
                      {years[1]}
                    </div>
                  </div>
                </div>
                <Slider
                  min={2000}
                  max={2026}
                  step={1}
                  value={years}
                  onValueChange={([a, b]) => setYears([a!, b!])}
                />
                <div className="flex flex-wrap gap-2">
                  {[
                    ['All (2000–26)', 2000, 2026],
                    ['2010s onwards', 2010, 2026],
                    ['Last 5 years', 2022, 2026],
                    ['Millennium 00s', 2000, 2009],
                  ].map(([label, a, b]) => (
                    <button
                      key={String(label)}
                      type="button"
                      onClick={() => setYears([a as number, b as number])}
                      className="rounded-full border border-cream/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-cream-muted hover:border-cream/25 hover:text-cream"
                    >
                      {label as string}
                    </button>
                  ))}
                </div>
              </div>

              <Footer>
                <Button onClick={next}>
                  Next
                  <ChevronRight size={16} />
                </Button>
              </Footer>
            </Card>
          )}

          {step === 2 && (
            <Card key="s2">
              <Eyebrow>Step 3 of 3</Eyebrow>
              <Title>
                pick voices that <em className="text-gradient not-italic">pull you in.</em>
              </Title>
              <Sub>Tap any you love. Even one tap teaches our picker a lot.</Sub>

              <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {ONBOARDING_ARTISTS.filter(
                  (a) => a.lang === 'both' || langs.includes(a.lang as 'hindi' | 'telugu'),
                ).map((a) => {
                  const active = picked.has(a.query);
                  return (
                    <motion.button
                      key={a.query}
                      type="button"
                      onClick={() => toggleArtist(a.query)}
                      whileHover={{ y: -3 }}
                      whileTap={{ scale: 0.97 }}
                      className={cn(
                        'relative overflow-hidden rounded-asym-md bg-ink-100 p-4 text-left ring-1 ring-cream/8 transition-shadow',
                        active && 'ring-cream/40 shadow-glow',
                      )}
                    >
                      <div
                        className="pointer-events-none absolute -inset-2 opacity-50 blur-2xl transition-opacity duration-300"
                        style={{ background: a.tint, opacity: active ? 0.7 : 0.25 }}
                      />
                      <div
                        className="relative size-10 rounded-full"
                        style={{ background: `radial-gradient(circle at 30% 30%, ${a.tint}, #1a1428)` }}
                      />
                      <div className="relative mt-6">
                        <div
                          className="font-display text-base leading-tight"
                          style={{ fontVariationSettings: "'opsz' 48, 'wght' 500" }}
                        >
                          {a.name}
                        </div>
                        <div className="label-mono mt-0.5">{a.era}</div>
                      </div>
                      {active && (
                        <motion.span
                          initial={{ scale: 0.5, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          className="absolute right-3 top-3 grid size-6 place-items-center rounded-full bg-cream text-ink"
                        >
                          <Check size={12} strokeWidth={3} />
                        </motion.span>
                      )}
                    </motion.button>
                  );
                })}
              </div>

              <Footer>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={finish}
                  disabled={busy}
                >
                  Skip
                </Button>
                <Button onClick={finish} disabled={busy}>
                  {busy ? 'Tuning…' : `Let's go${picked.size ? ` · ${picked.size} picked` : ''}`}
                </Button>
              </Footer>
            </Card>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: -10, filter: 'blur(6px)' }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="glass rounded-asym-lg p-8 md:p-12"
    >
      {children}
    </motion.div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="label-mono">{children}</div>;
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <h1
      className="mt-3 font-display text-[clamp(2rem,5vw,3.5rem)] leading-[0.95]"
      style={{ fontVariationSettings: "'opsz' 144, 'wght' 460", letterSpacing: '-0.025em' }}
    >
      {children}
    </h1>
  );
}

function Sub({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 max-w-xl text-cream-dim">{children}</p>;
}

function Footer({ children }: { children: React.ReactNode }) {
  return <div className="mt-12 flex items-center justify-end gap-3">{children}</div>;
}

function LangCard({
  label,
  sub,
  active,
  onClick,
  from,
  to,
}: {
  label: string;
  sub: string;
  active: boolean;
  onClick: () => void;
  from: string;
  to: string;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.97 }}
      className={cn(
        'relative overflow-hidden rounded-asym-md p-8 text-left ring-1 ring-cream/10 transition-all',
        active ? 'ring-cream/40 shadow-glow' : 'hover:ring-cream/25',
      )}
    >
      <div className={cn('pointer-events-none absolute inset-0 bg-gradient-to-br', from, to, active ? 'opacity-35' : 'opacity-15')} />
      <div className="relative">
        <div
          className="font-display text-6xl leading-none"
          style={{ fontVariationSettings: "'opsz' 144, 'wght' 500" }}
        >
          {label}
        </div>
        <div className="label-mono mt-4">{sub}</div>
      </div>
      {active && (
        <span className="absolute right-4 top-4 grid size-7 place-items-center rounded-full bg-cream text-ink">
          <Check size={14} strokeWidth={3} />
        </span>
      )}
    </motion.button>
  );
}
