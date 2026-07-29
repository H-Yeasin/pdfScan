import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LanguageRow } from '../components/settings/LanguageRow';
import { SettingRow } from '../components/settings/SettingRow';
import { SegmentedControl } from '../components/shared/SegmentedControl';
import { useRouter } from '../navigation/router';
import { useAppState } from '../store/AppStateContext';
import { fontFamily, spacing, typeScale, useTheme, type ThemePref } from '../theme';
import type { OcrScript } from '../types/models';

const THEME_SEGMENTS: { id: ThemePref; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

const AVAILABLE_SCRIPTS: { id: OcrScript; label: string }[] = [
  { id: 'latin', label: 'English / Western (Latin)' },
  { id: 'devanagari', label: 'Hindi · Marathi · Nepali (Devanagari)' },
  { id: 'chinese', label: 'Chinese' },
  { id: 'japanese', label: 'Japanese' },
  { id: 'korean', label: 'Korean' },
];

export function SettingsScreen() {
  const { tokens, themePref, setThemePref } = useTheme();
  const { go } = useRouter();
  const { state, dispatch } = useAppState();
  const { ocrScript } = state.settings;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tokens.bg }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={() => go('library', 'back')}>
          <Ionicons name="chevron-back" size={20} color={tokens.ink} />
        </Pressable>
        <Text style={[styles.title, { color: tokens.ink }]}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: tokens.muted }]}>Appearance</Text>
          <SegmentedControl segments={THEME_SEGMENTS} value={themePref} onChange={setThemePref} />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: tokens.muted }]}>OCR script</Text>
          <View style={[styles.card, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}>
            {AVAILABLE_SCRIPTS.map((script) => (
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
          <Text style={[styles.sectionLabel, { color: tokens.muted }]}>Backup</Text>
          <SettingRow
            title="Connect Drive or Dropbox"
            subtitle="Your account, your storage. Coming soon."
            onPress={() =>
              dispatch({ type: 'ui/SHOW_SNACK', msg: 'Cloud backup is not available in this build yet' })
            }
          />
        </View>

        <Pressable
          style={[styles.proCard, { backgroundColor: tokens.accentSoft, borderColor: tokens.accent }]}
          onPress={() => go('pro')}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.proTitle, { color: tokens.ink }]}>Pro — one time, forever</Text>
            <Text style={[styles.proSubtitle, { color: tokens.muted }]}>Batch actions, folder lock, themes</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={tokens.accentInk} />
        </Pressable>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: tokens.muted }]}>About</Text>
          <Text style={[styles.aboutText, { color: tokens.muted }]}>
            Version 1.0 · Documents never leave your phone unless you share them.
          </Text>
          <Pressable
            style={[styles.replayButton, { borderColor: tokens.edge, backgroundColor: tokens.surface }]}
            onPress={() => {
              dispatch({ type: 'settings/SET_FIRST_RUN', firstRun: true });
              go('capture', 'back');
            }}
          >
            <Text style={{ color: tokens.accentInk, fontSize: 14, fontWeight: '600' }}>Replay first run</Text>
          </Pressable>
        </View>
      </ScrollView>
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
