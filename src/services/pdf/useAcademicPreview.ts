import { useEffect, useRef, useState } from 'react';
import { File } from 'expo-file-system';
import { renderCoverPageImage, stampContentPageImage } from './academicRasterService';
import type { AcademicConfig, CoverPageConfig } from './pdfService';

function deleteIfExists(uri: string) {
  const file = new File(uri);
  if (file.exists) file.delete();
}

// Live "what will actually end up in the library" preview for the Review screen's cover slot.
// Mirrors useEnhancedPreview's cancellation/cleanup shape: imported-image covers are a cheap
// passthrough, template covers get rendered through the same Skia path buildPdfFromPages' library
// copy uses, so the preview is pixel-accurate rather than an approximation.
export function useAcademicCoverPreview(cover: CoverPageConfig | undefined) {
  const [previewUri, setPreviewUri] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const renderedRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!cover) {
      if (renderedRef.current) {
        deleteIfExists(renderedRef.current);
        renderedRef.current = null;
      }
      setLoading(false);
      setPreviewUri(undefined);
      return;
    }

    if (cover.mode === 'imported_image') {
      if (renderedRef.current) {
        deleteIfExists(renderedRef.current);
        renderedRef.current = null;
      }
      setLoading(false);
      setPreviewUri(cover.importedUri);
      return;
    }

    setLoading(true);
    renderCoverPageImage(cover).then((rendered) => {
      if (cancelled) {
        if (rendered) deleteIfExists(rendered.uri);
        return;
      }
      if (renderedRef.current) deleteIfExists(renderedRef.current);
      renderedRef.current = rendered?.uri ?? null;
      setLoading(false);
      setPreviewUri(rendered?.uri);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cover?.mode, cover?.title, cover?.studentName, cover?.courseCode, cover?.importedUri]);

  useEffect(() => {
    return () => {
      if (renderedRef.current) deleteIfExists(renderedRef.current);
    };
  }, []);

  return { previewUri, loading };
}

// Live border/header-footer preview for a single CONTENT page in the Review screen's main
// viewer. Runs the exact same stampContentPageImage used to build the library's own stamped
// copies, so toggling border/header/footer in Academic Options and coming back here shows
// precisely what will get saved - not a CSS approximation layered on top of the raw image.
export function useAcademicStampPreview(
  uri: string | undefined,
  config: AcademicConfig | null | undefined,
  pageNumber: number,
  totalPages: number
) {
  const [previewUri, setPreviewUri] = useState<string | undefined>(uri);
  const [loading, setLoading] = useState(false);
  const stampedRef = useRef<string | null>(null);

  const active = !!config && (config.enableBorder || !!config.headerText || !!config.footerText);

  useEffect(() => {
    let cancelled = false;

    if (!uri || !active || !config) {
      if (stampedRef.current) {
        deleteIfExists(stampedRef.current);
        stampedRef.current = null;
      }
      setLoading(false);
      setPreviewUri(uri);
      return;
    }

    setLoading(true);
    stampContentPageImage(uri, config, pageNumber, totalPages).then((stamped) => {
      if (cancelled) {
        deleteIfExists(stamped.uri);
        return;
      }
      if (stampedRef.current) deleteIfExists(stampedRef.current);
      stampedRef.current = stamped.uri;
      setLoading(false);
      setPreviewUri(stamped.uri);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri, active, config?.enableBorder, config?.headerText, config?.footerText, pageNumber, totalPages]);

  useEffect(() => {
    return () => {
      if (stampedRef.current) deleteIfExists(stampedRef.current);
    };
  }, []);

  return { previewUri, loading };
}
