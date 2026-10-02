import { Ionicons } from '@expo/vector-icons';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppDispatch, useAppSlices } from '../../store/AppStateContext';
import { radii, spacing, useTheme } from '../../theme';
import type { Semester } from '../../types/models';
import { useT } from '../../i18n/useT';

type SemesterSwitcherProps = {
  visible: boolean;
  // The semester Home is showing now.
  shown: Semester | null;
  // The one Home would show on its own (by date), marked "Current".
  current: Semester | null;
  onClose: () => void;
};

// Home's semester menu: pick which term Home shows, or archive the shown one at the end of term
// (it and all its courses at once - library/ARCHIVE_SEMESTER; documents stay searchable).
export function SemesterSwitcher({ visible, shown, current, onClose }: SemesterSwitcherProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const state = useAppSlices('library');
  const active = state.library.semesters.filter((s) => !s.archived);

  const pick = (semester: Semester) => {
    // Picking the current one goes back to following the date.
    dispatch({ type: 'library/SET_HOME_SEMESTER', id: semester.id === current?.id ? null : semester.id });
    onClose();
  };

  const archive = (semester: Semester) => {
    const count = state.library.courses.filter((c) => c.semesterId === semester.id && !c.archived).length;
    Alert.alert(
      t('courses.semesterSwitcher.archiveTitle', { name: semester.name }),
      t('courses.semesterSwitcher.archiveBody', { count }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('courses.archive'),
          style: 'destructive',
          onPress: () => {
            dispatch({ type: 'library/ARCHIVE_SEMESTER', id: semester.id });
            dispatch({ type: 'library/SET_HOME_SEMESTER', id: null });
            dispatch({ type: 'ui/SHOW_SNACK', msg: t('courses.semesterSwitcher.archived', { name: semester.name }) });
            onClose();
          },
        },
      ]
    );
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            { backgroundColor: tokens.surface, borderColor: tokens.edge, paddingBottom: spacing.md + insets.bottom },
          ]}
        >
          <Text style={[styles.title, { color: tokens.ink }]}>{t('courses.semesterSwitcher.title')}</Text>
          <ScrollView style={styles.list}>
            {active.map((semester) => (
              <Pressable key={semester.id} style={styles.row} onPress={() => pick(semester)}>
                <Text style={[styles.rowLabel, { color: tokens.ink }]} numberOfLines={1}>
                  {semester.name}
                  {semester.id === current?.id ? <Text style={{ color: tokens.muted }}>{t('courses.semesterSwitcher.current')}</Text> : null}
                </Text>
                {semester.id === shown?.id ? <Ionicons name="checkmark" size={18} color={tokens.accent} /> : null}
              </Pressable>
            ))}
          </ScrollView>
          {shown ? (
            <Pressable style={styles.row} onPress={() => archive(shown)} accessibilityRole="button">
              <Ionicons name="archive-outline" size={18} color={tokens.danger} />
              <Text style={[styles.rowLabel, { color: tokens.danger }]}>{t('courses.semesterSwitcher.archiveRow', { name: shown.name })}</Text>
            </Pressable>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radii.card * 1.5,
    borderTopRightRadius: radii.card * 1.5,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    gap: spacing.xs,
    maxHeight: '70%',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  list: {
    flexGrow: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  rowLabel: {
    flex: 1,
    fontSize: 15.5,
  },
});
