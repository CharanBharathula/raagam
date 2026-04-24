'use client';

import { cn } from '@/lib/utils';

interface AuroraProps {
  className?: string;
  variant?: 'soft' | 'rotate' | 'hero';
}

/**
 * Layered aurora that sits behind hero sections.
 * `hero`   — full-bleed, slow-rotating conic gradient
 * `rotate` — same but scaled-out, used behind player
 * `soft`   — stationary radial glows (cheapest, reusable inside cards)
 */
export function AuroraBackground({ className, variant = 'soft' }: AuroraProps) {
  if (variant === 'soft') {
    return (
      <div
        className={cn('pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]', className)}
        aria-hidden
      >
        <div className="aurora-static" />
      </div>
    );
  }
  if (variant === 'hero') {
    return (
      <div
        className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
        aria-hidden
      >
        <div className="aurora" />
        <div className="absolute inset-0 bg-ink-fade" />
      </div>
    );
  }
  return (
    <div className={cn('pointer-events-none absolute -inset-1/3 overflow-hidden', className)} aria-hidden>
      <div className="aurora opacity-70" />
    </div>
  );
}
