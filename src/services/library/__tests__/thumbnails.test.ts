import { Directory, File, Paths } from 'expo-file-system';
import { makeDoc, makePage } from '../../../test/fixtures';
import { makeJpeg } from '../../../test/jpeg';
import PdfNative from '../../../../modules/pdf-native';
import { holdReader } from '../../reader/readerHold';
import { libraryReducer, initialLibraryState } from '../../../store/slices/librarySlice';
import type { LibraryDocument } from '../../../types/models';
import { canBuildThumb, requestThumb, resetThumbnails, setThumbnailHost, thumbFor, thumbnailsIdle } from '../thumbnails';

// The resize writes a small JPEG into the cache, like the real one; `active` counts the builds
// running at once.
const mockRuns = { active: 0, mostActive: 0, resizes: 0 };
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  manipulateAsync: jest.fn(async (uri: string) => {
    const fs = jest.requireActual('expo-file-system') as typeof import('expo-file-system');
    if (!new fs.File(uri).exists) throw new Error('no such file');
    mockRuns.active += 1;
    mockRuns.mostActive = Math.max(mockRuns.mostActive, mockRuns.active);
    mockRuns.resizes += 1;
    await new Promise((resolve) => setTimeout(resolve, 1));
    const out = new fs.File(fs.Paths.cache, `resized_${mockRuns.resizes}.jpg`);
    out.write(new Uint8Array([1, 2, 3]));
    mockRuns.active -= 1;
    return { uri: out.uri, width: 300, height: 400 };
  }),
}));

const renderPage = (PdfNative as unknown as { renderPage: jest.Mock }).renderPage;
const { manipulateAsync } = jest.requireMock('expo-image-manipulator') as { manipulateAsync: jest.Mock };

let files: LibraryDocument[] = [];
const saved: { documentId: string; pageId: string; thumbUri: string }[] = [];

function master(docId: string, name: string): string {
  const file = new File(Paths.document, 'library', docId, name);
  if (!file.parentDirectory.exists) file.parentDirectory.create({ intermediates: true });
  file.write(makeJpeg(1800, 2400, 2000));
  return file.uri;
}

function scan(id: string, pages = 1): LibraryDocument {
  return makeDoc({
    id,
    pages: Array.from({ length: pages }, (_, i) =>
      makePage({ id: `${id}_p${i}`, fileUri: master(id, `page_${i + 1}.jpg`), thumbUri: undefined, width: 1800, height: 2400 })
    ),
  });
}

beforeEach(() => {
  resetThumbnails();
  const library = new Directory(Paths.document, 'library');
  if (library.exists) library.delete();
  files = [];
  saved.length = 0;
  mockRuns.active = 0;
  mockRuns.mostActive = 0;
  manipulateAsync.mockClear();
  renderPage.mockClear();
  setThumbnailHost({
    find: (id) => files.find((f) => f.id === id),
    save: (documentId, pageId, thumbUri) => {
      saved.push({ documentId, pageId, thumbUri });
      files = libraryReducer({ ...initialLibraryState, files }, { type: 'library/SET_PAGE_THUMB', id: documentId, pageId, thumbUri }).files;
    },
  });
});

describe('thumbFor', () => {
  it('is the thumbnail, and never the master', () => {
    expect(thumbFor(makePage({ fileUri: 'file:///master.jpg', thumbUri: 'file:///thumb.jpg' }))).toBe('file:///thumb.jpg');
    expect(thumbFor(makePage({ fileUri: 'file:///master.jpg', thumbUri: undefined }))).toBeUndefined();
    expect(thumbFor(makePage({ fileUri: 'file:///master.jpg', thumbUri: '' }))).toBeUndefined();
    expect(thumbFor(undefined)).toBeUndefined();
  });
});

describe('requestThumb', () => {
  it('builds a 400 px thumbnail from the master and saves it on the page', async () => {
    files = [scan('doc_a')];
    requestThumb('doc_a', 'doc_a_p0');
    await thumbnailsIdle();

    expect(manipulateAsync).toHaveBeenCalledWith(files[0].pages[0].fileUri, [{ resize: { width: 300, height: 400 } }], { compress: 0.7, format: 'jpeg' });
    expect(saved).toHaveLength(1);
    const thumb = new File(saved[0].thumbUri);
    expect(thumb.exists).toBe(true);
    expect(thumb.name).toBe('thumb_doc_a_p0.jpg');
    expect(thumb.parentDirectory.name).toBe('doc_a');
    expect(files[0].pages[0].thumbUri).toBe(saved[0].thumbUri);
  });

  it('builds one at a time', async () => {
    files = [scan('doc_a', 4)];
    for (const page of files[0].pages) requestThumb('doc_a', page.id);
    await thumbnailsIdle();
    expect(saved).toHaveLength(4);
    expect(mockRuns.mostActive).toBe(1);
  });

  it('builds a page once, however often it is asked for', async () => {
    files = [scan('doc_a')];
    requestThumb('doc_a', 'doc_a_p0');
    requestThumb('doc_a', 'doc_a_p0');
    requestThumb('doc_a', 'doc_a_p0');
    await thumbnailsIdle();
    requestThumb('doc_a', 'doc_a_p0');
    await thumbnailsIdle();
    expect(manipulateAsync).toHaveBeenCalledTimes(1);
    expect(saved).toHaveLength(1);
  });

  it('takes the newest request first', async () => {
    files = [scan('doc_a', 3)];
    // The first starts at once; of the two that wait, the later one goes next.
    for (const page of files[0].pages) requestThumb('doc_a', page.id);
    await thumbnailsIdle();
    expect(saved.map((s) => s.pageId)).toEqual(['doc_a_p0', 'doc_a_p2', 'doc_a_p1']);
  });

  it('does not try a page again after its build failed', async () => {
    const doc = scan('doc_a');
    new File(doc.pages[0].fileUri).delete();
    files = [doc];
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    requestThumb('doc_a', 'doc_a_p0');
    await thumbnailsIdle();
    requestThumb('doc_a', 'doc_a_p0');
    await thumbnailsIdle();
    warn.mockRestore();
    expect(manipulateAsync).toHaveBeenCalledTimes(1);
    expect(saved).toHaveLength(0);
  });

  it('writes nothing for a document deleted while its thumbnail was built', async () => {
    files = [scan('doc_a')];
    requestThumb('doc_a', 'doc_a_p0');
    files = [];
    new Directory(Paths.document, 'library', 'doc_a').delete();
    await thumbnailsIdle();
    expect(saved).toHaveLength(0);
    expect(new Directory(Paths.document, 'library', 'doc_a').exists).toBe(false);
  });

  it('waits for the library: nothing is built without a host', async () => {
    setThumbnailHost(null);
    files = [scan('doc_a')];
    requestThumb('doc_a', 'doc_a_p0');
    await thumbnailsIdle();
    expect(manipulateAsync).not.toHaveBeenCalled();
    setThumbnailHost({ find: (id) => files.find((f) => f.id === id), save: (documentId, pageId, thumbUri) => saved.push({ documentId, pageId, thumbUri }) });
    await thumbnailsIdle();
    expect(saved).toHaveLength(1);
  });
});

describe('imported PDFs', () => {
  const imported = (overrides: Partial<LibraryDocument> = {}) =>
    makeDoc({
      id: 'doc_pdf',
      sourceKind: 'imported_pdf',
      pdfUri: 'file:///library/doc_pdf/document.pdf',
      indexedAt: 1,
      indexState: 'partial',
      pages: [makePage({ id: 'p0', fileUri: '', thumbUri: 'file:///t0.jpg' }), makePage({ id: 'p1', fileUri: '', thumbUri: undefined })],
      ...overrides,
    });

  it('renders the page from the PDF at 400 px', async () => {
    files = [imported()];
    requestThumb('doc_pdf', 'p1');
    await thumbnailsIdle();
    expect(renderPage).toHaveBeenCalledWith('file:///library/doc_pdf/document.pdf', 1, { maxDim: 400, quality: 0.7 });
    expect(manipulateAsync).not.toHaveBeenCalled();
    expect(saved).toEqual([{ documentId: 'doc_pdf', pageId: 'p1', thumbUri: expect.stringContaining('thumb_p1.jpg') }]);
  });

  it('leaves a document to the indexer until it is done with it, and one it could not read', () => {
    const page = makePage({ id: 'p1', fileUri: '', thumbUri: undefined });
    expect(canBuildThumb(imported({ indexedAt: undefined, indexState: undefined }), page)).toBe(false);
    expect(canBuildThumb(imported({ indexState: 'encrypted' }), page)).toBe(false);
    expect(canBuildThumb(imported({ indexState: 'failed' }), page)).toBe(false);
    expect(canBuildThumb(imported({ indexState: 'done' }), page)).toBe(true);
    // The PDF already carries a turn made since: a new render would be turned twice in the row.
    expect(canBuildThumb(imported(), { ...page, rotation: 90 })).toBe(false);
  });

  it('does not take the pdfium thread from the Reader, and can be asked again after', async () => {
    files = [imported()];
    const release = holdReader();
    requestThumb('doc_pdf', 'p1');
    await thumbnailsIdle();
    expect(renderPage).not.toHaveBeenCalled();
    release();
    requestThumb('doc_pdf', 'p1');
    await thumbnailsIdle();
    expect(saved).toHaveLength(1);
  });
});

describe('library/SET_PAGE_THUMB', () => {
  it('keeps a thumbnail the page got meanwhile, and the state when nothing changes', () => {
    const doc = makeDoc({ id: 'd', pages: [makePage({ id: 'p', thumbUri: 'file:///indexer.jpg' })] });
    const state = { ...initialLibraryState, files: [doc] };
    expect(libraryReducer(state, { type: 'library/SET_PAGE_THUMB', id: 'd', pageId: 'p', thumbUri: 'file:///late.jpg' })).toBe(state);
    expect(libraryReducer(state, { type: 'library/SET_PAGE_THUMB', id: 'gone', pageId: 'p', thumbUri: 'file:///late.jpg' })).toBe(state);
  });
});
