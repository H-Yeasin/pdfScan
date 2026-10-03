import * as SecureStore from 'expo-secure-store';
import { applyReward, claimDayPass, loadPassLog, normalizePassLog, passesLeftToday, passesOnDay } from '../dayPass';
import { getEntitlement, isProActive, setEntitlement } from '../entitlement';

const HOUR = 60 * 60 * 1000;
// Local noon, so "today" is the same day in any test time zone.
const NOON = new Date(2026, 9, 3, 12, 0).getTime();

beforeEach(async () => {
  (SecureStore as unknown as { __reset(): void }).__reset();
  await setEntitlement(null);
});

describe('daily cap', () => {
  it("counts only today's passes", () => {
    const log = [NOON - 24 * HOUR, NOON - HOUR, NOON];
    expect(passesOnDay(log, NOON)).toBe(2);
    expect(passesLeftToday(log, NOON, 3)).toBe(1);
    expect(passesLeftToday(log, NOON, 2)).toBe(0);
    // Tomorrow starts fresh.
    expect(passesLeftToday(log, NOON + 24 * HOUR, 3)).toBe(3);
  });

  it('gives nothing once the cap is reached, and a pass of pass_hours before', () => {
    expect(applyReward(null, [NOON - HOUR, NOON - 2 * HOUR], NOON, 24, 2)).toEqual({ capped: true });
    const result = applyReward(null, [], NOON, 24, 3);
    if ('capped' in result) throw new Error('capped');
    expect(result.entitlement).toMatchObject({ source: 'pass', expiresAt: NOON + 24 * HOUR, checkedAt: NOON });
    expect(result.log).toEqual([NOON]);
  });

  it('a cap of 0 offers no passes', () => {
    expect(applyReward(null, [], NOON, 24, 0)).toEqual({ capped: true });
  });

  it('adds to a running pass and drops entries older than a week', () => {
    const first = applyReward(null, [NOON - 10 * 24 * HOUR], NOON, 24, 3);
    if ('capped' in first) throw new Error('capped');
    expect(first.log).toEqual([NOON]);
    const second = applyReward(first.entitlement, first.log, NOON + HOUR, 24, 3);
    if ('capped' in second) throw new Error('capped');
    expect(second.entitlement.expiresAt).toBe(NOON + 48 * HOUR);
  });

  it('reads a damaged log as empty', () => {
    expect(normalizePassLog('x')).toEqual([]);
    expect(normalizePassLog([1, 'a', NaN, 2])).toEqual([1, 2]);
  });
});

describe('claimDayPass', () => {
  it('grants and stores, up to the cap', async () => {
    expect(await claimDayPass(NOON, 24, 2)).toBe(true);
    expect(isProActive(getEntitlement(), NOON + HOUR)).toBe(true);
    expect(await claimDayPass(NOON + HOUR, 24, 2)).toBe(true);
    expect(await claimDayPass(NOON + 2 * HOUR, 24, 2)).toBe(false);
    expect(await loadPassLog()).toEqual([NOON, NOON + HOUR]);
    expect(getEntitlement()?.expiresAt).toBe(NOON + 48 * HOUR);
  });
});
