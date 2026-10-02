import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  defaultSemester,
  quickSetupActions,
  upcomingColors,
  validateQuickSetup,
  type QuickSetupRow,
} from '../../services/courses/courseSetup';
import { courseColorValue } from '../../services/courses/palette';
import { useAppState } from '../../store/AppStateContext';
import { radii, spacing, useTheme } from '../../theme';
import { createId } from '../../utils/id';
import { CourseSheet, SheetField, sheetInputStyle } from './CourseSheet';
import { useT } from '../../i18n/useT';

type QuickSetupSheetProps = {
  visible: boolean;
  onClose: () => void;
};

// Four rows covers most of a term's load; "Add another" covers the rest.
const INITIAL_ROWS = 4;
const emptyRows = (): QuickSetupRow[] => Array.from({ length: INITIAL_ROWS }, () => ({ name: '', code: '' }));

// "Add your courses": the fast path for a whole term at once (the §3 target is 4 courses in under a
// minute). Name and code only, keyboard-driven: Next on a name goes to its code, Next on a code to
// the following row's name. Everything else (emoji, teacher) is in CourseEditorSheet later.
// Opened from the empty course list now, and reused by §9 onboarding.
export function QuickSetupSheet({ visible, onClose }: QuickSetupSheetProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const { state, dispatch } = useAppState();
  const { courses, semesters } = state.library;

  const [semesterName, setSemesterName] = useState('');
  const [rows, setRows] = useState<QuickSetupRow[]>(emptyRows);
  const [attempted, setAttempted] = useState(false);
  const nameRefs = useRef<(TextInput | null)[]>([]);
  const codeRefs = useRef<(TextInput | null)[]>([]);
  const focusNextName = useRef<number | null>(null);

  useEffect(() => {
    if (!visible) return;
    setSemesterName(defaultSemester(new Date()).name);
    setRows(emptyRows());
    setAttempted(false);
  }, [visible]);

  // Focus a row added from the keyboard once it has rendered.
  useEffect(() => {
    if (focusNextName.current === null) return;
    nameRefs.current[focusNextName.current]?.focus();
    focusNextName.current = null;
  }, [rows.length]);

  const colors = useMemo(() => upcomingColors(courses, rows.length), [courses, rows.length]);
  const { rowErrors, semesterError, count } = validateQuickSetup(rows, semesterName, courses, semesters);
  const anyError = !!semesterError || rowErrors.some((e) => e.name || e.code);

  const updateRow = (index: number, patch: Partial<QuickSetupRow>) =>
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const addRow = (focus: boolean) => {
    if (focus) focusNextName.current = rows.length;
    setRows((prev) => [...prev, { name: '', code: '' }]);
  };

  const handleSave = () => {
    setAttempted(true);
    if (anyError || count === 0) return;
    for (const action of quickSetupActions(rows, semesterName, courses, semesters, new Date(), createId)) dispatch(action);
    dispatch({ type: 'ui/SHOW_SNACK', msg: t('courses.quickSetup.added', { count }) });
    onClose();
  };

  const inputStyle = [sheetInputStyle, { color: tokens.ink, backgroundColor: tokens.surface2, borderColor: tokens.edge }];
  // Codes clash live; a missing name waits for a save attempt.
  const errorFor = (i: number) => rowErrors[i]?.code ?? (attempted ? rowErrors[i]?.name : undefined);

  return (
    <CourseSheet
      visible={visible}
      title={t('courses.quickSetup.title')}
      submitLabel={t('courses.quickSetup.submit', { count: Math.max(1, count) })}
      submitDisabled={count === 0 || (attempted && anyError)}
      onSubmit={handleSave}
      onClose={onClose}
    >
      <SheetField label={t('courses.semester')} error={attempted ? semesterError : undefined}>
        <TextInput
          value={semesterName}
          onChangeText={setSemesterName}
          placeholder={t('courses.quickSetup.semesterPlaceholder')}
          placeholderTextColor={tokens.muted}
          style={inputStyle}
        />
      </SheetField>

      <View style={styles.rows}>
        <View style={styles.headerRow}>
          <View style={styles.dotSpace} />
          <Text style={[styles.header, styles.nameCol, { color: tokens.muted }]}>{t('courses.quickSetup.courseName')}</Text>
          <Text style={[styles.header, styles.codeCol, { color: tokens.muted }]}>{t('courses.code')}</Text>
        </View>
        {rows.map((row, i) => (
          <View key={i} style={styles.rowWrap}>
            <View style={styles.row}>
              <View style={[styles.dot, { backgroundColor: courseColorValue(colors[i], tokens) }]} />
              <TextInput
                ref={(el) => {
                  nameRefs.current[i] = el;
                }}
                value={row.name}
                onChangeText={(name) => updateRow(i, { name })}
                placeholder={i === 0 ? t('courses.quickSetup.firstPlaceholder') : t('courses.quickSetup.rowPlaceholder', { n: i + 1 })}
                placeholderTextColor={tokens.muted}
                autoFocus={i === 0}
                autoCapitalize="words"
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => codeRefs.current[i]?.focus()}
                style={[inputStyle, styles.nameCol]}
              />
              <TextInput
                ref={(el) => {
                  codeRefs.current[i] = el;
                }}
                value={row.code}
                onChangeText={(code) => updateRow(i, { code })}
                placeholder={t('courses.optional')}
                placeholderTextColor={tokens.muted}
                autoCapitalize="characters"
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => (i + 1 < rows.length ? nameRefs.current[i + 1]?.focus() : addRow(true))}
                style={[inputStyle, styles.codeCol]}
              />
            </View>
            {errorFor(i) ? <Text style={[styles.error, { color: tokens.danger }]}>{errorFor(i)}</Text> : null}
          </View>
        ))}
        <Pressable style={[styles.addRow, { borderColor: tokens.edge }]} onPress={() => addRow(true)} accessibilityRole="button">
          <Ionicons name="add" size={18} color={tokens.accentInk} />
          <Text style={[styles.addLabel, { color: tokens.accentInk }]}>{t('courses.quickSetup.addAnother')}</Text>
        </Pressable>
        <Text style={[styles.hint, { color: tokens.muted }]}>
          {t('courses.quickSetup.hint')}
        </Text>
      </View>
    </CourseSheet>
  );
}

const styles = StyleSheet.create({
  rows: {
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  header: {
    fontSize: 13,
    fontWeight: '600',
  },
  rowWrap: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dotSpace: {
    width: 12,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  nameCol: {
    flex: 3,
  },
  codeCol: {
    flex: 2,
  },
  error: {
    fontSize: 13,
    marginLeft: 12 + spacing.sm,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },
  addLabel: {
    fontSize: 14.5,
    fontWeight: '600',
  },
  hint: {
    fontSize: 13,
  },
});
