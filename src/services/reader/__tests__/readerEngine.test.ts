import { readerEngine } from '../readerEngine';
import { holdReader, isReaderHeld } from '../readerHold';

describe('readerEngine', () => {
  it('uses the surface for PDFs and scans only with the switch on and a build that has sessions', () => {
    expect(readerEngine({ format: 'PDF', nativeVersion: 2, surface: true })).toBe('surface');
    expect(readerEngine({ format: 'JPG', nativeVersion: 2, surface: true })).toBe('surface');
    expect(readerEngine({ format: 'PDF', nativeVersion: 3, surface: true })).toBe('surface');
  });

  it('keeps the old viewer with the switch off, or on a build without sessions', () => {
    expect(readerEngine({ format: 'PDF', nativeVersion: 2, surface: false })).toBe('pdf');
    expect(readerEngine({ format: 'PDF', nativeVersion: 1, surface: true })).toBe('pdf');
    expect(readerEngine({ format: 'JPG', nativeVersion: 0, surface: true })).toBe('pdf');
  });

  it("leaves the other formats to their own views, whatever the switch says", () => {
    for (const format of ['DOCX', 'XLSX', 'XLS', 'CSV', 'TXT'] as const) {
      expect(readerEngine({ format, nativeVersion: 2, surface: true })).toBe('own');
    }
    expect(readerEngine({ format: undefined, nativeVersion: 2, surface: true })).toBe('own');
  });
});

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
