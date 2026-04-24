'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { Home, Compass, Search, Heart, User, Music4 } from 'lucide-react';
import { Logo } from './Logo';
import { cn } from '@/lib/utils';
import { type ReactNode, useState } from 'react';
import { UserButton, SignedIn, SignedOut } from '@clerk/nextjs';

const NAV = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/discover', label: 'Discover', icon: Compass },
  { href: '/moods', label: 'Moods', icon: Music4 },
  { href: '/search', label: 'Search', icon: Search },
  { href: '/library', label: 'Library', icon: Heart },
] as const;

export function SiteFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const onAuthRoute = pathname?.startsWith('/sign-');

  if (onAuthRoute) {
    return <main className="relative min-h-screen">{children}</main>;
  }

  return (
    <div className="relative flex min-h-screen">
      <DesktopSide pathname={pathname} />
      <main className="relative flex-1 overflow-x-clip pb-32 md:pl-[232px] md:pb-24">
        {children}
      </main>
      <MobileNav pathname={pathname} />
    </div>
  );
}

// -----------------------------------------------------
// Desktop: a vertical rail with signature serif nav labels
// -----------------------------------------------------
function DesktopSide({ pathname }: { pathname: string | null }) {
  return (
    <aside
      className="fixed left-0 top-0 z-30 hidden h-screen w-[232px] flex-col border-r border-cream/5 glass-warm md:flex"
      aria-label="Primary"
    >
      <div className="flex items-center gap-3 px-6 pt-8 pb-6">
        <Logo mark size={32} />
        <span
          className="font-display text-[22px] leading-none"
          style={{ fontVariationSettings: "'opsz' 144, 'wght' 520", letterSpacing: '-0.03em' }}
        >
          raagam
        </span>
      </div>
      <div className="hairline mx-6" />
      <nav className="flex flex-col gap-1 px-3 pt-6">
        {NAV.map((n) => {
          const active = n.href === '/' ? pathname === '/' : pathname?.startsWith(n.href);
          const Icon = n.icon;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                'group relative flex items-center gap-3 rounded-xl px-4 py-2.5 transition-colors',
                active
                  ? 'bg-cream/8 text-cream'
                  : 'text-cream-muted hover:text-cream hover:bg-cream/4',
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-pill"
                  className="absolute inset-0 rounded-xl bg-gradient-to-br from-saffron/20 via-magenta/10 to-indigo-glow/10 ring-1 ring-inset ring-cream/10"
                  transition={{ type: 'spring', stiffness: 400, damping: 38 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-3">
                <Icon size={18} strokeWidth={1.6} />
                <span
                  className="font-display"
                  style={{ fontVariationSettings: "'opsz' 24, 'wght' 420", letterSpacing: '-0.015em' }}
                >
                  {n.label}
                </span>
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-6 pb-8">
        <div className="hairline mb-6" />
        <SignedIn>
          <div className="flex items-center gap-3">
            <UserButton afterSignOutUrl="/" />
            <Link href="/profile" className="label-mono hover:text-cream">
              Profile
            </Link>
          </div>
        </SignedIn>
        <SignedOut>
          <Link
            href="/sign-in"
            className="label-mono text-saffron hover:text-saffron-light"
          >
            Sign in
          </Link>
        </SignedOut>
      </div>
    </aside>
  );
}

// -----------------------------------------------------
// Mobile: a floating glass bar with a saffron active pill
// -----------------------------------------------------
function MobileNav({ pathname }: { pathname: string | null }) {
  const [hidden] = useState(false);
  return (
    <nav
      className={cn(
        'fixed inset-x-0 bottom-3 z-40 mx-auto w-[min(96vw,440px)] md:hidden',
        hidden && 'translate-y-[130%]',
      )}
      aria-label="Bottom navigation"
    >
      <div className="glass rounded-full p-1.5 flex items-center justify-between relative">
        {NAV.map((n) => {
          const active = n.href === '/' ? pathname === '/' : pathname?.startsWith(n.href);
          const Icon = n.icon;
          return (
            <Link
              key={n.href}
              href={n.href}
              className="relative flex flex-col items-center justify-center rounded-full px-3 py-2"
              aria-current={active ? 'page' : undefined}
            >
              {active && (
                <motion.span
                  layoutId="bottom-pill"
                  className="absolute inset-0 rounded-full bg-gradient-to-br from-saffron/30 via-magenta/20 to-indigo-glow/20 ring-1 ring-cream/15"
                  transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                />
              )}
              <span className="relative z-10 flex flex-col items-center">
                <Icon size={18} strokeWidth={1.8} className={active ? 'text-cream' : 'text-cream-muted'} />
                <span
                  className={cn(
                    'mt-0.5 font-mono text-[9px] uppercase tracking-[0.14em]',
                    active ? 'text-cream' : 'text-cream-muted',
                  )}
                >
                  {n.label}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
