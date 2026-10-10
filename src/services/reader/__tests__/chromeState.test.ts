import { CHROME_HIDE_AFTER, CHROME_SHOW_AFTER, CHROME_SHOWN, chromeAfterScroll, chromeAfterTap, type ChromeScroll } from '../chromeState';

const MID = { atStart: false, atEnd: false };

function scrollBy(state: ChromeScroll, steps: number[], locked = false): ChromeScroll {
  return steps.reduce((now, dy) => chromeAfterScroll(now, dy, MID, locked), state);
}

describe('chromeAfterScroll', () => {
  it('hides the bars once reading has gone forward far enough', () => {
    expect(scrollBy(CHROME_SHOWN, [10, 10]).shown).toBe(true);
    expect(scrollBy(CHROME_SHOWN, [10, 10, 10]).shown).toBe(false);
    expect(chromeAfterScroll(CHROME_SHOWN, CHROME_HIDE_AFTER, MID, false).shown).toBe(false);
  });

  it('brings them back on a scroll the other way', () => {
    const hidden = scrollBy(CHROME_SHOWN, [40]);
    expect(scrollBy(hidden, [-4]).shown).toBe(false);
    expect(scrollBy(hidden, [-4, -4]).shown).toBe(true);
    expect(chromeAfterScroll(hidden, -CHROME_SHOW_AFTER, MID, false).shown).toBe(true);
  });

  it('starts the count again when the scroll turns, so a wobble never hides them', () => {
    const wobble = scrollBy(CHROME_SHOWN, [20, -2, 20, -2, 20]);
    expect(wobble.shown).toBe(true);
    expect(wobble.travel).toBe(20);
  });

  it('shows them at either end of the document', () => {
    const hidden = scrollBy(CHROME_SHOWN, [40]);
    expect(chromeAfterScroll(hidden, 5, { atStart: false, atEnd: true }, false)).toEqual(CHROME_SHOWN);
    expect(chromeAfterScroll(hidden, -1, { atStart: true, atEnd: false }, false)).toEqual(CHROME_SHOWN);
  });

  it('keeps them on while locked, whatever the scroll', () => {
    expect(scrollBy(CHROME_SHOWN, [100, 100], true)).toBe(CHROME_SHOWN);
    expect(chromeAfterScroll({ shown: false, travel: 60 }, 30, MID, true)).toEqual(CHROME_SHOWN);
  });

  it('hands back the same state when nothing moved', () => {
    const state = { shown: false, travel: 30 };
    expect(chromeAfterScroll(state, 0, MID, false)).toBe(state);
  });
});

describe('chromeAfterTap', () => {
  it('toggles, unless locked on', () => {
    expect(chromeAfterTap(true, false)).toBe(false);
    expect(chromeAfterTap(false, false)).toBe(true);
    expect(chromeAfterTap(true, true)).toBe(true);
    expect(chromeAfterTap(false, true)).toBe(true);
  });
});
