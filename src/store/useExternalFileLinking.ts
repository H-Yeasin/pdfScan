import { useCallback, useEffect, useRef } from 'react';
import * as Linking from 'expo-linking';
import { importExternalFile, LegacyWordDocError, pruneExternalOpens } from '../services/files/externalFileService';
import { promoteExternalToLibrary } from '../services/persistence/libraryOperations';
import { useAppDispatch } from './AppStateContext';
import { File } from 'expo-file-system';
import { looksLikeZip } from '../services/backup/incomingZip';
import { openIncomingZip } from './backupIntake';
import { useRouter } from '../navigation/router';
import { t } from '../i18n';

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
// Only file handoffs are ours to open. Linking also delivers the app's own deep links - in a dev
// build the launch URL is `exp+<slug>://expo-development-client/?url=...` - and passing those to
// importExternalFile throws (expo-file-system: 'URI scheme is not "file"') and shows a bogus
// "couldn't open" snackbar on every boot.
function isFileUri(uri: string): boolean {
  return /^(file|content):\/\//i.test(uri);
}

// The name a content:// URI resolves to (its display name), when the provider tells.
function safeName(uri: string): string | null {
  try {
    return new File(uri).name;
  } catch {
    return null;
  }
}

export function useExternalFileLinking(libraryLoaded: boolean): void {
  const dispatch = useAppDispatch();
  const { go } = useRouter();
  const handledInitial = useRef(false);

  const openUri = useCallback(
    async (uri: string) => {
      if (!isFileUri(uri)) return;
      // §8 B4: a PDF Scan backup or a shared course opens the restore / import flow.
      if (looksLikeZip(uri) || looksLikeZip(safeName(uri))) {
        await openIncomingZip(dispatch, uri);
        return;
      }
      try {
        const ext = await importExternalFile(uri);
        // Promoted straight to the Library (not left as an ephemeral SET_EXTERNAL view) so a file
        // handed to the app via an OS "Open with"/share intent - e.g. from WhatsApp - is still
        // findable afterwards without an extra "Add to Library" tap: it lands in Library's
        // default Recent tab like any other document, same as pressing "Add to Library" manually.
        const promoted = await promoteExternalToLibrary(ext);
        dispatch({ type: 'library/ADD_FILE', file: promoted });
        dispatch({ type: 'reader/SET_READER_ID', id: promoted.id });
        go('reader');
      } catch (e) {
        console.warn('useExternalFileLinking: failed to open', uri, e);
        dispatch({ type: 'ui/SHOW_SNACK', msg: t(e instanceof LegacyWordDocError ? 'reader.docUnsupported' : 'library.openFailed') });
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
