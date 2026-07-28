import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LibraryDocument, LibraryIndex } from '../../types/models';

const INDEX_KEY = 'library:index';

export async function loadLibraryIndex(): Promise<LibraryDocument[]> {
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LibraryIndex;
    return parsed.documents ?? [];
  } catch (error) {
    console.warn('Failed to load library index', error);
    return [];
  }
}

export async function persistLibraryIndex(documents: LibraryDocument[]): Promise<void> {
  const index: LibraryIndex = { version: 1, documents };
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index));
}
