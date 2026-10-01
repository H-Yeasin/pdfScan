import { File } from 'expo-file-system';
import { THUMB_JPEG_Q, THUMB_MAX_DIM } from '../capture/imageSpec';
import { downscaleAndCompressPage } from '../enhance/enhanceService';
import { getDocumentDir } from '../persistence/libraryFiles';

export type LibraryImageInput = {
  // Already-final master (rendered at MASTER_PRESET). Moved into the library, never re-encoded.
  masterUri: string;
  // Optional stamped copy for the in-app viewer (academic border/header/footer).
  displayUri?: string;
  // Copy instead of move - for a source the caller still owns (e.g. an imported cover image).
  keepSource?: boolean;
};

export type LibraryImageFiles = { fileUri: string; displayUri?: string; thumbUri: string };

function place(sourceUri: string, dest: File, keepSource: boolean): void {
  if (dest.exists) dest.delete();
  if (keepSource) new File(sourceUri).copySync(dest);
  else new File(sourceUri).moveSync(dest);
}

// Files a document's page images into library/<documentId>/: page_N.jpg (master), display_N.jpg
// (stamped copy, when given) and thumb_N.jpg (small preview, generated here from the master).
// Masters keep full quality whatever export quality the user picked - that only affects
// document.pdf - so the library never loses detail. `sizeBytes` totals the masters.
export async function saveImagesToLibrary(
  documentId: string,
  pages: LibraryImageInput[]
): Promise<{ pages: LibraryImageFiles[]; sizeBytes: number }> {
  const dir = getDocumentDir(documentId);
  const saved: LibraryImageFiles[] = [];
  let sizeBytes = 0;

  for (let i = 0; i < pages.length; i++) {
    const input = pages[i];
    const master = new File(dir, `page_${i + 1}.jpg`);
    place(input.masterUri, master, !!input.keepSource);
    sizeBytes += master.size ?? 0;

    let displayUri: string | undefined;
    if (input.displayUri) {
      const display = new File(dir, `display_${i + 1}.jpg`);
      place(input.displayUri, display, false);
      displayUri = display.uri;
    }

    const thumbSource = await downscaleAndCompressPage(master.uri, THUMB_MAX_DIM, THUMB_JPEG_Q);
    const thumb = new File(dir, `thumb_${i + 1}.jpg`);
    place(thumbSource.uri, thumb, false);

    saved.push({ fileUri: master.uri, displayUri, thumbUri: thumb.uri });
  }

  return { pages: saved, sizeBytes };
}
