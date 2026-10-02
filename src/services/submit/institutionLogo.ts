import { Directory, File, Paths } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { createId } from '../../utils/id';

// §10 M4: the institution logo the University cover draws at its top. One small PNG in
// documents/profile/ (PNG keeps a transparent background); settings.institutionLogo holds its
// file name, never a full path, because the app's document directory can move (iOS updates).
// It isn't part of a backup zip: a restored phone just has no logo until one is added again.

const DIR = 'profile';
// Drawn 84 pt wide on the cover; 600 px is sharp in print and keeps the PDF small.
const LOGO_MAX_PX = 600;

function logoDir(): Directory {
  const dir = new Directory(Paths.document, DIR);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

// The logo's URI for drawing, or undefined when none was added or its file is gone.
export function institutionLogoUri(name: string | null | undefined): string | undefined {
  if (!name) return undefined;
  try {
    const file = new File(Paths.document, DIR, name);
    return file.exists ? file.uri : undefined;
  } catch {
    return undefined;
  }
}

// Copies a picked image into place, scaled down, and removes the one it replaces. Returns the
// new file name for settings/SET_INSTITUTION_LOGO. A new name each time, so no image cache shows
// the old logo.
export async function saveInstitutionLogo(sourceUri: string, previous: string | null): Promise<string> {
  const resized = await manipulateAsync(sourceUri, [{ resize: { width: LOGO_MAX_PX } }], { format: SaveFormat.PNG });
  const name = `${createId('logo')}.png`;
  const temp = new File(resized.uri);
  temp.copySync(new File(logoDir(), name));
  try {
    temp.delete();
  } catch {
    // A cache file; cleanTemporaryCache gets it later.
  }
  removeInstitutionLogo(previous);
  return name;
}

export function removeInstitutionLogo(name: string | null): void {
  if (!name) return;
  try {
    const file = new File(Paths.document, DIR, name);
    if (file.exists) file.delete();
  } catch (error) {
    console.warn('Could not remove the old institution logo', error);
  }
}
