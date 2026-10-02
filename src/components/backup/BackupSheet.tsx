import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatBytes } from '../../i18n';
import { useT } from '../../i18n/useT';
import type { BackupInclude, BackupProgress, BackupResult } from '../../services/backup/createBackup';
import type { BackupScope } from '../../services/backup/format';
import { radii, spacing, useTheme } from '../../theme';

export type BackupSheetPhase =
  | { kind: 'idle' }
  // Export: Everything or PDFs only?
  | { kind: 'choose'; scope: BackupScope; courseName?: string }
  | { kind: 'working'; full: boolean; progress: BackupProgress | null }
  | { kind: 'ready'; full: boolean; result: BackupResult }
  | { kind: 'saving'; full: boolean; result: BackupResult; folder: string; copied: number };

type BackupSheetProps = {
  phase: BackupSheetPhase;
  canSaveToFolder: boolean;
  onChoose: (include: BackupInclude) => void;
  onShare: () => void;
  onSave: () => void;
  onCancel: () => void;
  onDone: () => void;
};

// §8 B3: the one dialog a backup or export goes through - the choice, progress with Cancel, then
// Share / Save to folder / Done.
export function BackupSheet({ phase, canSaveToFolder, onChoose, onShare, onSave, onCancel, onDone }: BackupSheetProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  if (phase.kind === 'idle') return null;

  const working = phase.kind === 'working' || phase.kind === 'saving';
  // Back button: cancels what's running, otherwise closes.
  const onRequestClose = phase.kind === 'ready' ? onDone : onCancel;

  let fraction: number | null = null;
  let detail = '';
  if (phase.kind === 'working') {
    const p = phase.progress;
    if (p && p.bytesTotal > 0) {
      fraction = p.bytesDone / p.bytesTotal;
      detail = t('backup.progress', {
        done: p.documentsDone,
        total: p.documentsTotal,
        bytes: formatBytes(p.bytesDone),
        totalBytes: formatBytes(p.bytesTotal),
      });
    } else {
      detail = t('backup.preparing');
    }
  } else if (phase.kind === 'saving') {
    fraction = phase.result.bytes > 0 ? phase.copied / phase.result.bytes : null;
    detail = `${formatBytes(phase.copied)} / ${formatBytes(phase.result.bytes)}`;
  }

  const title =
    phase.kind === 'choose'
      ? t('backup.export.title')
      : phase.kind === 'working'
        ? phase.full
          ? t('backup.backingUp')
          : t('backup.exporting')
        : phase.kind === 'saving'
          ? t('backup.savingTo', { folder: phase.folder })
          : t('backup.ready', { size: formatBytes(phase.result.bytes) });

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onRequestClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}>
          <Text style={[styles.title, { color: tokens.ink }]}>{title}</Text>

          {phase.kind === 'choose' && (
            <View style={styles.options}>
              {(
                [
                  { id: 'everything', label: t('backup.export.everything'), hint: t('backup.export.everythingHint'), icon: 'albums-outline' },
                  { id: 'pdfsOnly', label: t('backup.export.pdfsOnly'), hint: t('backup.export.pdfsOnlyHint'), icon: 'document-outline' },
                ] as const
              ).map((option) => (
                <Pressable
                  key={option.id}
                  onPress={() => onChoose(option.id)}
                  style={[styles.option, { borderColor: tokens.edge, backgroundColor: tokens.surface2 }]}
                  accessibilityRole="button"
                >
                  <Ionicons name={option.icon} size={20} color={tokens.accent} />
                  <View style={styles.optionText}>
                    <Text style={[styles.optionLabel, { color: tokens.ink }]}>{option.label}</Text>
                    <Text style={[styles.hint, { color: tokens.muted }]}>{option.hint}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}

          {working && (
            <View style={styles.progressWrap}>
              {fraction === null ? (
                <ActivityIndicator color={tokens.accent} />
              ) : (
                <View style={[styles.track, { backgroundColor: tokens.surface2 }]}>
                  <View style={[styles.fill, { backgroundColor: tokens.accent, width: `${Math.round(Math.min(1, fraction) * 100)}%` }]} />
                </View>
              )}
              <Text style={[styles.hint, { color: tokens.muted }]}>{detail}</Text>
            </View>
          )}

          {phase.kind === 'ready' && <Text style={[styles.hint, { color: tokens.muted }]}>{t('backup.readyHint')}</Text>}

          <View style={styles.actions}>
            {phase.kind === 'ready' ? (
              <>
                <Pressable accessibilityRole="button" style={styles.ghostButton} onPress={onDone}>
                  <Text style={[styles.ghostLabel, { color: tokens.muted }]}>{t('backup.done')}</Text>
                </Pressable>
                {canSaveToFolder && (
                  <Pressable accessibilityRole="button" style={[styles.secondaryButton, { borderColor: tokens.edge }]} onPress={onSave}>
                    <Text style={[styles.ghostLabel, { color: tokens.ink }]}>{t('backup.saveToFolder')}</Text>
                  </Pressable>
                )}
                <Pressable accessibilityRole="button" style={[styles.primaryButton, { backgroundColor: tokens.accent }]} onPress={onShare}>
                  <Text style={[styles.primaryLabel, { color: tokens.onAccent }]}>{t('backup.share')}</Text>
                </Pressable>
              </>
            ) : (
              <Pressable accessibilityRole="button" style={styles.ghostButton} onPress={onCancel}>
                <Text style={[styles.ghostLabel, { color: tokens.muted }]}>{t('common.cancel')}</Text>
              </Pressable>
            )}
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
  options: {
    gap: spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  optionText: {
    flex: 1,
    gap: 2,
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
  },
  progressWrap: {
    gap: spacing.sm,
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
    alignItems: 'center',
    flexWrap: 'wrap',
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
  secondaryButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
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
