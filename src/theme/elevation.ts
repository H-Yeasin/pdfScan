import type { ViewStyle } from 'react-native';
import { tokens, type ThemeName } from './tokens';

// §17 U1: how high something sits. 0 is flat (on the page), 1 a card, 2 a floating bar or a menu,
// 3 a sheet or dialog. Light mode shows height with a soft shadow on `surface`. Dark mode has no
// shadows (they vanish on near-black and Android draws them as grey smudges); height is a lighter
// surface instead, one tonal step per level.
export type ElevationLevel = 0 | 1 | 2 | 3;

type ElevationStyle = Pick<ViewStyle, 'backgroundColor' | 'shadowColor' | 'shadowOffset' | 'shadowOpacity' | 'shadowRadius' | 'elevation'>;

// shadowColor/Offset/Opacity/Radius are iOS; `elevation` is Android's. Both are tuned to look alike.
const LIGHT_SHADOWS: Record<Exclude<ElevationLevel, 0>, Required<Omit<ElevationStyle, 'backgroundColor' | 'shadowColor'>>> = {
  1: { shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 1 },
  2: { shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 4 },
  3: { shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.16, shadowRadius: 20, elevation: 12 },
};

export function elevation(level: ElevationLevel, theme: ThemeName): ElevationStyle {
  const t = tokens[theme];
  if (level === 0) return {};
  if (theme === 'dark') {
    const tonal = level === 1 ? t.surface : level === 2 ? t.surface2 : t.surface3;
    return { backgroundColor: tonal, elevation: 0 };
  }
  // The shadow is warm (the ink), not black, so it sits on the cream paper.
  return { backgroundColor: level === 3 ? t.surface3 : t.surface, shadowColor: t.ink, ...LIGHT_SHADOWS[level] };
}
