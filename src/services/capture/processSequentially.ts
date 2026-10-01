export type BatchProgress = { done: number; total: number };

export type BatchResult<T> = {
  items: T[];
  cancelled: boolean;
  // Set when a step threw. Items finished before the failure are still returned.
  error?: unknown;
  // Index of the input that failed, if any.
  failedIndex?: number;
};

export type BatchOptions<I> = {
  // Checked between items (never mid-item): cancelling keeps every finished item.
  signal?: AbortSignal;
  // Called with { done: 0 } before the first item and after each finished item.
  onProgress?: (progress: BatchProgress) => void;
  // Called for every input that was never processed (after a cancel or a failure, including the
  // one that failed), so its temporary file can be deleted.
  discardInput?: (input: I) => void;
};

// Runs `step` over the inputs strictly one at a time - full-size scans and photos are big enough
// that processing them concurrently risks OOM on mid-range Android - with progress reporting,
// cooperative cancellation between items, and no work thrown away: whatever finished before a
// cancel or a failure is returned.
export async function processSequentially<I, T>(
  inputs: readonly I[],
  step: (input: I, index: number) => Promise<T>,
  options: BatchOptions<I> = {}
): Promise<BatchResult<T>> {
  const { signal, onProgress, discardInput } = options;
  const items: T[] = [];
  const total = inputs.length;
  const discardFrom = (index: number) => {
    if (discardInput) for (let i = index; i < total; i++) discardInput(inputs[i]);
  };

  onProgress?.({ done: 0, total });
  for (let i = 0; i < total; i++) {
    if (signal?.aborted) {
      discardFrom(i);
      return { items, cancelled: true };
    }
    try {
      items.push(await step(inputs[i], i));
    } catch (error) {
      discardFrom(i);
      return { items, cancelled: false, error, failedIndex: i };
    }
    onProgress?.({ done: i + 1, total });
  }
  return { items, cancelled: false };
}
