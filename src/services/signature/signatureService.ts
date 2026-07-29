import type { RefObject } from 'react';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

// Flattens whatever is rendered inside the given view (expected to be a page image with a
// SignaturePad drawn on top) into a single real JPEG file.
export async function captureSignedPage(ref: RefObject<View | null>): Promise<string> {
  return captureRef(ref, { format: 'jpg', quality: 0.92, result: 'tmpfile' });
}

// Captures an isolated signature (ink only, no backing page image) as a transparent PNG,
// for later placement onto a specific PDF page via pdfService's applySignatureToPdf.
export async function captureIsolatedSignature(ref: RefObject<View | null>): Promise<string> {
  return captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile' });
}
