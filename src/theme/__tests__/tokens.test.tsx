import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { COURSE_COLORS, courseColorValue, courseTint } from '../../services/courses/palette';
import { AA_TEXT, contrastRatio, mixHex } from '../contrast';
import { elevation } from '../elevation';
import { ICONS } from '../icons';
import { durations, useMotion, type Motion } from '../motion';
import { radii } from '../spacing';
import { tokens, type ThemeName } from '../tokens';

let mockReduced = false;
jest.mock('../useReducedMotion', () => ({ useReducedMotion: () => mockReduced }));

// §17 U1: the token rules the contrast test doesn't cover.
const THEMES: ThemeName[] = ['light', 'dark'];

describe('courseTint', () => {
  it('mixes hex colours', () => {
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mixHex('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
  });

  it.each(THEMES)('keeps each course colour readable on its own tint (%s)', (theme) => {
    for (const color of COURSE_COLORS) {
      const ink = courseColorValue(color, tokens[theme]);
      const tint = courseTint(color, theme);
      expect(tint).not.toBe(tokens[theme].surface);
      expect(contrastRatio(ink, tint)).toBeGreaterThanOrEqual(AA_TEXT);
      // The card's body text too.
      expect(contrastRatio(tokens[theme].ink, tint)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it('gives each course its own tint', () => {
    for (const theme of THEMES) expect(new Set(COURSE_COLORS.map((c) => courseTint(c, theme))).size).toBe(COURSE_COLORS.length);
  });
});

describe('ICONS', () => {
  it('never uses one icon for two actions', () => {
    const seen = new Map<string, string>();
    for (const [action, icon] of Object.entries(ICONS)) {
      expect([action, seen.get(icon)]).toEqual([action, undefined]);
      seen.set(icon, action);
    }
  });

  it('drops the developer icons', () => {
    const icons = Object.values(ICONS) as string[];
    for (const banned of ['git-merge-outline', 'git-branch-outline', 'git-pull-request-outline', 'contract-outline']) {
      expect(icons).not.toContain(banned);
    }
  });
});

describe('elevation', () => {
  it('uses shadows in light and a tonal step in dark', () => {
    expect(elevation(0, 'light')).toEqual({});
    expect(elevation(2, 'light').shadowOpacity).toBeGreaterThan(0);
    for (const level of [1, 2, 3] as const) expect(elevation(level, 'dark').shadowOpacity).toBeUndefined();
    expect(elevation(1, 'dark').backgroundColor).toBe(tokens.dark.surface);
    expect(elevation(3, 'dark').backgroundColor).toBe(tokens.dark.surface3);
  });
});

describe('radii', () => {
  it('keeps the v1 keys with the v2 values', () => {
    expect(radii.card).toBe(20);
    expect(radii.chip).toBe(radii.full);
    expect(radii.sheet).toBeGreaterThan(radii.card);
  });
});

describe('useMotion', () => {
  let root: ReactTestRenderer | null = null;
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
  });

  function read(): Motion {
    let motion!: Motion;
    function Probe() {
      motion = useMotion();
      return null;
    }
    act(() => {
      root = create(<Probe />);
    });
    return motion;
  }

  it('uses the durations normally', () => {
    mockReduced = false;
    const motion = read();
    expect(motion.reduced).toBe(false);
    expect(motion.durations).toEqual(durations);
  });

  it('makes every duration zero under reduced motion', () => {
    mockReduced = true;
    const motion = read();
    expect(motion.reduced).toBe(true);
    for (const ms of Object.values(motion.durations)) expect(ms).toBe(0);
  });
});
