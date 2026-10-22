import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '../../i18n/useT';
import { t as translate } from '../../i18n';
import { useRouter } from '../../navigation/router';
import { useScreenRole } from '../../navigation/screenRole';
import { passMinutesLeft } from '../../services/courses/homeSelectors';
import { isProActive, useEntitlement } from '../../services/pro/entitlement';
import { useRemoteConfig } from '../../services/remote/remoteConfig';
import { ICON_SIZE, ICONS, spacing, useTheme } from '../../theme';
import { Button, Card, Text } from '../ui';

// "42 min left", "1 h 20 min left" (passes add up, so one can run past an hour).
export function passLeftLabel(minutes: number): string {
  if (minutes < 60) return translate('home.passMinutes', { count: minutes });
  return translate('home.passHoursMinutes', { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
}

// What the card shows: a running pass, the way to one, or nothing. A paid licence (M9, never granted
// yet) needs no card; without ads (`ads_enabled` off) there is no way to watch for a pass.
export function proPassCardState(
  entitlement: { source: string; expiresAt?: number } | null,
  active: boolean,
  adsEnabled: boolean,
  now: number
): { kind: 'active'; minutes: number } | { kind: 'offer' } | null {
  if (active && entitlement?.source === 'pass' && entitlement.expiresAt !== undefined) {
    return { kind: 'active', minutes: Math.max(1, passMinutesLeft(entitlement.expiresAt, now)) };
  }
  if (active) return null;
  return adsEnabled ? { kind: 'offer' } : null;
}

// §17 U6: compact: "Pro pass active · 42 min left" on the marigold highlight, or "Get 1 hour of Pro"
// as a ghost button. While a pass runs and Home is on screen it counts down by the minute.
export function ProPassCard() {
  const { t } = useT();
  const { tokens } = useTheme();
  const { go } = useRouter();
  const { adsEnabled, passHours } = useRemoteConfig();
  const entitlement = useEntitlement();
  const onScreen = useScreenRole() === 'active';
  const [now, setNow] = useState(() => Date.now());
  const active = isProActive(entitlement, now);
  const running = active && entitlement?.expiresAt !== undefined;

  useEffect(() => {
    if (!onScreen) return;
    setNow(Date.now());
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [onScreen, running, entitlement]);

  const state = proPassCardState(entitlement, active, adsEnabled, now);
  if (!state) return null;

  if (state.kind === 'offer') {
    return (
      <Button
        variant="ghost"
        icon={ICONS.pro}
        label={t('home.getPass', { count: passHours })}
        onPress={() => go('pro')}
        style={styles.offer}
        testID="home-pro-offer"
      />
    );
  }
  return (
    <Card tone="highlight" onPress={() => go('pro')} style={styles.card} testID="home-pro-active">
      <Ionicons name={ICONS.pro} size={ICON_SIZE.row} color={tokens.highlightInk} />
      <View style={styles.flex}>
        <Text variant="label" color="highlightInk" numberOfLines={1}>
          {t('home.passActive', { left: passLeftLabel(state.minutes) })}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={ICON_SIZE.row} color={tokens.highlightInk} />
    </Card>
  );
}

const styles = StyleSheet.create({
  offer: {
    alignSelf: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
});
