import { toLocalDateString } from '../localDate';
import { msUntilNextDay } from '../useDayClock';

describe('msUntilNextDay', () => {
  it('lands on the next local day, at its first millisecond', () => {
    for (const at of [new Date(2026, 9, 10, 0, 0, 0, 0), new Date(2026, 9, 10, 13, 30), new Date(2026, 9, 10, 23, 59, 59, 999), new Date(2026, 11, 31, 22, 0)]) {
      const now = at.getTime();
      const wait = msUntilNextDay(now);
      expect(wait).toBeGreaterThan(0);
      expect(toLocalDateString(now + wait)).not.toBe(toLocalDateString(now));
      expect(toLocalDateString(now + wait - 1)).toBe(toLocalDateString(now));
    }
  });
});
