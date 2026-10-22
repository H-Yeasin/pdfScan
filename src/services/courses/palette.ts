import type { ThemeName, ThemeTokens } from '../../theme';
import { mixHex } from '../../theme/contrast';
import { tokens as themeTokens } from '../../theme/tokens';
import type { Course, CourseColor } from '../../types/models';

// The 10 course colours, in the order new courses get them. Courses store the id; the actual
// colour comes from the theme (tokens.courseColors), so every course stays readable in light and
// dark mode without the data knowing which is active.
export const COURSE_COLORS: readonly CourseColor[] = [
  'teal',
  'blue',
  'orange',
  'purple',
  'green',
  'pink',
  'indigo',
  'amber',
  'red',
  'slate',
];

export function isCourseColor(value: unknown): value is CourseColor {
  return typeof value === 'string' && (COURSE_COLORS as readonly string[]).includes(value);
}

// The colour for a new course: the first palette colour no active course uses yet. Archived
// courses don't count, so a new semester starts from the top of the palette again. Once all 10
// are taken, the least-used one (earliest in palette order on a tie), so colours stay spread out.
export function nextCourseColor(courses: readonly Pick<Course, 'color' | 'archived'>[]): CourseColor {
  const uses = new Map<CourseColor, number>(COURSE_COLORS.map((c) => [c, 0]));
  for (const course of courses) {
    if (!course.archived && uses.has(course.color)) uses.set(course.color, uses.get(course.color)! + 1);
  }
  let best = COURSE_COLORS[0];
  for (const color of COURSE_COLORS) if (uses.get(color)! < uses.get(best)!) best = color;
  return best;
}

export function courseColorValue(color: CourseColor, tokens: ThemeTokens): string {
  return tokens.courseColors[color] ?? tokens.courseColors[COURSE_COLORS[0]];
}

// §17 U1: how much of a course's colour goes into its card. Dark needs more: its course colours are
// pastels, and a little of a pastel on a near-black surface barely shows. Light is 12 %, not the
// planned 14 %: at 14 % teal text on its own tint drops to 4.42:1.
export const COURSE_TINT = { light: 0.12, dark: 0.22 } as const;

// A soft card background for a course: its colour mixed into `surface`. The course's own colour stays
// the text and icon colour on it (at least 4.5:1, services/courses/__tests__/palette.test.ts). The
// accent never changes surface or course colours, so the base tokens of the theme are enough.
export function courseTint(color: CourseColor, theme: ThemeName): string {
  const t = themeTokens[theme];
  return mixHex(t.surface, courseColorValue(color, t), COURSE_TINT[theme]);
}
