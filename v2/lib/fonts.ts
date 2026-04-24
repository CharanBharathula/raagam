import { Fraunces, Instrument_Sans, Fragment_Mono, Noto_Sans_Telugu, Hind_Siliguri } from 'next/font/google';

export const fraunces = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display',
  axes: ['opsz', 'SOFT'],
});

export const instrumentSans = Instrument_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

export const fragmentMono = Fragment_Mono({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-mono',
});

export const notoSansTelugu = Noto_Sans_Telugu({
  subsets: ['telugu'],
  display: 'swap',
  variable: '--font-telugu',
});

export const hindSiliguri = Hind_Siliguri({
  subsets: ['latin', 'devanagari'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-hindi',
});

export const fontClasses = [
  fraunces.variable,
  instrumentSans.variable,
  fragmentMono.variable,
  notoSansTelugu.variable,
  hindSiliguri.variable,
].join(' ');
