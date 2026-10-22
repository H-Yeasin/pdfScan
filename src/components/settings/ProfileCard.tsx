import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { useT } from '../../i18n/useT';
import { profileInitials } from '../../services/submit/profile';
import { useAppSelector } from '../../store/AppStateContext';
import { ICON_SIZE, ICONS, radii, spacing, useTheme } from '../../theme';
import { Card, Text } from '../ui';

const AVATAR = 56;

// §17 U10: the top of Me. The student's initials on the accent, their name, then roll and
// institution; "Add your details" while there is no name or roll. The whole card opens
// ProfileSheet.
export function ProfileCard({ onPress }: { onPress: () => void }) {
  const { tokens } = useTheme();
  const { t } = useT();
  const profile = useAppSelector((s) => s.settings.profile);
  const name = profile.name.trim();
  const details = [profile.roll.trim(), profile.institution.trim()].filter(Boolean).join(' · ');
  const empty = !name && !details;
  const initials = profileInitials(name);
  const title = empty ? t('settings.profile.add') : name || t('settings.profile.noName');
  const subtitle = empty ? t('settings.profile.addHint') : details || t('settings.profile.noRoll');

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${title}. ${subtitle}`}
      accessibilityHint={t('settings.profile.cardHint')}
      style={styles.card}
      testID="me-profile-card"
    >
      <View style={[styles.avatar, { backgroundColor: tokens.accent }]}>
        {initials ? (
          <Text variant="title" color={tokens.onAccent} chrome>
            {initials}
          </Text>
        ) : (
          <Ionicons name={ICONS.me} size={ICON_SIZE.bar + 6} color={tokens.onAccent} />
        )}
      </View>
      <View style={styles.texts}>
        <Text variant="subtitle" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="caption" color="muted" numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
      <Ionicons name={empty ? ICONS.addPage : ICONS.rename} size={ICON_SIZE.row} color={tokens.accentInk} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
});
