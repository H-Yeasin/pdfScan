import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { spacing, useTheme } from '../../theme';
import { useT } from '../../i18n/useT';

type ExportCopyProps = {
  enabled: boolean;
  onToggle: () => void;
  folderLabel: string | null;
  onSetup: () => void;
};

type MoreOptionsPanelProps = {
  open: boolean;
  onToggleOpen: () => void;
  // Android-only: omitted entirely on iOS, which has no SAF equivalent.
  exportCopy?: ExportCopyProps;
};

export function MoreOptionsPanel({
  open,
  onToggleOpen,
  exportCopy,
}: MoreOptionsPanelProps) {
  const { tokens } = useTheme();
  const { t } = useT();

  return (
    <View style={[styles.container, { borderTopColor: tokens.edge }]}>
      <Pressable accessibilityRole="button" style={styles.header} onPress={onToggleOpen}>
        <Ionicons
          name="chevron-forward"
          size={18}
          color={tokens.ink}
          style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}
        />
        <Text style={[styles.headerLabel, { color: tokens.ink }]}>{t('deliver.more.title')}</Text>
      </Pressable>

      {open && (
        <View style={styles.body}>
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: tokens.ink }]}>{t('deliver.more.margin')}</Text>
            <Text style={{ color: tokens.muted }}>{t('deliver.more.marginSmall')}</Text>
          </View>
          {exportCopy && (
            <View style={styles.row}>
              <View style={styles.rowTextWrap}>
                <Text style={[styles.rowLabel, { color: tokens.ink }]}>{t('deliver.more.exportCopy')}</Text>
                <Text style={[styles.disclosure, { color: tokens.muted }]}>
                  {exportCopy.folderLabel
                    ? t('deliver.more.exportCopyTo', { folder: exportCopy.folderLabel })
                    : t('deliver.more.exportCopySetup')}
                </Text>
              </View>
              {exportCopy.folderLabel ? (
                <Switch
                  value={exportCopy.enabled}
                  onValueChange={exportCopy.onToggle}
                  trackColor={{ true: tokens.accent, false: tokens.surface2 }}
                />
              ) : (
                <Pressable accessibilityRole="button" onPress={exportCopy.onSetup}>
                  <Text style={{ color: tokens.accentInk, fontSize: 13, fontWeight: '600' }}>{t('deliver.more.setUp')}</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  body: {
    marginTop: spacing.md,
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  rowTextWrap: {
    flex: 1,
    gap: 4,
  },
  rowLabel: {
    fontSize: 15,
  },
  disclosure: {
    fontSize: 12,
    lineHeight: 16,
  },
});
