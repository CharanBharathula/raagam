import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function getDecade(year: number): string {
  if (year >= 2020) return '2020s';
  if (year >= 2010) return '2010s';
  if (year >= 2000) return '2000s';
  return 'older';
}

export function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Late night vibes';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Time to unwind';
}

export function parseSyncedLyrics(lrc: string): Array<{ time: number; text: string }> {
  const lines: Array<{ time: number; text: string }> = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const m = raw.match(/^\[(\d{2}):(\d{2})(?:[.:](\d{1,3}))?\](.*)$/);
    if (!m) continue;
    const mm = Number(m[1]);
    const ss = Number(m[2]);
    const frac = m[3] ? Number(`0.${m[3]}`) : 0;
    const text = m[4].trim();
    const time = mm * 60 + ss + frac;
    lines.push({ time, text });
  }
  return lines.sort((a, b) => a.time - b.time);
}

export function findActiveLyricIndex(
  lines: Array<{ time: number }>,
  currentTime: number,
): number {
  if (!lines.length) return -1;
  let lo = 0;
  let hi = lines.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= currentTime) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return idx;
}

export function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.replace('#', '').match(/^([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
