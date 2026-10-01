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
import { useRouter } from '../navigation/router';
import { deriveFolderLabel } from '../services/export/deviceExportService';
import { useAppState } from '../store/AppStateContext';
import { fontFamily, spacing, typeScale, useTheme, type ThemePref } from '../theme';
import { READY_SCRIPTS } from '../services/scripts/registry';

const THEME_SEGMENTS: { id: ThemePref; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];


export function SettingsScreen() {
  const { tokens, themePref, setThemePref } = useTheme();
  const [timetableOpen, setTimetableOpen] = useState(false);
  const { go, hub } = useRouter();
  const { state, dispatch } = useAppState();
  // Class times of active courses only: an archived course's classes are over.
  const classCount = state.library.timetable.filter((slot) =>
    state.library.courses.some((c) => c.id === slot.courseId && !c.archived)
  ).length;
  const { ocrScript, androidExportFolderUri, androidExportFolderLabel, crashReportsEnabled, scannerUnavailable } =
    state.settings;

  const handlePickExportFolder = useCallback(async () => {
    const result = await StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!result.granted) {
      dispatch({ type: 'ui/SHOW_SNACK', msg: 'No folder selected' });
      return;
    }
    dispatch({
      type: 'settings/SET_ANDROID_EXPORT_FOLDER',
      uri: result.directoryUri,
      label: deriveFolderLabel(result.directoryUri),
    });
  }, [dispatch]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tokens.bg }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={() => go(hub, 'back')}>
          <Ionicons name="chevron-back" size={20} color={tokens.ink} />
        </Pressable>
        <Text style={[styles.title, { color: tokens.ink }]}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <ProfileSection />

        <NameTemplateSection />

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: tokens.muted }]}>Appearance</Text>
          <SegmentedControl segments={THEME_SEGMENTS} value={themePref} onChange={setThemePref} />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: tokens.muted }]}>OCR script</Text>
          <View style={[styles.card, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}>
            {READY_SCRIPTS.map((script) => (
              <LanguageRow
                key={script.id}
                name={script.label}
                selected={ocrScript === script.id}
                onPress={() => dispatch({ type: 'settings/SET_OCR_SCRIPT', script: script.id })}
              />
            ))}
          </View>
          <Text style={[styles.footnote, { color: tokens.muted }]}>
            Recognition runs fully on-device. Pick the script that matches your document —
            Devanagari covers Hindi, Marathi, Nepali and Sanskrit; Bengali script isn't supported yet.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: tokens.muted }]}>Organization</Text>
          <SettingRow
            title="Manage courses"
            subtitle="Create, rename, and organize your courses"
            chevron
            onPress={() => go('manageFolders')}
          />
          <SettingRow
            title="Class times"
            subtitle="Scans during a class are saved to that course"
            trailing={classCount === 0 ? 'Not set' : `${classCount} ${classCount === 1 ? 'class' : 'classes'}`}
            onPress={() => setTimetableOpen(true)}
          />
        </View>

        {Platform.OS === 'android' && (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: tokens.muted }]}>Export</Text>
            <SettingRow
              title="Default export folder"
              subtitle="Copy exported files here automatically"
              trailing={androidExportFolderLabel ?? 'Not set'}
              onPress={handlePickExportFolder}
            />
            {androidExportFolderUri ? (
              <Text style={[styles.footnote, { color: tokens.muted }]}>
                Turn on "Also save a copy" in Deliver to write exports here too.
              </Text>
            ) : null}
          </View>
        )}

        {scannerUnavailable && (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: tokens.muted }]}>Scanner</Text>
            <SettingRow
              title="Basic camera mode"
              subtitle="Google's scanner wasn't available on this phone. Tap to try it again (e.g. after updating Google Play services)."
              onPress={() => {
                dispatch({ type: 'settings/SET_SCANNER_UNAVAILABLE', unavailable: false });
                dispatch({ type: 'ui/SHOW_SNACK', msg: "The next scan will try Google's scanner" });
              }}
            />
          </View>
        )}

        {__DEV__ && (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: tokens.muted }]}>Developer</Text>
            <SettingRow
              title="Filter Lab"
              subtitle="Compare every filter and tune its constants"
              chevron
              onPress={() => go('filterLab')}
            />
          </View>
        )}

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: tokens.muted }]}>Privacy</Text>
          <SettingRow
            title="Send anonymous crash reports"
            subtitle="Never includes your documents, names or scanned text."
            toggle={{
              value: crashReportsEnabled,
              onChange: (enabled) => dispatch({ type: 'settings/SET_CRASH_REPORTS', enabled }),
            }}
          />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: tokens.muted }]}>About</Text>
          <Text style={[styles.aboutText, { color: tokens.muted }]}>
            Version 1.0 · Documents never leave your phone unless you share them.
          </Text>
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
