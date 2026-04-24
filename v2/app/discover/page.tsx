'use client';

import { motion } from 'framer-motion';
import { DiscoverDial } from '@/components/discover/DiscoverDial';
import { AuroraBackground } from '@/components/motion/AuroraBackground';
import { usePlayer } from '@/lib/store/player';

export default function DiscoverPage() {
  const settings = usePlayer((s) => s.settings);
  const setSettings = usePlayer((s) => s.setSettings);

  return (
    <div className="relative min-h-[calc(100vh-72px)] px-6 py-16">
      <AuroraBackground variant="hero" />
      <div className="relative mx-auto flex max-w-5xl flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="text-center"
        >
          <p className="label-mono">The discover dial</p>
          <h1
            className="mt-3 font-display text-[clamp(2.4rem,6vw,4.5rem)] leading-[0.9]"
            style={{ fontVariationSettings: "'opsz' 144, 'wght' 460", letterSpacing: '-0.03em' }}
          >
            spin a blockbuster.
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-cream-dim">
            Drag the two handles to set your era. Rotate the inner ring to blend Telugu ↔ Hindi.
            Hit the center to drop the needle.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15, type: 'spring', stiffness: 160, damping: 22 }}
          className="mt-16 w-full"
        >
          <DiscoverDial
            yearMin={settings.yearMin}
            yearMax={settings.yearMax}
            onYearChange={(yearMin, yearMax) => setSettings({ yearMin, yearMax })}
            langBlend={settings.langBlend}
            onLangBlendChange={(langBlend) => setSettings({ langBlend })}
          />
        </motion.div>
      </div>
    </div>
  );
}
