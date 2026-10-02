import { Ionicons } from '@expo/vector-icons';
import { useEffect, type PropsWithChildren } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { useT } from '../../i18n/useT';
import { useAppLock } from '../../store/useAppLock';
import { fontFamily, radii, spacing, typeScale, useTheme } from '../../theme';

// §10 M4: nothing of the app is rendered until the lock is settled: a blank page while settings
// load, the lock screen while locked. The screens (and the restore / export hosts) mount only
// after the unlock, so a file opened with "Open with" while locked waits underneath: its hooks
// in AppNavigator still run and route to the Reader, which shows once unlocked.
export function AppLockGate({ children }: PropsWithChildren) {
  const { status, promptTick, unlock } = useAppLock();
  const { tokens } = useTheme();
  if (status === 'unknown') return <View style={[styles.fill, { backgroundColor: tokens.bg }]} />;
  if (status === 'locked') return <LockScreen onUnlock={unlock} promptTick={promptTick} />;
  return <>{children}</>;
}

export function LockScreen({ onUnlock, promptTick }: { onUnlock: () => Promise<void>; promptTick: number }) {
  const { tokens } = useTheme();
  const { t } = useT();

  // Ask straight away, and again each time the app comes back to the front while locked. A
  // cancelled sheet isn't asked again until then: the Unlock button is there.
  useEffect(() => {
    void onUnlock();
  }, [onUnlock, promptTick]);
  // Back leaves the app instead of moving the screens underneath. Added after AppNavigator's
  // handler, so it runs first.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      BackHandler.exitApp();
      return true;
    });
    return () => sub.remove();
  }, []);

  return (
    <View style={[styles.fill, styles.center, { backgroundColor: tokens.bg }]}>
      <View style={[styles.icon, { backgroundColor: tokens.accentSoft }]}>
        <Ionicons name="lock-closed" size={30} color={tokens.accentInk} />
      </View>
      <Text accessibilityRole="header" style={[styles.title, { color: tokens.ink }]}>
        {t('lock.title')}
      </Text>
      <Text style={[styles.body, { color: tokens.muted }]}>{t('lock.body')}</Text>
      <Pressable accessibilityRole="button" onPress={() => void onUnlock()} style={[styles.button, { backgroundColor: tokens.accent }]}>
        <Text style={[styles.buttonText, { color: tokens.onAccent }]}>{t('lock.unlock')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  icon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: fontFamily.heading,
    fontSize: typeScale.title.fontSize,
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
  button: {
    marginTop: spacing.lg,
    minHeight: 48,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontFamily: typeScale.label.fontFamily,
  },
});
