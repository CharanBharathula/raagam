import type { LyricsPayload, PickRequest, PickResult, Song, UserSettings } from '@/lib/types';

// In the browser, hit the Next.js rewrite (/api/proxy/*) so auth cookies
// and same-origin rules are preserved. Server-side code calls the worker
// directly via NEXT_PUBLIC_WORKER_URL.
const BASE = typeof window === 'undefined'
  ? process.env.NEXT_PUBLIC_WORKER_URL || 'http://127.0.0.1:8787'
  : '/api/proxy';

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    credentials: 'include',
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) msg = body.error;
    } catch {}
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  request,

  pick: (req: PickRequest) =>
    request<PickResult>('/pick', { method: 'POST', body: JSON.stringify(req) }),

  song: (id: string) =>
    request<{ song: Song }>(`/songs/${encodeURIComponent(id)}`).then((r) => r.song),

  songsBatch: (ids: string[]) =>
    request<{ songs: Song[] }>('/songs/batch', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }).then((r) => r.songs),

  newReleases: (lang: 'hindi' | 'telugu', limit = 20) =>
    request<{ songs: Song[] }>(
      `/new-releases?lang=${lang}&limit=${limit}`,
    ).then((r) => r.songs),

  mood: (mood: string, lang: 'hindi' | 'telugu', limit = 50) =>
    request<{ songs: Song[] }>(
      `/moods/${encodeURIComponent(mood)}?lang=${lang}&limit=${limit}`,
    ).then((r) => r.songs),

  search: (params: { q: string; lang?: 'hindi' | 'telugu'; yearMin?: number; yearMax?: number }) => {
    const qs = new URLSearchParams();
    qs.set('q', params.q);
    if (params.lang) qs.set('lang', params.lang);
    if (params.yearMin) qs.set('yearMin', String(params.yearMin));
    if (params.yearMax) qs.set('yearMax', String(params.yearMax));
    return request<{ songs: Song[] }>(`/search?${qs.toString()}`).then((r) => r.songs);
  },

  lyrics: (lyricsId: number) =>
    request<LyricsPayload>(`/lyrics/${lyricsId}`),

  me: () => request<{ user: UserSettings | null }>('/me'),

  updateSettings: (s: Partial<UserSettings>) =>
    request<{ ok: boolean }>('/me/settings', { method: 'POST', body: JSON.stringify(s) }),

  like: (songId: string, liked: boolean) =>
    request<{ ok: boolean }>('/me/like', {
      method: 'POST',
      body: JSON.stringify({ songId, liked }),
    }),

  recordPlay: (songId: string, completed: boolean) =>
    request<{ ok: boolean }>('/me/history', {
      method: 'POST',
      body: JSON.stringify({ songId, completed }),
    }),
};
