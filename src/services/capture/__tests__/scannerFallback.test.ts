import DocumentScanner from 'react-native-document-scanner-plugin';
import { getCaptureModeSpec } from '../captureModes';
import { ingestBatch } from '../ingestBatch';
import {
  scannerUnavailableMessage,
  collectCameraPhotos,
  isScannerUnavailableError,
  runCameraFallback,
} from '../scannerFallback';
import { runNativeScannerPipeline } from '../scannerPipeline';

jest.mock('../ingestBatch', () => ({ ingestBatch: jest.fn(async () => {}) }));
// The system camera: permission denied, so the fallback ends with no photos.
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: false })),
  launchCameraAsync: jest.fn(),
}));

beforeEach(() => jest.clearAllMocks());

describe('isScannerUnavailableError', () => {
  it.each([
    'com.google.android.gms.common.api.ApiException: 17: API: DocumentScanning.API is not available on this device.',
    'Google Play services is missing.',
    'SERVICE_VERSION_UPDATE_REQUIRED',
    'MlKitException: The document scanner is unavailable',
    'Document camera is not supported on this device',
  ])('treats "%s" as unavailable', (message) => {
    expect(isScannerUnavailableError(new Error(message))).toBe(true);
  });

  it.each([
    'Waiting for the document scanner module to be downloaded. Please try again.',
    'Activity is busy',
    'document scan error: null',
    'User denied camera permission',
  ])('does not flag "%s"', (message) => {
    expect(isScannerUnavailableError(new Error(message))).toBe(false);
  });

  it('copes with non-Error rejections', () => {
    expect(isScannerUnavailableError('SERVICE_MISSING')).toBe(true);
    expect(isScannerUnavailableError(undefined)).toBe(false);
  });
});

describe('basic camera mode', () => {
  const photos = (n: number) => {
    let i = 0;
    return jest.fn(async () => (i < n ? `file:///cache/cam_${++i}.jpg` : null));
  };

  it('keeps taking photos until the user says Done', async () => {
    const askTakeAnother = jest.fn(async (taken: number) => taken < 3);
    const uris = await collectCameraPhotos(getCaptureModeSpec('notes'), { takePhoto: photos(10), askTakeAnother });
    expect(uris).toHaveLength(3);
  });

  it("stops at the mode's page limit without asking again", async () => {
    const askTakeAnother = jest.fn(async () => true);
    const uris = await collectCameraPhotos(getCaptureModeSpec('id'), { takePhoto: photos(10), askTakeAnother });
    expect(uris).toHaveLength(2);
    expect(askTakeAnother).toHaveBeenCalledTimes(1);
  });

  it('stops when the user backs out of the camera', async () => {
    const uris = await collectCameraPhotos(getCaptureModeSpec('doc'), { takePhoto: photos(0), askTakeAnother: jest.fn() });
    expect(uris).toEqual([]);
  });

  it('auto-crops and OCRs the photos through the gallery path, deleting them afterwards', async () => {
    const dispatch = jest.fn();
    const onScanMore = jest.fn();
    const spec = getCaptureModeSpec('notes');
    await runCameraFallback(dispatch, 'latin', spec, onScanMore, {
      takePhoto: photos(2),
      askTakeAnother: async () => true,
    });
    expect(dispatch).toHaveBeenCalledWith({ type: 'capture/SET_PROCESSING_STATUS', status: 'processing' });
    expect(ingestBatch).toHaveBeenCalledWith(dispatch, ['file:///cache/cam_1.jpg', 'file:///cache/cam_2.jpg'], {
      script: 'latin',
      spec,
      ownsInputs: true,
      autoCrop: true,
      onScanMore,
    });
  });

  it('goes back to idle if no photo was taken', async () => {
    const dispatch = jest.fn();
    await runCameraFallback(dispatch, 'latin', getCaptureModeSpec('doc'), jest.fn(), {
      takePhoto: photos(0),
      askTakeAnother: jest.fn(),
    });
    expect(dispatch).toHaveBeenCalledWith({ type: 'capture/SET_PROCESSING_STATUS', status: 'idle' });
    expect(ingestBatch).not.toHaveBeenCalled();
  });
});

describe('scanner pipeline fallback', () => {
  it('remembers an unavailable scanner, explains once, and falls back to the camera', async () => {
    jest.mocked(DocumentScanner.scanDocument).mockRejectedValueOnce(new Error('ApiException: 17: API is not available on this device'));
    const dispatch = jest.fn();
    await runNativeScannerPipeline(dispatch, 'latin', getCaptureModeSpec('doc'));
    const actions = dispatch.mock.calls.map(([a]) => a);
    expect(actions).toContainEqual({ type: 'settings/SET_SCANNER_UNAVAILABLE', unavailable: true });
    expect(actions).toContainEqual({ type: 'ui/SHOW_SNACK', msg: scannerUnavailableMessage() });
    expect(actions.some((a) => a.type === 'capture/SET_PROCESSING_STATUS' && a.status === 'error')).toBe(false);
    // Fell through to the camera (permission denied here -> no photos -> back to idle).
    expect(actions.at(-1)).toEqual({ type: 'capture/SET_PROCESSING_STATUS', status: 'idle' });
  });

  it('reports other scanner errors normally', async () => {
    jest.mocked(DocumentScanner.scanDocument).mockRejectedValueOnce(new Error('document scan error: null'));
    const dispatch = jest.fn();
    await runNativeScannerPipeline(dispatch, 'latin', getCaptureModeSpec('doc'));
    const actions = dispatch.mock.calls.map(([a]) => a);
    expect(actions).toContainEqual({
      type: 'capture/SET_PROCESSING_STATUS',
      status: 'error',
      errorMessage: 'document scan error: null',
    });
    expect(actions.some((a) => a.type === 'settings/SET_SCANNER_UNAVAILABLE')).toBe(false);
  });

  it('skips Google\'s scanner entirely once it is known to be unavailable', async () => {
    const dispatch = jest.fn();
    await runNativeScannerPipeline(dispatch, 'latin', getCaptureModeSpec('doc'), { scannerUnavailable: true });
    expect(DocumentScanner.scanDocument).not.toHaveBeenCalled();
  });
});
