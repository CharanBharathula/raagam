'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from '@radix-ui/react-slot';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'relative inline-flex items-center justify-center gap-2 whitespace-nowrap font-sans text-sm font-medium transition-all duration-300 ease-raaga ' +
    'disabled:pointer-events-none disabled:opacity-40 ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink',
  {
    variants: {
      variant: {
        primary:
          'bg-gradient-to-br from-saffron via-saffron-light to-magenta text-ink shadow-glow hover:brightness-110 active:scale-[0.985]',
        ghost:
          'bg-cream/5 text-cream backdrop-blur-md border border-cream/10 hover:bg-cream/8 hover:border-cream/20 active:scale-[0.985]',
        outline:
          'border border-cream/15 text-cream hover:bg-cream/5 active:scale-[0.985]',
        ink:
          'bg-ink-100 text-cream border border-cream/8 hover:bg-ink-50 active:scale-[0.985]',
        mono:
          'bg-transparent text-cream label-mono hover:text-saffron-light',
      },
      size: {
        sm: 'h-9 px-4 rounded-full text-xs',
        md: 'h-11 px-6 rounded-full',
        lg: 'h-14 px-8 rounded-full text-base',
        icon: 'h-11 w-11 rounded-full',
        pill: 'h-10 px-5 rounded-full',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
