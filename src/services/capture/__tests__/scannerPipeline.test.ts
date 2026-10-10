import DocumentScanner from 'react-native-document-scanner-plugin';
import { getCaptureModeSpec } from '../captureModes';
import { ingestPage } from '../ingest';
import { runNativeScannerPipeline } from '../scannerPipeline';

jest.mock('react-native-document-scanner-plugin', () => ({
  __esModule: true,
  default: { scanDocument: jest.fn() },
  ResponseType: { ImageFilePath: 'imageFilePath' },
  ScanDocumentResponseStatus: { Success: 'success', Cancel: 'cancel' },
}));
jest.mock('../ingest', () => ({
  ingestPage: jest.fn(async (uri: string, _script: string, options: { enhance?: string }) => ({
    id: uri,
    uri,
    width: 10,
    height: 10,
    rotation: 0,
    enhance: options.enhance ?? 'auto',
  })),
  readPage: jest.fn(async () => ({})),
}));

describe('runNativeScannerPipeline', () => {
  it("uses the mode's page limit, gallery import and default filter", async () => {
    jest.mocked(DocumentScanner.scanDocument).mockResolvedValue({
      status: 'success',
      scannedImages: ['file:///a.jpg', 'file:///b.jpg'],
    } as never);
    const dispatch = jest.fn();

    await runNativeScannerPipeline(dispatch, 'latin', getCaptureModeSpec('notes'));

    expect(DocumentScanner.scanDocument).toHaveBeenCalledWith(
      expect.objectContaining({ maxNumDocuments: 50, galleryImportAllowed: true, scannerMode: 'full' })
    );
    expect(ingestPage).toHaveBeenCalledWith('file:///a.jpg', 'latin', { deleteSource: true, enhance: 'ink', ocr: false });
    const added = dispatch.mock.calls.flatMap(([action]) => (action.type === 'capture/ADD_PAGE' ? [action.page] : []));
    expect(added.map((p: { enhance: string }) => p.enhance)).toEqual(['ink', 'ink']);
  });

  it('limits ID card scans to two pages', async () => {
    jest.mocked(DocumentScanner.scanDocument).mockResolvedValue({ status: 'cancel' } as never);
    await runNativeScannerPipeline(jest.fn(), 'latin', getCaptureModeSpec('id'));
    expect(DocumentScanner.scanDocument).toHaveBeenLastCalledWith(expect.objectContaining({ maxNumDocuments: 2 }));
  });
});
