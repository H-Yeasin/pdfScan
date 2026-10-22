import { rgba, type ThemeTokens } from '../../theme';
import { contrastRatio } from '../../theme/contrast';

// §17 U2: the few colours the kit derives from the tokens instead of reading one. Pure, so the
// contrast tests can check them in both themes and under every accent.

// The press ripple: ink at 12 % on a light control, white at 24 % on a filled one (accent, danger).
export function rippleColor(tokens: ThemeTokens, onFill = false): string {
  return onFill ? 'rgba(255, 255, 255, 0.24)' : rgba(hexOf(tokens.ink), 0.12);
}

// Text and icons on the danger fill. There is no onDanger token: white on light mode's danger is
// 5.4:1, but on dark mode's lighter red it is only 3:1 (enough for an icon, not for a label), so a
// danger button's label takes whichever of white and the dark paper reads better.
export function onDanger(tokens: ThemeTokens): string {
  const paper = '#14120f';
  return contrastRatio('#ffffff', tokens.danger) >= contrastRatio(paper, tokens.danger) ? '#ffffff' : paper;
}

// The tokens are #rrggbb except `edge` and `scrim`; the ripple only ever needs an opaque one.
function hexOf(color: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : '#000000';
}
