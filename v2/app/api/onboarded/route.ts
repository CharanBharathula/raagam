import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

// Flips publicMetadata.onboarded = true so middleware stops redirecting
// the user to /onboarding. Called by the onboarding page after /me/onboard.
export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const client = await clerkClient();
  await client.users.updateUserMetadata(userId, {
    publicMetadata: { onboarded: true, onboardedAt: Date.now() },
  });
  return NextResponse.json({ ok: true });
}
