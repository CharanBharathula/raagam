import { Logo } from '@/components/Logo';

export default function Loading() {
  return (
    <div className="grid min-h-[calc(100vh-72px)] place-items-center">
      <div className="flex flex-col items-center gap-4">
        <Logo mark size={42} className="animate-breathe" />
        <p className="label-mono">tuning…</p>
      </div>
    </div>
  );
}
