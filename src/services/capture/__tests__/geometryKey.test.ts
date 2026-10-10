import type { SessionPage } from '../../../types/models';
import { geometryKey, masterGeometryKey, ocrFitsPage } from '../geometryKey';

const ocr = { text: 'Lab report', blocks: [] };
const base: SessionPage = { id: 'p', uri: 'a.jpg', width: 1800, height: 2400, rotation: 0, enhance: 'auto' };
// As ingest leaves a page: read from its unturned master.
const read: SessionPage = { ...base, ocr, ocrGeometry: masterGeometryKey(base, 'latin') };

describe('geometryKey', () => {
  it('is the same for a page read as it lies and the page unturned', () => {
    expect(masterGeometryKey(base, 'latin')).toBe(geometryKey(base, 'latin'));
  });

  it('ignores the filter, its options and the sliders', () => {
    const look: SessionPage = { ...read, enhance: 'ink', adjust: { brightness: 0.4, contrast: -0.2, saturation: 0 }, filterOptions: {} };
    expect(ocrFitsPage(look, 'latin')).toBe(true);
  });

  it('changes with the image, its size, its turn and the script', () => {
    expect(ocrFitsPage(read, 'latin')).toBe(true);
    expect(ocrFitsPage({ ...read, uri: 'cropped.jpg' }, 'latin')).toBe(false);
    expect(ocrFitsPage({ ...read, width: 1700 }, 'latin')).toBe(false);
    expect(ocrFitsPage({ ...read, rotation: 90 }, 'latin')).toBe(false);
    expect(ocrFitsPage(read, 'devanagari')).toBe(false);
  });

  it('never fits a page with no text, or text of unknown origin', () => {
    expect(ocrFitsPage({ ...read, ocr: undefined }, 'latin')).toBe(false);
    expect(ocrFitsPage({ ...base, ocr }, 'latin')).toBe(false);
  });
});
