import { useCallback, useEffect, useRef } from 'react';
import * as Linking from 'expo-linking';
import { importExternalFile, pruneExternalOpens } from '../services/files/externalFileService';
import { promoteExternalToLibrary } from '../services/persistence/libraryOperations';
import { insertScannedDocument } from '../services/persistence/dbService';
import { useAppState } from './AppStateContext';
import { useRouter } from '../navigation/router';

// Handles the app being launched (or brought to foreground) via an OS "Open with pdfScan" /
// "Share to pdfScan" intent for a supported file. Cold start goes through getInitialURL(); warm
// start (app already running/backgrounded) goes through the 'url' event - MainActivity is already
// launchMode="singleTask" in the generated manifest, so a repeat "Open with" re-triggers the
// existing instance's event stream rather than spawning a new one.
//
// `libraryLoaded` (from useLibraryPersistence) gates the cold-start check purely to keep boot
// sequencing tidy - opening an external file never touches state.library.files itself, so nothing
// would actually break by racing ahead of library load; this just avoids a nav jump firing before
// the rest of the app's state has settled.
export function useExternalFileLinking(libraryLoaded: boolean): void {
  const { dispatch } = useAppState();
  const { go } = useRouter();
  const handledInitial = useRef(false);

  const openUri = useCallback(
    async (uri: string) => {
      try {
        const ext = await importExternalFile(uri);
        // Promoted straight to the Library (not left as an ephemeral SET_EXTERNAL view) so a file
        // handed to the app via an OS "Open with"/share intent - e.g. from WhatsApp - is still
        // findable afterwards without an extra "Add to Library" tap: it lands in Library's
        // default Recent tab like any other document, same as pressing "Add to Library" manually.
        const promoted = await promoteExternalToLibrary(ext);
        insertScannedDocument(promoted).catch((e) => console.warn('db insert failed', e));
        dispatch({ type: 'library/ADD_FILE', file: promoted });
        dispatch({ type: 'reader/SET_READER_ID', id: promoted.id });
        go('reader');
      } catch (e) {
        console.warn('useExternalFileLinking: failed to open', uri, e);
        dispatch({ type: 'ui/SHOW_SNACK', msg: "Couldn't open that file" });
      }
    },
    [dispatch, go]
  );

  useEffect(() => {
    if (!libraryLoaded || handledInitial.current) return;
    handledInitial.current = true;
    pruneExternalOpens();
    Linking.getInitialURL().then((url) => {
      if (url) openUri(url);
    });
  }, [libraryLoaded, openUri]);

  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => openUri(url));
    return () => subscription.remove();
  }, [openUri]);
}
