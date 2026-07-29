import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

const META_KEY = 'signature:saved';
const SIGNATURE_FILENAME = 'signature.png';

export type SavedSignature = { uri: string; aspectRatio: number };

function getSignatureDir(): Directory {
  const dir = new Directory(Paths.document, 'signature');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

// Copies the freshly-captured (cache-resident, may be swept by cleanTemporaryCache) signature
// PNG into permanent storage and records its aspect ratio, so the same signature can be reused
// on later documents without redrawing, and survives app restarts.
export async function saveSignatureForReuse(tempUri: string, aspectRatio: number): Promise<SavedSignature> {
  const dest = new File(getSignatureDir(), SIGNATURE_FILENAME);
  if (dest.exists) dest.delete();
  new File(tempUri).copy(dest);
  await AsyncStorage.setItem(META_KEY, JSON.stringify({ aspectRatio }));
  return { uri: dest.uri, aspectRatio };
}

export async function loadSavedSignature(): Promise<SavedSignature | null> {
  try {
    const raw = await AsyncStorage.getItem(META_KEY);
    if (!raw) return null;
    const { aspectRatio } = JSON.parse(raw) as { aspectRatio: number };
    const file = new File(getSignatureDir(), SIGNATURE_FILENAME);
    if (!file.exists) return null;
    return { uri: file.uri, aspectRatio };
  } catch (error) {
    console.warn('Failed to load saved signature', error);
    return null;
  }
}

export async function clearSavedSignature(): Promise<void> {
  const dir = new Directory(Paths.document, 'signature');
  if (dir.exists) dir.delete();
  await AsyncStorage.removeItem(META_KEY);
}
