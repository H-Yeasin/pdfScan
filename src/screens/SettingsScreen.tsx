import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Pressable, Text, View } from 'react-native';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TimetableEditor } from '../components/courses/TimetableEditor';
import { LanguageRow } from '../components/settings/LanguageRow';
import { NameTemplateSection } from '../components/settings/NameTemplateSection';
import { ProfileSection } from '../components/settings/ProfileSection';
import { SettingRow } from '../components/settings/SettingRow';
import { SegmentedControl } from '../components/shared/SegmentedControl';
import { CATALOG_IDS, PSEUDO_LOCALE, catalogNativeName, systemCatalogId, type DocumentLanguage, type UiLanguage } from '../i18n';
import { useT } from '../i18n/useT';
import { useRouter } from '../navigation/router';
import { deriveFolderLabel } from '../services/export/deviceExportService';
import { useAppDispatch, useAppSlices } from '../store/AppStateContext';
import { fontFamily, spacing, typeScale, useTheme, type ThemePref } from '../theme';
import { PLANNED_SCRIPTS, READY_SCRIPTS } from '../services/scripts/registry';


const APP_VERSION = '1.0';

export function SettingsScreen() {
  const { tokens, themePref, setThemePref } = useTheme();
  const { t } = useT();
  const themeSegments: { id: ThemePref; label: string }[] = [
    { id: 'system', label: t('settings.theme.system') },
    { id: 'light', label: t('settings.theme.light') },
    { id: 'dark', label: t('settings.theme.dark') },
  ];
  const [timetableOpen, setTimetableOpen] = useState(false);
  const { go, hub } = useRouter();
  const dispatch = useAppDispatch();
  const state = useAppSlices('library', 'settings');
  // Class times of active courses only: an archived course's classes are over.
  const classCount = state.library.timetable.filter((slot) =>
    state.library.courses.some((c) => c.id === slot.courseId && !c.archived)
  ).length;
  const { ocrScript, uiLanguage, documentLanguage, androidExportFolderUri, androidExportFolderLabel, crashReportsEnabled, scannerUnavailable } =
    state.settings;
  // 'system' first, then each language with a catalog, then (development builds) the pseudo-locale.
  const languageOptions: { id: UiLanguage; name: string }[] = [
    { id: 'system', name: t('settings.language.system', { name: catalogNativeName(systemCatalogId()) }) },
    ...CATALOG_IDS.map((id): { id: UiLanguage; name: string } => ({ id, name: catalogNativeName(id) })),
    ...(__DEV__ ? [{ id: PSEUDO_LOCALE as UiLanguage, name: t('settings.language.pseudo') }] : []),
  ];
  const documentLanguageOptions: { id: DocumentLanguage; name: string }[] = [
    { id: 'ui', name: t('settings.language.documentSameAsApp') },
    ...CATALOG_IDS.map((id): { id: DocumentLanguage; name: string } => ({ id, name: catalogNativeName(id) })),
  ];

  const handlePickExportFolder = useCallback(async () => {
    const result = await StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!result.granted) {
      dispatch({ type: 'ui/SHOW_SNACK', msg: t('settings.export.noFolder') });
      return;
    }
    dispatch({
      type: 'settings/SET_ANDROID_EXPORT_FOLDER',
      uri: result.directoryUri,
      label: deriveFolderLabel(result.directoryUri),
    });
  }, [dispatch, t]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tokens.bg }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={() => go(hub, 'back')} accessibilityLabel={t('common.back')}>
          <Ionicons name="chevron-back" size={20} color={tokens.ink} />
        </Pressable>
        <Text style={[styles.title, { color: tokens.ink }]}>{t('settings.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <ProfileSection />

        <NameTemplateSection />

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: tokens.muted }]}>{t('settings.appearance')}</Text>
          <SegmentedControl segments={themeSegments} value={themePref} onChange={setThemePref} />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: tokens.muted }]}>{t('settings.language.section')}</Text>
          <View style={[styles.card, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}>
            {languageOptions.map((option) => (
              <LanguageRow
                key={option.id}
                name={option.name}
                selected={uiLanguage === option.id}
                onPress={() => dispatch({ type: 'settings/SET_UI_LANGUAGE', language: option.id })}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: tokens.muted }]}>{t('settings.language.documentSection')}</Text>
          <View style={[styles.card, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}>
            {documentLanguageOptions.map((option) => (
              <LanguageRow
                key={option.id}
                name={option.name}
                selected={documentLanguage === option.id}
                onPress={() => dispatch({ type: 'settings/SET_DOCUMENT_LANGUAGE', language: option.id })}
              />
            ))}
          </View>
          <Text style={[styles.footnote, { color: tokens.muted }]}>{t('settings.language.documentHint')}</Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: tokens.muted }]}>{t('settings.recognition.section')}</Text>
          <View style={[styles.card, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}>
            {READY_SCRIPTS.map((script) => (
              <LanguageRow
                key={script.id}
                name={script.nativeName}
                subtitle={t(script.labelKey)}
                sample={script.sampleText}
                selected={ocrScript === script.id}
                onPress={() => dispatch({ type: 'settings/SET_OCR_SCRIPT', script: script.id })}
              />
            ))}
            {PLANNED_SCRIPTS.map((script) => (
              <LanguageRow
                key={script.id}
                name={script.nativeName}
                subtitle={t(script.labelKey)}
                selected={false}
                comingSoon
              />
            ))}
          </View>
          <Text style={[styles.footnote, { color: tokens.muted }]}>{t('settings.recognition.footnote')}</Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: tokens.muted }]}>{t('settings.organization.section')}</Text>
          <SettingRow
            title={t('settings.organization.manageCourses')}
            subtitle={t('settings.organization.manageCoursesSubtitle')}
            chevron
            onPress={() => go('manageFolders')}
          />
          <SettingRow
            title={t('settings.organization.classTimes')}
            subtitle={t('settings.organization.classTimesSubtitle')}
            trailing={classCount === 0 ? t('common.notSet') : t('settings.organization.classCount', { count: classCount })}
            onPress={() => setTimetableOpen(true)}
          />
        </View>

        {Platform.OS === 'android' && (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: tokens.muted }]}>{t('settings.export.section')}</Text>
            <SettingRow
              title={t('settings.export.folder')}
              subtitle={t('settings.export.folderSubtitle')}
              trailing={androidExportFolderLabel ?? t('common.notSet')}
              onPress={handlePickExportFolder}
            />
            {androidExportFolderUri ? (
              <Text style={[styles.footnote, { color: tokens.muted }]}>{t('settings.export.folderHint')}</Text>
            ) : null}
          </View>
        )}

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: tokens.muted }]}>{t('backup.screen.section')}</Text>
          <SettingRow
            title={t('backup.screen.row')}
            subtitle={t('backup.screen.rowSubtitle')}
            chevron
            onPress={() => go('backup')}
          />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: tokens.muted }]}>{t('settings.storage.section')}</Text>
          <SettingRow
            title={t('settings.storage.row')}
            subtitle={t('settings.storage.rowSubtitle')}
            chevron
            onPress={() => go('storage')}
          />
        </View>

        {scannerUnavailable && (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: tokens.muted }]}>{t('settings.scanner.section')}</Text>
            <SettingRow
              title={t('settings.scanner.basicMode')}
              subtitle={t('settings.scanner.basicModeSubtitle')}
              onPress={() => {
                dispatch({ type: 'settings/SET_SCANNER_UNAVAILABLE', unavailable: false });
                dispatch({ type: 'ui/SHOW_SNACK', msg: t('settings.scanner.retrySnack') });
              }}
            />
          </View>
        )}

        {__DEV__ && (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: tokens.muted }]}>{t('settings.developer.section')}</Text>
            <SettingRow
              title={t('settings.developer.filterLab')}
              subtitle={t('settings.developer.filterLabSubtitle')}
              chevron
              onPress={() => go('filterLab')}
            />
          </View>
        )}

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: tokens.muted }]}>{t('settings.privacy.section')}</Text>
          <SettingRow
            title={t('settings.privacy.crashReports')}
            subtitle={t('settings.privacy.crashReportsSubtitle')}
            toggle={{
              value: crashReportsEnabled,
              onChange: (enabled) => dispatch({ type: 'settings/SET_CRASH_REPORTS', enabled }),
            }}
          />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: tokens.muted }]}>{t('settings.about.section')}</Text>
          <Text style={[styles.aboutText, { color: tokens.muted }]}>{t('settings.about.text', { version: APP_VERSION })}</Text>
          <SettingRow title={t('settings.about.showIntro')} chevron onPress={() => go('onboarding')} />
        </View>
      </ScrollView>
      <TimetableEditor visible={timetableOpen} onClose={() => setTimetableOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fontFamily.heading,
    fontSize: typeScale.title.fontSize + 4,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.xl,
  },
  section: {
    gap: spacing.sm,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  footnote: {
    fontSize: 12.5,
    lineHeight: 17,
  },
  proCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: 16,
    borderWidth: 1,
  },
  proTitle: {
    fontFamily: fontFamily.heading,
    fontSize: 18,
    marginBottom: 3,
  },
  proSubtitle: {
    fontSize: 13.5,
  },
  aboutText: {
    fontSize: 13.5,
    lineHeight: 19,
  },
  replayButton: {
    alignSelf: 'flex-start',
    height: 40,
    paddingHorizontal: spacing.lg,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
