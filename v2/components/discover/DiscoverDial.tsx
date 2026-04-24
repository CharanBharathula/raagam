'use client';

import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { type PointerEvent as ReactPointerEvent, useRef, useState } from 'react';
import { Play, Dice5 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePlayer } from '@/lib/store/player';
import { api } from '@/lib/api/client';

interface Props {
  yearMin: number;
  yearMax: number;
  onYearChange: (min: number, max: number) => void;
  langBlend: number;
  onLangBlendChange: (v: number) => void;
}

const RANGE_MIN = 2000;
const RANGE_MAX = 2026;
const TOTAL_YEARS = RANGE_MAX - RANGE_MIN;

/**
 * A compass-meets-turntable dial. Two arcs on a circular track:
 *   • Year arc (saffron → magenta)
 *   • Language blend (rotating inner ring)
 * Center = play button.
 *
 * Built with pure SVG + framer-motion. Drag the handles to adjust.
 */
export function DiscoverDial({
  yearMin,
  yearMax,
  onYearChange,
  langBlend,
  onLangBlendChange,
}: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<'min' | 'max' | 'blend' | null>(null);
  const [busy, setBusy] = useState(false);

  const play = usePlayer((s) => s.play);
  const settings = usePlayer((s) => s.settings);

  const size = 420;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = 175;
  const innerR = 138;

  const minAngle = yearToAngle(yearMin);
  const maxAngle = yearToAngle(yearMax);

  const onPointerDown = (handle: 'min' | 'max' | 'blend') => (e: ReactPointerEvent<SVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setActive(handle);
  };
  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!active || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const dx = e.clientX - r.left - cx * (r.width / size);
    const dy = e.clientY - r.top - cy * (r.height / size);
    const a = ((Math.atan2(dy, dx) * 180) / Math.PI + 360 + 90) % 360;

    if (active === 'min') {
      const year = Math.max(RANGE_MIN, Math.min(yearMax - 1, angleToYear(a)));
      onYearChange(year, yearMax);
    } else if (active === 'max') {
      const year = Math.max(yearMin + 1, Math.min(RANGE_MAX, angleToYear(a)));
      onYearChange(yearMin, year);
    } else if (active === 'blend') {
      const v = Math.max(0, Math.min(1, a / 360));
      onLangBlendChange(v);
    }
  };
  const onPointerUp = () => setActive(null);

  const onPlay = async () => {
    setBusy(true);
    try {
      const { song } = await api.pick({
        years: [yearMin, yearMax],
        langBlend,
      });
      await play(song);
      // Route push handled by parent after pick
      window.location.assign('/player');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative mx-auto w-full max-w-[460px]">
      {/* pulsing halos */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="size-[440px] rounded-full bg-saffron/10 blur-[80px] animate-pulse-glow" />
      </div>

      <motion.svg
        ref={ref}
        viewBox={`0 0 ${size} ${size}`}
        className="relative z-10 w-full select-none touch-none"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 180, damping: 22 }}
      >
        <defs>
          <linearGradient id="yearArc" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#F59E0B" />
            <stop offset="50%" stopColor="#E11D74" />
            <stop offset="100%" stopColor="#4F39E8" />
          </linearGradient>
          <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.9" />
            <stop offset="60%" stopColor="#E11D74" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#4F39E8" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* outer ticks — one per year */}
        <g>
          {Array.from({ length: TOTAL_YEARS + 1 }).map((_, i) => {
            const a = (i / TOTAL_YEARS) * 360 - 90;
            const r1 = outerR + 14;
            const r2 = outerR + 22;
            const x1 = cx + Math.cos((a * Math.PI) / 180) * r1;
            const y1 = cy + Math.sin((a * Math.PI) / 180) * r1;
            const x2 = cx + Math.cos((a * Math.PI) / 180) * r2;
            const y2 = cy + Math.sin((a * Math.PI) / 180) * r2;
            const major = i % 5 === 0;
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={major ? '#F4EEE4' : '#F4EEE4'}
                strokeWidth={major ? 1.6 : 0.8}
                opacity={major ? 0.9 : 0.35}
                strokeLinecap="round"
              />
            );
          })}
        </g>

        {/* major year labels */}
        {[2000, 2005, 2010, 2015, 2020, 2025].map((y) => {
          const a = (yearToAngle(y) * Math.PI) / 180;
          const r = outerR + 38;
          const x = cx + Math.cos(a - Math.PI / 2) * r;
          const yPos = cy + Math.sin(a - Math.PI / 2) * r;
          return (
            <text
              key={y}
              x={x}
              y={yPos + 4}
              textAnchor="middle"
              className="fill-cream-muted"
              fontSize={11}
              fontFamily="var(--font-mono)"
            >
              {y}
            </text>
          );
        })}

        {/* year arc (between handles) */}
        <path
          d={arcPath(cx, cy, outerR, minAngle, maxAngle)}
          stroke="url(#yearArc)"
          strokeWidth={5}
          fill="none"
          strokeLinecap="round"
        />

        {/* background ring */}
        <circle cx={cx} cy={cy} r={outerR} stroke="#F4EEE4" strokeOpacity={0.08} strokeWidth={1.2} fill="none" />
        <circle cx={cx} cy={cy} r={innerR} stroke="#F4EEE4" strokeOpacity={0.06} strokeWidth={1} fill="none" strokeDasharray="3 5" />

        {/* min handle */}
        <Handle
          cx={cx}
          cy={cy}
          r={outerR}
          angle={minAngle}
          color="#F59E0B"
          label={String(yearMin)}
          active={active === 'min'}
          onPointerDown={onPointerDown('min')}
        />
        {/* max handle */}
        <Handle
          cx={cx}
          cy={cy}
          r={outerR}
          angle={maxAngle}
          color="#4F39E8"
          label={String(yearMax)}
          active={active === 'max'}
          onPointerDown={onPointerDown('max')}
        />

        {/* language blend ring (inner) */}
        <g transform={`rotate(${langBlend * 360}, ${cx}, ${cy})`}>
          <path
            d={arcPath(cx, cy, innerR, 0, 180)}
            stroke="#F59E0B"
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
            opacity={0.7}
          />
          <path
            d={arcPath(cx, cy, innerR, 180, 360)}
            stroke="#F43F9D"
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
            opacity={0.7}
          />
          <Handle
            cx={cx}
            cy={cy}
            r={innerR}
            angle={0}
            color="#F5E6B3"
            label=""
            active={active === 'blend'}
            onPointerDown={onPointerDown('blend')}
            small
          />
        </g>

        {/* center disc — play button area */}
        <circle cx={cx} cy={cy} r={92} fill="url(#centerGlow)" opacity={0.5} />
        <circle cx={cx} cy={cy} r={70} fill="#120e1c" stroke="#F4EEE4" strokeOpacity={0.12} />

        {/* center label */}
        <text
          x={cx}
          y={cy - 8}
          textAnchor="middle"
          className="fill-cream-muted"
          fontSize={9}
          letterSpacing="3"
          fontFamily="var(--font-mono)"
        >
          DROP THE NEEDLE
        </text>
        <text
          x={cx}
          y={cy + 20}
          textAnchor="middle"
          className="fill-cream"
          fontSize={22}
          fontFamily="var(--font-display)"
          fontStyle="italic"
          style={{ fontVariationSettings: "'opsz' 144, 'wght' 440" }}
        >
          {yearMin}–{yearMax}
        </text>
      </motion.svg>

      {/* Play button centered over the SVG */}
      <button
        type="button"
        onClick={onPlay}
        disabled={busy}
        className={cn(
          'group absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2',
          'size-[112px] rounded-full bg-gradient-to-br from-saffron via-magenta to-indigo-glow',
          'text-ink shadow-glow ring-1 ring-cream/25 transition-transform',
          'hover:scale-105 active:scale-95 disabled:opacity-70',
        )}
        aria-label="Play a random blockbuster"
      >
        <span className="absolute inset-0 rounded-full bg-gradient-to-br from-saffron to-magenta blur-2xl opacity-60 group-hover:opacity-100 transition-opacity" />
        <span className="relative flex flex-col items-center justify-center gap-1.5">
          {busy ? (
            <Dice5 size={28} className="animate-spin" />
          ) : (
            <Play size={30} fill="currentColor" />
          )}
          <span className="font-mono text-[9px] uppercase tracking-[0.2em]">Play</span>
        </span>
      </button>

      {/* Language blend label */}
      <div className="mt-8 flex items-center justify-between text-[11px]">
        <span className="label-mono">తెలుగు · Telugu</span>
        <div className="flex-1 mx-4 h-px bg-gradient-to-r from-saffron via-magenta to-indigo-glow opacity-40" />
        <span className="label-mono">हिन्दी · Hindi</span>
      </div>
    </div>
  );
}

function Handle({
  cx,
  cy,
  r,
  angle,
  color,
  label,
  active,
  onPointerDown,
  small,
}: {
  cx: number;
  cy: number;
  r: number;
  angle: number;
  color: string;
  label: string;
  active: boolean;
  onPointerDown: (e: ReactPointerEvent<SVGElement>) => void;
  small?: boolean;
}) {
  const a = ((angle - 90) * Math.PI) / 180;
  const x = cx + Math.cos(a) * r;
  const y = cy + Math.sin(a) * r;
  const s = small ? 9 : 13;
  return (
    <g style={{ cursor: 'grab' }} onPointerDown={onPointerDown}>
      <circle cx={x} cy={y} r={s + 6} fill={color} opacity={0.25} />
      <circle
        cx={x}
        cy={y}
        r={s}
        fill={color}
        stroke="#0a0712"
        strokeWidth={2}
        style={{
          filter: active ? `drop-shadow(0 0 14px ${color})` : `drop-shadow(0 0 6px ${color}88)`,
          transition: 'filter 0.2s',
        }}
      />
      {label && (
        <text
          x={x}
          y={y - s - 10}
          textAnchor="middle"
          className="fill-cream"
          fontSize={11}
          fontFamily="var(--font-mono)"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {label}
        </text>
      )}
    </g>
  );
}

function yearToAngle(year: number): number {
  const t = (year - RANGE_MIN) / TOTAL_YEARS;
  return t * 360;
}

function angleToYear(angle: number): number {
  const t = angle / 360;
  return Math.round(RANGE_MIN + t * TOTAL_YEARS);
}

function arcPath(cx: number, cy: number, r: number, a1: number, a2: number): string {
  const start = polar(cx, cy, r, a1 - 90);
  const end = polar(cx, cy, r, a2 - 90);
  const large = (a2 - a1 + 360) % 360 > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`;
}
function polar(cx: number, cy: number, r: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
}
