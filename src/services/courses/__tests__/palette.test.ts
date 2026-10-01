import { tokens } from '../../../theme/tokens';
import { COURSE_COLORS, courseColorValue, isCourseColor, nextCourseColor } from '../palette';
import type { CourseColor } from '../../../types/models';

// WCAG relative luminance / contrast ratio, for opaque #rrggbb colours.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const course = (color: CourseColor, archived = false) => ({ color, archived });

describe('course palette', () => {
  it('has 10 distinct colours, each defined in both themes', () => {
    expect(new Set(COURSE_COLORS).size).toBe(10);
    for (const theme of [tokens.light, tokens.dark]) {
      expect(Object.keys(theme.courseColors).sort()).toEqual([...COURSE_COLORS].sort());
      expect(new Set(Object.values(theme.courseColors)).size).toBe(10);
    }
  });

  it.each(['light', 'dark'] as const)('every colour is readable on %s backgrounds (>= 4.5:1)', (name) => {
    const theme = tokens[name];
    for (const color of COURSE_COLORS) {
      for (const background of [theme.bg, theme.surface, theme.surface2]) {
        expect(contrast(courseColorValue(color, theme), background)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('validates ids', () => {
    expect(isCourseColor('teal')).toBe(true);
    expect(isCourseColor('#0f766e')).toBe(false);
    expect(isCourseColor(null)).toBe(false);
  });
});

describe('nextCourseColor', () => {
  it('starts at the top of the palette', () => {
    expect(nextCourseColor([])).toBe(COURSE_COLORS[0]);
  });

  it('takes the first unused colour, filling gaps', () => {
    expect(nextCourseColor([course(COURSE_COLORS[0]), course(COURSE_COLORS[2])])).toBe(COURSE_COLORS[1]);
  });

  it('ignores archived courses', () => {
    expect(nextCourseColor([course(COURSE_COLORS[0], true)])).toBe(COURSE_COLORS[0]);
  });

  it('reuses the least-used colour once all 10 are taken', () => {
    const all = COURSE_COLORS.map((c) => course(c));
    expect(nextCourseColor(all)).toBe(COURSE_COLORS[0]);
    expect(nextCourseColor([...all, course(COURSE_COLORS[0]), course(COURSE_COLORS[1])])).toBe(COURSE_COLORS[2]);
  });
});
