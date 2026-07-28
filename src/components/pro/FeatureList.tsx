import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { spacing, useTheme } from '../../theme';

const FEATURES = [
  'Batch OCR and batch export across many files',
  'Folder lock with fingerprint or passcode',
  'Theme accents beyond the default',
  'Automatic backup to your own Drive or Dropbox',
];

export function FeatureList() {
  const { tokens } = useTheme();

  return (
    <View style={styles.list}>
      {FEATURES.map((feature) => (
        <View key={feature} style={styles.row}>
          <View style={[styles.iconWrap, { backgroundColor: tokens.accentSoft }]}>
            <Ionicons name="checkmark" size={13} color={tokens.accentInk} />
          </View>
          <Text style={[styles.label, { color: tokens.ink }]}>{feature}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  iconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  label: {
    flex: 1,
    fontSize: 15.5,
    lineHeight: 21,
  },
});
