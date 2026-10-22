import { useCallback, useMemo, useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import { TimetableEditor } from '../components/courses/TimetableEditor';
import { BrandMark } from '../components/brand/BrandMark';
import { ProPassCard } from '../components/home/ProPassCard';
import { passEndLabel } from '../components/pro/passEndLabel';
import { ReadingSettingsSheet } from '../components/reader/ReadingSettingsSheet';
import { AccentPicker } from '../components/settings/AccentPicker';
import { AppLockSection } from '../components/settings/AppLockSection';
import { ChoiceSheet, type Choice } from '../components/settings/ChoiceSheet';
import { FileNamesSheet } from '../components/settings/FileNamesSheet';
import { ProfileCard } from '../components/settings/ProfileCard';
import { ProfileSheet } from '../components/settings/ProfileSheet';
import { ScanFiltersSheet } from '../components/settings/ScanFiltersSheet';
import { SettingsGroup } from '../components/settings/SettingsGroup';
import { ListItem, ScreenHeader, Text, useScreenHeader } from '../components/ui';
import { CATALOG_IDS, PSEUDO_LOCALE, catalogNativeName, hasLanguageChoice, systemCatalogId, type DocumentLanguage, type UiLanguage } from '../i18n';
import { useT } from '../i18n/useT';
import { useRouter } from '../navigation/router';
import { useAdsSdk } from '../services/ads/adsSdk';
import { CAPTURE_MODES, getCaptureModeSpec } from '../services/capture/captureModes';
import type { ReadingSettings } from '../services/documents/readingSettings';
import { deriveFolderLabel } from '../services/export/deviceExportService';
import { grantPass, setEntitlement, useEntitlement, useIsPro } from '../services/pro/entitlement';
import { useRemoteConfig, useRemoteConfigSource } from '../services/remote/remoteConfig';
import { PLANNED_SCRIPTS, READY_SCRIPTS, SCRIPTS } from '../services/scripts/registry';
import { NAME_PRESETS, namePresetFor } from '../services/submit/naming';
import { deviceInfo, supportContacts, type SupportContact } from '../services/support/supportLinks';
import { isCrashReportingActive, reportCrash } from '../services/telemetry/crash';
import { useAppDispatch, useAppSelector } from '../store/AppStateContext';
import { ICONS, spacing, useTheme, type IoniconName, type ThemePref } from '../theme';
import { APP_VERSION } from '../config/appInfo';
import type { CaptureMode, OcrScript } from '../types/models';
import { setRenderCountsShown, useRenderCountsShown } from '../utils/renderCounts';

// What is open over Me: one sheet at a time.
type MeSheet = 'profile' | 'fileNames' | 'filters' | 'reading' | 'mode' | 'script' | 'theme' | 'uiLanguage' | 'docLanguage' | 'timetable';

const THEME_ICONS: Record<ThemePref, IoniconName> = { system: 'phone-portrait-outline', light: 'sunny-outline', dark: 'moon-outline' };

// §17 U10: the Me tab. The student's own card first, then the Pro pass, then short groups of rows,
// each a card (SettingsGroup). Everything with more than a switch to it opens a sheet over the tab,
// so Me itself stays one screen long. A tab root: no Back (Android's goes to Home), and the shell's
// TabBar pads the bottom.
export function SettingsScreen() {
  const { tokens, themePref, setThemePref } = useTheme();
  const { t } = useT();
  const { go } = useRouter();
  const dispatch = useAppDispatch();
  const header = useScreenHeader();
  const [sheet, setSheet] = useState<MeSheet | null>(null);
  const close = useCallback(() => setSheet(null), []);
  const settings = useAppSelector((s) => s.settings);
  // Class times of active courses only: an archived course's classes are over.
  const classCount = useAppSelector(
    (s) => s.library.timetable.filter((slot) => s.library.courses.some((c) => c.id === slot.courseId && !c.archived)).length
  );
  const renderCountsOn = useRenderCountsShown();
  const entitlement = useEntitlement();
  const isPro = useIsPro();
  const remote = useRemoteConfig();
  const remoteSource = useRemoteConfigSource();
  const adsSdk = useAdsSdk();
  const contacts = useMemo(() => supportContacts(remote, deviceInfo()), [remote]);
  const {
    lastCaptureMode,
    ocrScript,
    uiLanguage,
    documentLanguage,
    androidExportFolderUri,
    androidExportFolderLabel,
    crashReportsEnabled,
    scannerUnavailable,
    personalizedAdsEnabled,
    usageStatsEnabled,
    copyScansToFolder,
    nameTemplate,
    reading,
  } = settings;

  // §10 M7: WhatsApp or the email app, with the prefilled message.
  const openContact = useCallback(
    (contact: SupportContact) => {
      Linking.openURL(contact.url).catch(() =>
        dispatch({ type: 'ui/SHOW_SNACK', msg: t('settings.help.openFailed', { app: t(contact.kind === 'whatsapp' ? 'settings.help.whatsappApp' : 'settings.help.emailApp') }) })
      );
    },
    [dispatch, t]
  );

  const handlePickExportFolder = useCallback(async () => {
    const result = await StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!result.granted) {
      dispatch({ type: 'ui/SHOW_SNACK', msg: t('settings.export.noFolder') });
      return;
    }
    dispatch({ type: 'settings/SET_ANDROID_EXPORT_FOLDER', uri: result.directoryUri, label: deriveFolderLabel(result.directoryUri) });
  }, [dispatch, t]);

  const modeChoices: Choice<CaptureMode>[] = CAPTURE_MODES.map((mode) => ({ id: mode.id, label: t(mode.labelKey), subtitle: t(mode.hintKey), icon: mode.icon }));
  const scriptChoices: Choice<OcrScript>[] = [
    ...READY_SCRIPTS.map((s) => ({ id: s.id, label: s.nativeName, subtitle: [t(s.labelKey), s.sampleText].filter(Boolean).join('  ·  ') })),
    ...PLANNED_SCRIPTS.map((s) => ({ id: s.id, label: s.nativeName, subtitle: `${t(s.labelKey)}  ·  ${t('common.comingSoon')}`, disabled: true })),
  ];
  const themeChoices: Choice<ThemePref>[] = (['system', 'light', 'dark'] as const).map((id) => ({ id, label: t(`settings.theme.${id}`), icon: THEME_ICONS[id] }));
  // 'system' first, then each language with a catalog. The rows that open these are hidden while
  // English is the only one (hasLanguageChoice); the pseudo-locale is a developer switch.
  const uiLanguageChoices: Choice<UiLanguage>[] = [
    { id: 'system', label: t('settings.language.system', { name: catalogNativeName(systemCatalogId()) }) },
    ...CATALOG_IDS.map((id) => ({ id, label: catalogNativeName(id) })),
  ];
  const documentLanguageChoices: Choice<DocumentLanguage>[] = [
    { id: 'ui', label: t('settings.language.documentSameAsApp') },
    ...CATALOG_IDS.map((id) => ({ id, label: catalogNativeName(id) })),
  ];
  const labelOf = <Id extends string>(choices: Choice<Id>[], id: Id) => choices.find((c) => c.id === id)?.label;

  const preset = namePresetFor(nameTemplate);
  const presetLabel = preset === 'custom' ? t('settings.fileNames.custom') : t(NAME_PRESETS.find((p) => p.id === preset)!.labelKey);
  const script = SCRIPTS.find((s) => s.id === ocrScript);
  const readingSummary = [
    t(reading.layout === 'paged' ? 'reader.reading.paged' : 'reader.reading.continuous'),
    t(reading.fit === 'page' ? 'reader.reading.fitPage' : 'reader.reading.fitWidth'),
  ].join(' · ');

  return (
    <View style={[styles.root, { backgroundColor: tokens.bg }]}>
      <ScreenHeader large scroll={header} title={t('settings.title')} />
      <Animated.ScrollView
        onScroll={header.onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.body, { paddingTop: header.contentTop }]}
      >
        <ProfileCard onPress={() => setSheet('profile')} />
        {/* §10 M6: as on Home: a running pass and its time left, or the way to one. */}
        <ProPassCard />

        <SettingsGroup title={t('settings.scanning.section')}>
          <ListItem
            icon={ICONS.scanMode}
            title={t('settings.scanning.defaultMode')}
            subtitle={t(getCaptureModeSpec(lastCaptureMode).labelKey)}
            trailing="chevron"
            onPress={() => setSheet('mode')}
            testID="me-default-mode"
          />
          <ListItem
            icon={ICONS.enhance}
            title={t('settings.scanning.filters')}
            subtitle={t('settings.scanning.filtersSubtitle')}
            trailing="chevron"
            onPress={() => setSheet('filters')}
          />
          <ListItem
            icon={ICONS.recognition}
            title={t('settings.recognition.section')}
            subtitle={script?.nativeName}
            trailing="chevron"
            onPress={() => setSheet('script')}
          />
          {scannerUnavailable ? (
            <ListItem
              icon={ICONS.camera}
              title={t('settings.scanner.basicMode')}
              subtitle={t('settings.scanner.basicModeSubtitle')}
              onPress={() => {
                dispatch({ type: 'settings/SET_SCANNER_UNAVAILABLE', unavailable: false });
                dispatch({ type: 'ui/SHOW_SNACK', msg: t('settings.scanner.retrySnack') });
              }}
            />
          ) : null}
        </SettingsGroup>

        <SettingsGroup title={t('settings.organization.section')}>
          <ListItem
            icon={ICONS.course}
            title={t('settings.organization.manageCourses')}
            subtitle={t('settings.organization.manageCoursesSubtitle')}
            trailing="chevron"
            onPress={() => go('manageFolders')}
          />
          <ListItem
            icon={ICONS.timetable}
            title={t('settings.organization.classTimes')}
            subtitle={t('settings.organization.classTimesSubtitle')}
            meta={classCount === 0 ? t('common.notSet') : t('settings.organization.classCount', { count: classCount })}
            onPress={() => setSheet('timetable')}
          />
        </SettingsGroup>

        <SettingsGroup title={t('settings.reading.section')}>
          <ListItem
            icon={ICONS.readingSettings}
            title={t('settings.reading.row')}
            subtitle={readingSummary}
            trailing="chevron"
            onPress={() => setSheet('reading')}
          />
        </SettingsGroup>

        <SettingsGroup title={t('settings.files.section')}>
          <ListItem icon={ICONS.backup} title={t('backup.screen.row')} subtitle={t('backup.screen.rowSubtitle')} trailing="chevron" onPress={() => go('backup')} />
          <ListItem
            icon={ICONS.storage}
            title={t('settings.storage.row')}
            subtitle={t('settings.storage.rowSubtitle')}
            trailing="chevron"
            onPress={() => go('storage')}
          />
          <ListItem
            icon={ICONS.fileNames}
            title={t('settings.fileNames.section')}
            subtitle={presetLabel}
            trailing="chevron"
            onPress={() => setSheet('fileNames')}
            testID="me-file-names"
          />
          {Platform.OS === 'android' ? (
            <ListItem
              icon={ICONS.exportFolder}
              title={t('settings.export.folder')}
              subtitle={androidExportFolderLabel ?? t('common.notSet')}
              onPress={() => void handlePickExportFolder()}
            />
          ) : null}
          {/* §17 U9: was a per-save switch in Deliver's "More options". */}
          {Platform.OS === 'android' && androidExportFolderUri ? (
            <ListItem
              icon={ICONS.duplicate}
              title={t('settings.export.copyScans')}
              subtitle={t('settings.export.copyScansSubtitle', { folder: androidExportFolderLabel ?? '' })}
              switchValue={copyScansToFolder}
              onValueChange={(enabled) => dispatch({ type: 'settings/SET_COPY_SCANS', enabled })}
            />
          ) : null}
        </SettingsGroup>

        <SettingsGroup title={t('settings.privacy.section')} footnote={t('settings.privacy.adsNote')}>
          <AppLockSection />
          <ListItem
            icon={ICONS.crashReports}
            title={t('settings.privacy.crashReports')}
            subtitle={t('settings.privacy.crashReportsSubtitle')}
            switchValue={crashReportsEnabled}
            onValueChange={(enabled) => dispatch({ type: 'settings/SET_CRASH_REPORTS', enabled })}
          />
          <ListItem
            icon={ICONS.usageStats}
            title={t('settings.privacy.usageStats')}
            subtitle={t('settings.privacy.usageStatsSubtitle')}
            switchValue={usageStatsEnabled}
            onValueChange={(enabled) => dispatch({ type: 'settings/SET_USAGE_STATS', enabled })}
          />
          <ListItem
            icon={ICONS.ads}
            title={t('settings.privacy.personalizedAds')}
            subtitle={t('settings.privacy.personalizedAdsSubtitle')}
            switchValue={personalizedAdsEnabled}
            onValueChange={(enabled) => dispatch({ type: 'settings/SET_PERSONALIZED_ADS', enabled })}
          />
        </SettingsGroup>

        <SettingsGroup title={t('settings.appearance')}>
          <ListItem icon={ICONS.theme} title={t('settings.theme.label')} subtitle={labelOf(themeChoices, themePref)} trailing="chevron" onPress={() => setSheet('theme')} />
          <View style={styles.accent}>
            <AccentPicker />
          </View>
        </SettingsGroup>

        {hasLanguageChoice() ? (
          <SettingsGroup title={t('settings.language.group')}>
            <ListItem
              icon={ICONS.language}
              title={t('settings.language.section')}
              subtitle={labelOf(uiLanguageChoices, uiLanguage)}
              trailing="chevron"
              onPress={() => setSheet('uiLanguage')}
            />
            <ListItem
              icon={ICONS.language}
              title={t('settings.language.documentSection')}
              subtitle={labelOf(documentLanguageChoices, documentLanguage)}
              trailing="chevron"
              onPress={() => setSheet('docLanguage')}
            />
          </SettingsGroup>
        ) : null}

        <SettingsGroup title={t('settings.help.section')} footnote={t('settings.help.note')}>
          {contacts.map((contact) => (
            <ListItem
              key={contact.kind}
              icon={contact.kind === 'whatsapp' ? ICONS.whatsapp : ICONS.email}
              title={t(contact.kind === 'whatsapp' ? 'settings.help.whatsappApp' : 'settings.help.emailTitle')}
              subtitle={contact.label}
              trailing="chevron"
              onPress={() => openContact(contact)}
            />
          ))}
          <ListItem icon={ICONS.intro} title={t('settings.about.showIntro')} trailing="chevron" onPress={() => go('onboarding')} />
        </SettingsGroup>

        <SettingsGroup title={t('settings.about.section')}>
          {/* §15 V4: the logo next to the version. */}
          <View style={styles.about}>
            <BrandMark size={40} />
            <Text variant="caption" color="muted" style={styles.flex}>
              {t('settings.about.text', { version: APP_VERSION })}
            </Text>
          </View>
        </SettingsGroup>

        {__DEV__ ? (
          <SettingsGroup title={t('settings.developer.section')}>
            <ListItem icon={ICONS.developer} title={t('settings.developer.filterLab')} subtitle={t('settings.developer.filterLabSubtitle')} trailing="chevron" onPress={() => go('filterLab')} />
            <ListItem icon={ICONS.developer} title={t('settings.developer.readerLab')} subtitle={t('settings.developer.readerLabSubtitle')} trailing="chevron" onPress={() => go('readerLab')} />
            <ListItem icon={ICONS.developer} title={t('settings.developer.uiGallery')} subtitle={t('settings.developer.uiGallerySubtitle')} trailing="chevron" onPress={() => go('uiGallery')} />
            <ListItem
              icon={ICONS.developer}
              title={t('settings.developer.renderCounts')}
              subtitle={t(renderCountsOn ? 'settings.developer.renderCountsOn' : 'settings.developer.renderCountsOff')}
              switchValue={renderCountsOn}
              onValueChange={setRenderCountsShown}
            />
            <ListItem
              icon={ICONS.language}
              title={t('settings.language.pseudo')}
              switchValue={uiLanguage === PSEUDO_LOCALE}
              onValueChange={(on) => dispatch({ type: 'settings/SET_UI_LANGUAGE', language: on ? PSEUDO_LOCALE : 'system' })}
            />
            <ListItem
              icon={ICONS.pro}
              title={t('settings.developer.proPass')}
              subtitle={
                isPro && entitlement?.expiresAt
                  ? t('settings.developer.proPassActive', { time: passEndLabel(entitlement.expiresAt) })
                  : t('settings.developer.proPassInactive', { count: remote.passHours })
              }
              onPress={() => void setEntitlement(isPro ? null : grantPass(entitlement, Date.now(), remote.passHours))}
            />
            <ListItem
              icon={ICONS.ads}
              title={t('settings.developer.adsSetup')}
              subtitle={t('settings.developer.adsSetupLine', {
                status: t(`settings.developer.adsStatus.${adsSdk.status}`, {
                  reason: t(`settings.developer.adsReason.${adsSdk.reason ?? 'sdk'}`),
                }),
                unit: t((Platform.OS === 'ios' ? remote.adsRewardedUnitIos : remote.adsRewardedUnitAndroid) ? 'settings.developer.yes' : 'settings.developer.no'),
                source: t(`settings.developer.remoteSource.${remoteSource}`),
              })}
            />
            <ListItem
              icon={ICONS.crashReports}
              title={t('settings.developer.testCrash')}
              subtitle={t('settings.developer.testCrashSubtitle')}
              onPress={() => {
                const sent = isCrashReportingActive();
                reportCrash(new Error('Sentry test error'));
                dispatch({ type: 'ui/SHOW_SNACK', msg: t(sent ? 'settings.developer.testCrashSent' : 'settings.developer.testCrashOff') });
              }}
            />
          </SettingsGroup>
        ) : null}
      </Animated.ScrollView>

      <ProfileSheet visible={sheet === 'profile'} onClose={close} />
      <FileNamesSheet visible={sheet === 'fileNames'} onClose={close} />
      <ScanFiltersSheet visible={sheet === 'filters'} onClose={close} />
      <ReadingSettingsSheet
        visible={sheet === 'reading'}
        reading={reading}
        showPageOptions
        onChange={(patch: Partial<ReadingSettings>) => dispatch({ type: 'settings/SET_READING', reading: patch })}
        onClose={close}
      />
      <ChoiceSheet
        visible={sheet === 'mode'}
        onClose={close}
        title={t('settings.scanning.defaultMode')}
        choices={modeChoices}
        value={lastCaptureMode}
        onChange={(mode) => dispatch({ type: 'settings/SET_LAST_CAPTURE_MODE', mode })}
        testID="me-mode"
      />
      <ChoiceSheet
        visible={sheet === 'script'}
        onClose={close}
        title={t('settings.recognition.section')}
        choices={scriptChoices}
        value={ocrScript}
        onChange={(id) => dispatch({ type: 'settings/SET_OCR_SCRIPT', script: id })}
        footnote={t('settings.recognition.footnote')}
        testID="me-script"
      />
      <ChoiceSheet visible={sheet === 'theme'} onClose={close} title={t('settings.theme.label')} choices={themeChoices} value={themePref} onChange={setThemePref} testID="me-theme" />
      <ChoiceSheet
        visible={sheet === 'uiLanguage'}
        onClose={close}
        title={t('settings.language.section')}
        choices={uiLanguageChoices}
        value={uiLanguage}
        onChange={(language) => dispatch({ type: 'settings/SET_UI_LANGUAGE', language })}
      />
      <ChoiceSheet
        visible={sheet === 'docLanguage'}
        onClose={close}
        title={t('settings.language.documentSection')}
        choices={documentLanguageChoices}
        value={documentLanguage}
        onChange={(language) => dispatch({ type: 'settings/SET_DOCUMENT_LANGUAGE', language })}
        footnote={t('settings.language.documentHint')}
      />
      <TimetableEditor visible={sheet === 'timetable'} onClose={close} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.xl,
  },
  accent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  about: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  flex: {
    flex: 1,
  },
});
