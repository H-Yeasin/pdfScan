import type { ReaderPosition } from '../../types/models';

// §18 W19 (A12): reading and writing a saved position (types/models ReaderPosition). Types only
// are imported here: libraryRepo, the library slice and the backup format use it, and all three
// are on the boot path (§16 G3).
//
// The saved position (`documents.last_position`, and the outside files' list) is JSON
// that an older or newer build, a restored backup or a damaged row may have written. Whatever is
// read back goes through here: a position of a known kind with every number finite and in range,
// or undefined (the document then opens the way it did before W19).
const MAX_INDEX = 10_000_000;

function whole(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(MAX_INDEX, Math.max(0, Math.floor(value))) : null;
}

function unit(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : null;
}

export function normalizePosition(value: unknown): ReaderPosition | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const raw = value as Record<string, unknown>;
  switch (raw.kind) {
    case 'page': {
      const index = whole(raw.index);
      const fy = unit(raw.fy);
      if (index === null || fy === null) return undefined;
      const pageId = typeof raw.pageId === 'string' && raw.pageId.length > 0 && raw.pageId.length <= 200 ? raw.pageId : undefined;
      return pageId ? { kind: 'page', pageId, index, fy } : { kind: 'page', index, fy };
    }
    case 'txt': {
      const chunk = whole(raw.chunk);
      const fy = unit(raw.fy);
      return chunk === null || fy === null ? undefined : { kind: 'txt', chunk, fy };
    }
    case 'sheet': {
      const sheet = whole(raw.sheet);
      const row = whole(raw.row);
      const col = whole(raw.col);
      return sheet === null || row === null || col === null ? undefined : { kind: 'sheet', sheet, row, col };
    }
    case 'docx': {
      const fraction = unit(raw.fraction);
      return fraction === null ? undefined : { kind: 'docx', fraction };
    }
    default:
      return undefined;
  }
}

export function encodePosition(position: ReaderPosition | undefined): string | null {
  const clean = normalizePosition(position);
  return clean ? JSON.stringify(clean) : null;
}

export function decodePosition(json: unknown): ReaderPosition | undefined {
  if (typeof json !== 'string' || json.length === 0 || json.length > 1000) return undefined;
  try {
    return normalizePosition(JSON.parse(json));
  } catch {
    return undefined;
  }
}

export function samePosition(a: ReaderPosition | undefined, b: ReaderPosition | undefined): boolean {
  return a === b || encodePosition(a) === encodePosition(b);
}

// A backup's `last_position` as it comes in under new page ids (§8 B4: Add and "keep both" give
// every row a new id): the page it names follows. Anything that isn't a position becomes NULL.
export function remapPositionPage(json: unknown, pageIds: ReadonlyMap<string, string>): string | null {
  const position = decodePosition(json);
  if (!position) return null;
  if (position.kind !== 'page' || !position.pageId) return encodePosition(position);
  const pageId = pageIds.get(position.pageId);
  return encodePosition(pageId ? { ...position, pageId } : { kind: 'page', index: position.index, fy: position.fy });
}
