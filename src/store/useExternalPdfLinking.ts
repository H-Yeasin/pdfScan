import { useCallback, useEffect, useRef } from 'react';
import * as Linking from 'expo-linking';
import { importExternalPdf } from '../services/pdf/externalPdfService';
import { useAppState } from './AppStateContext';
import { useRouter } from '../navigation/router';

// Handles the app being launched (or brought to foreground) via an OS "Open with pdfScan" /
// "Share to pdfScan" intent for a PDF file. Cold start goes through getInitialURL(); warm start
// (app already running/backgrounded) goes through the 'url' event - MainActivity is already
// launchMode="singleTask" in the generated manifest, so a repeat "Open with" re-triggers the
// existing instance's event stream rather than spawning a new one.
//
// `libraryLoaded` (from useLibraryPersistence) gates the cold-start check purely to keep boot
// sequencing tidy - opening an external PDF never touches state.library.files itself, so nothing
// would actually break by racing ahead of library load; this just avoids a nav jump firing before
// the rest of the app's state has settled.
export function useExternalPdfLinking(libraryLoaded: boolean): void {
  const { dispatch } = useAppState();
  const { go } = useRouter();
  const handledInitial = useRef(false);

  const openUri = useCallback(
    async (uri: string) => {
      try {
        const ext = await importExternalPdf(uri);
        dispatch({ type: 'reader/SET_EXTERNAL', doc: ext });
        go('reader');
      } catch (e) {
        console.warn('useExternalPdfLinking: failed to open', uri, e);
        dispatch({ type: 'ui/SHOW_SNACK', msg: "Couldn't open that PDF" });
      }
    },
    [dispatch, go]
  );

  useEffect(() => {
    if (!libraryLoaded || handledInitial.current) return;
    handledInitial.current = true;
    Linking.getInitialURL().then((url) => {
      if (url) openUri(url);
    });
  }, [libraryLoaded, openUri]);

  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => openUri(url));
    return () => subscription.remove();
  }, [openUri]);
}
