import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { File } from 'expo-file-system';
import { formatBytes, formatDate, t } from '../../i18n';
import { useT } from '../../i18n/useT';
import { BackupFormatError, type ImportMode } from '../../services/backup/format';
import { discardIncomingZip } from '../../services/backup/incomingZip';
import {
  applyRestore,
  previewRestore,
  readBackup,
  RestoreSpaceError,
  type OpenedBackup,
  type RestorePreview,
  type RestoreProgress,
} from '../../services/backup/restoreBackup';
import { hasSettingsToApply, settingsFromBackup } from '../../services/backup/restoreSettings';
import { ZipAbortedError, ZipError } from '../../services/backup/zip';
import { useAppDispatch, useAppSelector, useAppStore } from '../../store/AppStateContext';
import { radii, spacing, useTheme } from '../../theme';
import { SegmentedControl } from '../shared/SegmentedControl';

type Phase =
  | { kind: 'idle' }
  | { kind: 'reading' }
  | { kind: 'preview'; backup: OpenedBackup; mode: ImportMode; preview: RestorePreview | null }
  | { kind: 'working'; backup: OpenedBackup; mode: ImportMode; progress: RestoreProgress | null };

// What went wrong, in words: the library is never left half-changed, so every message can say so.
function errorMessage(error: unknown): string {
  if (error instanceof ZipAbortedError) return t('backup.restore.cancelled');
  if (error instanceof RestoreSpaceError) return t('backup.restore.notEnoughSpace', { size: formatBytes(error.bytesNeeded) });
  if (error instanceof BackupFormatError) return error.code === 'TOO_NEW' ? t('backup.restore.tooNew') : t('backup.restore.notABackup');
  if (error instanceof ZipError) {
    if (error.code === 'UNSUPPORTED_ZIP') return t('backup.restore.changedOutside');
    if (error.code === 'CRC_MISMATCH') return t('backup.restore.damaged');
    return t('backup.restore.notABackup');
  }
  return t('backup.restore.failed');
}

// §8 B4: the restore and import flow, always mounted (AppNavigator). Anything can start it with
// `ui/OPEN_BACKUP` (Settings → Backup, the Library's file picker, "Open with"): it reads the zip,
// previews what would happen (Restore or Add, what's new, whether it fits), copies, commits,
// reloads the library and, after a full restore, offers the backup's settings once.
export function RestoreHost() {
  const { tokens, themePref, setThemePref } = useTheme();
  const { t: tr } = useT();
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const uri = useAppSelector((s) => s.ui.backupToOpen);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const controller = useRef<AbortController | null>(null);

  const close = useCallback(
    (message?: string) => {
      setPhase({ kind: 'idle' });
      dispatch({ type: 'ui/CLOSE_BACKUP' });
      discardIncomingZip();
      if (message) dispatch({ type: 'ui/SHOW_SNACK', msg: message });
    },
    [dispatch]
  );

  const loadPreview = useCallback(
    (backup: OpenedBackup, mode: ImportMode) => {
      setPhase({ kind: 'preview', backup, mode, preview: null });
      previewRestore(backup, mode).then(
        (preview) => setPhase((p) => (p.kind === 'preview' && p.backup === backup && p.mode === mode ? { ...p, preview } : p)),
        (error) => close(errorMessage(error))
      );
    },
    [close]
  );

  // A new zip to open.
  useEffect(() => {
    if (!uri) return;
    setPhase({ kind: 'reading' });
    // Reading happens after the spinner has had a frame to show.
    const timer = setTimeout(() => {
      try {
        const backup = readBackup(new File(uri));
        // A full backup is restored by default; a course or documents export is added.
        loadPreview(backup, backup.manifest.kind === 'full' ? 'restore' : 'add');
      } catch (error) {
        console.warn('RestoreHost: could not read', error);
        close(errorMessage(error));
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [uri, loadPreview, close]);

  const offerSettings = useCallback(
    (backup: OpenedBackup) => {
      if (!backup.settings) return;
      const result = settingsFromBackup(backup.settings, store.getState().settings, themePref);
      if (!hasSettingsToApply(result)) return;
      Alert.alert(t('backup.restore.settingsTitle'), t('backup.restore.settingsBody'), [
        { text: t('backup.restore.settingsSkip'), style: 'cancel' },
        {
          text: t('backup.restore.settingsUse'),
          onPress: () => {
            result.actions.forEach((action) => dispatch(action));
            if (result.themePref) setThemePref(result.themePref);
          },
        },
      ]);
    },
    [store, themePref, setThemePref, dispatch]
  );

  const start = useCallback(async () => {
    if (phase.kind !== 'preview' || !phase.preview) return;
    const { backup, mode, preview } = phase;
    const full = backup.manifest.kind === 'full' && mode === 'restore';
    const abort = new AbortController();
    controller.current = abort;
    setPhase({ kind: 'working', backup, mode, progress: null });
    try {
      await applyRestore(backup, preview, {
        signal: abort.signal,
        restoreSignature: full,
        onProgress: (progress) => setPhase({ kind: 'working', backup, mode, progress }),
      });
      // Reload from the database (which also re-runs the B1 integrity check).
      dispatch({ type: 'library/RETRY_LOAD' });
      const count = preview.plan.counts.insert + preview.plan.counts.keepBoth;
      close(
        count === 0
          ? t('backup.restore.nothingNew')
          : mode === 'restore'
            ? t('backup.restore.restored', { count })
            : t('backup.restore.added', { count })
      );
      if (full) offerSettings(backup);
    } catch (error) {
      console.warn('RestoreHost: restore failed', error);
      close(errorMessage(error));
    } finally {
      controller.current = null;
    }
  }, [phase, dispatch, close, offerSettings]);

  if (phase.kind === 'idle') return null;

  const cancel = () => {
    if (controller.current) controller.current.abort();
    else close();
  };

  let body: React.ReactNode;
  let title: string;
  if (phase.kind === 'reading') {
    title = tr('backup.restore.reading');
    body = <ActivityIndicator color={tokens.accent} />;
  } else if (phase.kind === 'working') {
    title = phase.mode === 'restore' ? tr('backup.restore.restoring') : tr('backup.restore.importing');
    const p = phase.progress;
    body = (
      <View style={styles.gap}>
        {p && p.bytesTotal > 0 ? (
          <View style={[styles.track, { backgroundColor: tokens.surface2 }]}>
            <View style={[styles.fill, { backgroundColor: tokens.accent, width: `${Math.round((p.bytesDone / p.bytesTotal) * 100)}%` }]} />
          </View>
        ) : (
          <ActivityIndicator color={tokens.accent} />
        )}
        {p ? (
          <Text style={[styles.hint, { color: tokens.muted }]}>
            {tr('backup.progress', {
              done: p.documentsDone,
              total: p.documentsTotal,
              bytes: formatBytes(p.bytesDone),
              totalBytes: formatBytes(p.bytesTotal),
            })}
          </Text>
        ) : null}
      </View>
    );
  } else {
    const { backup, mode, preview } = phase;
    const { manifest } = backup;
    title = mode === 'restore' ? tr('backup.restore.titleRestore') : tr('backup.restore.titleAdd');
    const counts = preview?.plan.counts;
    const planLine = counts
      ? [
          counts.insert > 0 || (counts.skip === 0 && counts.keepBoth === 0) ? tr('backup.restore.planNew', { count: counts.insert }) : null,
          counts.skip > 0 ? tr('backup.restore.planHere', { count: counts.skip }) : null,
          counts.keepBoth > 0 ? tr('backup.restore.planBoth', { count: counts.keepBoth }) : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : '';
    body = (
      <View style={styles.gap}>
        <Text style={[styles.summary, { color: tokens.ink }]}>
          {[
            tr('backup.restore.courses', { count: manifest.counts.courses }),
            tr('backup.restore.documents', { count: manifest.counts.documents }),
            formatBytes(manifest.counts.bytes),
          ].join(' · ')}
        </Text>
        <Text style={[styles.hint, { color: tokens.muted }]}>
          {tr('backup.restore.made', { date: formatDate(manifest.createdAt, { day: 'numeric', month: 'short', year: 'numeric' }), version: manifest.appVersion })}
        </Text>
        <SegmentedControl
          segments={[
            { id: 'restore' as ImportMode, label: tr('backup.restore.modeRestore') },
            { id: 'add' as ImportMode, label: tr('backup.restore.modeAdd') },
          ]}
          value={mode}
          onChange={(next) => next !== mode && loadPreview(backup, next)}
        />
        <Text style={[styles.hint, { color: tokens.muted }]}>
          {mode === 'restore' ? tr('backup.restore.modeRestoreHint') : tr('backup.restore.modeAddHint')}
        </Text>
        {manifest.restorable === 'pdfs' ? <Text style={[styles.hint, { color: tokens.muted }]}>{tr('backup.restore.pdfsOnly')}</Text> : null}
        {preview ? (
          <>
            <Text style={[styles.hint, { color: tokens.ink }]}>{planLine}</Text>
            {preview.freeBytes !== null ? (
              <Text style={[styles.hint, { color: preview.fits ? tokens.muted : tokens.danger }]}>
                {preview.fits
                  ? tr('backup.restore.free', { size: formatBytes(preview.freeBytes) })
                  : tr('backup.restore.notEnoughSpace', { size: formatBytes(preview.bytesNeeded) })}
              </Text>
            ) : null}
          </>
        ) : (
          <ActivityIndicator color={tokens.accent} />
        )}
      </View>
    );
  }

  const canStart = phase.kind === 'preview' && !!phase.preview && phase.preview.fits;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={cancel}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}>
          <Text style={[styles.title, { color: tokens.ink }]}>{title}</Text>
          {body}
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" style={styles.ghostButton} onPress={cancel}>
              <Text style={[styles.ghostLabel, { color: tokens.muted }]}>{tr('common.cancel')}</Text>
            </Pressable>
            {phase.kind === 'preview' ? (
              <Pressable accessibilityRole="button"
                style={[styles.primaryButton, { backgroundColor: tokens.accent, opacity: canStart ? 1 : 0.5 }]}
                onPress={start}
                disabled={!canStart}
              >
                <Text style={[styles.primaryLabel, { color: tokens.onAccent }]}>
                  {phase.mode === 'restore' ? tr('backup.restore.startRestore') : tr('backup.restore.startAdd')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
  },
  gap: {
    gap: spacing.sm,
  },
  summary: {
    fontSize: 15,
    fontWeight: '600',
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
  },
  track: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  ghostButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  ghostLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  primaryButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
  },
  primaryLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
});
