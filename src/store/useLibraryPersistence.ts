import { useEffect, useRef } from 'react';
import { loadLibraryIndex, persistLibraryIndex } from '../services/persistence/libraryStore';
import { useAppState } from './AppStateContext';

// Loads the persisted library index once on mount, then mirrors any change to
// state.library.files back to disk. The `loaded` guard stops the very first
// (pre-load) render's empty file list from overwriting what's already on disk.
export function useLibraryPersistence() {
  const { state, dispatch } = useAppState();
  const loaded = useRef(false);

  useEffect(() => {
    loadLibraryIndex().then((files) => {
      dispatch({ type: 'library/SET_FILES', files });
      loaded.current = true;
    });
  }, [dispatch]);

  useEffect(() => {
    if (!loaded.current) return;
    persistLibraryIndex(state.library.files);
  }, [state.library.files]);
}
