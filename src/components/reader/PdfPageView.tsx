import { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Pdf from 'react-native-pdf-jsi';

export type PdfPageViewHandle = {
  goToPage: (pageNumber: number) => void; // 1-indexed, matches react-native-pdf-jsi's own convention
};

type PdfPageViewProps = {
  uri: string;
  pdfId: string;
  password?: string;
  night: boolean;
  // §12 D2: the night overlay's opacity, and the reading settings' layout, fit and spacing
  // (readingSettings.pdfViewOptions).
  nightAlpha: number;
  enablePaging: boolean;
  fitPolicy: 0 | 2;
  spacing: number;
  onLoad: (pageCount: number) => void;
  onPageChanged: (page: number, pageCount: number) => void; // 1-indexed
  onTap?: (page: number) => void;
  onError: (message: string) => void;
  highlightRects?: Array<{ page: number; rect: string }>;
};

// Thin wrapper around react-native-pdf-jsi's <Pdf> - isolates the rest of the reader from that
// package's exact prop/callback shapes (verified against its real installed source, not its
// README - see the plan file's §2/§9 for what was checked). No engine-native night/invert mode
// exists (confirmed absent from the props interface and grepped the whole package for
// invert/night/dark/grayscale - zero matches), so night mode here is a dim overlay rather than a
// true color invert - an accepted MVP simplification, not a bug.
export const PdfPageView = forwardRef<PdfPageViewHandle, PdfPageViewProps>(function PdfPageView(
  { uri, pdfId, password, night, nightAlpha, enablePaging, fitPolicy, spacing, onLoad, onPageChanged, onTap, onError, highlightRects },
  ref
) {
  const innerRef = useRef<Pdf>(null);

  useImperativeHandle(
    ref,
    () => ({
      goToPage: (pageNumber: number) => innerRef.current?.setPage(pageNumber),
    }),
    []
  );

  return (
    <View style={styles.container}>
      <Pdf
        ref={innerRef}
        pdfId={pdfId}
        source={{ uri }}
        password={password}
        style={styles.pdf}
        enableDoubleTapZoom
        enableAnnotationRendering
        fitPolicy={fitPolicy}
        enablePaging={enablePaging}
        spacing={spacing}
        highlightRects={highlightRects}
        onLoadComplete={(numberOfPages) => onLoad(numberOfPages)}
        onPageChanged={(page, numberOfPages) => onPageChanged(page, numberOfPages)}
        onPageSingleTap={(page) => onTap?.(page)}
        onError={(error) => onError(errorMessage(error))}
      />
      {night && <View pointerEvents="none" style={[styles.nightOverlay, { backgroundColor: `rgba(10,8,6,${nightAlpha})` }]} />}
    </View>
  );
});

// pdf-jsi hands onError an Error built from the native message (index.js _onChange), and
// JSON.stringify of an Error is "{}" - so the message is read directly (§7 R4 tells a password
// from a damaged file by it).
function errorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string' ? message : JSON.stringify(error);
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pdf: { flex: 1 },
  nightOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
