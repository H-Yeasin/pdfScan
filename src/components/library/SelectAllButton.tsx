import { Pressable, StyleSheet, Text } from 'react-native';
import { spacing, touchSlop, useTheme, CHROME_MAX_FONT_SCALE } from '../../theme';
import { useT } from '../../i18n/useT';
import { useAppDispatch } from '../../store/AppStateContext';

type SelectAllButtonProps = {
  // The ids the list shows right now (tab, course, filters and search applied): Select all never
  // reaches a document the student can't see.
  visibleIds: readonly string[];
  selection: ReadonlySet<string>;
};

// §14 Q5: "Select all" in a selection header; once everything visible is selected it turns into
// "Select none", which keeps selection mode on (the X leaves it).
export function SelectAllButton({ visibleIds, selection }: SelectAllButtonProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const dispatch = useAppDispatch();
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selection.has(id));
  if (visibleIds.length === 0) return null;

  return (
    <Pressable
      testID="select-all"
      hitSlop={touchSlop(44)}
      accessibilityRole="button"
      style={styles.button}
      onPress={() => dispatch({ type: 'libraryUi/SELECT_ALL', ids: allSelected ? [] : [...visibleIds] })}
    >
      <Text maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE} numberOfLines={1} style={[styles.label, { color: tokens.accentInk }]}>
        {allSelected ? t('library.selectNone') : t('library.selectAll')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    marginLeft: 'auto',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
});
