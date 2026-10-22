import { ACCENT_IDS, themeTokens, type AccentId, type ThemeName, type ThemeTokens } from '../tokens';
import { AA_LARGE, AA_TEXT, contrastRatio } from '../contrast';

// §9 O4b: text and icon colours stay readable in both themes. Text pairs need 4.5:1; icons and
// state indicators (an accent icon or border) need 3:1 (WCAG 2.1 AA, 1.4.3 and 1.4.11).
// edge and scrim are translucent (decorative / a dim), so they aren't checked. §10 M4: every accent, in
// both themes. §17 U1: surface3, marigold, the semantic states and the focus ring.

type Key = Exclude<keyof ThemeTokens, 'courseColors' | 'edge' | 'scrim'>;
const TEXT_ON: Key[] = ['bg', 'surface', 'surface2', 'surface3'];
const STATES: [Key, Key][] = [
  ['success', 'successSoft'],
  ['warning', 'warningSoft'],
  ['info', 'infoSoft'],
];

const textPairs: [Key, Key][] = [
  ...(['ink', 'muted', 'accentInk', 'danger', 'highlightInk', 'success', 'warning', 'info'] as Key[]).flatMap((fg) =>
    TEXT_ON.map((bg) => [fg, bg] as [Key, Key])
  ),
  // Selected chips: their label on the soft accent.
  ['ink', 'accentSoft'],
  ['accentInk', 'accentSoft'],
  // Labels on accent buttons, and the Hint callout (bg-coloured text on ink).
  ['onAccent', 'accent'],
  ['bg', 'ink'],
  // Marigold: a label on the fill, and marigold or ink text on the tint.
  ['onHighlight', 'highlight'],
  ['highlightInk', 'highlightSoft'],
  ['ink', 'highlightSoft'],
  // A state banner: its colour as text on its own tint, and body text on the tint.
  ...STATES,
  ...STATES.map(([, soft]) => ['ink', soft] as [Key, Key]),
];

const iconPairs: [Key, Key][] = [
  // Accent icons, selection borders and the active tab's underline.
  ...TEXT_ON.map((bg) => ['accent', bg] as [Key, Key]),
  // The focus ring, drawn around anything on any surface or on an accent fill.
  ...TEXT_ON.map((bg) => ['focus', bg] as [Key, Key]),
  ['focus', 'accentSoft'],
  // Danger icons (a delete badge's ×) on the danger fill are white.
];

const CASES: [ThemeName, AccentId][] = (['light', 'dark'] as ThemeName[]).flatMap((theme) => ACCENT_IDS.map((accent) => [theme, accent] as [ThemeName, AccentId]));

describe.each(CASES)('%s theme, %s accent: contrast', (name, accent) => {
  const t = themeTokens(name, accent);

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
