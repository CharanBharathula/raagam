import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { AuroraBackground } from '@/components/motion/AuroraBackground';

export default function NotFound() {
  return (
    <div className="relative grid min-h-[calc(100vh-72px)] place-items-center px-6">
      <AuroraBackground variant="soft" />
      <div className="relative text-center">
        <Logo mark size={48} className="mx-auto" />
        <p className="label-mono mt-6">404 · off the record</p>
        <h1
          className="mt-3 font-display text-5xl"
          style={{ fontVariationSettings: "'opsz' 144, 'wght' 460", letterSpacing: '-0.025em' }}
        >
          this track is silent.
        </h1>
        <Link
          href="/"
          className="mt-8 inline-flex items-center rounded-full border border-cream/10 bg-cream/5 px-5 py-2 text-sm hover:bg-cream/10"
        >
          ← Back home
        </Link>
      </div>
    </div>
  );
}
