'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Mood, PickRequest, Song } from '@/lib/types';

export function usePick(req: PickRequest) {
  return useMutation({
    mutationFn: () => api.pick(req),
  });
}

export function useSong(id: string | null | undefined) {
  return useQuery({
    queryKey: ['song', id],
    queryFn: () => api.song(id as string),
    enabled: !!id,
    staleTime: 60 * 60 * 1000, // an hour
  });
}

export function useNewReleases(lang: 'hindi' | 'telugu') {
  return useQuery({
    queryKey: ['new-releases', lang],
    queryFn: () => api.newReleases(lang, 24),
    staleTime: 10 * 60 * 1000,
  });
}

export function useMood(mood: Mood | null, lang: 'hindi' | 'telugu') {
  return useQuery({
    queryKey: ['mood', mood, lang],
    queryFn: () => api.mood(mood as string, lang, 60),
    enabled: !!mood,
    staleTime: 10 * 60 * 1000,
  });
}

export function useSearch(q: string, lang?: 'hindi' | 'telugu') {
  return useQuery({
    queryKey: ['search', q, lang],
    queryFn: () => api.search({ q, lang }),
    enabled: q.trim().length >= 2,
    staleTime: 5 * 60 * 1000,
  });
}

export function useLyrics(lyricsId: number | null | undefined) {
  return useQuery({
    queryKey: ['lyrics', lyricsId],
    queryFn: () => api.lyrics(lyricsId as number),
    enabled: !!lyricsId,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useLikeMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ song, liked }: { song: Song; liked: boolean }) =>
      api.like(song.id, liked),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['liked'] });
    },
  });
}

export function useRecordPlay() {
  return useMutation({
    mutationFn: ({ songId, completed }: { songId: string; completed: boolean }) =>
      api.recordPlay(songId, completed),
  });
}

export function useMeSettings() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api.me(),
    staleTime: 60 * 1000,
  });
}
