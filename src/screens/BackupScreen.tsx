import { Ionicons } from '@expo/vector-icons';
import { useCallback } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBackupExport } from '../components/backup/useBackupExport';
import { pickBackupZip } from '../store/backupIntake';
import { SettingRow } from '../components/settings/SettingRow';
import { SegmentedControl } from '../components/shared/SegmentedControl';
import type { AutoBackupFrequency } from '../services/backup/schedule';
import { formatBytes, formatDate } from '../i18n';
import { useT } from '../i18n/useT';
import { useRouter } from '../navigation/router';
import { deriveFolderLabel } from '../services/export/deviceExportService';
import { useAppDispatch, useAppSelector } from '../store/AppStateContext';
import { fontFamily, spacing, typeScale, useTheme, touchSlop } from '../theme';

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
  const folderUri = useAppSelector((s) => s.settings.backupFolderUri);
  const autoBackup = useAppSelector((s) => s.settings.autoBackup);
  const lastAutoBackupAt = useAppSelector((s) => s.settings.lastAutoBackupAt);
  const { backUpEverything, busy, overlay } = useBackupExport();

  // Resolves whether a folder was chosen.
  const handlePickFolder = useCallback(async (): Promise<boolean> => {
    const result = await StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!result.granted) {
      dispatch({ type: 'ui/SHOW_SNACK', msg: t('backup.noFolder') });
      return false;
    }
    dispatch({ type: 'settings/SET_BACKUP_FOLDER', uri: result.directoryUri, label: deriveFolderLabel(result.directoryUri) });
    // Another folder: the old automatic backups aren't in it, so there's nothing to rotate there.
    dispatch({ type: 'settings/LOAD_AUTO_BACKUP_STATE', lastAt: lastAutoBackupAt, uris: [] });
    return true;
  }, [dispatch, t, lastAutoBackupAt]);

  // §8 B5: automatic backups need a folder; choosing Weekly or Monthly without one asks for it.
  const handleAutoBackup = useCallback(
    async (frequency: AutoBackupFrequency) => {
      if (frequency !== 'off' && !folderUri && !(await handlePickFolder())) {
        dispatch({ type: 'ui/SHOW_SNACK', msg: t('backup.auto.needsFolder') });
        return;
      }
      dispatch({ type: 'settings/SET_AUTO_BACKUP', frequency });
    },
    [folderUri, handlePickFolder, dispatch, t]
  );

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
    <SafeAreaView style={[styles.container, { backgroundColor: tokens.bg }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable hitSlop={touchSlop(44)} accessibilityRole="button" style={styles.headerButton} onPress={() => go('settings', 'back')} accessibilityLabel={t('common.back')}>
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

        <View style={styles.section}>
          <SettingRow
            title={t('backup.screen.restore')}
            subtitle={t('backup.screen.restoreSubtitle')}
            chevron
            onPress={busy ? undefined : () => void pickBackupZip(dispatch)}
          />
          <SettingRow
            title={t('backup.screen.import')}
            subtitle={t('backup.screen.importSubtitle')}
            chevron
            onPress={busy ? undefined : () => void pickBackupZip(dispatch)}
          />
        </View>

        {Platform.OS === 'android' ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: tokens.ink }]}>{t('backup.auto.title')}</Text>
            <SegmentedControl
              segments={[
                { id: 'off' as AutoBackupFrequency, label: t('backup.auto.off') },
                { id: 'weekly' as AutoBackupFrequency, label: t('backup.auto.weekly') },
                { id: 'monthly' as AutoBackupFrequency, label: t('backup.auto.monthly') },
              ]}
              value={autoBackup}
              onChange={handleAutoBackup}
            />
            <Text style={[styles.footnote, { color: tokens.muted }]}>{t('backup.auto.subtitle')}</Text>
            {autoBackup !== 'off' ? (
              <SettingRow
                title={t('backup.auto.last')}
                trailing={lastAutoBackupAt === null ? t('backup.screen.never') : formatDate(lastAutoBackupAt, { day: 'numeric', month: 'short', year: 'numeric' })}
              />
            ) : null}
            <SettingRow
              title={t('backup.screen.folder')}
              subtitle={t('backup.screen.folderSubtitle')}
              trailing={folderLabel ?? t('common.notSet')}
              onPress={() => void handlePickFolder()}
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
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  footnote: {
    fontSize: 12.5,
    lineHeight: 17,
  },
});
