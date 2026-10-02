import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { COURSE_EMOJIS, defaultSemester, findSemesterByName, hasErrors, validateCourseDraft } from '../../services/courses/courseSetup';
import { COURSE_COLORS, courseColorValue, nextCourseColor } from '../../services/courses/palette';
import { READY_SCRIPTS, getScript, resolveOcrScript } from '../../services/scripts/registry';
import { useAppState } from '../../store/AppStateContext';
import { radii, spacing, useTheme } from '../../theme';
import type { Course, CourseColor, OcrScript } from '../../types/models';
import { createId } from '../../utils/id';
import { CourseBadge } from './CourseBadge';
import { CourseSheet, SheetField, sheetInputStyle } from './CourseSheet';
import { TimetableEditor } from './TimetableEditor';
import { formatSlot } from '../../services/courses/timetable';
import { useT } from '../../i18n/useT';

type CourseEditorSheetProps = {
  visible: boolean;
  // Undefined: create a new course.
  course?: Course;
  onClose: () => void;
  onSaved?: (courseId: string) => void;
};

// Semester choice: an existing one, none, or the default term for today (created on save, so a
// student with no semesters yet gets one without a separate step).
type SemesterChoice = { kind: 'none' } | { kind: 'existing'; id: string } | { kind: 'new'; name: string };

export function CourseEditorSheet({ visible, course, onClose, onSaved }: CourseEditorSheetProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const { state, dispatch } = useAppState();
  const { courses, semesters } = state.library;

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [teacher, setTeacher] = useState('');
  const [emoji, setEmoji] = useState<string | undefined>();
  const [color, setColor] = useState<CourseColor>(COURSE_COLORS[0]);
  const [semester, setSemester] = useState<SemesterChoice>({ kind: 'none' });
  const [archived, setArchived] = useState(false);
  // §6 L1: undefined = the app setting (Settings → Recognition language).
  const [ocrScript, setOcrScript] = useState<OcrScript | undefined>();
  const [attempted, setAttempted] = useState(false);
  const [classTimesOpen, setClassTimesOpen] = useState(false);
  const classTimes = course ? state.library.timetable.filter((s) => s.courseId === course.id) : [];

  // What "App default" currently means, so the chip can say it.
  const appDefaultScript = getScript(resolveOcrScript({ settings: state.settings }))!;

  const todayTerm = useMemo(() => defaultSemester(new Date()), []);
  const todaySemester = findSemesterByName(semesters, todayTerm.name);

  // Reset the form each time the sheet opens. A new course goes into the newest active semester
  // (or today's term), so adding courses one by one keeps them together.
  useEffect(() => {
    if (!visible) return;
    setName(course?.name ?? '');
    setCode(course?.code ?? '');
    setTeacher(course?.teacher ?? '');
    setEmoji(course?.emoji);
    setColor(course?.color ?? nextCourseColor(courses));
    setArchived(course?.archived ?? false);
    setOcrScript(course?.ocrScript);
    setAttempted(false);
    if (course) {
      setSemester(course.semesterId ? { kind: 'existing', id: course.semesterId } : { kind: 'none' });
    } else {
      const newest = semesters.find((s) => !s.archived);
      setSemester(newest ? { kind: 'existing', id: newest.id } : { kind: 'new', name: todayTerm.name });
    }
    // Only on open: later edits to the library mustn't reset what the student is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const semesterId = semester.kind === 'existing' ? semester.id : undefined;
  // A semester created on save has no courses yet, so nothing can clash with it.
  const validationSemesterId = semester.kind === 'new' ? '\0new' : semesterId;
  const errors = validateCourseDraft({ name, code, semesterId: validationSemesterId }, courses, course?.id);
  // Name errors wait for a save attempt (an empty field isn't wrong yet); a code clash shows live.
  const shownErrors = { name: attempted ? errors.name : undefined, code: errors.code };

  // Active semesters, plus this course's own semester even if it's archived, so it stays visible.
  const semesterChips = semesters.filter((s) => !s.archived || s.id === course?.semesterId);

  const handleSave = () => {
    setAttempted(true);
    if (hasErrors(errors)) return;
    let targetSemesterId = semesterId;
    if (semester.kind === 'new') {
      targetSemesterId = createId('semester');
      dispatch({
        type: 'library/CREATE_SEMESTER',
        semester: { id: targetSemesterId, name: semester.name, startsOn: todayTerm.startsOn, endsOn: todayTerm.endsOn },
      });
    }
    const fields = {
      code: code.trim() || undefined,
      teacher: teacher.trim() || undefined,
      emoji,
      color,
      semesterId: targetSemesterId,
      archived,
      ocrScript,
    };
    let id = course?.id;
    if (id) {
      dispatch({ type: 'library/UPDATE_COURSE', id, patch: { name: name.trim(), ...fields } });
    } else {
      id = createId('course');
      dispatch({ type: 'library/CREATE_COURSE', id, name: name.trim(), fields });
    }
    onSaved?.(id);
    onClose();
  };

  const chip = (selected: boolean) => [
    styles.chip,
    { borderColor: selected ? tokens.accent : tokens.edge, backgroundColor: selected ? tokens.accentSoft : tokens.surface2 },
  ];

  return (
    <CourseSheet
      visible={visible}
      title={course ? t('courses.editCourse') : t('courses.newCourse')}
      submitLabel={course ? t('courses.save') : t('courses.addCourse')}
      submitDisabled={!!errors.code}
      onSubmit={handleSave}
      onClose={onClose}
    >
      <View style={styles.preview}>
        <CourseBadge course={{ name: name || '?', code, emoji, color }} size={48} />
        <View style={styles.previewText}>
          <SheetField label={t('courses.name')} error={shownErrors.name}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={t('courses.namePlaceholder')}
              placeholderTextColor={tokens.muted}
              autoFocus={!course}
              autoCapitalize="words"
              style={[sheetInputStyle, { color: tokens.ink, backgroundColor: tokens.surface2, borderColor: tokens.edge }]}
            />
          </SheetField>
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.flex}>
          <SheetField label={t('courses.code')} error={shownErrors.code}>
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder={t('courses.codePlaceholder')}
              placeholderTextColor={tokens.muted}
              autoCapitalize="characters"
              style={[sheetInputStyle, { color: tokens.ink, backgroundColor: tokens.surface2, borderColor: tokens.edge }]}
            />
          </SheetField>
        </View>
        <View style={styles.flex}>
          <SheetField label={t('courses.teacher')}>
            <TextInput
              value={teacher}
              onChangeText={setTeacher}
              placeholder={t('courses.optional')}
              placeholderTextColor={tokens.muted}
              autoCapitalize="words"
              style={[sheetInputStyle, { color: tokens.ink, backgroundColor: tokens.surface2, borderColor: tokens.edge }]}
            />
          </SheetField>
        </View>
      </View>

      <SheetField label={t('courses.colour')}>
        <View style={styles.wrap}>
          {COURSE_COLORS.map((c) => (
            <Pressable
              key={c}
              onPress={() => setColor(c)}
              accessibilityRole="radio"
              accessibilityState={{ selected: c === color }}
              accessibilityLabel={t(`courses.colours.${c}`)}
              style={[
                styles.swatch,
                { backgroundColor: courseColorValue(c, tokens), borderColor: c === color ? tokens.ink : 'transparent' },
              ]}
            >
              {c === color ? <Ionicons name="checkmark" size={16} color={tokens.surface} /> : null}
            </Pressable>
          ))}
        </View>
      </SheetField>

      <SheetField label={t('courses.emoji')}>
        <View style={styles.wrap}>
          <Pressable style={[...chip(!emoji), styles.emojiChip]} onPress={() => setEmoji(undefined)} accessibilityLabel={t('courses.noEmoji')}>
            <Ionicons name="close" size={16} color={tokens.muted} />
          </Pressable>
          {COURSE_EMOJIS.map((e) => (
            <Pressable key={e} style={[...chip(emoji === e), styles.emojiChip]} onPress={() => setEmoji(e)}>
              <Text style={styles.emoji}>{e}</Text>
            </Pressable>
          ))}
        </View>
      </SheetField>

      <SheetField label={t('courses.semester')}>
        <View style={styles.wrap}>
          <Pressable style={chip(semester.kind === 'none')} onPress={() => setSemester({ kind: 'none' })}>
            <Text style={[styles.chipLabel, { color: tokens.ink }]}>{t('courses.none')}</Text>
          </Pressable>
          {semesterChips.map((s) => (
            <Pressable
              key={s.id}
              style={chip(semester.kind === 'existing' && semester.id === s.id)}
              onPress={() => setSemester({ kind: 'existing', id: s.id })}
            >
              <Text style={[styles.chipLabel, { color: tokens.ink }]}>{s.archived ? t('courses.archivedSuffix', { name: s.name }) : s.name}</Text>
            </Pressable>
          ))}
          {!todaySemester ? (
            <Pressable
              style={chip(semester.kind === 'new')}
              onPress={() => setSemester({ kind: 'new', name: todayTerm.name })}
            >
              <Text style={[styles.chipLabel, { color: tokens.ink }]}>{t('courses.newSemester', { name: todayTerm.name })}</Text>
            </Pressable>
          ) : null}
        </View>
      </SheetField>

      <SheetField label={t('courses.recognition')}>
        <View style={styles.wrap}>
          <Pressable
            style={chip(ocrScript === undefined)}
            onPress={() => setOcrScript(undefined)}
            accessibilityRole="radio"
            accessibilityState={{ selected: ocrScript === undefined }}
          >
            <Text style={[styles.chipLabel, { color: tokens.ink }]}>{t('courses.appDefault', { name: appDefaultScript.nativeName })}</Text>
          </Pressable>
          {READY_SCRIPTS.map((script) => (
            <Pressable
              key={script.id}
              style={chip(ocrScript === script.id)}
              onPress={() => setOcrScript(script.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: ocrScript === script.id }}
              accessibilityLabel={t(script.labelKey)}
            >
              <Text style={[styles.chipLabel, { color: tokens.ink }]}>{script.nativeName}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={[styles.hint, { color: tokens.muted }]}>{t('courses.recognitionHint')}</Text>
      </SheetField>

      {course ? (
        <SheetField label={t('courses.classTimes')}>
          <Pressable
            style={[styles.classTimes, { backgroundColor: tokens.surface2, borderColor: tokens.edge }]}
            onPress={() => setClassTimesOpen(true)}
            accessibilityRole="button"
          >
            <Text style={[styles.classTimesText, { color: classTimes.length ? tokens.ink : tokens.muted }]} numberOfLines={2}>
              {classTimes.length ? classTimes.map(formatSlot).join(', ') : t('courses.classTimesNotSet')}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={tokens.muted} />
          </Pressable>
          <TimetableEditor visible={classTimesOpen} courseId={course.id} onClose={() => setClassTimesOpen(false)} />
        </SheetField>
      ) : null}

      {course ? (
        <View style={styles.switchRow}>
          <View style={styles.flex}>
            <Text style={[styles.chipLabel, { color: tokens.ink }]}>{t('courses.archived')}</Text>
            <Text style={[styles.hint, { color: tokens.muted }]}>{t('courses.archivedHint')}</Text>
          </View>
          <Switch value={archived} onValueChange={setArchived} trackColor={{ true: tokens.accent }} />
        </View>
      ) : null}
    </CourseSheet>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  preview: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.md,
  },
  previewText: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  emojiChip: {
    width: 42,
    height: 42,
    paddingHorizontal: 0,
    paddingVertical: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 20,
  },
  chipLabel: {
    fontSize: 14.5,
    fontWeight: '600',
  },
  classTimes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  classTimesText: {
    flex: 1,
    fontSize: 14.5,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  hint: {
    fontSize: 13,
    marginTop: 2,
  },
});
