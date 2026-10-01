import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { COURSE_EMOJIS, defaultSemester, findSemesterByName, hasErrors, validateCourseDraft } from '../../services/courses/courseSetup';
import { COURSE_COLORS, courseColorValue, nextCourseColor } from '../../services/courses/palette';
import { useAppState } from '../../store/AppStateContext';
import { radii, spacing, useTheme } from '../../theme';
import type { Course, CourseColor } from '../../types/models';
import { createId } from '../../utils/id';
import { CourseBadge } from './CourseBadge';
import { CourseSheet, SheetField, sheetInputStyle } from './CourseSheet';

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
  const { state, dispatch } = useAppState();
  const { courses, semesters } = state.library;

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [teacher, setTeacher] = useState('');
  const [emoji, setEmoji] = useState<string | undefined>();
  const [color, setColor] = useState<CourseColor>(COURSE_COLORS[0]);
  const [semester, setSemester] = useState<SemesterChoice>({ kind: 'none' });
  const [archived, setArchived] = useState(false);
  const [attempted, setAttempted] = useState(false);

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
      title={course ? 'Edit course' : 'New course'}
      submitLabel={course ? 'Save' : 'Add course'}
      submitDisabled={!!errors.code}
      onSubmit={handleSave}
      onClose={onClose}
    >
      <View style={styles.preview}>
        <CourseBadge course={{ name: name || '?', code, emoji, color }} size={48} />
        <View style={styles.previewText}>
          <SheetField label="Name" error={shownErrors.name}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Linear Algebra"
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
          <SheetField label="Code" error={shownErrors.code}>
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="MATH 201"
              placeholderTextColor={tokens.muted}
              autoCapitalize="characters"
              style={[sheetInputStyle, { color: tokens.ink, backgroundColor: tokens.surface2, borderColor: tokens.edge }]}
            />
          </SheetField>
        </View>
        <View style={styles.flex}>
          <SheetField label="Teacher">
            <TextInput
              value={teacher}
              onChangeText={setTeacher}
              placeholder="Optional"
              placeholderTextColor={tokens.muted}
              autoCapitalize="words"
              style={[sheetInputStyle, { color: tokens.ink, backgroundColor: tokens.surface2, borderColor: tokens.edge }]}
            />
          </SheetField>
        </View>
      </View>

      <SheetField label="Colour">
        <View style={styles.wrap}>
          {COURSE_COLORS.map((c) => (
            <Pressable
              key={c}
              onPress={() => setColor(c)}
              accessibilityRole="radio"
              accessibilityState={{ selected: c === color }}
              accessibilityLabel={c}
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

      <SheetField label="Emoji">
        <View style={styles.wrap}>
          <Pressable style={[...chip(!emoji), styles.emojiChip]} onPress={() => setEmoji(undefined)} accessibilityLabel="No emoji">
            <Ionicons name="close" size={16} color={tokens.muted} />
          </Pressable>
          {COURSE_EMOJIS.map((e) => (
            <Pressable key={e} style={[...chip(emoji === e), styles.emojiChip]} onPress={() => setEmoji(e)}>
              <Text style={styles.emoji}>{e}</Text>
            </Pressable>
          ))}
        </View>
      </SheetField>

      <SheetField label="Semester">
        <View style={styles.wrap}>
          <Pressable style={chip(semester.kind === 'none')} onPress={() => setSemester({ kind: 'none' })}>
            <Text style={[styles.chipLabel, { color: tokens.ink }]}>None</Text>
          </Pressable>
          {semesterChips.map((s) => (
            <Pressable
              key={s.id}
              style={chip(semester.kind === 'existing' && semester.id === s.id)}
              onPress={() => setSemester({ kind: 'existing', id: s.id })}
            >
              <Text style={[styles.chipLabel, { color: tokens.ink }]}>{s.archived ? `${s.name} (archived)` : s.name}</Text>
            </Pressable>
          ))}
          {!todaySemester ? (
            <Pressable
              style={chip(semester.kind === 'new')}
              onPress={() => setSemester({ kind: 'new', name: todayTerm.name })}
            >
              <Text style={[styles.chipLabel, { color: tokens.ink }]}>+ {todayTerm.name}</Text>
            </Pressable>
          ) : null}
        </View>
      </SheetField>

      {course ? (
        <View style={styles.switchRow}>
          <View style={styles.flex}>
            <Text style={[styles.chipLabel, { color: tokens.ink }]}>Archived</Text>
            <Text style={[styles.hint, { color: tokens.muted }]}>Hidden from course lists and pickers. Its files stay searchable.</Text>
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
