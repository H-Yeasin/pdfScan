import { useCallback, useEffect, useRef, useState } from 'react';
import type { LockState } from '../types/capture';

const SEARCH_MIN_MS = 900;
const SEARCH_JITTER_MS = 500;
const AUTO_CAPTURE_HOLD_MS = 650;

// No real edge-detection model is wired up (see AGENTS.md context) — this is a timer-based
// stand-in for "the page is framed and steady" so the UI can be built and feel right now.
// Swap the searching->locked transition below for a real detector without touching callers.
export function useDocumentLock(autoCaptureEnabled: boolean, onAutoCapture: () => void) {
  const [lockState, setLockState] = useState<LockState>('searching');
  const autoCaptureFired = useRef(false);

  useEffect(() => {
    if (lockState !== 'searching') return;
    const delay = SEARCH_MIN_MS + Math.random() * SEARCH_JITTER_MS;
    const timer = setTimeout(() => setLockState('locked'), delay);
    return () => clearTimeout(timer);
  }, [lockState]);

  useEffect(() => {
    if (lockState !== 'locked') {
      autoCaptureFired.current = false;
      return;
    }
    if (!autoCaptureEnabled || autoCaptureFired.current) return;

    autoCaptureFired.current = true;
    const timer = setTimeout(onAutoCapture, AUTO_CAPTURE_HOLD_MS);
    return () => clearTimeout(timer);
  }, [lockState, autoCaptureEnabled, onAutoCapture]);

  const beginCapture = useCallback(() => setLockState('capturing'), []);

  const resetForNextPage = useCallback(() => {
    autoCaptureFired.current = false;
    setLockState('searching');
  }, []);

  return { lockState, beginCapture, resetForNextPage };
}
