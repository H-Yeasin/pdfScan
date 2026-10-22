import type { PropsWithChildren } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { courseTint } from '../../services/courses/palette';
import { elevation as elevationStyle, radii, spacing, useTheme, type ElevationLevel, type ThemeName, type ThemeTokens } from '../../theme';
import type { CourseColor } from '../../types/models';
import { Touchable } from './Touchable';

// §17 U2: a rounded block on the page. `surface` is the plain card (raised a step); `tinted` is a
// course's card when `tint` names its colour (courseTint), else the second surface; `accent` and
// `highlight` are the soft green and marigold for a call to action or a tip. With onPress the card
// is one button (it doesn't scale: a wide card scaling looks like a jump).

export type CardTone = 'surface' | 'tinted' | 'accent' | 'highlight';

export type CardProps = PropsWithChildren<{
  tone?: CardTone;
  tint?: CourseColor;
  // Defaults: 1 for `surface`, 0 (flat) for the coloured tones.
  elevation?: ElevationLevel;
  padded?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}>;

export function cardBackground(tone: CardTone, tokens: ThemeTokens, theme: ThemeName, tint?: CourseColor): string {
  switch (tone) {
    case 'surface':
      return tokens.surface;
    case 'tinted':
      return tint ? courseTint(tint, theme) : tokens.surface2;
    case 'accent':
      return tokens.accentSoft;
    case 'highlight':
      return tokens.highlightSoft;
  }
}

export function Card({
  tone = 'surface',
  tint,
  elevation,
  padded = true,
  onPress,
  onLongPress,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
  children,
}: CardProps) {
  const { tokens, theme } = useTheme();
  const level = elevation ?? (tone === 'surface' ? 1 : 0);
  // elevation() also sets a background (the tonal step in dark); the tone's own colour wins for
  // the coloured tones, which are flat.
  const box = [
    styles.card,
    padded && styles.padded,
    elevationStyle(level, theme),
    tone === 'surface' ? null : { backgroundColor: cardBackground(tone, tokens, theme, tint) },
    level === 0 && tone === 'surface' ? { backgroundColor: tokens.surface } : null,
    style,
  ];

  if (!onPress && !onLongPress) {
    return (
      <View style={box} testID={testID}>
        {children}
      </View>
    );
  }
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      onLongPress={onLongPress}
      scale={false}
      testID={testID}
      style={[box, Platform.OS === 'android' && styles.clip]}
    >
      {children}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.card,
  },
  padded: {
    padding: spacing.lg,
  },
  // The ripple stays inside the corners. Android only: there the shadow is drawn from the outline
  // and survives the clip; on iOS overflow hidden would cut it (and iOS has no ripple).
  clip: {
    overflow: 'hidden',
  },
});
