import type { Song } from '@/lib/types';
import { saveDownload, deleteDownload, getDownload } from '@/lib/data/dexie';

export type DownloadStatus = 'idle' | 'downloading' | 'downloaded' | 'error';

export async function downloadSong(
  song: Song,
  onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
  const res = await fetch(song.audioUrl);
  if (!res.ok || !res.body) throw new Error(`download_failed_${res.status}`);

  const total = Number(res.headers.get('content-length') ?? 0);
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.byteLength;
      onProgress?.(loaded, total);
    }
  }

  const blob = new Blob(chunks as BlobPart[], {
    type: res.headers.get('content-type') ?? 'audio/mp4',
  });
  await saveDownload(song, blob);
}

export async function removeDownload(id: string): Promise<void> {
  await deleteDownload(id);
}

export async function isDownloaded(id: string): Promise<boolean> {
  const r = await getDownload(id);
  return !!r;
}
