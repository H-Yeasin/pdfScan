import { Ionicons } from '@expo/vector-icons';
import { Alert, ScrollView, StyleSheet, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FeatureList } from '../components/pro/FeatureList';
import { useRouter } from '../navigation/router';
import { fontFamily, radii, spacing, useTheme } from '../theme';
import { useT } from '../i18n/useT';

export function ProScreen() {
  const { tokens } = useTheme();
  const { t } = useT();
  const { go } = useRouter();

  const showUnavailable = (action: string) =>
    Alert.alert(
      t('pro.unavailableTitle'),
      t('pro.unavailableBody', { action })
    );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tokens.bg }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={() => go('settings', 'back')} accessibilityLabel={t('common.back')}>
          <Ionicons name="chevron-back" size={20} color={tokens.ink} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.kicker, { color: tokens.accentInk }]}>{t('pro.kicker')}</Text>
        <Text style={[styles.price, { color: tokens.ink }]}>৳ 890</Text>
        <Text style={[styles.subtitle, { color: tokens.muted }]}>
          {t('pro.subtitle')}
        </Text>

        <View style={styles.featuresWrap}>
          <FeatureList />
        </View>

        <View style={[styles.reassuranceCard, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}>
          <Text style={[styles.reassuranceTitle, { color: tokens.ink }]}>
            {t('pro.freeTitle')}
          </Text>
          <Text style={[styles.reassuranceBody, { color: tokens.muted }]}>
            {t('pro.freeBody')}
          </Text>
        </View>

        <Pressable
          style={[styles.primary, { backgroundColor: tokens.accent }]}
          onPress={() => showUnavailable(t('pro.unlock'))}
        >
          <Text style={styles.primaryLabel}>{t('pro.unlock')}</Text>
        </Pressable>
        <Pressable style={styles.ghost} onPress={() => showUnavailable(t('pro.restore'))}>
          <Text style={[styles.ghostLabel, { color: tokens.accentInk }]}>{t('pro.restore')}</Text>
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
