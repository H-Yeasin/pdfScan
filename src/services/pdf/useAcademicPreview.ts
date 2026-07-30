import { useEffect, useRef, useState } from 'react';
import { File } from 'expo-file-system';
import { stampContentPageImage } from './academicRasterService';
import type { AcademicConfig } from './pdfService';

function deleteIfExists(uri: string) {
  const file = new File(uri);
  if (file.exists) file.delete();
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
