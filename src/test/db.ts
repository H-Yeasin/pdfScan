import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SQLite from 'expo-sqlite';
import { __resetDbForTests } from '../services/persistence/dbService';

// Fresh in-memory SQLite, empty AsyncStorage and a forgotten getDb() memo.
export async function resetStorage(): Promise<void> {
  (SQLite as unknown as { __resetDatabases: () => void }).__resetDatabases();
  __resetDbForTests();
  await AsyncStorage.clear();
}
