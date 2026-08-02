const PATH_SEPARATORS = /[/\\]/g;
const DOT_RUNS = /\.{2,}/g;
const RESERVED_CHARS = /[<>:"|?*]/g;
const WHITESPACE_RUNS = /\s+/g;
const EDGE_DOTS_OR_SPACE = /^[.\s]+|[.\s]+$/g;

const MAX_LENGTH = 60;
const DEL_CODE_POINT = 127;

// Drops ASCII control characters (code points below the printable range, plus DEL) without
// relying on \u/\x escapes in a regex literal, which are easy to mistype into an unreviewable
// raw byte instead of the intended escape sequence.
function stripControlChars(value: string): string {
  let result = '';
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x20 && code !== DEL_CODE_POINT) result += ch;
  }
  return result;
}

// Turns a free-typed display name (e.g. "CS 101") into a filesystem-safe directory segment.
// Lowercased so the same course name always resolves to one physical directory regardless of
// platform - Android's filesystem is case-sensitive, iOS/APFS defaults to case-insensitive.
// Returns '' if nothing safe survives (e.g. input was only ".." or path separators) - callers
// must treat that identically to "no folder provided," never invent a shared fallback bucket.
export function sanitizeFolderSegment(rawName: string): string {
  return stripControlChars(rawName)
    .replace(PATH_SEPARATORS, ' ')
    .replace(DOT_RUNS, ' ')
    .replace(RESERVED_CHARS, '')
    .replace(WHITESPACE_RUNS, ' ')
    .replace(EDGE_DOTS_OR_SPACE, '')
    .slice(0, MAX_LENGTH)
    .replace(EDGE_DOTS_OR_SPACE, '')
    .toLowerCase();
}
