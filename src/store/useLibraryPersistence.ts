import { useEffect, useRef } from 'react';
import { loadLibraryIndex, persistLibraryIndex } from '../services/persistence/libraryStore';
import { useAppState } from './AppStateContext';

// Loads the persisted library index once on mount, then mirrors any change to
// state.library.files/folders back to disk. The `loaded` guard stops the very first
// (pre-load) render's empty state from overwriting what's already on disk.
export function useLibraryPersistence() {
  const { state, dispatch } = useAppState();
  const loaded = useRef(false);

  useEffect(() => {
    loadLibraryIndex().then(({ documents, folders }) => {
      dispatch({ type: 'library/SET_FILES', files: documents });
      dispatch({ type: 'library/SET_FOLDERS', folders });
      loaded.current = true;
    });
  }, [dispatch]);

  useEffect(() => {
    if (!loaded.current) return;
    persistLibraryIndex(state.library.files, state.library.folders);
  }, [state.library.files, state.library.folders]);
}
