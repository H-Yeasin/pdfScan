import { createFrameMeter, readStartup } from '../perfStats';
import { ocrText, ocrWithBoxes } from '../seedLibrary';

describe('perf overlay arithmetic (§16 G9)', () => {
  it('counts frames over the last second and keeps the slowest since reset', () => {
    const meter = createFrameMeter(1000);
    for (let t = 0; t <= 1984; t += 16) meter.frame(t);
    meter.frame(2068); // one 84 ms hitch
    const r = meter.read();
    expect(r.fps).toBeGreaterThanOrEqual(55);
    expect(r.fps).toBeLessThanOrEqual(63);
    expect(r.worstMs).toBe(84);
    meter.reset();
    expect(meter.read()).toEqual({ fps: 0, worstMs: 0, frames: 0 });
  });

  it('reads start-up times from the process start when React Native has it', () => {
    const r = readStartup(
      { now: () => 5200, rnStartupTiming: { startTime: 200, executeJavaScriptBundleEntryPointStart: 650 }, memory: { usedJSHeapSize: 42 * 1_048_576 } },
      1400
    );
    expect(r).toEqual({ sinceStartMs: 5000, bundleAtMs: 450, firstScreenAtMs: 1200, heapMb: 42 });
  });

  it('falls back to the bare clock without startup timing', () => {
    const perf = {
      now: () => 300,
      get rnStartupTiming(): never {
        throw new Error('no native module');
      },
    };
    expect(readStartup(perf)).toEqual({ sinceStartMs: 300, bundleAtMs: undefined, firstScreenAtMs: undefined, heapMb: undefined });
  });
});

describe('seeded word boxes (§16 G9)', () => {
  const text = ocrText(3);
  const ocr = ocrWithBoxes(text);
  const words = ocr.blocks.flatMap((b) => b.lines.flatMap((l) => l.words ?? []));

  it('keeps every word, in order, in paragraphs', () => {
    expect(words.map((w) => w.text).join(' ')).toBe(text);
    expect(words).toHaveLength(250);
    expect(ocr.blocks.length).toBeGreaterThan(3);
  });

  it('puts every box on the page', () => {
    for (const { bounding: b } of words) {
      expect(b.left).toBeGreaterThanOrEqual(0);
      expect(b.left + b.width).toBeLessThanOrEqual(595);
      expect(b.top + b.height).toBeLessThanOrEqual(842);
    }
  });

  it('stores about as much as a real page of OCR', () => {
    const kb = JSON.stringify(ocr.blocks).length / 1024;
    expect(kb).toBeGreaterThan(20);
    expect(kb).toBeLessThan(60);
  });
});
