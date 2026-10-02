import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DocTypeSelector } from '../courses/DocTypeChips';
import { NameField } from '../deliver/NameField';
import { nextTypeNumber } from '../../services/courses/docTypes';
import { dueAtFrom, formatTime, parseTime, startOfDay, upcomingDays } from '../../services/submit/deadlines';
import { useAppDispatch, useAppSlices } from '../../store/AppStateContext';
import { useDeadlineActions } from '../../store/useDeadlines';
import { radii, spacing, useTheme } from '../../theme';
import { formatDate, t, tDoc } from '../../i18n';
import { useT } from '../../i18n/useT';
import type { Deadline, DocType } from '../../types/models';

const TIME_PRESETS = [9 * 60, 12 * 60, 17 * 60, 23 * 60 + 59];
const DEFAULT_TIME = 23 * 60 + 59;

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { tokens } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.chip, { borderColor: selected ? tokens.accent : tokens.edge, backgroundColor: selected ? tokens.accentSoft : tokens.surface }]}
    >
      <Text style={[styles.chipLabel, { color: selected ? tokens.accentInk : tokens.ink }]}>{label}</Text>
    </Pressable>
  );
}

function dayLabel(day: number, now: number): string {
  const [today, tomorrow] = upcomingDays(now, 2);
  if (day === today) return t('common.today');
  if (day === tomorrow) return t('deadlines.tomorrow');
  return formatDate(day, { weekday: 'short', day: 'numeric', month: day < today ? 'short' : undefined });
}

type DeadlineEditorSheetProps = {
  visible: boolean;
  onClose: () => void;
  // Editing this one; otherwise a new deadline.
  deadline?: Deadline;
  // A course page fixes the course; Home lets the student pick one.
  courseId?: string;
};

// Add or edit a deadline: course, title, day, time, type. Saving schedules the reminders.
export function DeadlineEditorSheet({ visible, onClose, deadline, courseId: fixedCourseId }: DeadlineEditorSheetProps) {
  const { tokens } = useTheme();
  // t is imported (dayLabel uses it too); this re-renders on a language change.
  useT();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const state = useAppSlices('library');
  const { save, remove } = useDeadlineActions();
  const activeCourses = useMemo(() => state.library.courses.filter((c) => !c.archived), [state.library.courses]);

  const [courseId, setCourseId] = useState<string | null>(null);
  const [docType, setDocType] = useState<DocType>('assignment');
  const [title, setTitle] = useState('');
  const [titleEdited, setTitleEdited] = useState(false);
  const [day, setDay] = useState(0);
  const [timeText, setTimeText] = useState(formatTime(DEFAULT_TIME));
  const [saving, setSaving] = useState(false);

  // Fresh values each time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    const now = Date.now();
    setCourseId(deadline?.courseId ?? fixedCourseId ?? activeCourses[0]?.id ?? null);
    setDocType(deadline?.docType ?? 'assignment');
    setTitle(deadline?.title ?? '');
    setTitleEdited(!!deadline);
    setDay(deadline ? startOfDay(deadline.dueAt) : upcomingDays(now)[1]);
    setTimeText(formatTime(deadline ? (new Date(deadline.dueAt).getHours() * 60 + new Date(deadline.dueAt).getMinutes()) : DEFAULT_TIME));
  }, [visible, deadline, fixedCourseId, activeCourses]);

  // "HW3": the type's short name and the number the next one in this course will get.
  const suggestedTitle = useMemo(
    () => (courseId ? `${tDoc(`document.docTypeShort.${docType}`)}${nextTypeNumber(state.library.files, courseId, docType)}` : ''),
    [courseId, docType, state.library.files]
  );
  useEffect(() => {
    if (!titleEdited) setTitle(suggestedTitle);
  }, [titleEdited, suggestedTitle]);

  const days = useMemo(() => {
    const list = upcomingDays(Date.now());
    return day && !list.includes(day) ? [day, ...list] : list;
  }, [day, visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const minutes = parseTime(timeText);
  const dueAt = minutes === null ? null : dueAtFrom(day, minutes);
  const problem =
    !courseId
      ? t('deadlines.pickCourse')
      : !title.trim()
        ? t('deadlines.giveTitle')
        : dueAt === null
          ? t('deadlines.timeFormat')
          : dueAt <= Date.now()
            ? t('deadlines.pickFuture')
            : null;

  const handleSave = async () => {
    if (problem || !courseId || dueAt === null || saving) return;
    setSaving(true);
    try {
      const { remindersOn } = await save({ courseId, title: title.trim(), dueAt, docType }, deadline);
      if (!remindersOn) {
        dispatch({ type: 'ui/SHOW_SNACK', msg: t('deadlines.noReminders') });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityRole="button" style={styles.backdrop} onPress={onClose} accessibilityLabel={t('common.close')} />
      <View style={[styles.sheet, { backgroundColor: tokens.bg, paddingBottom: insets.bottom + spacing.lg }]}>
        <Text style={[styles.title, { color: tokens.ink }]}>{deadline ? t('deadlines.edit') : t('deadlines.add')}</Text>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {!fixedCourseId && !deadline ? (
            <View style={styles.group}>
              <Text style={[styles.label, { color: tokens.ink }]}>{t('deadlines.course')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {activeCourses.map((c) => (
                  <Chip key={c.id} label={c.code || c.name} selected={c.id === courseId} onPress={() => setCourseId(c.id)} />
                ))}
              </ScrollView>
            </View>
          ) : null}

          <View style={styles.group}>
            <Text style={[styles.label, { color: tokens.ink }]}>{t('deadlines.type')}</Text>
            <DocTypeSelector value={docType} onChange={setDocType} />
          </View>

          <NameField
            label={t('deadlines.title')}
            value={title}
            onChange={(value) => {
              setTitle(value);
              setTitleEdited(true);
            }}
            placeholder={t('deadlines.titlePlaceholder')}
          />

          <View style={styles.group}>
            <Text style={[styles.label, { color: tokens.ink }]}>{t('deadlines.due')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {days.map((d) => (
                <Chip key={d} label={dayLabel(d, Date.now())} selected={d === day} onPress={() => setDay(d)} />
              ))}
            </ScrollView>
            <View style={styles.timeRow}>
              {TIME_PRESETS.map((m) => (
                <Chip key={m} label={formatTime(m)} selected={minutes === m} onPress={() => setTimeText(formatTime(m))} />
              ))}
              <TextInput
                value={timeText}
                onChangeText={setTimeText}
                keyboardType="numbers-and-punctuation"
                accessibilityLabel={t('deadlines.time')}
                style={[styles.timeInput, { color: tokens.ink, borderColor: tokens.edge, backgroundColor: tokens.surface }]}
              />
            </View>
            <Text style={[styles.hint, { color: problem ? tokens.danger : tokens.muted }]}>
              {problem ?? t('deadlines.remindersHint')}
            </Text>
          </View>

          <View style={styles.actions}>
            {deadline ? (
              <Pressable
                style={styles.ghost}
                onPress={() => {
                  remove(deadline.id);
                  onClose();
                }}
                accessibilityRole="button"
              >
                <Text style={[styles.ghostLabel, { color: tokens.danger }]}>{t('deadlines.delete')}</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={[styles.primary, { backgroundColor: tokens.accent, opacity: problem || saving ? 0.5 : 1 }]}
              onPress={handleSave}
              disabled={!!problem || saving}
              accessibilityRole="button"
            >
              <Text style={styles.primaryLabel}>{t('deadlines.save')}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,.4)',
  },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: radii.card * 2,
    borderTopRightRadius: radii.card * 2,
    paddingTop: spacing.lg,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  body: {
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  group: {
    gap: spacing.sm,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  chips: {
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipLabel: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  timeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  timeInput: {
    minWidth: 76,
    height: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 14,
    textAlign: 'center',
  },
  hint: {
    fontSize: 12.5,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  ghost: {
    height: 48,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  ghostLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  primary: {
    flex: 1,
    height: 48,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
