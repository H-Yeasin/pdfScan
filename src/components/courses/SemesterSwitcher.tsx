import { useMemo } from 'react';
import { Alert } from 'react-native';
import { useAppDispatch, useAppSlices } from '../../store/AppStateContext';
import type { Semester } from '../../types/models';
import { useT } from '../../i18n/useT';
import { Menu, type MenuSection } from '../ui';

type SemesterSwitcherProps = {
  visible: boolean;
  // The semester Home is showing now.
  shown: Semester | null;
  // The one Home would show on its own (by date), marked "Current".
  current: Semester | null;
  onClose: () => void;
};

const ARCHIVE_ID = '__archive';

export function semesterSections(
  t: ReturnType<typeof useT>['t'],
  active: readonly Semester[],
  shown: Semester | null,
  current: Semester | null
): MenuSection[] {
  return [
    {
      items: active.map((semester) => ({
        id: semester.id,
        label: semester.name,
        // The shown one is ticked; the one by date says so.
        icon: semester.id === shown?.id ? 'checkmark-circle' : 'ellipse-outline',
        badge: semester.id === current?.id ? { label: t('courses.semesterSwitcher.current'), tone: 'accent' as const } : undefined,
      })),
    },
    {
      items: shown
        ? [{ id: ARCHIVE_ID, label: t('courses.semesterSwitcher.archiveRow', { name: shown.name }), icon: 'archive-outline' as const, destructive: true }]
        : [],
    },
  ];
}

// Home's semester menu (§17 U6: opened from the semester chip under the greeting): pick which term
// Home shows, or archive the shown one at the end of term (it and all its courses at once -
// library/ARCHIVE_SEMESTER; documents stay searchable). On the kit's Menu, so it becomes a Sheet with
// U3; the archive confirm becomes U3's Dialog.
export function SemesterSwitcher({ visible, shown, current, onClose }: SemesterSwitcherProps) {
  const { t } = useT();
  const dispatch = useAppDispatch();
  const state = useAppSlices('library');
  const semesters = state.library.semesters;
  const active = useMemo(() => semesters.filter((s) => !s.archived), [semesters]);
  const sections = useMemo(() => semesterSections(t, active, shown, current), [t, active, shown, current]);

  const pick = (semester: Semester) => {
    // Picking the current one goes back to following the date.
    dispatch({ type: 'libraryUi/SET_HOME_SEMESTER', id: semester.id === current?.id ? null : semester.id });
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
            dispatch({ type: 'libraryUi/SET_HOME_SEMESTER', id: null });
            // §8 B5: the end of term is the moment to keep a copy; a quiet nudge with the action.
            const courseIds = state.library.courses.filter((c) => c.semesterId === semester.id).map((c) => c.id);
            const hasDocuments = state.library.files.some((f) => f.courseId !== undefined && courseIds.includes(f.courseId));
            const archived = t('courses.semesterSwitcher.archived', { name: semester.name });
            dispatch(
              hasDocuments
                ? {
                    type: 'ui/SHOW_SNACK',
                    msg: t('backup.reminder.semesterArchived', { name: semester.name }),
                    action: t('backup.reminder.backUp'),
                    onAction: () =>
                      dispatch({ type: 'ui/REQUEST_EXPORT', request: { scope: { kind: 'courses', courseIds }, courseName: semester.name } }),
                  }
                : { type: 'ui/SHOW_SNACK', msg: archived }
            );
          },
        },
      ]
    );
  };

  const onSelect = (id: string) => {
    if (id === ARCHIVE_ID) {
      if (shown) archive(shown);
      return;
    }
    const semester = active.find((s) => s.id === id);
    if (semester) pick(semester);
  };

  return <Menu visible={visible} onClose={onClose} onSelect={onSelect} sections={sections} title={t('courses.semesterSwitcher.title')} />;
}
