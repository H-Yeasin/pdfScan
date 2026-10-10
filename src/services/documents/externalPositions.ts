import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ExternalFileDocument, ReaderPosition } from '../../types/models';
import { normalizePosition } from './positionCodec';

// §18 W19: a file opened from outside ("Open with") has no library row to keep its position in.
// The last few are remembered here instead, most recently read first, so opening the same
// handout from WhatsApp again goes back to where it was. Nothing of the file is stored: its
// address and size (which name it) and the position.

const STORAGE_KEY = 'reader:externalPositions';
export const EXTERNAL_POSITIONS_MAX = 50;

type Entry = [key: string, position: ReaderPosition];

// The app's own copy of the file gets a new uri every time; the address it came from doesn't.
export function externalPositionKey(external: Pick<ExternalFileDocument, 'sourceUri' | 'uri' | 'sizeBytes'>): string {
  return `${external.sourceUri || external.uri}|${external.sizeBytes}`;
}

// Whatever was stored, as a clean list: damaged entries are dropped, not repaired.
export function parseExternalPositions(json: string | null): Entry[] {
  if (!json) return [];
  try {
    const raw: unknown = JSON.parse(json);
    if (!Array.isArray(raw)) return [];
    const out: Entry[] = [];
    for (const item of raw) {
      if (!Array.isArray(item) || typeof item[0] !== 'string') continue;
      const position = normalizePosition(item[1]);
      if (position) out.push([item[0], position]);
      if (out.length >= EXTERNAL_POSITIONS_MAX) break;
    }
    return out;
  } catch {
    return [];
  }
}

// `key` moved to the front with its new position; the oldest fall off the end.
export function withExternalPosition(entries: readonly Entry[], key: string, position: ReaderPosition, max = EXTERNAL_POSITIONS_MAX): Entry[] {
  return [[key, position] as Entry, ...entries.filter(([k]) => k !== key)].slice(0, max);
}

export async function loadExternalPosition(key: string): Promise<ReaderPosition | undefined> {
  try {
    return parseExternalPositions(await AsyncStorage.getItem(STORAGE_KEY)).find(([k]) => k === key)?.[1];
  } catch {
    return undefined;
  }
}

// One write at a time: two saves in a row would each read the list before the other wrote it.
let queue: Promise<void> = Promise.resolve();

export function saveExternalPosition(key: string, position: ReaderPosition): Promise<void> {
  const clean = normalizePosition(position);
  if (!clean) return queue;
  queue = queue.then(async () => {
    try {
      const entries = parseExternalPositions(await AsyncStorage.getItem(STORAGE_KEY));
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(withExternalPosition(entries, key, clean)));
    } catch {
      // Best-effort: the file opens at its start next time.
    }
  });
  return queue;
}
