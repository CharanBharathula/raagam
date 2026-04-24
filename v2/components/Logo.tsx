import { cn } from '@/lib/utils';

interface LogoProps {
  size?: number;
  className?: string;
  mark?: boolean;
}

/**
 * The mark is a stylized tanpura string running through a crescent —
 * evokes raga + night at once. Rendered as pure SVG so it animates.
 */
export function Logo({ size = 28, className, mark = false }: LogoProps) {
  if (mark) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        className={cn('text-cream', className)}
        aria-label="Raagam"
      >
        <defs>
          <linearGradient id="raaga-mark" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#F59E0B" />
            <stop offset="50%" stopColor="#E11D74" />
            <stop offset="100%" stopColor="#4F39E8" />
          </linearGradient>
        </defs>
        <circle cx="24" cy="24" r="22" fill="none" stroke="url(#raaga-mark)" strokeWidth="1.5" />
        <path
          d="M14 24 Q 24 6, 34 24 Q 24 42, 14 24 Z"
          fill="url(#raaga-mark)"
          opacity="0.9"
        />
        <circle cx="24" cy="24" r="2.5" fill="#F4EEE4" />
        <line
          x1="24"
          y1="2"
          x2="24"
          y2="46"
          stroke="#F4EEE4"
          strokeWidth="0.6"
          strokeDasharray="2 3"
          opacity="0.4"
        />
      </svg>
    );
  }

  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <Logo mark size={size} />
      <span
        className="font-display leading-none"
        style={{
          fontVariationSettings: "'opsz' 144, 'wght' 500",
          fontSize: size * 0.78,
          letterSpacing: '-0.03em',
        }}
      >
        raagam
      </span>
    </span>
  );
}
