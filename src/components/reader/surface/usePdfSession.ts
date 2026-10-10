import { useEffect, useRef, useState } from 'react';
import { PdfEncryptedError, PdfWrongPasswordError } from '../../../services/pdf/pdfNative';
import { acquirePdfSession, type PdfSession } from '../../../services/pdf/pdfSession';

// What useReaderDocument's `handlePdfError` is told (readerPosition.classifyPdfError reads it):
// the words pdf-jsi uses for a missing or wrong password, so both viewers end in the same prompt;
// anything else is a file no password opens.
const PASSWORD_MESSAGE = 'Password required or incorrect password.';
const LOAD_FAILED_MESSAGE = 'Load pdf failed';

export function sessionErrorMessage(error: unknown): string {
  if (error instanceof PdfEncryptedError || error instanceof PdfWrongPasswordError) return PASSWORD_MESSAGE;
  const message = error instanceof Error ? error.message : '';
  return message && !/password/i.test(message) ? message : LOAD_FAILED_MESSAGE;
}

// §18 W10: the open pdfium document behind a surface (services/pdf/pdfSession), held for as long
// as the surface shows this file with this password. null: not needed (`uri` null, a scan), not
// open yet, or it failed (`onError` was told). The surface is mounted again for another password
// or a rewritten file, so this never has to reopen by itself.
export function usePdfSession(uri: string | null, password: string | undefined, onError: (message: string) => void): PdfSession | null {
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
        if (!cancelled) report.current(sessionErrorMessage(error));
      });
    return () => {
      cancelled = true;
      held?.release();
      setSession(null);
    };
  }, [uri, password]);

  return session;
}
