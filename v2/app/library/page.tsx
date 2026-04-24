'use client';

import { motion } from 'framer-motion';
import { useLiveQuery } from 'dexie-react-hooks';
import { Heart, Clock, Download } from 'lucide-react';
import { useState } from 'react';
import { getDB } from '@/lib/data/dexie';
import { SongRow } from '@/components/SongRow';

type Tab = 'liked' | 'history' | 'downloads';

export default function LibraryPage() {
  const [tab, setTab] = useState<Tab>('liked');
  const liked = useLiveQuery(() => getDB().liked.orderBy('likedAt').reverse().toArray(), []);
  const history = useLiveQuery(
    () => getDB().history.orderBy('playedAt').reverse().limit(100).toArray(),
    [],
  );
  const downloads = useLiveQuery(() => getDB().downloads.orderBy('downloadedAt').reverse().toArray(), []);

  return (
    <div className="relative min-h-[calc(100vh-72px)] px-6 py-14 md:px-10">
      <div className="mx-auto max-w-4xl">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <p className="label-mono">Your library</p>
          <h1
            className="mt-3 font-display text-[clamp(2.4rem,6vw,4.5rem)] leading-[0.9]"
            style={{ fontVariationSettings: "'opsz' 144, 'wght' 460", letterSpacing: '-0.03em' }}
          >
            the collected.
          </h1>
        </motion.div>

        {/* Tabs */}
        <div className="mt-10 inline-flex rounded-full border border-cream/10 bg-ink-100 p-1 text-sm">
          <TabBtn active={tab === 'liked'} onClick={() => setTab('liked')} icon={<Heart size={14} />}>
            Liked · {liked?.length ?? 0}
          </TabBtn>
          <TabBtn active={tab === 'history'} onClick={() => setTab('history')} icon={<Clock size={14} />}>
            History · {history?.length ?? 0}
          </TabBtn>
          <TabBtn active={tab === 'downloads'} onClick={() => setTab('downloads')} icon={<Download size={14} />}>
            Downloads · {downloads?.length ?? 0}
          </TabBtn>
        </div>

        <div className="mt-8 space-y-1">
          {tab === 'liked' && liked?.length === 0 && <Empty msg="Nothing liked yet. Tap the heart on any song to start." />}
          {tab === 'history' && history?.length === 0 && <Empty msg="No history. Start playing and we'll remember." />}
          {tab === 'downloads' && downloads?.length === 0 && <Empty msg="No downloads yet." />}

          {tab === 'liked' &&
            liked?.map((r, i) => <SongRow key={r.id} song={r.song} index={i} />)}
          {tab === 'history' &&
            history?.map((r, i) => <SongRow key={r.id} song={r.song} index={i} />)}
          {tab === 'downloads' &&
            downloads?.map((r, i) => <SongRow key={r.id} song={r.song} index={i} />)}
        </div>
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-full px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors ${
        active ? 'bg-cream text-ink' : 'text-cream-muted hover:text-cream'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="py-16 text-center">
      <p className="font-display text-xl text-cream-dim" style={{ fontVariationSettings: "'opsz' 96, 'wght' 400" }}>
        {msg}
      </p>
    </div>
  );
}
