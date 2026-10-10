import { AVAILABLE_FILTER_IDS, FILTER_IDS } from '../filterIds';
import { FILTERS } from '../registry';

// §16 G3: boot code reads the ids from filterIds.ts so it doesn't load the filters; the two lists
// must not drift apart.
describe('filterIds', () => {
  it('lists every registered filter, in the registry order', () => {
    expect(FILTER_IDS).toEqual(FILTERS.map((spec) => spec.id));
  });

  it('marks the same filters available as the registry', () => {
    expect(AVAILABLE_FILTER_IDS).toEqual(FILTERS.filter((spec) => spec.available).map((spec) => spec.id));
  });
});
