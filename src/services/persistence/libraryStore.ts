import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LibraryDocument, LibraryFolder, LibraryIndexV2 } from '../../types/models';

const INDEX_KEY = 'library:index';

type LoadedLibrary = { documents: LibraryDocument[]; folders: LibraryFolder[] };

// Handles both the current v2 shape and the pre-folders v1 shape (or anything
// unrecognized), always normalizing to v2 so every caller only deals with one shape.
function migrateLibraryIndex(parsed: unknown): LibraryIndexV2 {
  if (!parsed || typeof parsed !== 'object') return { version: 2, documents: [], folders: [] };
  const obj = parsed as Partial<LibraryIndexV2>;
  const documents = Array.isArray(obj.documents) ? obj.documents : [];
  if (obj.version === 2) {
    const folders = Array.isArray(obj.folders) ? obj.folders : [];
    return { version: 2, documents, folders };
  }
  return { version: 2, documents, folders: [] };
}

export async function loadLibraryIndex(): Promise<LoadedLibrary> {
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    if (!raw) return { documents: [], folders: [] };
    const migrated = migrateLibraryIndex(JSON.parse(raw));
    return { documents: migrated.documents, folders: migrated.folders };
  } catch (error) {
    console.warn('Failed to load library index', error);
    return { documents: [], folders: [] };
  }
}

export async function persistLibraryIndex(documents: LibraryDocument[], folders: LibraryFolder[]): Promise<void> {
  const index: LibraryIndexV2 = { version: 2, documents, folders };
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index));
}
