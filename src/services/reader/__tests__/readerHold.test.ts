import { holdReader, isReaderHeld } from '../readerHold';

describe('readerHold', () => {
  it('is held until every holder has let go, and a release counts once', () => {
    expect(isReaderHeld()).toBe(false);
    const first = holdReader();
    const second = holdReader();
    expect(isReaderHeld()).toBe(true);
    first();
    first();
    expect(isReaderHeld()).toBe(true);
    second();
    expect(isReaderHeld()).toBe(false);
  });
});
