'use client';

import * as SliderPrimitive from '@radix-ui/react-slider';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export const Slider = forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn('relative flex w-full touch-none select-none items-center', className)}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-cream/10">
      <SliderPrimitive.Range className="absolute h-full bg-gradient-to-r from-saffron via-magenta to-indigo-glow" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      className="block h-3.5 w-3.5 rounded-full bg-cream shadow-glow transition-transform duration-200 hover:scale-110 focus-visible:scale-110"
      aria-label="Progress"
    />
  </SliderPrimitive.Root>
));
Slider.displayName = 'Slider';
