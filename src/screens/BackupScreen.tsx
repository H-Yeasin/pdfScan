import { Ionicons } from '@expo/vector-icons';
import { useCallback } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBackupExport } from '../components/backup/useBackupExport';
import { SettingRow } from '../components/settings/SettingRow';
import { formatBytes, formatDate } from '../i18n';
import { useT } from '../i18n/useT';
import { useRouter } from '../navigation/router';
import { deriveFolderLabel } from '../services/export/deviceExportService';
import { useAppDispatch, useAppSelector } from '../store/AppStateContext';
import { fontFamily, spacing, typeScale, useTheme } from '../theme';

// §8 B3: Settings → Backup. "Back up everything", when the last backup was, and (Android) the
// folder "Save to folder" writes to.
export function BackupScreen() {
  const { tokens } = useTheme();
  const { t } = useT();
  const { go } = useRouter();
  const dispatch = useAppDispatch();
  const hasDocuments = useAppSelector((s) => s.library.files.length > 0);
  const lastBackupAt = useAppSelector((s) => s.settings.lastBackupAt);
  const lastBackupBytes = useAppSelector((s) => s.settings.lastBackupBytes);
  const folderLabel = useAppSelector((s) => s.settings.backupFolderLabel);
  const { backUpEverything, busy, overlay } = useBackupExport();

  const handlePickFolder = useCallback(async () => {
    const result = await StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!result.granted) {
      dispatch({ type: 'ui/SHOW_SNACK', msg: t('backup.noFolder') });
      return;
    }
    dispatch({ type: 'settings/SET_BACKUP_FOLDER', uri: result.directoryUri, label: deriveFolderLabel(result.directoryUri) });
  }, [dispatch, t]);

  const last =
    lastBackupAt === null
      ? t('backup.screen.never')
      : lastBackupBytes === null
        ? formatDate(lastBackupAt, { day: 'numeric', month: 'short', year: 'numeric' })
        : t('backup.screen.lastValue', {
            date: formatDate(lastBackupAt, { day: 'numeric', month: 'short', year: 'numeric' }),
            size: formatBytes(lastBackupBytes),
          });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tokens.bg }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={() => go('settings', 'back')} accessibilityLabel={t('common.back')}>
          <Ionicons name="chevron-back" size={20} color={tokens.ink} />
        </Pressable>
        <Text style={[styles.title, { color: tokens.ink }]}>{t('backup.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.section}>
          <SettingRow
            title={t('backup.screen.backUpEverything')}
            subtitle={hasDocuments ? t('backup.screen.backUpEverythingSubtitle') : t('backup.screen.empty')}
            chevron
            onPress={hasDocuments && !busy ? () => void backUpEverything() : undefined}
          />
          <SettingRow title={t('backup.screen.last')} trailing={last} />
        </View>

        {Platform.OS === 'android' ? (
          <View style={styles.section}>
            <SettingRow
              title={t('backup.screen.folder')}
              subtitle={t('backup.screen.folderSubtitle')}
              trailing={folderLabel ?? t('common.notSet')}
              onPress={handlePickFolder}
            />
          </View>
        ) : (
          <Text style={[styles.footnote, { color: tokens.muted }]}>{t('backup.screen.iosNote')}</Text>
        )}
      </ScrollView>
      {overlay}
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
  footnote: {
    fontSize: 12.5,
    lineHeight: 17,
  },
});
