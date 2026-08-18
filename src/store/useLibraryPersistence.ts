import { useEffect, useState } from 'react';
import { loadLibraryIndex, persistLibraryIndex } from '../services/persistence/libraryStore';
import { useAppState } from './AppStateContext';

// Loads the persisted library index once on mount, then mirrors any change to
// state.library.files/folders back to disk. The `loaded` guard stops the very first
// (pre-load) render's empty state from overwriting what's already on disk.
// Returns `loaded` (as tracked state, not a ref) so callers like useExternalPdfLinking can
// depend on it to sequence their own boot-time work after the library index is in place.
export function useLibraryPersistence(): boolean {
  const { state, dispatch } = useAppState();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadLibraryIndex().then(({ documents, folders }) => {
      dispatch({ type: 'library/SET_FILES', files: documents });
      dispatch({ type: 'library/SET_FOLDERS', folders });
      setLoaded(true);
    });
  }, [dispatch]);

  useEffect(() => {
    if (!loaded) return;
    persistLibraryIndex(state.library.files, state.library.folders);
  }, [loaded, state.library.files, state.library.folders]);

  return loaded;
}
