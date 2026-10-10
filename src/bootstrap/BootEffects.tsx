import { memo, useEffect, useRef } from 'react';
import { useRenderCount } from '../utils/renderCounts';
import { MIN_SESSIONS_FOR_ADS } from '../services/ads/adPolicy';
import { startAds } from '../services/ads/adsSdk';
import { loadEntitlement, useIsPro } from '../services/pro/entitlement';
import { loadRemoteConfig, useRemoteConfig } from '../services/remote/remoteConfig';
import { initCrashReporting } from '../services/telemetry/crash';
import { logUsage, setUsageCollection } from '../services/telemetry/usage';
import { useAppSelector } from '../store/AppStateContext';
import { useAutoBackup } from '../store/useAutoBackup';
import { configureNotifications, useDeadlineReminders } from '../store/useDeadlines';
import { useExternalFileLinking } from '../store/useExternalFileLinking';
import { useImportedPdfIndexing } from '../store/useImportedPdfIndexing';
import { useLibraryPersistence } from '../store/useLibraryPersistence';
import { usePdfInfoBackfill } from '../store/usePdfInfoBackfill';
import { useSettingsPersistence } from '../store/useSettingsPersistence';
import { useSignaturePersistence } from '../store/useSignaturePersistence';
import { useStorageIntegrity } from '../store/useStorageIntegrity';

// §16 G5: the app's always-on background work, as a component that renders nothing. These hooks
// follow whole slices (persistence diffs the library on each change, indexing and the reminders
// read its documents and deadlines), and a hook re-renders the component it's called in. In
// AppNavigator that was the navigator and every host under it, on each saved page and each
// setting. Here it's only this empty component.
//
// Mounted by AppNavigator from its first render (the loads start then), above the app lock.
// `afterBoot` (§9 O5): true a moment after the start screen is up; what the first screen doesn't
// need waits for it.
export const BootEffects = memo(function BootEffects({ afterBoot }: { afterBoot: boolean }) {
  useRenderCount('BootEffects');
  const libraryLoaded = useLibraryPersistence();
  const libraryAfterBoot = afterBoot && libraryLoaded;
  useSettingsPersistence();
  useSignaturePersistence();
  useExternalFileLinking(libraryLoaded);
  useDeadlineReminders(libraryLoaded, libraryAfterBoot);
  useImportedPdfIndexing(libraryAfterBoot);
  usePdfInfoBackfill(libraryAfterBoot);
  useStorageIntegrity(libraryAfterBoot);
  useAutoBackup(libraryAfterBoot);

  const settingsLoaded = useAppSelector((s) => s.settings.loaded);
  const crashReportsEnabled = useAppSelector((s) => s.settings.crashReportsEnabled);
  // Deferred too (§9 O5): Sentry's init isn't free, and a crash before it still reaches the
  // ErrorBoundary.
  useEffect(() => {
    if (afterBoot) initCrashReporting(crashReportsEnabled);
  }, [afterBoot, crashReportsEnabled]);
  // §10 M8: usage counts follow "Help improve PDF Scan", after the first frame like Sentry. One
  // app_open per run, sent once collection is on.
  const usageStatsEnabled = useAppSelector((s) => s.settings.usageStatsEnabled);
  const openLogged = useRef(false);
  useEffect(() => {
    if (!afterBoot || !settingsLoaded) return;
    void setUsageCollection(usageStatsEnabled).then(() => {
      if (usageStatsEnabled && !openLogged.current) {
        openLogged.current = true;
        logUsage('app_open');
      }
    });
  }, [afterBoot, settingsLoaded, usageStatsEnabled]);
  // §10 M3: one small secure-store read, not deferred, so Pro features and the banner policy
  // (M5) see the pass as soon as they render.
  useEffect(() => {
    void loadEntitlement();
  }, []);
  // §10 M2: the console's settings (ads switch, pass length, support contact); bundled defaults
  // until then and whenever Firebase isn't there.
  useEffect(() => {
    if (afterBoot) void loadRemoteConfig();
  }, [afterBoot]);
  // Reminders as banners while the app is open (§16 G3: deferred, not at import).
  useEffect(() => {
    if (afterBoot) configureNotifications();
  }, [afterBoot]);
  // §10 M5: the ads SDK (and its consent form, where the law needs one) only once a banner could
  // show: ads switched on in the console, the introduction done, from the third start, no Pro.
  // Before that the SDK is never loaded.
  const { adsEnabled } = useRemoteConfig();
  const isPro = useIsPro();
  const adsAllowed = useAppSelector((s) => s.settings.onboardingDone && s.settings.appSessions >= MIN_SESSIONS_FOR_ADS);
  const adsCould = afterBoot && adsEnabled && !isPro && adsAllowed;
  useEffect(() => {
    if (adsCould) void startAds();
  }, [adsCould]);

  return null;
});
