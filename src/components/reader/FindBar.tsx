import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useT } from '../../i18n/useT';
import { CHROME_MAX_FONT_SCALE, spacing, touchSlop, useTheme } from '../../theme';

// What Find has found. `current` is the place of the match it is on (0: none chosen yet), only
// where the viewer can step through its matches (the page surface); the other viewers give a
// total alone. `scanning`: pages are still being read, so the total may grow ("3 of 27+").
export type FindCount = { total: number; current?: number; scanning?: boolean };

type Translate = ReturnType<typeof useT>['t'];

// The words next to the field: "3 of 27", "3 of 27+" while the search runs, "No matches" once it
// has ended with none, a bare total for a viewer without a current match, nothing without a query.
export function findCountLabel(query: string, count: FindCount, t: Translate): string {
  if (!query.trim()) return '';
  if (count.current === undefined) return String(count.total);
  if (count.total === 0) return count.scanning ? '' : t('reader.findNone');
  const total = `${count.total}${count.scanning ? '+' : ''}`;
  return count.current > 0 ? t('reader.findCount', { n: count.current, total }) : total;
}

type FindBarProps = {
  query: string;
  onChangeQuery: (value: string) => void;
  count: FindCount;
  // Next (1) or previous (-1) match. Undefined: the viewer has no current match to move.
  onStep?: (by: 1 | -1) => void;
  onClose: () => void;
};

// §18 W12: Find's row in the Reader's top bar, in place of the title row while Find is open: the
// query, the count, previous / next and close. The keyboard's search key goes to the next match
// and leaves the keyboard up.
export function FindBar({ query, onChangeQuery, count, onStep, onClose }: FindBarProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const label = findCountLabel(query, count, t);
  const canStep = !!onStep && count.total > 0;
  const stepColor = canStep ? tokens.ink : tokens.muted;

  return (
    <View style={styles.row}>
      <TextInput
        value={query}
        onChangeText={onChangeQuery}
        placeholder={t('reader.findPlaceholder')}
        placeholderTextColor={tokens.muted}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        submitBehavior="submit"
        onSubmitEditing={() => onStep?.(1)}
        style={[styles.input, { color: tokens.ink }]}
      />
      {label ? (
        <Text maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE} style={[styles.count, { color: tokens.muted }]} numberOfLines={1} accessibilityLiveRegion="polite">
          {label}
        </Text>
      ) : null}
      {onStep ? (
        <>
          <Pressable
            hitSlop={touchSlop(STEP_WIDTH)}
            style={styles.step}
            disabled={!canStep}
            onPress={() => onStep(-1)}
            accessibilityRole="button"
            accessibilityLabel={t('reader.findPrevious')}
            accessibilityState={{ disabled: !canStep }}
          >
            <Ionicons name="chevron-up" size={20} color={stepColor} />
          </Pressable>
          <Pressable
            hitSlop={touchSlop(STEP_WIDTH)}
            style={styles.step}
            disabled={!canStep}
            onPress={() => onStep(1)}
            accessibilityRole="button"
            accessibilityLabel={t('reader.findNext')}
            accessibilityState={{ disabled: !canStep }}
          >
            <Ionicons name="chevron-down" size={20} color={stepColor} />
          </Pressable>
        </>
      ) : null}
      <Pressable hitSlop={touchSlop(44)} style={styles.close} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')}>
        <Ionicons name="close" size={20} color={tokens.ink} />
      </Pressable>
    </View>
  );
}

// Narrower than the bar's other buttons, so the field keeps room on a small phone; the slop
// makes up the touch target.
const STEP_WIDTH = 36;

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingLeft: spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 15,
  },
  count: {
    fontSize: 13,
    paddingHorizontal: spacing.xs,
    fontVariant: ['tabular-nums'],
  },
  step: {
    width: STEP_WIDTH,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  close: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
