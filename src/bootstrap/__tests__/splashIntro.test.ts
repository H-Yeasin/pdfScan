import { MARK_CONTENT_BOX, MARK_PIECES, WHITE_PIECES } from '../../components/brand/markGeometry';
import { SPLASH_TIMEOUT_MS } from '../splash';
import {
  INTRO_PHASES,
  INTRO_TOTAL_MS,
  introFrame,
  introPlan,
  PAINT_RUNS,
  paintRuns,
  PIECE_DIRECTIONS,
  resetFirstMountForTests,
  shouldExit,
  SPLASH_EXIT_MS,
  SWEEP_BAND,
  SWEEP_FROM,
  SWEEP_TO,
  sweepLine,
  takeFirstMount,
} from '../splashIntro';

// §15 V5: the splash intro's rules and timeline. The overlay itself (Skia, Reanimated) isn't
// rendered under Jest; everything it decides is here.

describe('introPlan', () => {
  const known = { reducedMotion: false, externalLaunch: false, firstMountThisProcess: true };

  it('plays on a first cold start with motion on and no file', () => {
    expect(introPlan({ ...known, holdOver: false })).toBe('play');
    expect(introPlan({ ...known, holdOver: true })).toBe('play');
  });

  it.each([
    ['a remount in the same process', { firstMountThisProcess: false }],
    ['"Remove animations"', { reducedMotion: true }],
    ['an "Open with" or share cold start', { externalLaunch: true }],
  ])('stays still for %s, straight away', (_why, override) => {
    expect(introPlan({ ...known, ...override, holdOver: false })).toBe('still');
  });

  it('waits for an unknown input during the hold, then gives up on it', () => {
    for (const unknown of ['reducedMotion', 'externalLaunch', 'firstMountThisProcess'] as const) {
      const inputs = { ...known, [unknown]: undefined };
      expect(introPlan({ ...inputs, holdOver: false })).toBe('wait');
      expect(introPlan({ ...inputs, holdOver: true })).toBe('still');
    }
  });

  it('stays still when a known input says so, even with others unknown', () => {
    expect(introPlan({ reducedMotion: true, externalLaunch: undefined, firstMountThisProcess: undefined, holdOver: false })).toBe('still');
  });
});

describe('shouldExit', () => {
  const base = { introDone: false, booting: true, appLocked: false, elapsedMs: 0 };

  it('waits for both the intro and boot', () => {
    expect(shouldExit(base)).toBe(false);
    expect(shouldExit({ ...base, introDone: true })).toBe(false);
    expect(shouldExit({ ...base, booting: false })).toBe(false);
    expect(shouldExit({ ...base, introDone: true, booting: false })).toBe(true);
  });

  it('gives way to the app lock as soon as boot is done', () => {
    expect(shouldExit({ ...base, appLocked: true })).toBe(false);
    expect(shouldExit({ ...base, appLocked: true, booting: false })).toBe(true);
  });

  it('never outlasts the splash cap', () => {
    expect(shouldExit({ ...base, elapsedMs: SPLASH_TIMEOUT_MS - 1 })).toBe(false);
    expect(shouldExit({ ...base, elapsedMs: SPLASH_TIMEOUT_MS })).toBe(true);
  });
});

describe('the timeline', () => {
  const phases = Object.entries(INTRO_PHASES);

  it.each(phases)('%s is inside the intro', (_name, phase) => {
    expect(phase.start).toBeGreaterThanOrEqual(0);
    expect(phase.end).toBeGreaterThan(phase.start);
    expect(phase.end).toBeLessThanOrEqual(INTRO_TOTAL_MS);
  });

  it('holds still while the native splash fades out', () => {
    expect(INTRO_PHASES.hold.end).toBeGreaterThanOrEqual(SPLASH_EXIT_MS);
    for (const [name, phase] of phases) if (name !== 'hold') expect(phase.start).toBeGreaterThanOrEqual(INTRO_PHASES.hold.end);
  });

  it('fits in the time the splash may take', () => {
    expect(INTRO_TOTAL_MS).toBeLessThan(SPLASH_TIMEOUT_MS);
  });
});

describe('introFrame', () => {
  const rest = { part: 0, sweep: 0, fold: 0, wordmark: 0 };

  it('is the still frame (the native splash) through the hold', () => {
    for (const t of [0, 75, INTRO_PHASES.hold.end]) expect(introFrame(t)).toEqual(rest);
  });

  it('ends assembled, with the band gone and the wordmark in', () => {
    const end = introFrame(INTRO_TOTAL_MS);
    expect(end.part).toBeCloseTo(0, 10);
    expect(end.fold).toBeCloseTo(0, 10);
    expect(end.sweep).toBe(1);
    expect(end.wordmark).toBe(1);
    expect(introFrame(INTRO_TOTAL_MS * 2)).toEqual(end);
  });

  it('parts the page fully, then snaps it back a little past together', () => {
    const parts = sample(INTRO_PHASES.assemble).map((t) => introFrame(t).part);
    expect(Math.max(...parts)).toBeCloseTo(1, 2);
    expect(Math.min(...parts)).toBeLessThan(0);
    expect(Math.min(...parts)).toBeGreaterThan(-0.1);
  });

  it('lifts the fold once and settles it', () => {
    const folds = sample(INTRO_PHASES.fold).map((t) => introFrame(t).fold);
    expect(Math.max(...folds)).toBeCloseTo(1, 2);
    expect(Math.min(...folds)).toBeGreaterThanOrEqual(0);
  });

  it('moves the band and the wordmark one way only', () => {
    for (const key of ['sweep', 'wordmark'] as const) {
      const values = sample({ start: 0, end: INTRO_TOTAL_MS }).map((t) => introFrame(t)[key]);
      values.slice(1).forEach((v, i) => expect(v).toBeGreaterThanOrEqual(values[i]));
    }
  });
});

describe('the sweep line', () => {
  // Where a point falls along the sweep, as a distance from SWEEP_FROM.
  const along = (p: { x: number; y: number }) => {
    const [dx, dy] = [SWEEP_TO.x - SWEEP_FROM.x, SWEEP_TO.y - SWEEP_FROM.y];
    return ((p.x - SWEEP_FROM.x) * dx + (p.y - SWEEP_FROM.y) * dy) / Math.hypot(dx, dy);
  };
  const length = Math.hypot(SWEEP_TO.x - SWEEP_FROM.x, SWEEP_TO.y - SWEEP_FROM.y);
  const { x, y, width, height } = MARK_CONTENT_BOX;
  const corners = [
    { x, y },
    { x: x + width, y },
    { x, y: y + height },
    { x: x + width, y: y + height },
  ];

  it('is SWEEP_BAND long', () => {
    for (const s of [0, 0.5, 1]) {
      const { start, end } = sweepLine(s);
      expect(Math.hypot(end.x - start.x, end.y - start.y)).toBeCloseTo(SWEEP_BAND, 6);
    }
  });

  it('lies wholly before the mark at 0 and wholly past it at 1', () => {
    for (const corner of corners) {
      expect(along(corner)).toBeGreaterThanOrEqual(along(sweepLine(0).end) - 1e-9);
      expect(along(corner)).toBeLessThanOrEqual(along(sweepLine(1).start) + 1e-9);
    }
    expect(along(sweepLine(0).end)).toBeCloseTo(0, 6);
    expect(along(sweepLine(1).start)).toBeCloseTo(length, 6);
  });
});

describe('the pieces', () => {
  it('sends each white piece outwards its own way', () => {
    // stemTop left and up, topBar up, bowl right, stemBottom down and left.
    expect(Math.sign(PIECE_DIRECTIONS.stemTop.x)).toBe(-1);
    expect(Math.sign(PIECE_DIRECTIONS.stemTop.y)).toBe(-1);
    expect(PIECE_DIRECTIONS.topBar.y).toBeLessThan(-0.9);
    expect(PIECE_DIRECTIONS.bowl.x).toBeGreaterThan(0.9);
    expect(Math.sign(PIECE_DIRECTIONS.stemBottom.x)).toBe(-1);
    expect(Math.sign(PIECE_DIRECTIONS.stemBottom.y)).toBe(1);
    for (const d of Object.values(PIECE_DIRECTIONS)) expect(Math.hypot(d.x, d.y)).toBeCloseTo(1, 10);
    expect(Object.keys(PIECE_DIRECTIONS).sort()).toEqual(WHITE_PIECES.map((p) => p.name).sort());
  });

  it("keeps the logo's paint order with the green pieces in one layer", () => {
    const { before, greens, after } = PAINT_RUNS;
    expect([...before, ...greens, ...after]).toEqual(MARK_PIECES);
    expect(greens.every((p) => p.fill !== 'paper')).toBe(true);
    expect([...before, ...after].every((p) => p.fill === 'paper')).toBe(true);
  });

  it('would notice green pieces that are not consecutive', () => {
    const [stemTop, ribbon, , , , topBar] = MARK_PIECES;
    const { before, greens, after } = paintRuns([stemTop, ribbon, topBar, ribbon]);
    // A white piece caught inside the green run is the sign.
    expect(greens.some((p) => p.fill === 'paper')).toBe(true);
    expect([...before, ...greens, ...after]).toHaveLength(4);
  });
});

describe('takeFirstMount', () => {
  it('is true once per process', () => {
    resetFirstMountForTests();
    expect(takeFirstMount()).toBe(true);
    expect(takeFirstMount()).toBe(false);
  });
});

// Every 10 ms through a phase, both ends included.
function sample(phase: { start: number; end: number }): number[] {
  const out: number[] = [];
  for (let t = phase.start; t <= phase.end; t += 10) out.push(t);
  return out;
}
