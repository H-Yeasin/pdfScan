import { createHintScheduler, type HintContext } from '../hints';

const ctx = (patch: Partial<HintContext> = {}): HintContext => ({ seen: [], busy: false, blocked: false, visitKey: 1, ...patch });

describe('hint scheduling', () => {
  it('shows a hint only while it is unseen', () => {
    const s = createHintScheduler();
    expect(s.tryClaim('scan', ctx({ seen: ['scan'] }))).toBe(false);
    expect(s.tryClaim('scan', ctx())).toBe(true);
  });

  it('shows at most one hint per screen visit', () => {
    const s = createHintScheduler();
    expect(s.tryClaim('readerBookmark', ctx({ visitKey: 5 }))).toBe(true);
    expect(s.tryClaim('submit', ctx({ visitKey: 5 }))).toBe(false);
    // The same hint re-checking on its own visit keeps its claim.
    expect(s.tryClaim('readerBookmark', ctx({ visitKey: 5 }))).toBe(true);
    // The next visit is free again.
    expect(s.tryClaim('submit', ctx({ visitKey: 6 }))).toBe(true);
  });

  it('never shows while busy or covered, and doesn’t use up the visit', () => {
    const s = createHintScheduler();
    expect(s.tryClaim('reviewFilters', ctx({ busy: true }))).toBe(false);
    expect(s.tryClaim('reviewFilters', ctx({ blocked: true }))).toBe(false);
    expect(s.tryClaim('scan', ctx())).toBe(true);
  });
});
