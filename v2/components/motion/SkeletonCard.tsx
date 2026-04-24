import { cn } from '@/lib/utils';

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-asym-md bg-ink-100/60 border border-cream/5',
        className,
      )}
    >
      <div className="aspect-square w-full shimmer" />
      <div className="p-4 space-y-2">
        <div className="h-3 w-3/4 shimmer rounded" />
        <div className="h-2 w-1/2 shimmer rounded opacity-70" />
      </div>
    </div>
  );
}
