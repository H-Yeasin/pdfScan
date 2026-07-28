import { Ionicons } from '@expo/vector-icons';
import { Alert, ScrollView, StyleSheet, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FeatureList } from '../components/pro/FeatureList';
import { useRouter } from '../navigation/router';
import { fontFamily, radii, spacing, useTheme } from '../theme';

export function ProScreen() {
  const { tokens } = useTheme();
  const { go } = useRouter();

  const showUnavailable = (action: string) =>
    Alert.alert(
      'Not available yet',
      `${action} isn't wired up in this build — in-app purchases need store-side setup that hasn't happened yet. Everything you use today stays free either way.`
    );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tokens.bg }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={() => go('settings', 'back')}>
          <Ionicons name="chevron-back" size={20} color={tokens.ink} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.kicker, { color: tokens.accentInk }]}>One time, forever</Text>
        <Text style={[styles.price, { color: tokens.ink }]}>৳ 890</Text>
        <Text style={[styles.subtitle, { color: tokens.muted }]}>
          Paid once. No subscription, no renewal, no account.
        </Text>

        <View style={styles.featuresWrap}>
          <FeatureList />
        </View>

        <View style={[styles.reassuranceCard, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}>
          <Text style={[styles.reassuranceTitle, { color: tokens.ink }]}>
            Everything you use today stays free.
          </Text>
          <Text style={[styles.reassuranceBody, { color: tokens.muted }]}>
            Scanning, OCR, export and the reader are not part of this purchase and never will be.
          </Text>
        </View>

        <Pressable
          style={[styles.primary, { backgroundColor: tokens.accent }]}
          onPress={() => showUnavailable('Unlock Pro')}
        >
          <Text style={styles.primaryLabel}>Unlock Pro</Text>
        </Pressable>
        <Pressable style={styles.ghost} onPress={() => showUnavailable('Restore purchase')}>
          <Text style={[styles.ghostLabel, { color: tokens.accentInk }]}>Restore purchase</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.xl,
  },
  kicker: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  price: {
    fontFamily: fontFamily.heading,
    fontSize: 40,
    marginTop: spacing.sm,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 21,
    marginBottom: spacing.xl,
  },
  featuresWrap: {
    marginBottom: spacing.xl,
  },
  reassuranceCard: {
    padding: spacing.lg,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.xl,
  },
  reassuranceTitle: {
    fontFamily: fontFamily.heading,
    fontSize: 18,
    marginBottom: 5,
  },
  reassuranceBody: {
    fontSize: 13.5,
    lineHeight: 19,
  },
  primary: {
    height: 52,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  ghost: {
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  ghostLabel: {
    fontSize: 14.5,
    fontWeight: '600',
  },
});
