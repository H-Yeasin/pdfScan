// The one page-processing batch that may be running (a scan or a gallery import), so the UI can
// cancel it without the pipeline having to live in a component. Starting a new batch supersedes
// (aborts) any previous one.
let current: AbortController | null = null;

export function beginProcessing(): AbortSignal {
  current?.abort();
  current = new AbortController();
  return current.signal;
}

export function endProcessing(signal: AbortSignal): void {
  if (current?.signal === signal) current = null;
}

// Stops after the page currently being processed; pages already done are kept.
export function cancelProcessing(): void {
  current?.abort();
}

export function isProcessing(): boolean {
  return current !== null;
}
