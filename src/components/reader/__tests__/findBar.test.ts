import { t } from '../../../i18n';
import { findCountLabel } from '../FindBar';

describe('findCountLabel', () => {
  it('says nothing without a query', () => {
    expect(findCountLabel('  ', { current: 0, total: 0, scanning: false }, t)).toBe('');
    expect(findCountLabel('', { total: 4 }, t)).toBe('');
  });

  it('shows the match Find is on among the ones found', () => {
    expect(findCountLabel('the', { current: 3, total: 27, scanning: false }, t)).toBe('3 of 27');
  });

  it('marks a count that is still growing', () => {
    expect(findCountLabel('the', { current: 1, total: 12, scanning: true }, t)).toBe('1 of 12+');
    // Matches are in but none is chosen yet (they are all before the reading position).
    expect(findCountLabel('the', { current: 0, total: 5, scanning: true }, t)).toBe('5+');
  });

  it('waits for the search to end before saying there are none', () => {
    expect(findCountLabel('zzz', { current: 0, total: 0, scanning: true }, t)).toBe('');
    expect(findCountLabel('zzz', { current: 0, total: 0, scanning: false }, t)).toBe('No matches');
  });

  it('shows a bare total for a viewer without a current match', () => {
    expect(findCountLabel('a', { total: 0 }, t)).toBe('0');
    expect(findCountLabel('a', { total: 14 }, t)).toBe('14');
  });
});
