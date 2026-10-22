import { sanitizeFileName } from '../../utils/sanitize';

// §18 W23 / §17 U7: the name a document is renamed to, or null when there is nothing to do (empty
// once cleaned, or the name it already has). Cleaned like a file name, since the name becomes one
// whenever the document is shared or exported (shareService.shareFileName); the files on disk keep
// theirs, which are by document id.
export function renamedTo(currentName: string, rawName: string): string | null {
  const name = sanitizeFileName(rawName);
  if (!name || name === currentName) return null;
  return name;
}
