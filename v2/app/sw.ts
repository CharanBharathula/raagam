/// <reference lib="webworker" />

import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import {
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  Serwist,
  StaleWhileRevalidate,
} from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Saavn / YouTube / Clerk images — SWR with LRU
    {
      matcher: /^https:\/\/(c\.saavncdn\.com|i\.ytimg\.com|img\.clerk\.com)\/.*/i,
      handler: new StaleWhileRevalidate({
        cacheName: 'raagam-images',
        plugins: [new ExpirationPlugin({ maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 30 })],
      }),
    },
    // Audio blobs from Saavn — cache-first, bounded, range-aware
    {
      matcher: /^https:\/\/aac\.saavncdn\.com\/.*/i,
      handler: new CacheFirst({
        cacheName: 'raagam-audio',
        plugins: [new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 14 })],
      }),
    },
    // API proxy — always try network first, fall back to last good response
    {
      matcher: ({ url }) => url.pathname.startsWith('/api/proxy/'),
      handler: new NetworkFirst({
        cacheName: 'raagam-api',
        networkTimeoutSeconds: 4,
        plugins: [new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 })],
      }),
    },
    // Fonts — cache aggressively
    {
      matcher: /^https:\/\/fonts\.(gstatic|googleapis)\.com\/.*/i,
      handler: new CacheFirst({
        cacheName: 'raagam-fonts',
        plugins: [new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 })],
      }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: '/offline',
        matcher: ({ request }) => request.destination === 'document',
      },
    ],
  },
});

serwist.addEventListeners();
