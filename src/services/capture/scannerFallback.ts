import type { Dispatch } from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { t } from '../../i18n';
import type { AppAction } from '../../store/appReducer';
import type { OcrScript } from '../../types/models';
import type { CaptureModeSpec } from './captureModes';
import { ingestBatch } from './ingestBatch';

// --- Is Google's scanner missing on this phone? ------------------------------------------------
//
// The scanner lives in Google Play services. On phones without them (Huawei, some Chinese ROMs,
// emulator images) or with a too-old version, scanDocument rejects; the plugin passes the native
// message through. These patterns match the Play services / ML Kit "can't run here" failures. A
// transient state - the scanner module still downloading on first use - is deliberately NOT
// treated as unavailable: it works a moment later, and flagging it would permanently downgrade
// the phone to the basic camera.
const UNAVAILABLE_PATTERNS = [
  /google play services/i,
  /\bSERVICE_(MISSING|INVALID|DISABLED|VERSION_UPDATE_REQUIRED)\b/,
  /\bAPI_UNAVAILABLE\b/,
  /\bnot available on this device\b/i,
  /\bis not available\b/i,
  /\bunavailable\b/i,
  /\bnot supported\b/i,
  /\bapiexception: (16|17)\b/i,
];
const TRANSIENT_PATTERNS = [/download/i, /\btry again\b/i, /\bbusy\b/i];

export function isScannerUnavailableError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? '');
  if (TRANSIENT_PATTERNS.some((p) => p.test(message))) return false;
  return UNAVAILABLE_PATTERNS.some((p) => p.test(message));
}

// A function, not a constant, so it is read in the language active when it's shown.
export const scannerUnavailableMessage = () => t('capture.scannerUnavailable');

// --- Basic camera mode -------------------------------------------------------------------------

export type CameraFallbackDeps = {
  // Takes one photo; resolves to its uri, or null if the user backs out.
  takePhoto: () => Promise<string | null>;
  // After each photo: true to take another.
  askTakeAnother: (taken: number) => Promise<boolean>;
};

async function takePhotoWithSystemCamera(): Promise<string | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return null;
  // Full quality: ingestPage does the one encode to the master spec.
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
  return result.canceled ? null : (result.assets[0]?.uri ?? null);
}

function askWithAlert(taken: number): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      t('capture.fallback.taken', { count: taken }),
      t('capture.fallback.takeAnotherQuestion'),
      [
        { text: t('capture.fallback.done'), style: 'cancel', onPress: () => resolve(false) },
        { text: t('capture.fallback.takeAnother'), onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}

const SYSTEM_CAMERA: CameraFallbackDeps = { takePhoto: takePhotoWithSystemCamera, askTakeAnother: askWithAlert };

// Collects up to the mode's page limit, one system-camera photo at a time.
export async function collectCameraPhotos(spec: CaptureModeSpec, deps: CameraFallbackDeps = SYSTEM_CAMERA): Promise<string[]> {
  const uris: string[] = [];
  while (uris.length < spec.pageLimit) {
    const uri = await deps.takePhoto();
    if (!uri) break;
    uris.push(uri);
    if (uris.length >= spec.pageLimit || !(await deps.askTakeAnother(uris.length))) break;
  }
  return uris;
}

// Scanning without Google's scanner: plain camera photos, then the same ingest as gallery
// imports - automatic page detection and crop (C5), the mode's post-processing, OCR. The photos
// are temporary files in our cache, so ingest deletes them. The caller has set 'scanning'.
export async function runCameraFallback(
  dispatch: Dispatch<AppAction>,
  script: OcrScript,
  spec: CaptureModeSpec,
  onScanMore: () => void,
  deps: CameraFallbackDeps = SYSTEM_CAMERA
): Promise<void> {
  let uris: string[];
  try {
    uris = await collectCameraPhotos(spec, deps);
  } catch (error) {
    dispatch({
      type: 'capture/SET_PROCESSING_STATUS',
      status: 'error',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return;
  }
  if (uris.length === 0) {
    dispatch({ type: 'capture/SET_PROCESSING_STATUS', status: 'idle' });
    return;
  }
  dispatch({ type: 'capture/SET_PROCESSING_STATUS', status: 'processing' });
  await ingestBatch(dispatch, uris, { script, spec, ownsInputs: true, autoCrop: true, onScanMore });
}
