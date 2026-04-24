import { Logo } from '@/components/Logo';

export const dynamic = 'force-static';

export default function OfflinePage() {
  return (
    <div className="grid min-h-screen place-items-center px-6 text-center">
      <div>
        <Logo mark size={48} className="mx-auto" />
        <p className="label-mono mt-6">airplane mode</p>
        <h1
          className="mt-3 font-display text-5xl"
          style={{ fontVariationSettings: "'opsz' 144, 'wght' 460", letterSpacing: '-0.025em' }}
        >
          nothing reaching <em className="text-gradient not-italic">the antenna.</em>
        </h1>
        <p className="mt-4 max-w-md mx-auto text-cream-dim">
          Downloaded songs and your library still work offline. Reconnect to pick fresh picks.
        </p>
      </div>
    </div>
  );
}
