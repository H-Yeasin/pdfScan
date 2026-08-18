import { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Pdf from 'react-native-pdf-jsi';

export type PdfPageViewHandle = {
  goToPage: (pageNumber: number) => void; // 1-indexed, matches react-native-pdf-jsi's own convention
};

export type PdfOutlineNode = {
  children: PdfOutlineNode[];
  pageIdx: number;
  title: string;
};

type PdfPageViewProps = {
  uri: string;
  pdfId: string;
  password?: string;
  night: boolean;
  onLoad: (pageCount: number, outline: PdfOutlineNode[] | undefined) => void;
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
  { uri, pdfId, password, night, onLoad, onPageChanged, onTap, onError, highlightRects },
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
        fitPolicy={0}
        highlightRects={highlightRects}
        onLoadComplete={(numberOfPages, _path, _size, tableContents) =>
          onLoad(numberOfPages, tableContents as PdfOutlineNode[] | undefined)
        }
        onPageChanged={(page, numberOfPages) => onPageChanged(page, numberOfPages)}
        onPageSingleTap={(page) => onTap?.(page)}
        onError={(error) => onError(typeof error === 'string' ? error : JSON.stringify(error))}
      />
      {night && <View pointerEvents="none" style={styles.nightOverlay} />}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  pdf: { flex: 1 },
  nightOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,8,6,0.72)',
  },
});
