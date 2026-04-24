'use client';

import { SignUp } from '@clerk/nextjs';
import { AuroraBackground } from '@/components/motion/AuroraBackground';
import { Logo } from '@/components/Logo';

export default function SignUpPage() {
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden px-6">
      <AuroraBackground variant="hero" />
      <div className="relative flex flex-col items-center gap-10">
        <div className="flex flex-col items-center gap-4">
          <Logo mark size={44} />
          <h1
            className="font-display text-4xl"
            style={{ fontVariationSettings: "'opsz' 144, 'wght' 460", letterSpacing: '-0.025em' }}
          >
            make a room.
          </h1>
          <p className="label-mono">two minutes. no credit card.</p>
        </div>
        <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" afterSignUpUrl="/" />
      </div>
    </div>
  );
}
