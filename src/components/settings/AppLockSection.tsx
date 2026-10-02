import { Platform, StyleSheet, Text, View } from 'react-native';
import { useT } from '../../i18n/useT';
import { useIsPro } from '../../services/pro/entitlement';
import { canUseProFeature } from '../../services/pro/proFeatures';
import { LOCK_AFTER_OPTIONS, type LockAfter } from '../../services/security/appLock';
import { useAppDispatch, useAppSlices } from '../../store/AppStateContext';
import { authenticate, hasDeviceLock } from '../../store/useAppLock';
import { spacing, useTheme } from '../../theme';
import { useOfferPro } from '../pro/useOfferPro';
import { SegmentedControl } from '../shared/SegmentedControl';
import { SettingRow } from './SettingRow';

// §10 M4: Settings → Privacy's app lock rows. Turning the lock on needs Pro and a screen lock on
// the phone, and is confirmed with the phone's unlock (so nobody locks themselves out by
// accident). Turning it off is always allowed, after the same confirmation: the lock stays on
// after Pro ends until then (lapse rule 'keepUntilOff').
export function AppLockSection() {
  const { tokens } = useTheme();
  const { t } = useT();
  const dispatch = useAppDispatch();
  const { appLock } = useAppSlices('settings').settings;
  const isPro = useIsPro();
  const offerPro = useOfferPro();
  const afterSegments = LOCK_AFTER_OPTIONS.map((o) => ({ id: o.id, label: t(o.labelKey) }));

  const setEnabled = async (enabled: boolean) => {
    if (enabled && !canUseProFeature('appLock', 'start', isPro)) {
      offerPro('appLock');
      return;
    }
    if (!(await hasDeviceLock())) {
      // Nothing to confirm with: turning on is refused; turning off (the screen lock was removed
      // since) just happens.
      if (enabled) dispatch({ type: 'ui/SHOW_SNACK', msg: t('settings.appLock.noDeviceLock') });
      else dispatch({ type: 'settings/SET_APP_LOCK', appLock: { enabled: false } });
      return;
    }
    const result = await authenticate(t(enabled ? 'settings.appLock.confirmPrompt' : 'settings.appLock.turnOffPrompt'));
    if (result.success) dispatch({ type: 'settings/SET_APP_LOCK', appLock: { enabled } });
  };

  return (
    <>
      <SettingRow
        title={t('settings.appLock.title')}
        subtitle={appLock.enabled && !isPro ? t('settings.appLock.keptAfterPro') : t('settings.appLock.subtitle')}
        proBadge={!isPro && !appLock.enabled}
        toggle={{ value: appLock.enabled, onChange: (enabled) => void setEnabled(enabled) }}
      />
      {appLock.enabled && (
        <>
          <View style={styles.after}>
            <Text style={[styles.label, { color: tokens.ink }]}>{t('settings.appLock.lockAfter')}</Text>
            <SegmentedControl<LockAfter>
              segments={afterSegments}
              value={appLock.after}
              onChange={(after) => dispatch({ type: 'settings/SET_APP_LOCK', appLock: { after } })}
            />
            <Text style={[styles.footnote, { color: tokens.muted }]}>{t('settings.appLock.lockAfterHint')}</Text>
          </View>
          {Platform.OS === 'android' && (
            <SettingRow
              title={t('settings.appLock.hideInRecents')}
              subtitle={t('settings.appLock.hideInRecentsSubtitle')}
              toggle={{
                value: appLock.hideInRecents,
                onChange: (hideInRecents) => dispatch({ type: 'settings/SET_APP_LOCK', appLock: { hideInRecents } }),
              }}
            />
          )}
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  after: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  label: {
    fontSize: 15,
  },
  footnote: {
    fontSize: 12.5,
    lineHeight: 17,
  },
});
