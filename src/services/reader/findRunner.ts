// §18 W2: Find's searches answer out of order. The PDF engine searches on a thread pool, so the
// result for "ph" can land after the one for "photosynthesis" and replace it, and a search still
// running when Find closes used to put its highlights back on the page. Each run takes a
// generation token; only the newest run's answer is handed back, and close() retires every run
// in flight.
export type FindRunner<Q, R> = {
  // The search's results, or null when a newer run or a close overtook it (drop it: don't
  // show it, don't scroll to it). A failed search rejects only while it is still the newest.
  run: (query: Q) => Promise<R | null>;
  // Find closed, the query was cleared or another document opened: nothing in flight may land.
  close: () => void;
};

export function createFindRunner<Q, R>(search: (query: Q) => Promise<R>): FindRunner<Q, R> {
  let generation = 0;
  return {
    async run(query) {
      generation += 1;
      const mine = generation;
      try {
        const results = await search(query);
        return mine === generation ? results : null;
      } catch (e) {
        if (mine !== generation) return null;
        throw e;
      }
    },
    close() {
      generation += 1;
    },
  };
}
