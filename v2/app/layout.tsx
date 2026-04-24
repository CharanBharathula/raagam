import type { Metadata, Viewport } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Providers } from '@/lib/providers';
import { fontClasses } from '@/lib/fonts';
import { SiteFrame } from '@/components/SiteFrame';
import { NowPlayingBar } from '@/components/NowPlayingBar';
import { SmoothScroll } from '@/components/SmoothScroll';
import { LibrarySync } from '@/components/LibrarySync';
import './globals.css';

export const metadata: Metadata = {
  title: 'Raagam — A music room for the night',
  description:
    'Telugu + Bollywood blockbusters, 2000 to 2026. Weighted discovery, synced lyrics, immersive player.',
  applicationName: 'Raagam',
  manifest: '/manifest.webmanifest',
  appleWebApp: { title: 'Raagam', statusBarStyle: 'black-translucent', capable: true },
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/icon-192.png',
  },
  openGraph: {
    title: 'Raagam',
    description: 'A music room for the night — Telugu + Bollywood blockbusters, 2000–2026.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#0a0712',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: '#F59E0B',
          colorBackground: '#0a0712',
          colorText: '#F4EEE4',
          colorInputBackground: '#120e1c',
          colorInputText: '#F4EEE4',
          borderRadius: '12px',
        },
      }}
    >
      <html lang="en" className={fontClasses} suppressHydrationWarning>
        <body className="grain relative min-h-screen antialiased">
          <Providers>
            <SmoothScroll />
            <LibrarySync />
            <SiteFrame>{children}</SiteFrame>
            <NowPlayingBar />
          </Providers>
          <Analytics />
          <SpeedInsights />
        </body>
      </html>
    </ClerkProvider>
  );
}
