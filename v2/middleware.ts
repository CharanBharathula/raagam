import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isPublic = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/offline',
  '/api/clerk/webhook',
  '/api/proxy/health',
]);

const isOnboardingRoute = createRouteMatcher(['/onboarding', '/api/onboarded']);

export default clerkMiddleware(async (auth, req) => {
  const { userId, sessionClaims } = await auth();

  // Gate protected routes explicitly — redirect unauthed users to /sign-in
  // (Clerk's auth.protect() defaults to a 404 in middleware on v6, which
  // we never want).
  if (!isPublic(req) && !userId) {
    const signIn = req.nextUrl.clone();
    signIn.pathname = '/sign-in';
    signIn.searchParams.set('redirect_url', req.nextUrl.pathname);
    return NextResponse.redirect(signIn);
  }

  if (!userId) return NextResponse.next();

  // Force fresh users through onboarding before they reach the rest of
  // the app. `onboarded` is set in publicMetadata after /me/onboard.
  const claims = sessionClaims as Record<string, unknown> | null;
  const publicMetadata = (claims?.publicMetadata ?? claims?.public_metadata) as
    | { onboarded?: boolean }
    | undefined;
  const onboarded = publicMetadata?.onboarded === true;

  if (!onboarded && !isOnboardingRoute(req) && !isPublic(req)) {
    const url = req.nextUrl.clone();
    url.pathname = '/onboarding';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
