import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useT } from '../../i18n/useT';
import { useIsPro } from '../../services/pro/entitlement';
import { ACCENT_IDS, ACCENTS, DEFAULT_ACCENT, spacing, useTheme, type AccentId } from '../../theme';
import { ProBadge } from '../pro/ProBadge';
import { useOfferPro } from '../pro/useOfferPro';

// §10 M4: Settings → Appearance's accent swatches. Teal is free; the others are Pro. Without Pro
// a Pro swatch offers Pro instead of switching (useOfferPro). A choice made with Pro is kept and
// comes back with Pro (ThemeProvider shows teal meanwhile).
export function AccentPicker() {
  const { tokens, theme, accent, accentPref, setAccentPref } = useTheme();
  const { t } = useT();
  const isPro = useIsPro();
  const offerPro = useOfferPro();

  const choose = (id: AccentId) => {
    if (id !== DEFAULT_ACCENT && !isPro) {
      offerPro('themeAccents');
      return;
    }
    setAccentPref(id);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: tokens.ink }]}>{t('settings.accent.label')}</Text>
        {isPro ? null : <ProBadge />}
      </View>
      <View style={styles.row} accessibilityRole="radiogroup">
        {ACCENT_IDS.map((id) => {
          const selected = id === accent;
          const name = t(`settings.accent.names.${id}`);
          return (
            <Pressable
              key={id}
              onPress={() => choose(id)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={t('settings.accent.a11y', { name })}
              style={[styles.swatchRing, { borderColor: selected ? tokens.ink : 'transparent' }]}
            >
              <View style={[styles.swatch, { backgroundColor: ACCENTS[id][theme].accent }]}>
                {selected ? <Ionicons name="checkmark" size={18} color={ACCENTS[id][theme].onAccent} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      {accentPref !== accent ? <Text style={[styles.note, { color: tokens.muted }]}>{t('settings.accent.lapsed')}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  label: {
    fontSize: 15,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  swatchRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatch: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: {
    fontSize: 12.5,
    lineHeight: 17,
  },
});
