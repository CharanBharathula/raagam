'use client';

import { motion, type Variants } from 'framer-motion';
import type { ReactNode } from 'react';

const container: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 16, filter: 'blur(6px)' },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { type: 'spring', stiffness: 140, damping: 18 },
  },
};

export function Stagger({
  children,
  as = 'div',
  className,
}: {
  children: ReactNode;
  as?: 'div' | 'ul' | 'section';
  className?: string;
}) {
  const Comp = motion[as] as typeof motion.div;
  return (
    <Comp variants={container} initial="hidden" animate="visible" className={className}>
      {children}
    </Comp>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={item} className={className}>
      {children}
    </motion.div>
  );
}
