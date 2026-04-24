'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Search as SearchIcon, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSearch } from '@/lib/api/hooks';
import { SongRow } from '@/components/SongRow';
import { SkeletonCard } from '@/components/motion/SkeletonCard';

export default function SearchPage() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [lang, setLang] = useState<'hindi' | 'telugu' | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 150);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isLoading, isFetching } = useSearch(debounced, lang);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="relative min-h-[calc(100vh-72px)] px-6 py-14 md:px-10">
      <div className="mx-auto max-w-4xl">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <p className="label-mono">Search</p>
          <h1
            className="mt-3 font-display text-[clamp(2.4rem,6vw,4.5rem)] leading-[0.9]"
            style={{ fontVariationSettings: "'opsz' 144, 'wght' 460", letterSpacing: '-0.03em' }}
          >
            find a song.
          </h1>
        </motion.div>

        {/* Search box */}
        <div className="relative mt-10">
          <div className="group glass-warm flex items-center gap-3 rounded-full px-5 py-3 ring-1 ring-cream/10 focus-within:ring-saffron/50 transition-shadow">
            <SearchIcon size={18} className="text-cream-muted shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder='Try "Kesariya" or "Thaman S"…'
              className="flex-1 bg-transparent outline-none placeholder:text-cream-muted font-display text-lg"
              style={{ fontVariationSettings: "'opsz' 96, 'wght' 400" }}
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ('')}
                className="grid size-7 place-items-center rounded-full bg-cream/5 text-cream-muted hover:text-cream"
                aria-label="Clear"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="mt-3 flex gap-2">
            {[undefined, 'hindi', 'telugu'].map((l) => (
              <button
                key={l ?? 'all'}
                type="button"
                onClick={() => setLang(l as 'hindi' | 'telugu' | undefined)}
                className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors ${
                  lang === l
                    ? 'border-cream/40 bg-cream/10 text-cream'
                    : 'border-cream/10 text-cream-muted hover:text-cream'
                }`}
              >
                {l ?? 'all'}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        <div className="mt-10 space-y-1">
          <AnimatePresence mode="wait">
            {!debounced ? (
              <EmptyState key="empty" />
            ) : isLoading ? (
              <div key="load" className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-14 rounded-2xl shimmer" />
                ))}
              </div>
            ) : (data?.length ?? 0) === 0 ? (
              <motion.div
                key="none"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="py-12 text-center text-cream-muted"
              >
                No songs match <strong className="text-cream">{debounced}</strong>.
              </motion.div>
            ) : (
              <motion.div
                key="results"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-1"
              >
                <p className="label-mono pl-3">
                  {data?.length} result{data?.length === 1 ? '' : 's'}
                  {isFetching && ' · refreshing…'}
                </p>
                <div className="mt-3 space-y-1">
                  {(data ?? []).map((song, i) => (
                    <SongRow key={song.id} song={song} index={i} />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  const hints = [
    'Tum Hi Ho',
    'Pushpa',
    'Arijit Singh',
    'Thaman S',
    'Devi Sri Prasad',
    'Animal',
    'Aashiqui 2',
    'Sid Sriram',
  ];
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="pt-8"
    >
      <p className="label-mono">Try</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {hints.map((h) => (
          <span
            key={h}
            className="rounded-full border border-cream/10 bg-cream/5 px-3 py-1 font-display text-sm text-cream-dim"
            style={{ fontVariationSettings: "'opsz' 48, 'wght' 420" }}
          >
            {h}
          </span>
        ))}
      </div>
    </motion.div>
  );
}
