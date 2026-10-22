import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { spacing } from '../../theme';
import { Card, Divider, Text } from '../ui';

type SettingsGroupProps = {
  title: string;
  // Under the card: what the rows don't say themselves (where the data goes, what an ad sees).
  footnote?: string;
  children: ReactNode;
};

// §17 U10: one group of Me: an overline, then one card of rows with a divider between each two.
// A row that isn't there (`{android && <ListItem …/>}`) leaves no divider behind, and a group with
// no rows at all isn't drawn.
export function SettingsGroup({ title, footnote, children }: SettingsGroupProps) {
  const rows = Children.toArray(children).filter(isValidElement);
  if (rows.length === 0) return null;
  return (
    <View style={styles.group}>
      <Text variant="overline" color="muted" accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      <Card padded={false} style={Platform.OS === 'android' && styles.clip}>
        {rows.map((row, i) => (
          <Fragment key={row.key ?? i}>
            {i > 0 ? <Divider inset="icon" /> : null}
            {row}
          </Fragment>
        ))}
      </Card>
      {footnote ? (
        <Text variant="caption" color="muted" style={styles.footnote}>
          {footnote}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: spacing.sm,
  },
  title: {
    paddingHorizontal: spacing.xs,
  },
  // The first and last rows' ripple stays inside the corners. Android only, as in Card: on iOS the
  // clip would cut the shadow (and iOS has no ripple).
  clip: {
    overflow: 'hidden',
  },
  footnote: {
    paddingHorizontal: spacing.xs,
  },
});
