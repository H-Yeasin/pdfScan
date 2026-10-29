import { passLeftLabel, proPassCardState } from '../ProPassCard';
import { passShortLabel } from '../ProPassBadge';

// §17 U6: the Pro pass on Home (the header badge) and Me (the card).
describe('proPassCardState', () => {
  const now = 1_000_000;

  it('counts a running pass down in minutes', () => {
    expect(proPassCardState({ source: 'pass', expiresAt: now + 42 * 60_000 }, true, true, now)).toEqual({ kind: 'active', minutes: 42 });
  });

  it('offers a pass only while ads can give one', () => {
    expect(proPassCardState(null, false, true, now)).toEqual({ kind: 'offer' });
    expect(proPassCardState(null, false, false, now)).toBeNull();
  });

  it('shows a running pass even with ads off, and nothing for a paid licence', () => {
    expect(proPassCardState({ source: 'pass', expiresAt: now + 60_000 }, true, false, now)).toEqual({ kind: 'active', minutes: 1 });
    expect(proPassCardState({ source: 'lifetime' }, true, true, now)).toBeNull();
  });
});

describe('passLeftLabel', () => {
  it('says minutes, then hours and minutes', () => {
    expect(passLeftLabel(42)).toBe('42 min left');
    expect(passLeftLabel(80)).toBe('1 h 20 min left');
  });
});

// Home's header badge: the time left as the logo's exponent.
describe('passShortLabel', () => {
  it('fits in a few characters', () => {
    expect(passShortLabel(42)).toBe('42m');
    expect(passShortLabel(60)).toBe('1h');
    expect(passShortLabel(80)).toBe('1h 20m');
  });
});
