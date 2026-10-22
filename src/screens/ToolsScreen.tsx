import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { ListItem, ScreenHeader, Text, useScreenHeader } from '../components/ui';
import { useT } from '../i18n/useT';
import { useRouter } from '../navigation/router';
import { startScan } from '../services/courses/startScan';
import { useAppDispatch, useAppStore } from '../store/AppStateContext';
import { useGalleryImport } from '../store/useGalleryImport';
import { useImportFile } from '../store/useImportFile';
import { ICONS, spacing, useTheme, type IoniconName } from '../theme';

// §17 U5: the Tools tab. Until U8's hub (each tool as pick → options → progress → result) it lists
// the ways to the tools that exist today: scanning and importing start here; the tools that work
// on chosen files (merge, split, compress, sign, cover) are in Files' selection bar, so their row
// opens Files; the rest are the screens Me holds.
type Row = { id: string; title: string; subtitle?: string; icon: IoniconName; onPress: () => void };

export function ToolsScreen() {
  const { t } = useT();
  const { tokens } = useTheme();
  const { go, switchTab } = useRouter();
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const header = useScreenHeader();
  const importPhotos = useGalleryImport();
  const importFile = useImportFile();

  const sections: { title: string; rows: Row[] }[] = [
    {
      title: t('tools.section.create'),
      rows: [
        {
          id: 'scan',
          title: t('tools.scan'),
          subtitle: t('tools.scanSub'),
          icon: ICONS.scan,
          onPress: () => {
            const state = store.getState();
            startScan(state, dispatch, null, { launch: true, mode: state.settings.lastCaptureMode });
          },
        },
        {
          id: 'photos',
          title: t('capture.modeSheet.importPhotos'),
          icon: ICONS.gallery,
          onPress: () => {
            startScan(store.getState(), dispatch, null, { launch: false });
            void importPhotos();
          },
        },
        { id: 'file', title: t('capture.modeSheet.importFile'), subtitle: t('tools.importFileSub'), icon: ICONS.import, onPress: () => void importFile() },
      ],
    },
    {
      title: t('tools.section.files'),
      rows: [
        { id: 'organise', title: t('tools.organise'), subtitle: t('tools.organiseSub'), icon: ICONS.merge, onPress: () => switchTab('library') },
      ],
    },
    {
      title: t('tools.section.keep'),
      rows: [
        { id: 'backup', title: t('backup.screen.row'), subtitle: t('backup.screen.rowSubtitle'), icon: ICONS.backup, onPress: () => go('backup') },
        { id: 'storage', title: t('tools.storage'), icon: ICONS.compress, onPress: () => go('storage') },
        { id: 'courses', title: t('tools.courses'), icon: ICONS.course, onPress: () => go('manageFolders') },
      ],
    },
  ];

  return (
    <View style={[styles.root, { backgroundColor: tokens.bg }]}>
      <ScreenHeader large scroll={header} title={t('tools.title')} />
      <Animated.ScrollView onScroll={header.onScroll} scrollEventThrottle={16} contentContainerStyle={[styles.content, { paddingTop: header.contentTop }]}>
        {sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text variant="overline" color="muted" accessibilityRole="header" style={styles.sectionTitle}>
              {section.title}
            </Text>
            {section.rows.map((row) => (
              <ListItem key={row.id} title={row.title} subtitle={row.subtitle} icon={row.icon} trailing={'chevron'} onPress={row.onPress} />
            ))}
          </View>
        ))}
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingBottom: spacing.xl },
  section: { paddingTop: spacing.md },
  sectionTitle: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
});
