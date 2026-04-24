# Raagam v2

Production rewrite of Raagam — Telugu + Bollywood music streaming. Legacy vanilla app still lives at the repo root.

## Stack

- **Next.js 15** (App Router) + React 19 + TypeScript
- **Tailwind v4** + shadcn/ui
- **Framer Motion** / GSAP / Motion One / Lenis
- **React Three Fiber + Drei** (player 3D scenes)
- **Howler.js** (audio) + **Vidstack** (video) + **Wavesurfer** (scrubber)
- **Zustand** (player state) + **TanStack Query** (remote)
- **Cloudflare Workers + D1** (edge backend)
- **Meilisearch Cloud** (instant search)
- **Clerk** (auth)
- **Dexie** (IndexedDB for offline)
- Deployed to **Vercel**

## Setup

```bash
# 1. Install deps
cd v2
npm install

# 2. Set up env
cp .env.example .env.local
# Fill in Clerk + Meilisearch keys

# 3. Bootstrap D1 schema (local)
npm run worker:db:local

# 4. Migrate legacy DB -> D1-compatible SQL
npm run migrate:prepare
npm run migrate:local

# 5. Run worker + web in separate terminals
npm run worker:dev   # :8787
npm run dev          # :3000
```

## Architecture

```
v2/
├── app/              Next.js App Router (layout, home, player, search, library, profile, discover, auth)
├── components/       Reusable UI (NowPlayingBar, PlayerStage, DiscoverDial, HomeBento, motion primitives)
├── lib/
│   ├── api/          Worker client + TanStack Query hooks
│   ├── audio/        Howler wrapper + AnalyserNode tap + crossfade engine
│   ├── data/         Dexie (IndexedDB) schemas for liked / history / downloads
│   └── store/        Zustand player store
├── worker/           Cloudflare Worker (Hono) + D1 schema + Blockbuster Pick algorithm
├── scripts/          Legacy-DB -> D1 migration
└── public/           Static assets
```

## Key features

- **Blockbuster Pick v2** — weighted reservoir sample on 2000-song candidate pool. Year range, language blend, era bias, popularity proxy, freshness boost, anti-repeat, taste-vector match.
- **No bundled DB** — old app shipped ~33 MB of JS for the song catalog. v2 queries D1 at the edge in ~50 ms.
- **Pre-resolved YouTube IDs + LRC IDs** — nightly cron enriches D1, so tapping play never waits on external lookups.
- **Rich motion** — 3D tilt cards, aurora backgrounds, spring-physics buttons, staggered reveal, View Transitions between pages.
- **R3F player stage** — particle field reacts to FFT of the current song.
- **Offline** — Workbox + Dexie Blob storage for downloaded songs.

## Dropped from v1

- Playlists, albums, movie detail pages, Collections, Eras tiles — replaced by Mood radios + Discover dial + Search facets.
