// §9 O3: one-time hints. Each shows exactly once (its id goes into settings.hintsSeen as soon as it
// appears, so leaving the screen without "Got it" still counts), at most one per screen visit,
// never while a scan is being processed, and never over a dialog (the caller passes `blocked`).

export type HintId = 'scan' | 'reviewFilters' | 'submit' | 'readerBookmark';

export type HintContext = {
  seen: readonly string[];
  // A scan is being captured or processed.
  busy: boolean;
  // Something covers the anchor (a sheet or dialog is open), or the anchor isn't on screen.
  blocked: boolean;
  // Changes on every navigation (the router's navTick): one hint per value.
  visitKey: number;
};

export type HintScheduler = {
  // True when `id` may show now; claims the visit for it.
  tryClaim(id: HintId, ctx: HintContext): boolean;
};

export function createHintScheduler(): HintScheduler {
  let claimed: { visitKey: number; id: HintId } | null = null;
  return {
    tryClaim(id, ctx) {
      if (ctx.seen.includes(id) || ctx.busy || ctx.blocked) return false;
      if (claimed && claimed.visitKey === ctx.visitKey && claimed.id !== id) return false;
      claimed = { visitKey: ctx.visitKey, id };
      return true;
    },
  };
}

// The app's one scheduler: hints on the same screen visit compete for it.
export const hintScheduler = createHintScheduler();
