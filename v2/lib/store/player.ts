'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Mood, Song, UserSettings } from '@/lib/types';
import { getEngine } from '@/lib/audio/engine';
import { api } from '@/lib/api/client';
import { pushHistoryLocal } from '@/lib/data/dexie';

interface PlayerState {
  status: 'idle' | 'loading' | 'playing' | 'paused' | 'error';
  current: Song | null;
  queue: Song[]; // lookahead
  history: string[]; // recent song ids (caps at 300)
  progress: number;
  duration: number;
  volume: number;
  settings: UserSettings;
  activeMood: Mood | null;
  showLyrics: boolean;
  showVideo: boolean;

  play: (song: Song, prefetchNext?: boolean) => Promise<void>;
  toggle: () => void;
  next: () => Promise<void>;
  seek: (sec: number) => void;
  setVolume: (v: number) => void;
  setSettings: (s: Partial<UserSettings>) => void;
  setActiveMood: (m: Mood | null) => void;
  toggleLyrics: () => void;
  toggleVideo: () => void;
  pushHistory: (id: string) => void;
}

export const usePlayer = create<PlayerState>()(
  persist(
    (set, get) => {
      // Wire engine -> store once (module-scoped singleton).
      if (typeof window !== 'undefined') {
        const engine = getEngine();
        engine.subscribe({
          onStatus: (s) => set({ status: s }),
          onProgress: (progress, duration) => set({ progress, duration }),
          onEnd: () => {
            const cur = get().current;
            if (cur) {
              pushHistoryLocal(cur, true).catch(() => {});
              api.recordPlay(cur.id, true).catch(() => {});
            }
            void get().next();
          },
        });
      }

      return {
        status: 'idle',
        current: null,
        queue: [],
        history: [],
        progress: 0,
        duration: 0,
        volume: 1,
        settings: { langBlend: 0.6, yearMin: 2000, yearMax: 2026 },
        activeMood: null,
        showLyrics: false,
        showVideo: false,

        play: async (song, prefetchNext = true) => {
          const engine = getEngine();
          set({ current: song, status: 'loading' });
          get().pushHistory(song.id);

          let nextSong: Song | null = null;
          if (prefetchNext) {
            try {
              const { settings, history, activeMood } = get();
              const { song: n } = await api.pick({
                years: [settings.yearMin, settings.yearMax],
                langBlend: settings.langBlend,
                moods: activeMood ? [activeMood] : undefined,
                excludeIds: [song.id, ...history.slice(0, 20)],
              });
              nextSong = n;
              set({ queue: [n] });
            } catch {
              /* best-effort */
            }
          }
          await engine.play(song, nextSong);
          pushHistoryLocal(song, false).catch(() => {});
          api.recordPlay(song.id, false).catch(() => {});
        },

        toggle: () => getEngine().toggle(),

        next: async () => {
          const q = get().queue[0];
          if (q) {
            set({ queue: get().queue.slice(1) });
            await get().play(q, true);
            return;
          }
          // Fallback: fresh pick
          const { settings, history, activeMood } = get();
          const { song } = await api.pick({
            years: [settings.yearMin, settings.yearMax],
            langBlend: settings.langBlend,
            moods: activeMood ? [activeMood] : undefined,
            excludeIds: history.slice(0, 20),
          });
          await get().play(song, true);
        },

        seek: (sec) => {
          getEngine().seek(sec);
          set({ progress: sec });
        },

        setVolume: (v) => {
          getEngine().setVolume(v);
          set({ volume: v });
        },

        setSettings: (s) => {
          set({ settings: { ...get().settings, ...s } });
          api.updateSettings(s).catch(() => {});
        },

        setActiveMood: (m) => set({ activeMood: m }),
        toggleLyrics: () => set({ showLyrics: !get().showLyrics }),
        toggleVideo: () => set({ showVideo: !get().showVideo }),

        pushHistory: (id) => {
          const h = [id, ...get().history.filter((x) => x !== id)].slice(0, 300);
          set({ history: h });
        },
      };
    },
    {
      name: 'raagam-player',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        history: s.history,
        volume: s.volume,
        settings: s.settings,
        activeMood: s.activeMood,
      }),
    },
  ),
);
