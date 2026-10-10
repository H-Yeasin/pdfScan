import { File } from 'expo-file-system';
import { createId } from '../../utils/id';

// §18 W3: replacing a file without a moment in which the document has none. The old pattern,
// `dest.delete(); dest.write(bytes)`, loses the document if the write fails (disk full) or the app
// is killed half-way: the old file is gone and the new one is cut short. Here the new bytes are
// first written, complete, to `.<name>.tmp-<id>` in the same folder; only then is the old file
// deleted and the temporary one moved into place (a rename: same folder, same volume).
// - The write fails: the old file was never touched.
// - The app dies between the delete and the move: the folder holds a complete temporary file and
//   no `<name>`; storage/integrity's recoverInterruptedWrites moves it into place at the next
//   launch.
// - The app dies during the write: `<name>` is still the old file, and the half-written temporary
//   one is deleted by the same check.
// Everything here is synchronous, so nothing else in the app ever sees the steps in between.

const TEMP_NAME = /^\.(.+)\.tmp-[^.]+$/;

function tempFor(dest: File): File {
  return new File(dest.parentDirectory, `.${dest.name}.tmp-${createId('w')}`);
}

// The name of the file a temporary file was written for, or null for any other file name.
export function interruptedWriteTarget(name: string): string | null {
  return TEMP_NAME.exec(name)?.[1] ?? null;
}

function deleteQuietly(file: File): void {
  try {
    if (file.exists) file.delete();
  } catch {
    // Left for recoverInterruptedWrites.
  }
}

// The old file goes only once `temp` holds the whole new one. If the last move fails, `temp` is
// kept: it is now the only copy, and the integrity check puts it in place.
function swapIn(temp: File, dest: File): void {
  if (dest.exists) dest.delete();
  temp.moveSync(dest);
}

// Writes `bytes` as `dest`, replacing what was there.
export function writeFileReplacing(dest: File, bytes: Uint8Array | string): void {
  const dir = dest.parentDirectory;
  if (!dir.exists) dir.create({ intermediates: true });
  const temp = tempFor(dest);
  try {
    temp.write(bytes);
  } catch (error) {
    deleteQuietly(temp);
    throw error;
  }
  swapIn(temp, dest);
}

// Moves `src` (a finished file, e.g. a PDF built in the cache) to `dest`, replacing what was
// there. `src` first goes next to `dest` under the temporary name: from the cache that is a copy
// across volumes, the slow part, and it happens while the old file is still there.
export function moveReplacing(src: File, dest: File): void {
  const dir = dest.parentDirectory;
  if (!dir.exists) dir.create({ intermediates: true });
  const temp = tempFor(dest);
  try {
    src.moveSync(temp);
  } catch (error) {
    deleteQuietly(temp);
    throw error;
  }
  swapIn(temp, dest);
}
