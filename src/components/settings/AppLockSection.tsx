import { Platform, StyleSheet, View } from 'react-native';
import { useT } from '../../i18n/useT';
import { useIsPro } from '../../services/pro/entitlement';
import { canUseProFeature } from '../../services/pro/proFeatures';
import { LOCK_AFTER_OPTIONS, type LockAfter } from '../../services/security/appLock';
import { useAppDispatch, useAppSlices } from '../../store/AppStateContext';
import { authenticate, hasDeviceLock } from '../../store/useAppLock';
import { ICONS, spacing } from '../../theme';
import { ProBadge } from '../pro/ProBadge';
import { useOfferPro } from '../pro/useOfferPro';
import { SegmentedControl } from '../shared/SegmentedControl';
import { Divider, ICON_WELL, ListItem, Text } from '../ui';

// §10 M4: Me → Privacy & security's app lock rows (§17 U10: on the kit, inside the group's card). Turning the lock on needs Pro and a screen lock on
// the phone, and is confirmed with the phone's unlock (so nobody locks themselves out by
// accident). Turning it off is always allowed, after the same confirmation: the lock stays on
// after Pro ends until then (lapse rule 'keepUntilOff').
export function AppLockSection() {
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
    <View>
      <ListItem
        icon={ICONS.lock}
        title={t('settings.appLock.title')}
        subtitle={appLock.enabled && !isPro ? t('settings.appLock.keptAfterPro') : t('settings.appLock.subtitle')}
        switchValue={appLock.enabled}
        onValueChange={(enabled) => void setEnabled(enabled)}
      />
      {!isPro && !appLock.enabled ? (
        <View style={styles.badge}>
          <ProBadge />
        </View>
      ) : null}
      {appLock.enabled && (
        <>
          <Divider inset="icon" />
          <View style={styles.after}>
            <Text variant="bodyStrong">{t('settings.appLock.lockAfter')}</Text>
            <SegmentedControl<LockAfter>
              segments={afterSegments}
              value={appLock.after}
              onChange={(after) => dispatch({ type: 'settings/SET_APP_LOCK', appLock: { after } })}
            />
            <Text variant="caption" color="muted">
              {t('settings.appLock.lockAfterHint')}
            </Text>
          </View>
          {Platform.OS === 'android' && (
            <>
              <Divider inset="icon" />
              <ListItem
                icon={ICONS.hideInRecents}
                title={t('settings.appLock.hideInRecents')}
                subtitle={t('settings.appLock.hideInRecentsSubtitle')}
                switchValue={appLock.hideInRecents}
                onValueChange={(hideInRecents) => dispatch({ type: 'settings/SET_APP_LOCK', appLock: { hideInRecents } })}
              />
            </>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // The ProBadge sits under the title, lined up with the row's text.
  badge: {
    flexDirection: 'row',
    paddingLeft: spacing.lg + ICON_WELL + spacing.md,
    marginTop: -spacing.xs,
    paddingBottom: spacing.sm,
  },
  after: {
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingRight: spacing.lg,
    paddingLeft: spacing.lg + ICON_WELL + spacing.md,
  },
});
