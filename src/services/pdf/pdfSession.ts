import {
  closeDocument,
  getOutline,
  getPageLinks,
  getSessionPageText,
  openDocument,
  PdfSessionClosedError,
  renderPageImage,
  type PdfLink,
  type PdfOpenedDocument,
  type PdfOutlineItem,
  type PdfPageImageOptions,
  type PdfPageSize,
  type PdfPageText,
  type PdfRenderedPage,
} from './pdfNative';

// §18 W7: one open pdfium document per file, shared by everything that reads it (the page surface,
// Find, links, the contents list). Opening is the expensive part of every native PDF call, so the
// first `acquirePdfSession` opens and the last `release` closes; in between, each user holds a
// reference.
//
// Native code may close a document on its own (it keeps two, drops one after a minute without a
// call, and drops all when the system is short of memory). That shows up here as
// PdfSessionClosedError and is answered by opening again, once, so callers never see it.
//
// The password lives in this module's memory for as long as the session is held, because a reopen
// needs it. It is never stored.

export type PdfSession = {
  uri: string;
  pageCount: number;
  // Shown sizes in points (the page's /Rotate applied); pages are 0-based.
  pages: PdfPageSize[];
  hasOutline: boolean;
  renderPage(page: number, options: PdfPageImageOptions): Promise<PdfRenderedPage>;
  pageText(page: number): Promise<PdfPageText>;
  pageLinks(page: number): Promise<PdfLink[]>;
  outline(): Promise<PdfOutlineItem[]>;
  // Call once when done; more calls do nothing. Work still running on the session may then fail.
  release(): void;
};

type Entry = {
  key: string;
  uri: string;
  password?: string;
  refs: number;
  opened: Promise<PdfOpenedDocument>;
};

const entries = new Map<string, Entry>();

// A different password is a different session: a wrong one must not poison the right one's.
function keyOf(uri: string, password?: string): string {
  return password ? `${uri}\u0000${password}` : uri;
}

function drop(entry: Entry): void {
  entry.refs -= 1;
  if (entry.refs > 0) return;
  if (entries.get(entry.key) === entry) entries.delete(entry.key);
  // Whatever `opened` is by now (the first open or a reopen); a failed one has nothing to close.
  entry.opened.then((doc) => closeDocument(doc.id)).catch(() => undefined);
}

async function withDocument<T>(entry: Entry, run: (id: string) => Promise<T>): Promise<T> {
  const opened = entry.opened;
  const doc = await opened;
  try {
    return await run(doc.id);
  } catch (error) {
    if (!(error instanceof PdfSessionClosedError)) throw error;
    // Several calls can find it closed at once: only the first opens again.
    if (entry.opened === opened) entry.opened = openDocument(entry.uri, entry.password);
    return run((await entry.opened).id);
  }
}

// Rejects like `openDocument`: PdfEncryptedError, PdfWrongPasswordError, PdfNativeUnavailableError
// (a build without sessions), or the native read error. A failed open is not kept, so a retry
// (or the right password) opens again.
export async function acquirePdfSession(uri: string, password?: string): Promise<PdfSession> {
  const key = keyOf(uri, password);
  let entry = entries.get(key);
  if (!entry) {
    entry = { key, uri, password: password || undefined, refs: 0, opened: openDocument(uri, password) };
    entries.set(key, entry);
  }
  const held = entry;
  held.refs += 1;
  let doc: PdfOpenedDocument;
  try {
    doc = await held.opened;
  } catch (error) {
    if (entries.get(key) === held) entries.delete(key);
    throw error;
  }

  let released = false;
  const use = <T>(run: (id: string) => Promise<T>): Promise<T> => {
    if (released) return Promise.reject(new Error('The PDF session was used after release()'));
    return withDocument(held, run);
  };
  return {
    uri,
    pageCount: doc.pageCount,
    pages: doc.pages,
    hasOutline: doc.hasOutline,
    renderPage: (page, options) => use((id) => renderPageImage(id, page, options)),
    pageText: (page) => use((id) => getSessionPageText(id, page)),
    pageLinks: (page) => use((id) => getPageLinks(id, page)),
    outline: () => use((id) => getOutline(id)),
    release: () => {
      if (released) return;
      released = true;
      drop(held);
    },
  };
}

// How many documents this module holds open (tests, the lab screen).
export function openPdfSessionCount(): number {
  return entries.size;
}
