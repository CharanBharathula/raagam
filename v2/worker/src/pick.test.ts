// Vitest — exercises Blockbuster Pick v2 against a fake D1.
// Focuses on scoring invariants, not concrete picks (Math.random),
// so each test seeds Math.random deterministically.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pickBlockbuster } from './pick';
import type { Env, SongRow } from './types';

// ---------------------------------------------------------------
// Fake D1 — supports only the 2 prepare/bind/all shapes `pick.ts` uses.
// ---------------------------------------------------------------
function makeEnv(
  songs: SongRow[],
  user?: { taste_vector: string },
  history: Array<{ id: string; artists: string; album: string | null }> = [],
): Env {
  const prepare = (sql: string) => {
    let boundArgs: any[] = [];
    const stmt: any = {
      bind: (...a: any[]) => {
        boundArgs = a;
        return stmt;
      },
      all: async () => {
        if (sql.includes('FROM songs')) {
          // args = [yearMin, yearMax, ...langs, minDuration, limit]
          const [yearMin, yearMax, ...rest] = boundArgs;
          const limit = rest[rest.length - 1] as number;
          const minDuration = rest[rest.length - 2] as number;
          const langs = rest.slice(0, rest.length - 2) as string[];
          const filtered = songs
            .filter((s) => s.year >= yearMin && s.year <= yearMax)
            .filter((s) => langs.includes(s.language))
            .filter((s) => s.duration >= minDuration)
            .sort((a, b) => b.popularity - a.popularity)
            .slice(0, limit);
          return { results: filtered };
        }
        if (sql.includes('FROM history')) return { results: history };
        return { results: [] };
      },
      first: async () => (sql.includes('taste_vector') ? (user ?? null) : null),
      run: async () => ({ meta: { changes: 1 } }),
    };
    return stmt;
  };

  return {
    DB: { prepare } as unknown as D1Database,
    CACHE: {} as KVNamespace,
    LRCLIB_ENDPOINT: 'x',
    YT_PROXY_ENDPOINT: 'x',
  };
}

function row(partial: Partial<SongRow>): SongRow {
  return {
    id: partial.id ?? 'x',
    name: partial.name ?? 'Track',
    artists: partial.artists ?? 'Some Artist',
    album: partial.album ?? 'Some Album',
    year: partial.year ?? 2015,
    duration: partial.duration ?? 200,
    language: partial.language ?? 'hindi',
    audio_url: 'https://x/a.mp4',
    image_url: null,
    tags: partial.tags ?? null,
    video_id: null,
    lyrics_id: null,
    color_primary: null,
    color_dark: null,
    color_light: null,
    popularity: partial.popularity ?? 50,
    play_count: 0,
    like_count: 0,
    source: 'saavn',
    enriched_at: null,
    created_at: 0,
  };
}

beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('pickBlockbuster', () => {
  it('respects year window (hard filter)', async () => {
    const out = await pickBlockbuster(
      makeEnv([
        row({ id: 'a', year: 1999, popularity: 100 }),
        row({ id: 'b', year: 2005, popularity: 20 }),
      ]),
      { years: [2000, 2026] },
    );
    expect(out.song.id).toBe('b');
  });

  it('favors higher popularity when nothing else differs', async () => {
    // Mock Math.random so the reservoir sampling is deterministic.
    let call = 0;
    (Math.random as ReturnType<typeof vi.spyOn>).mockImplementation(() => {
      call++;
      return 0.5;
    });
    const out = await pickBlockbuster(
      makeEnv([
        row({ id: 'low', year: 2010, popularity: 10 }),
        row({ id: 'high', year: 2010, popularity: 95 }),
      ]),
      { years: [2000, 2026] },
    );
    // Both have identical random; higher score -> key higher.
    expect(out.song.id).toBe('high');
  });

  it('applies anti-repeat penalty for same artist', async () => {
    const out = await pickBlockbuster(
      makeEnv(
        [
          row({ id: 'same', year: 2015, popularity: 70, artists: 'Arijit Singh' }),
          row({ id: 'new',  year: 2015, popularity: 50, artists: 'Other Person' }),
        ],
        { taste_vector: '{}' },
        // history: last played by same artist
        [{ id: 'h1', artists: 'Arijit Singh', album: 'Old' }],
      ),
      { years: [2000, 2026], userId: 'u1' },
    );
    // With a 10-point penalty on 'same', 'new' should win.
    expect(out.song.id).toBe('new');
  });

  it('mood requested + no match downweights heavily', async () => {
    const out = await pickBlockbuster(
      makeEnv([
        row({ id: 'match',   year: 2020, popularity: 50, tags: '["party"]' }),
        row({ id: 'nomatch', year: 2020, popularity: 98, tags: null }),
      ]),
      { years: [2000, 2026], moods: ['party'] },
    );
    // `match` gets +mood boost, `nomatch` gets score * 0.3.
    expect(out.song.id).toBe('match');
  });

  it('language blend biases toward the requested side', async () => {
    // Force many candidates so weighting actually matters.
    const songs: SongRow[] = [];
    for (let i = 0; i < 10; i++) songs.push(row({ id: `h${i}`, year: 2015, popularity: 50, language: 'hindi' }));
    for (let i = 0; i < 10; i++) songs.push(row({ id: `t${i}`, year: 2015, popularity: 50, language: 'telugu' }));
    (Math.random as ReturnType<typeof vi.spyOn>).mockReturnValue(0.5);

    const hindiHeavy = await pickBlockbuster(makeEnv(songs), { langBlend: 0.95 });
    expect(hindiHeavy.song.language).toBe('hindi');

    const teluguHeavy = await pickBlockbuster(makeEnv(songs), { langBlend: 0.05 });
    expect(teluguHeavy.song.language).toBe('telugu');
  });

  it('excludeIds actually excludes', async () => {
    const out = await pickBlockbuster(
      makeEnv([
        row({ id: 'a', year: 2020, popularity: 100 }),
        row({ id: 'b', year: 2020, popularity: 20 }),
      ]),
      { years: [2000, 2026], excludeIds: ['a'] },
    );
    expect(out.song.id).toBe('b');
  });

  it('does not crash on an empty taste vector', async () => {
    const out = await pickBlockbuster(
      makeEnv([row({ id: 'x', year: 2020, popularity: 50 })], { taste_vector: '{}' }),
      { years: [2000, 2026], userId: 'u1' },
    );
    expect(out.song.id).toBe('x');
  });

  it('taste match for a top artist wins over a higher-popularity non-match', async () => {
    const taste = { artists: { 'sid sriram': 15 }, decades: {}, moods: {}, langs: {} };
    const out = await pickBlockbuster(
      makeEnv(
        [
          row({ id: 'popular-noise', year: 2020, popularity: 95, artists: 'Someone Unknown' }),
          row({ id: 'taste-match',   year: 2020, popularity: 40, artists: 'Sid Sriram' }),
        ],
        { taste_vector: JSON.stringify(taste) },
      ),
      { years: [2000, 2026], userId: 'u1' },
    );
    expect(out.song.id).toBe('taste-match');
  });
});
