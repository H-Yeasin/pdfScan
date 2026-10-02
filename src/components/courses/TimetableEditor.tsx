import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { formatTime, parseSlotTimes, slotChanges, WEEKDAY_ORDER, weekdayName } from '../../services/courses/timetable';
import { useAppDispatch, useAppSlices } from '../../store/AppStateContext';
import { radii, spacing, useTheme } from '../../theme';
import type { TimetableSlot } from '../../types/models';
import { createId } from '../../utils/id';
import { CourseBadge } from './CourseBadge';
import { CourseSheet, SheetField, sheetInputStyle } from './CourseSheet';
import { useT } from '../../i18n/useT';

type TimetableEditorProps = {
  visible: boolean;
  // One course's class times (from the course editor), or every active course's (from Settings).
  courseId?: string;
  onClose: () => void;
};

type Form = { editingId: string | null; courseId: string; weekday: number; start: string; end: string; error?: string };

// "Class times": the optional weekly timetable that lets a scan in class file itself (K5). Works
// on a draft; Done applies the changes, Cancel drops them. Times are typed ("9:30", "2pm") - there
// is no time-picker dependency, and typing is faster for a whole week anyway.
export function TimetableEditor({ visible, courseId, onClose }: TimetableEditorProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const dispatch = useAppDispatch();
  const state = useAppSlices('library');
  const { courses, timetable } = state.library;
  const scopeCourses = courseId ? courses.filter((c) => c.id === courseId) : courses.filter((c) => !c.archived);
  const inScope = (slot: TimetableSlot) => scopeCourses.some((c) => c.id === slot.courseId);

  const [draft, setDraft] = useState<TimetableSlot[]>([]);
  const [form, setForm] = useState<Form | null>(null);

  useEffect(() => {
    if (!visible) return;
    setDraft(timetable.filter(inScope));
    setForm(null);
    // Only on open: the draft is the student's until Done or Cancel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const openForm = (forCourse: string, slot?: TimetableSlot) =>
    setForm({
      editingId: slot?.id ?? null,
      courseId: forCourse,
      weekday: slot?.weekday ?? 1,
      start: slot ? formatTime(slot.startMin) : '',
      end: slot ? formatTime(slot.endMin) : '',
    });

  const saveForm = () => {
    if (!form) return;
    const times = parseSlotTimes(form.start, form.end);
    if ('error' in times) {
      setForm({ ...form, error: times.error });
      return;
    }
    const slot: TimetableSlot = { id: form.editingId ?? createId('slot'), courseId: form.courseId, weekday: form.weekday, ...times };
    setDraft((prev) => (form.editingId ? prev.map((s) => (s.id === form.editingId ? slot : s)) : [...prev, slot]));
    setForm(null);
  };

  const handleDone = () => {
    const { added, updated, removedIds } = slotChanges(timetable.filter(inScope), draft);
    for (const slot of added) dispatch({ type: 'library/ADD_SLOT', slot });
    for (const slot of updated) dispatch({ type: 'library/UPDATE_SLOT', id: slot.id, patch: slot });
    for (const id of removedIds) dispatch({ type: 'library/REMOVE_SLOT', id });
    onClose();
  };

  const input = [sheetInputStyle, { color: tokens.ink, backgroundColor: tokens.surface2, borderColor: tokens.edge }];
  const chip = (selected: boolean) => [
    styles.chip,
    { borderColor: selected ? tokens.accent : tokens.edge, backgroundColor: selected ? tokens.accentSoft : tokens.surface2 },
  ];

  const sorted = (slots: TimetableSlot[]) =>
    [...slots].sort((a, b) => WEEKDAY_ORDER.indexOf(a.weekday as never) - WEEKDAY_ORDER.indexOf(b.weekday as never) || a.startMin - b.startMin);

  return (
    <CourseSheet visible={visible} title={t('courses.timetable.title')} submitLabel={t('courses.timetable.done')} submitDisabled={!!form} onSubmit={handleDone} onClose={onClose}>
      <Text style={[styles.hint, { color: tokens.muted }]}>
        {t('courses.timetable.hint')}
      </Text>

      {scopeCourses.length === 0 ? (
        <Text style={[styles.hint, { color: tokens.muted }]}>{t('courses.timetable.noCourses')}</Text>
      ) : null}

      {scopeCourses.map((course) => (
        <View key={course.id} style={styles.course}>
          {!courseId ? (
            <View style={styles.courseHeader}>
              <CourseBadge course={course} size={26} />
              <Text style={[styles.courseName, { color: tokens.ink }]} numberOfLines={1}>
                {course.name}
              </Text>
            </View>
          ) : null}
          {sorted(draft.filter((s) => s.courseId === course.id)).map((slot) => (
            <View key={slot.id} style={[styles.slotRow, { backgroundColor: tokens.surface2 }]}>
              <Pressable style={styles.slotText} onPress={() => openForm(course.id, slot)} accessibilityRole="button">
                <Text style={[styles.slotDay, { color: tokens.ink }]}>{weekdayName(slot.weekday)}</Text>
                <Text style={{ color: tokens.ink, fontSize: 15 }}>
                  {formatTime(slot.startMin)}–{formatTime(slot.endMin)}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setDraft((prev) => prev.filter((s) => s.id !== slot.id))}
                hitSlop={8}
                accessibilityLabel={t('courses.timetable.remove', { day: weekdayName(slot.weekday), time: formatTime(slot.startMin) })}
              >
                <Ionicons name="close" size={18} color={tokens.muted} />
              </Pressable>
            </View>
          ))}

          {form && form.courseId === course.id ? (
            <View style={[styles.form, { borderColor: tokens.edge }]}>
              <View style={styles.days}>
                {WEEKDAY_ORDER.map((day) => (
                  <Pressable key={day} style={chip(form.weekday === day)} onPress={() => setForm({ ...form, weekday: day })}>
                    <Text style={[styles.chipLabel, { color: tokens.ink }]}>{weekdayName(day)}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.times}>
                <View style={styles.flex}>
                  <SheetField label={t('courses.timetable.starts')}>
                    <TextInput
                      value={form.start}
                      onChangeText={(start) => setForm({ ...form, start, error: undefined })}
                      placeholder="9:00"
                      placeholderTextColor={tokens.muted}
                      autoFocus
                      style={input}
                    />
                  </SheetField>
                </View>
                <View style={styles.flex}>
                  <SheetField label={t('courses.timetable.ends')}>
                    <TextInput
                      value={form.end}
                      onChangeText={(end) => setForm({ ...form, end, error: undefined })}
                      placeholder="10:30"
                      placeholderTextColor={tokens.muted}
                      onSubmitEditing={saveForm}
                      style={input}
                    />
                  </SheetField>
                </View>
              </View>
              {form.error ? <Text style={{ color: tokens.danger, fontSize: 13 }}>{form.error}</Text> : null}
              <View style={styles.formActions}>
                <Pressable onPress={() => setForm(null)} style={styles.formButton}>
                  <Text style={[styles.formButtonLabel, { color: tokens.muted }]}>{t('common.cancel')}</Text>
                </Pressable>
                <Pressable onPress={saveForm} style={[styles.formButton, { backgroundColor: tokens.accentSoft, borderRadius: radii.full }]}>
                  <Text style={[styles.formButtonLabel, { color: tokens.accentInk }]}>{form.editingId ? t('courses.timetable.update') : t('courses.timetable.add')}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable style={styles.addRow} onPress={() => openForm(course.id)} disabled={!!form} accessibilityRole="button">
              <Ionicons name="add" size={18} color={form ? tokens.muted : tokens.accentInk} />
              <Text style={[styles.addLabel, { color: form ? tokens.muted : tokens.accentInk }]}>{t('courses.timetable.addClassTime')}</Text>
            </Pressable>
          )}
        </View>
      ))}
    </CourseSheet>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  hint: {
    fontSize: 13.5,
    lineHeight: 19,
  },
  course: {
    gap: spacing.sm,
  },
  courseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  courseName: {
    flex: 1,
    fontSize: 15.5,
    fontWeight: '600',
  },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.card,
  },
  slotText: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.md,
  },
  slotDay: {
    width: 36,
    fontSize: 15,
    fontWeight: '700',
  },
  form: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  days: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipLabel: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  times: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  formButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  formButtonLabel: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  addLabel: {
    fontSize: 14.5,
    fontWeight: '600',
  },
});
