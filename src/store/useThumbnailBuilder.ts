import { useEffect } from 'react';
import { setThumbnailHost } from '../services/library/thumbnails';
import { useAppDispatch, useAppStore } from './AppStateContext';

// §16 G6: gives the thumbnail queue (services/library/thumbnails.ts) the library to read and a
// way to save. It reads the store when a build starts and ends, not through a slice, so nothing
// re-renders for it. Off until the library has loaded: nothing is written after a failed load.
export function useThumbnailBuilder(libraryLoaded: boolean): void {
  const store = useAppStore();
  const dispatch = useAppDispatch();
  useEffect(() => {
    if (!libraryLoaded) return;
    setThumbnailHost({
      find: (documentId) => store.getState().library.files.find((f) => f.id === documentId),
      save: (documentId, pageId, thumbUri) => dispatch({ type: 'library/SET_PAGE_THUMB', id: documentId, pageId, thumbUri }),
    });
    return () => setThumbnailHost(null);
  }, [libraryLoaded, store, dispatch]);
}
