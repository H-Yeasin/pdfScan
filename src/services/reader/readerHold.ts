import { useSyncExternalStore } from 'react';

// §18 W10: the page surface renders through pdf-native's one pdfium thread, and so does the
// imported-PDF indexer (store/useImportedPdfIndexing). While a surface is on screen it holds this,
// and the indexer waits: a page the student is looking at never queues behind a thumbnail for a
// document they aren't. Module state, like the remote config: nothing saves it.

let holds = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isReaderHeld(): boolean {
  return holds > 0;
}

// Call the returned function once when done; more calls do nothing.
export function holdReader(): () => void {
  let released = false;
  holds += 1;
  if (holds === 1) listeners.forEach((l) => l());
  return () => {
    if (released) return;
    released = true;
    holds -= 1;
    if (holds === 0) listeners.forEach((l) => l());
  };
}

export function useReaderHeld(): boolean {
  return useSyncExternalStore(subscribe, isReaderHeld, isReaderHeld);
}
