import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { spacing, typeScale, useTheme, CHROME_MAX_FONT_SCALE } from '../../theme';
import { useT } from '../../i18n/useT';
import { BottomBar } from '../shared/BottomBar';

type ContextBarItem = {
  id: 'crop' | 'rotate' | 'retake' | 'ocr' | 'sign';
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active?: boolean;
};

type ContextBarProps = {
  onPress: (id: ContextBarItem['id']) => void;
  ocrRunning: boolean;
};

export function ContextBar({ onPress, ocrRunning }: ContextBarProps) {
  const { tokens } = useTheme();
  const { t } = useT();

  const items: ContextBarItem[] = [
    { id: 'crop', label: t('review.actions.crop'), icon: 'crop-outline' },
    { id: 'rotate', label: t('review.actions.rotate'), icon: 'reload-outline' },
    { id: 'retake', label: t('review.actions.retake'), icon: 'camera-outline' },
    { id: 'ocr', label: t('review.actions.ocr'), icon: 'text-outline', active: ocrRunning },
    // Same icon as OverflowSheet's "Sign" action in ReaderScreen, for visual consistency.
    { id: 'sign', label: t('review.actions.sign'), icon: 'create-outline' },
  ];

  return (
    <BottomBar backgroundColor={tokens.surface} style={[styles.bar, { borderTopColor: tokens.edge }]}>
      <View style={styles.row}>
        {items.map((item) => (
          <Pressable key={item.id} style={styles.item} onPress={() => onPress(item.id)} accessibilityRole="button">
            <Ionicons name={item.icon} size={21} color={item.active ? tokens.accent : tokens.ink} />
            <Text
              maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE}
              numberOfLines={1}
              style={[styles.label, { color: item.active ? tokens.accent : tokens.ink }]}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </BottomBar>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  item: {
    flex: 1,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  label: {
    fontSize: 12,
    fontFamily: typeScale.label.fontFamily,
    fontWeight: '600',
  },
});
