import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { CHROME_MAX_FONT_SCALE, fontFamily, typeScale, useTheme, type ThemeTokens, type TypeVariant } from '../../theme';

// §17 U2: all text in the kit, and from U5 on in every redesigned screen. A variant is a whole
// typeScale v2 entry (family, size, line height); a different weight is a different Figtree family
// (`weight`), never a fontWeight on top, which Android draws as a faked bold. `color` is a token name
// (`'muted'`, `'accentInk'`) or a colour value for the rare text on a photo.

export type TextWeight = 'regular' | 'medium' | 'semibold' | 'bold';

type ColorToken = { [K in keyof ThemeTokens]: ThemeTokens[K] extends string ? K : never }[keyof ThemeTokens];

export type TextProps = RNTextProps & {
  variant?: TypeVariant;
  color?: ColorToken | (string & {});
  // Figtree variants only; Caprasimo has one weight.
  weight?: TextWeight;
  align?: TextStyle['textAlign'];
  // Dense chrome (a bar, a chip, a tab) stops growing at CHROME_MAX_FONT_SCALE (§9 O4b).
  chrome?: boolean;
};

const WEIGHT_FAMILY: Record<TextWeight, string> = {
  regular: fontFamily.bodyRegular,
  medium: fontFamily.bodyMedium,
  semibold: fontFamily.bodySemiBold,
  bold: fontFamily.bodyBold,
};

// The big Caprasimo sizes stop growing sooner: at 200 % a 32 dp display would wrap a two-word
// title into three lines. Body text follows the system scale all the way.
const VARIANT_MAX_SCALE: Partial<Record<TypeVariant, number>> = {
  display: 1.3,
  headline: 1.4,
  title: 1.6,
};

export function familyFor(variant: TypeVariant, weight?: TextWeight): string {
  const base = typeScale[variant].fontFamily;
  if (!weight || base === fontFamily.heading || base === 'monospace') return base;
  return WEIGHT_FAMILY[weight];
}

export function maxScaleFor(variant: TypeVariant, chrome?: boolean): number | undefined {
  const own = VARIANT_MAX_SCALE[variant];
  if (!chrome) return own;
  return own === undefined ? CHROME_MAX_FONT_SCALE : Math.min(own, CHROME_MAX_FONT_SCALE);
}

export function Text({ variant = 'body', color = 'ink', weight, align, chrome, style, maxFontSizeMultiplier, ...rest }: TextProps) {
  const { tokens } = useTheme();
  const resolved = color in tokens ? (tokens[color as ColorToken] as string) : color;
  return (
    <RNText
      {...rest}
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? maxScaleFor(variant, chrome)}
      style={[typeScale[variant], { fontFamily: familyFor(variant, weight), color: resolved, textAlign: align }, style]}
    />
  );
}
