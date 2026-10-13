import { toResultsFile } from '../domain/attempts';
import type { Attempt } from '../domain/types';

export interface ShareNav {
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function buildResultsFile(attempts: readonly Attempt[], now: Date): File | null {
  const results = toResultsFile(attempts, now.toISOString());
  if (results.attempts.length === 0) return null;
  const day = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const stamp = `${day}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return new File([JSON.stringify(results, null, 1)], `results-${stamp}.json`, {
    type: 'application/json',
  });
}

/** Share sheet (AirDrop) first; a download into Files if sharing is unavailable or fails. */
export async function deliverFile(
  file: File,
  nav: ShareNav,
  download: (file: File) => void,
): Promise<'shared' | 'downloaded' | 'cancelled'> {
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file] });
      return 'shared';
    } catch (error) {
      if ((error as Error).name === 'AbortError') return 'cancelled';
    }
  }
  download(file);
  return 'downloaded';
}

export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
