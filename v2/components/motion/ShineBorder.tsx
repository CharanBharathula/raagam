'use client';

import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  className?: string;
  borderRadius?: string;
  duration?: number;
}

/**
 * Animated conic-gradient border. Renders as two layered boxes —
 * the outer one has a rotating conic gradient; inner is opaque ink.
 */
export function ShineBorder({
  children,
  className,
  borderRadius = '28px 6px 28px 6px',
  duration = 8,
}: Props) {
  return (
    <div
      className={cn('relative isolate p-[1px]', className)}
      style={{ borderRadius }}
    >
      <span
        className="absolute inset-0"
        style={{
          borderRadius,
          background:
            'conic-gradient(from 0deg, transparent 0deg, #F59E0B 60deg, transparent 120deg, #E11D74 240deg, transparent 300deg)',
          animation: `aurora-spin ${duration}s linear infinite`,
        }}
        aria-hidden
      />
      <div
        className="relative glass-warm overflow-hidden"
        style={{ borderRadius: `calc(${borderRadius} - 1px)` }}
      >
        {children}
      </div>
    </div>
  );
}
