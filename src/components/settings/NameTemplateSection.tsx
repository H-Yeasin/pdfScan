import { useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { NameField } from '../deliver/NameField';
import { Pill } from '../shared/Pill';
import { DEFAULT_NAME_TEMPLATE, NAME_TOKENS, suggestName } from '../../services/submit/naming';
import { useAppState } from '../../store/AppStateContext';
import { spacing, useTheme } from '../../theme';

// A stand-in for the live example when there are no courses yet.
const SAMPLE_COURSE = { name: 'Physics', code: 'PHY 101' };

// Settings editor for settings.nameTemplate: the template itself, chips that insert a token at
// the cursor, and the name it gives right now, with the real profile and the first course.
export function NameTemplateSection() {
  const { tokens } = useTheme();
  const { state, dispatch } = useAppState();
  const { nameTemplate, profile } = state.settings;
  const course = state.library.courses.find((c) => !c.archived) ?? SAMPLE_COURSE;
  // Where a token chip inserts; the end until the field reports a cursor.
  const cursor = useRef<number | null>(null);

  const setTemplate = (template: string) => dispatch({ type: 'settings/SET_NAME_TEMPLATE', template });

  const insertToken = (token: string) => {
    const at = Math.min(cursor.current ?? nameTemplate.length, nameTemplate.length);
    const text = `{${token}}`;
    setTemplate(nameTemplate.slice(0, at) + text + nameTemplate.slice(at));
    cursor.current = at + text.length;
  };

  const example = useMemo(
    () =>
      suggestName(nameTemplate, {
        profile,
        course,
        docType: 'assignment',
        n: 3,
        date: new Date(),
        title: "Ohm's law",
      }),
    [nameTemplate, profile, course]
  );

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: tokens.muted }]}>File names</Text>
      <NameField
        label="Naming template"
        placeholder={DEFAULT_NAME_TEMPLATE}
        value={nameTemplate}
        onChange={setTemplate}
        onSelectionChange={(selection) => {
          cursor.current = selection.end;
        }}
      />
      <View style={styles.chips}>
        {NAME_TOKENS.map((token) => (
          <Pressable key={token} onPress={() => insertToken(token)} accessibilityRole="button" accessibilityLabel={`Insert ${token}`}>
            <Pill backgroundColor={tokens.surface} borderColor={tokens.edge} textColor={tokens.ink}>{`{${token}}`}</Pill>
          </Pressable>
        ))}
      </View>
      <Text style={[styles.footnote, { color: tokens.ink }]} selectable>
        Example: {example ? `${example}.pdf` : '(empty: scans are named Scan_<date>)'}
      </Text>
      {nameTemplate !== DEFAULT_NAME_TEMPLATE ? (
        <Pressable onPress={() => setTemplate(DEFAULT_NAME_TEMPLATE)} accessibilityRole="button" hitSlop={8}>
          <Text style={[styles.link, { color: tokens.accentInk }]}>Reset to {DEFAULT_NAME_TEMPLATE}</Text>
        </Pressable>
      ) : null}
      <Text style={[styles.footnote, { color: tokens.muted }]}>
        Used to name new scans in Deliver. Without a name and roll in your profile, the default
        becomes {'{course}_{type}{n}_{date}'}. Empty parts are left out.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.md,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  footnote: {
    fontSize: 12.5,
    lineHeight: 17,
  },
  link: {
    fontSize: 13.5,
    fontWeight: '600',
  },
});
