import { StyleSheet, View } from 'react-native';
import { spacing, type IoniconName } from '../../theme';
import { Divider, ListItem, Sheet, Text } from '../ui';

export type Choice<Id extends string> = {
  id: Id;
  label: string;
  subtitle?: string;
  icon?: IoniconName;
  // Shown, not choosable (a recognition script that's coming).
  disabled?: boolean;
};

type ChoiceSheetProps<Id extends string> = {
  visible: boolean;
  onClose: () => void;
  title: string;
  choices: Choice<Id>[];
  value: Id;
  onChange: (id: Id) => void;
  // Under the choices: what the choice changes.
  footnote?: string;
  testID?: string;
};

// §17 U10: one of a few values (the default scan mode, the recognition script, the theme, a
// language). Radio rows with the current one ticked; a pick is saved and closes the sheet. A Menu
// can't show which item is the current one.
export function ChoiceSheet<Id extends string>({ visible, onClose, title, choices, value, onChange, footnote, testID }: ChoiceSheetProps<Id>) {
  const withIcons = choices.some((c) => c.icon);
  return (
    <Sheet visible={visible} onClose={onClose} title={title} testID={testID}>
      <View accessibilityRole="radiogroup" style={styles.rows}>
        {choices.map((choice, i) => (
          <View key={choice.id}>
            {i > 0 ? <Divider inset={withIcons ? 'icon' : 'text'} /> : null}
            <ListItem
              icon={choice.icon}
              title={choice.label}
              subtitle={choice.subtitle}
              radioSelected={choice.id === value}
              disabled={choice.disabled}
              onPress={() => {
                onChange(choice.id);
                onClose();
              }}
              testID={testID ? `${testID}-${choice.id}` : undefined}
            />
          </View>
        ))}
      </View>
      {footnote ? (
        <Text variant="caption" color="muted">
          {footnote}
        </Text>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  // The rows pad themselves; the sheet's body padding would double it.
  rows: {
    marginHorizontal: -spacing.lg,
  },
});
