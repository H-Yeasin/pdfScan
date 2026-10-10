import { isPageRasterFormat } from '../documents/formatCapabilities';
import { PDF_NATIVE_SESSIONS } from '../pdf/pdfNative';
import type { DocFormat } from '../../types/models';

// §18 W10: which viewer shows a file.
//  - 'surface': the page surface (components/reader/surface), for PDFs and scans, when the build
//    has pdf-native's sessions (§18 W7) and the `reader_surface` switch is on;
//  - 'pdf': react-native-pdf-jsi, the viewer until W17 turns the surface on for everyone;
//  - 'own': the format's own view (DOCX, sheets, TXT).
export type ReaderEngine = 'surface' | 'pdf' | 'own';

export function readerEngine(options: { format: DocFormat | undefined; nativeVersion: number; surface: boolean }): ReaderEngine {
  if (!options.format || !isPageRasterFormat(options.format)) return 'own';
  return options.surface && options.nativeVersion >= PDF_NATIVE_SESSIONS ? 'surface' : 'pdf';
}
