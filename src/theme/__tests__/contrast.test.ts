import { tokens, type ThemeName, type ThemeTokens } from '../tokens';
import { AA_LARGE, AA_TEXT, contrastRatio } from '../contrast';

// §9 O4b: text and icon colours stay readable in both themes. Text pairs need 4.5:1; icons and
// state indicators (an accent icon or border) need 3:1 (WCAG 2.1 AA, 1.4.3 and 1.4.11).
// edge is translucent and decorative, so it isn't checked.

type Key = Exclude<keyof ThemeTokens, 'courseColors' | 'edge'>;
const TEXT_ON: Key[] = ['bg', 'surface', 'surface2'];

const textPairs: [Key, Key][] = [
  ...(['ink', 'muted', 'accentInk', 'danger'] as Key[]).flatMap((fg) => TEXT_ON.map((bg) => [fg, bg] as [Key, Key])),
  // Selected chips: their label on the soft accent.
  ['ink', 'accentSoft'],
  ['accentInk', 'accentSoft'],
  // Labels on accent buttons, and the Hint callout (bg-coloured text on ink).
  ['onAccent', 'accent'],
  ['bg', 'ink'],
];

const iconPairs: [Key, Key][] = [
  // Accent icons, selection borders and the active tab's underline.
  ...TEXT_ON.map((bg) => ['accent', bg] as [Key, Key]),
  // Danger icons (a delete badge's ×) on the danger fill are white.
];

describe.each<ThemeName>(['light', 'dark'])('%s theme contrast', (name) => {
  const t = tokens[name];

  it.each(textPairs)('%s text on %s reaches 4.5:1', (fg, bg) => {
    expect(contrastRatio(t[fg], t[bg])).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(iconPairs)('%s icons on %s reach 3:1', (fg, bg) => {
    expect(contrastRatio(t[fg], t[bg])).toBeGreaterThanOrEqual(AA_LARGE);
  });

  it('white icons on the danger fill reach 3:1', () => {
    expect(contrastRatio('#ffffff', t.danger)).toBeGreaterThanOrEqual(AA_LARGE);
  });
});
