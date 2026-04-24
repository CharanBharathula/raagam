'use client';

import { motion } from 'framer-motion';
import type { Mood } from '@/lib/types';
import { cn } from '@/lib/utils';

interface MoodDef {
  id: Mood;
  label: string;
  glyph: string;
  gradient: string;
}

export const MOODS: MoodDef[] = [
  { id: 'romantic',   label: 'Romantic',   glyph: '❀', gradient: 'from-magenta via-raaga-rose to-raaga-violet' },
  { id: 'party',      label: 'Party',      glyph: '✸', gradient: 'from-saffron via-saffron-light to-magenta' },
  { id: 'chill',      label: 'Chill',      glyph: '〰', gradient: 'from-indigo-glow via-raaga-violet to-magenta' },
  { id: 'sad',        label: 'Melancholic',glyph: '☾', gradient: 'from-indigo-night via-indigo-glow to-cream-muted' },
  { id: 'workout',    label: 'Workout',    glyph: '⚡', gradient: 'from-saffron-deep via-saffron to-magenta' },
  { id: 'focus',      label: 'Focus',      glyph: '◉', gradient: 'from-indigo-deep via-raaga-violet to-indigo-glow' },
  { id: 'monsoon',    label: 'Monsoon',    glyph: '☔', gradient: 'from-indigo-glow via-raaga-violet to-magenta' },
  { id: 'late-night', label: 'Late Night', glyph: '✦', gradient: 'from-ink-50 via-indigo-night to-raaga-violet' },
];

interface Props {
  active?: Mood | null;
  onSelect: (mood: Mood) => void;
}

export function MoodChips({ active, onSelect }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {MOODS.map((m, i) => {
        const isActive = m.id === active;
        return (
          <motion.button
            key={m.id}
            type="button"
            onClick={() => onSelect(m.id)}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, type: 'spring', stiffness: 180, damping: 22 }}
            whileHover={{ y: -4 }}
            whileTap={{ scale: 0.97 }}
            className={cn(
              'group relative overflow-hidden rounded-asym-md bg-ink-100 p-5 text-left ring-1 ring-cream/8 transition-shadow hover:shadow-glow',
              isActive && 'ring-cream/40 shadow-glow',
            )}
          >
            <div
              className={cn(
                'pointer-events-none absolute -inset-1 bg-gradient-to-br opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-70',
                m.gradient,
                isActive && 'opacity-80',
              )}
            />
            <div
              className={cn(
                'relative mb-10 grid size-14 place-items-center rounded-full bg-gradient-to-br text-2xl text-ink',
                m.gradient,
              )}
            >
              <span style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.3))' }}>{m.glyph}</span>
            </div>
            <div className="relative">
              <div
                className="font-display text-xl leading-none"
                style={{ fontVariationSettings: "'opsz' 96, 'wght' 460", letterSpacing: '-0.01em' }}
              >
                {m.label}
              </div>
              <div className="mt-1 label-mono">Start a radio</div>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}
