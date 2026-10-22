import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useT } from '../../i18n/useT';
import type { ToolBadge, ToolDef } from '../../services/tools/toolRegistry';
import { radii, spacing, useTheme } from '../../theme';
import { Badge, Text, Touchable } from '../ui';

const WELL = 52;

type ToolTileProps = {
  tool: ToolDef;
  badge: ToolBadge;
  onPress: (tool: ToolDef) => void;
  style?: StyleProp<ViewStyle>;
};

// §17 U8: one tool in the Tools tab's grid: its icon on a tinted circle, its name, and "Pro" or
// "Free today" when it is a Pro task (toolRegistry.toolBadge). The description is what TalkBack
// says after the name.
export const ToolTile = memo(function ToolTile({ tool, badge, onPress, style }: ToolTileProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const label = t(tool.labelKey);
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={badge === 'pro' ? `${label}, ${t('ui.badge.pro')}` : label}
      accessibilityHint={t(tool.descKey)}
      onPress={() => onPress(tool)}
      style={[styles.tile, style]}
      testID={`tool-${tool.id}`}
    >
      <View style={[styles.well, { backgroundColor: tokens.accentSoft }]}>
        <Ionicons name={tool.icon} size={24} color={tokens.accentInk} />
        {badge === 'pro' ? <Badge kind="pro" style={styles.badge} /> : null}
        {badge === 'freeToday' ? <Badge label={t('tools.freeToday')} tone="highlight" style={styles.badge} /> : null}
      </View>
      <Text variant="label" numberOfLines={2} style={styles.label}>
        {label}
      </Text>
    </Touchable>
  );
});

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.card,
  },
  well: {
    width: WELL,
    height: WELL,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -spacing.xs,
    right: -spacing.md,
  },
  label: { textAlign: 'center' },
});
