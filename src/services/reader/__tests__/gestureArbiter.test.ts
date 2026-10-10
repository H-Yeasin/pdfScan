import { hasReadingTaps, panMode, PINCH_GUARD_MS, routeTap, strokeOutcome, TAP_JITTER, type StrokeFacts } from '../gestureArbiter';

// A one-finger stroke that was let go after travelling well past a tap's jitter.
const clean: StrokeFacts = { success: true, multiTouch: false, startedAt: 1000, pinchAt: null, travel: 80 };

describe('§18 W15 strokeOutcome (the pinch race)', () => {
  it('one finger, no pinch, a real line: a mark', () => {
    expect(strokeOutcome(clean)).toBe('commit');
  });

  it('a second finger at any point: nothing is drawn', () => {
    expect(strokeOutcome({ ...clean, multiTouch: true })).toBe('discard');
  });

  it('a pinch that begins while the stroke is drawn, or just around its start: nothing', () => {
    // Two fingers landing one after the other: the first drew a little before the pinch began.
    expect(strokeOutcome({ ...clean, pinchAt: 1000 + 40 })).toBe('discard');
    expect(strokeOutcome({ ...clean, pinchAt: 1000 + PINCH_GUARD_MS })).toBe('discard');
    // A finger already down and drawing for a second when the other joins.
    expect(strokeOutcome({ ...clean, pinchAt: 2000 })).toBe('discard');
    // The pinch began a moment before the stroke did.
    expect(strokeOutcome({ ...clean, pinchAt: 1000 - 30 })).toBe('discard');
  });

  it("a pinch that was over well before the stroke began doesn't count", () => {
    expect(strokeOutcome({ ...clean, pinchAt: 1000 - PINCH_GUARD_MS - 1 })).toBe('commit');
  });

  it('a cancelled gesture draws nothing, however far it went', () => {
    expect(strokeOutcome({ ...clean, success: false })).toBe('discard');
  });

  it('a stroke no longer than a shaky tap is the tap it was', () => {
    expect(strokeOutcome({ ...clean, travel: TAP_JITTER - 1 })).toBe('tap');
    expect(strokeOutcome({ ...clean, travel: TAP_JITTER })).toBe('commit');
    // But not when a second finger made it short.
    expect(strokeOutcome({ ...clean, travel: 2, multiTouch: true })).toBe('discard');
  });
});

describe('§18 W15 what one finger does', () => {
  it('reading and selecting scroll; so does the Hand tool', () => {
    expect(panMode('read', 'pen')).toBe('scroll');
    expect(panMode('select', 'highlight')).toBe('scroll');
    expect(panMode('mark', 'hand')).toBe('scroll');
  });

  it('a drawing tool draws; a tap tool moves the box it begins on', () => {
    for (const tool of ['highlight', 'underline', 'strike', 'pen'] as const) expect(panMode('mark', tool)).toBe('draw');
    for (const tool of ['note', 'text', 'eraser'] as const) expect(panMode('mark', tool)).toBe('drag');
  });

  it('placing a signature has its own mode, whatever Mark tool was last used', () => {
    expect(panMode('sign', 'pen')).toBe('sign');
  });

  it('only reading and selecting wait for a second tap or a held finger', () => {
    expect(hasReadingTaps('read')).toBe(true);
    expect(hasReadingTaps('select')).toBe(true);
    expect(hasReadingTaps('mark')).toBe(false);
    expect(hasReadingTaps('sign')).toBe(false);
  });
});

describe('§18 W15 routeTap', () => {
  const free = { selectionOpen: false, onLink: false, findOpen: false };

  it("a Mark tool takes the tap; a tap beside the signature being placed does nothing", () => {
    expect(routeTap({ ...free, tool: 'mark', onLink: true })).toBe('tool');
    expect(routeTap({ ...free, tool: 'sign', onLink: true })).toBe('none');
  });

  it('a selection comes before a link, a link before the bars', () => {
    expect(routeTap({ ...free, tool: 'read', selectionOpen: true, onLink: true })).toBe('selection');
    expect(routeTap({ ...free, tool: 'select' })).toBe('selection');
    expect(routeTap({ ...free, tool: 'read', onLink: true })).toBe('link');
    expect(routeTap({ ...free, tool: 'read' })).toBe('chrome');
  });

  it('with Find open a tap never hides the bars', () => {
    expect(routeTap({ ...free, tool: 'read', findOpen: true })).toBe('none');
  });
});
