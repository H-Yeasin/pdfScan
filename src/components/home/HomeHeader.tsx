import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { useT } from '../../i18n/useT';
import { useRouter } from '../../navigation/router';
import { dayPart, greetingName } from '../../services/courses/homeSelectors';
import { useAppDispatch, useAppSelector } from '../../store/AppStateContext';
import { ICON_SIZE, ICONS, radii, spacing, useTheme } from '../../theme';
import type { Semester } from '../../types/models';
import { Chip, FIELD_HEIGHT, Text, Touchable } from '../ui';

type HomeHeaderProps = {
  // The semester Home shows; null without semesters (no chip then).
  shown: Semester | null;
  // Home's day clock (useDayClock), for the time of day.
  now: number;
  onOpenSemesters: () => void;
};

// §17 U6: "Good morning, Rahim", the shown semester as a chip that opens the switcher, and a search
// bar that is one tap to searching everything (it opens Files with the search field focused).
export function HomeHeader({ shown, now, onOpenSemesters }: HomeHeaderProps) {
  const { t } = useT();
  const name = useAppSelector((s) => greetingName(s.settings.profile));
  const greeting = name ? t(`home.greeting.${dayPart(new Date(now).getHours())}`, { name }) : t('home.greetingNoName');

  return (
    <View style={styles.header}>
      <Text variant="headline" accessibilityRole="header" numberOfLines={2}>
        {greeting}
      </Text>
      {shown ? (
        <Chip
          label={shown.name}
          icon={ICONS.timetable}
          onPress={onOpenSemesters}
          accessibilityLabel={t('home.semesterA11y', { name: shown.name })}
          testID="home-semester"
        />
      ) : null}
      <SearchEntry />
    </View>
  );
}

// Looks like a TextField; it is a button (typing happens in Files, where the results are).
function SearchEntry() {
  const { tokens } = useTheme();
  const { t } = useT();
  const { go } = useRouter();
  const dispatch = useAppDispatch();
  return (
    <Touchable
      accessibilityRole="search"
      accessibilityLabel={t('home.search')}
      accessibilityHint={t('home.searchHint')}
      scale={false}
      testID="home-search"
      onPress={() => {
        dispatch({ type: 'libraryUi/OPEN_SEARCH' });
        go('library');
      }}
      style={[styles.search, { backgroundColor: tokens.surface, borderColor: tokens.edge }]}
    >
      <Ionicons name={ICONS.find} size={ICON_SIZE.row} color={tokens.muted} />
      <Text color="muted" numberOfLines={1} style={styles.searchText}>
        {t('home.search')}
      </Text>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.sm,
  },
  search: {
    marginTop: spacing.xs,
    height: FIELD_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.input,
    borderWidth: 1,
  },
  searchText: {
    flex: 1,
  },
});
