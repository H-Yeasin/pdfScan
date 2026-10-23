import PdfNative from '../../modules/pdf-native';

// §19 X1: named moments and stretches of a run, for a Perfetto trace of a *release* build
// (scripts/perf/README.md). perfMarks.ts is the dev overlay's clock and does nothing in release; this
// is what the measurements read. Each call reaches Android's android.os.Trace through
// modules/pdf-native, and costs about one JSI call when no trace is recording. Without the native
// functions (iOS, Jest, a build made before X1) every call does nothing.
//
// Names are short and fixed: every one is in the trace vocabulary in docs/qa/performance.md (§19),
// so the scripts and whoever reads a trace can search for them. Never put document text, a file
// name or anything a student typed into a name: a trace leaves the phone.
//
// On the boot path (SplashIntro, the router), so it imports only the native module.

const PREFIX = 'pdfscan.';
let nextCookie = 1;
let fullyDrawn = false;

const noop = () => {};

// A moment, e.g. 'boot.firstScreen'.
export function traceMark(name: string): void {
  try {
    PdfNative?.traceMark?.(PREFIX + name);
  } catch {
    // Tracing never gets in the way.
  }
}

// A stretch that starts now; call the returned function once it's over (later calls do nothing).
// Stretches may overlap: each has its own cookie.
export function traceBegin(name: string): () => void {
  if (!PdfNative?.traceBegin || !PdfNative.traceEnd) return noop;
  const full = PREFIX + name;
  const cookie = nextCookie++;
  try {
    PdfNative.traceBegin(full, cookie);
  } catch {
    return noop;
  }
  let open = true;
  return () => {
    if (!open) return;
    open = false;
    try {
      PdfNative?.traceEnd?.(full, cookie);
    } catch {
      // As above.
    }
  };
}

// `run` as one stretch, however it ends.
export async function traced<T>(name: string, run: () => Promise<T>): Promise<T> {
  const end = traceBegin(name);
  try {
    return await run();
  } finally {
    end();
  }
}

// The start screen is usable (the splash intro is gone): Android's "Fully drawn", once per process.
export function reportFullyDrawn(): void {
  if (fullyDrawn) return;
  fullyDrawn = true;
  traceMark('boot.usable');
  try {
    PdfNative?.reportFullyDrawn?.().catch(noop);
  } catch {
    // As above.
  }
}
