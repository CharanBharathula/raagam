'use client';

import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { type ReactNode, useRef } from 'react';
import { cn } from '@/lib/utils';

interface TiltCardProps {
  children: ReactNode;
  className?: string;
  intensity?: number; // 0..1, how much it rotates
  glare?: boolean;
}

/**
 * 3D magnetic tilt with a moving glare highlight. Desktop pointer only —
 * touch users get the element flat (no tilt on small screens).
 */
export function TiltCard({ children, className, intensity = 1, glare = true }: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0);
  const py = useMotionValue(0);

  const sx = useSpring(px, { stiffness: 180, damping: 20, mass: 0.3 });
  const sy = useSpring(py, { stiffness: 180, damping: 20, mass: 0.3 });

  const rotateX = useTransform(sy, [-0.5, 0.5], [10 * intensity, -10 * intensity]);
  const rotateY = useTransform(sx, [-0.5, 0.5], [-10 * intensity, 10 * intensity]);
  const glareX = useTransform(sx, [-0.5, 0.5], ['20%', '80%']);
  const glareY = useTransform(sy, [-0.5, 0.5], ['20%', '80%']);

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width - 0.5);
    py.set((e.clientY - r.top) / r.height - 0.5);
  };

  const onPointerLeave = () => {
    px.set(0);
    py.set(0);
  };

  return (
    <motion.div
      ref={ref}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      style={{ rotateX, rotateY, transformPerspective: 1200, transformStyle: 'preserve-3d' }}
      className={cn('relative will-change-transform', className)}
    >
      <div style={{ transform: 'translateZ(0.01px)' }}>{children}</div>
      {glare && (
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-[inherit]"
          style={{
            background: `radial-gradient(circle at ${glareX.get()} ${glareY.get()}, rgba(255,255,255,0.18), transparent 50%)`,
            mixBlendMode: 'overlay',
          }}
          animate={{
            background: [
              `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.14), transparent 55%)`,
              `radial-gradient(circle at 70% 70%, rgba(255,255,255,0.14), transparent 55%)`,
            ],
          }}
          transition={{ duration: 6, repeat: Infinity, repeatType: 'reverse' }}
        />
      )}
    </motion.div>
  );
}
