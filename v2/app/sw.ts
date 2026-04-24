/// <reference lib="webworker" />

import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist } from 'serwist';

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
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'raagam-images',
        expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 30 },
      },
    },
    // Audio blobs from Saavn — cache-first, bounded
    {
      matcher: /^https:\/\/aac\.saavncdn\.com\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'raagam-audio',
        expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 14 },
        rangeRequests: true,
      },
    },
    // API proxy — always try network first, fall back to last good response
    {
      matcher: ({ url }) => url.pathname.startsWith('/api/proxy/'),
      handler: 'NetworkFirst',
      options: {
        cacheName: 'raagam-api',
        networkTimeoutSeconds: 4,
        expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 },
      },
    },
    // Fonts — cache aggressively
    {
      matcher: /^https:\/\/fonts\.(gstatic|googleapis)\.com\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'raagam-fonts',
        expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
      },
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
