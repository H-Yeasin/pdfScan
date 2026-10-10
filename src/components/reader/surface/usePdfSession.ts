import { useEffect, useRef, useState } from 'react';
import type { NativePdfErrorCode } from '../../../services/documents/readerPosition';
import { PdfEncryptedError, PdfWrongPasswordError } from '../../../services/pdf/pdfNative';
import { acquirePdfSession, type PdfSession } from '../../../services/pdf/pdfSession';

// What useReaderDocument's `handlePdfError` is told (readerPosition.classifyNativePdfError reads
// it): a missing or wrong password ends in the prompt; anything else is a file no password opens,
// whatever its message says.
export function sessionErrorCode(error: unknown): NativePdfErrorCode {
  return error instanceof PdfEncryptedError || error instanceof PdfWrongPasswordError ? 'password' : 'failed';
}

// §18 W10: the open pdfium document behind a surface (services/pdf/pdfSession), held for as long
// as the surface shows this file with this password. null: not needed (`uri` null, a scan), not
// open yet, or it failed (`onError` was told). The surface is mounted again for another password
// or a rewritten file, so this never has to reopen by itself.
export function usePdfSession(uri: string | null, password: string | undefined, onError: (code: NativePdfErrorCode) => void): PdfSession | null {
  const [session, setSession] = useState<PdfSession | null>(null);
  const report = useRef(onError);
  report.current = onError;

  useEffect(() => {
    if (!uri) return;
    let cancelled = false;
    let held: PdfSession | null = null;
    acquirePdfSession(uri, password)
      .then((opened) => {
        if (cancelled) {
          opened.release();
          return;
        }
        held = opened;
        setSession(opened);
      })
      .catch((error) => {
        if (!cancelled) report.current(sessionErrorCode(error));
      });
    return () => {
      cancelled = true;
      held?.release();
      setSession(null);
    };
  }, [uri, password]);

  return session;
}
