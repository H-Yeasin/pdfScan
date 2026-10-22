import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { NameField } from '../deliver/NameField';
import { useT } from '../../i18n/useT';
import { DEFAULT_NAME_TEMPLATE, NAME_TOKENS } from '../../services/submit/naming';
import { spacing } from '../../theme';
import { Chip, Text } from '../ui';

type NameTemplateSectionProps = {
  template: string;
  onChange: (template: string) => void;
  // The name the template gives right now (FileNamesSheet works it out for every choice).
  example: string;
};

// §17 U10: File names → Custom… The template itself, chips that insert a token at the cursor, and
// the name it gives right now.
export function NameTemplateSection({ template, onChange, example }: NameTemplateSectionProps) {
  const { t } = useT();
  // Where a token chip inserts; the end until the field reports a cursor.
  const cursor = useRef<number | null>(null);

  const insertToken = (token: string) => {
    const at = Math.min(cursor.current ?? template.length, template.length);
    const text = `{${token}}`;
    onChange(template.slice(0, at) + text + template.slice(at));
    cursor.current = at + text.length;
  };

  return (
    <View style={styles.section}>
      <NameField
        label={t('settings.fileNames.template')}
        placeholder={DEFAULT_NAME_TEMPLATE}
        value={template}
        onChange={onChange}
        onSelectionChange={(selection) => {
          cursor.current = selection.end;
        }}
      />
      <View style={styles.chips}>
        {NAME_TOKENS.map((token) => (
          <Chip
            key={token}
            label={`{${token}}`}
            onPress={() => insertToken(token)}
            accessibilityLabel={t('settings.fileNames.insertToken', { token })}
          />
        ))}
      </View>
      <Text variant="caption" selectable>
        {example ? t('settings.fileNames.example', { name: `${example}.pdf` }) : t('settings.fileNames.exampleEmpty')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.md,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
