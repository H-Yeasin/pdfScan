import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { spacing, useTheme } from '../../theme';

type ExportCopyProps = {
  enabled: boolean;
  onToggle: () => void;
  folderLabel: string | null;
  onSetup: () => void;
};

type MoreOptionsPanelProps = {
  open: boolean;
  onToggleOpen: () => void;
  passwordEnabled: boolean;
  onTogglePassword: () => void;
  // Android-only: omitted entirely on iOS, which has no SAF equivalent.
  exportCopy?: ExportCopyProps;
};

export function MoreOptionsPanel({
  open,
  onToggleOpen,
  passwordEnabled,
  onTogglePassword,
  exportCopy,
}: MoreOptionsPanelProps) {
  const { tokens } = useTheme();

  return (
    <View style={[styles.container, { borderTopColor: tokens.edge }]}>
      <Pressable style={styles.header} onPress={onToggleOpen}>
        <Ionicons
          name="chevron-forward"
          size={18}
          color={tokens.ink}
          style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}
        />
        <Text style={[styles.headerLabel, { color: tokens.ink }]}>More options</Text>
      </Pressable>

      {open && (
        <View style={styles.body}>
          <View style={styles.row}>
            <View style={styles.rowTextWrap}>
              <Text style={[styles.rowLabel, { color: tokens.ink }]}>Password protect</Text>
              <Text style={[styles.disclosure, { color: tokens.muted }]}>
                Marks the file as protected in your library — this build does not encrypt the PDF itself.
              </Text>
            </View>
            <Switch
              value={passwordEnabled}
              onValueChange={onTogglePassword}
              trackColor={{ true: tokens.accent, false: tokens.surface2 }}
            />
          </View>
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: tokens.ink }]}>Page size</Text>
            <Text style={{ color: tokens.muted }}>A4 · fit to content</Text>
          </View>
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: tokens.ink }]}>Margin</Text>
            <Text style={{ color: tokens.muted }}>Small</Text>
          </View>
          {exportCopy && (
            <View style={styles.row}>
              <View style={styles.rowTextWrap}>
                <Text style={[styles.rowLabel, { color: tokens.ink }]}>Also save a copy to device</Text>
                <Text style={[styles.disclosure, { color: tokens.muted }]}>
                  {exportCopy.folderLabel
                    ? `Copies the export to ${exportCopy.folderLabel}.`
                    : 'Set up a default export folder in Settings first.'}
                </Text>
              </View>
              {exportCopy.folderLabel ? (
                <Switch
                  value={exportCopy.enabled}
                  onValueChange={exportCopy.onToggle}
                  trackColor={{ true: tokens.accent, false: tokens.surface2 }}
                />
              ) : (
                <Pressable onPress={exportCopy.onSetup}>
                  <Text style={{ color: tokens.accentInk, fontSize: 13, fontWeight: '600' }}>Set up →</Text>
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
