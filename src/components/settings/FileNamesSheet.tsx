import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '../../i18n/useT';
import { FALLBACK_NAME_TEMPLATE, NAME_PRESETS, namePresetFor, suggestName, type NamingContext } from '../../services/submit/naming';
import { useAppDispatch, useAppSelector } from '../../store/AppStateContext';
import { spacing } from '../../theme';
import { Button, Card, Divider, ListItem, Sheet, Text } from '../ui';
import { NameTemplateSection } from './NameTemplateSection';

// §17 U10: Me → File names. The presets, each with the name it gives right now (the real profile
// and the first course), then Custom…, which opens the token editor. A choice is saved at once
// (settings/SET_NAME_TEMPLATE), so Done only closes.
export function FileNamesSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t, locale } = useT();
  const dispatch = useAppDispatch();
  const template = useAppSelector((s) => s.settings.nameTemplate);
  const profile = useAppSelector((s) => s.settings.profile);
  // A stand-in for the examples when there are no courses yet.
  const firstCourse = useAppSelector((s) => s.library.courses.find((c) => !c.archived));
  // Custom… was tapped while the template is still a preset: the editor opens on that preset.
  const [editing, setEditing] = useState(false);
  const preset = namePresetFor(template);
  const custom = editing || preset === 'custom';

  const ctx = useMemo<NamingContext>(
    () => ({
      profile,
      course: firstCourse ?? { name: t('settings.fileNames.sampleCourse'), code: 'PHY 101' },
      docType: 'assignment',
      n: 3,
      date: new Date(),
      title: t('settings.fileNames.sampleTitle'),
    }),
    // `locale`: t is one function for every language, so the language is the dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile, firstCourse, locale]
  );
  // suggestName, not renderTemplate: the default shows what a scan would really get, which is the
  // fallback while the profile has no name or roll.
  const exampleOf = (value: string) => {
    const name = suggestName(value, ctx);
    return name ? `${name}.pdf` : t('settings.fileNames.exampleEmptyShort');
  };

  const setTemplate = (value: string) => dispatch({ type: 'settings/SET_NAME_TEMPLATE', template: value });
  const close = () => {
    setEditing(false);
    onClose();
  };

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={t('settings.fileNames.section')}
      footer={<Button label={t('common.done')} onPress={close} fullWidth />}
      testID="file-names-sheet"
    >
      <Card padded={false} elevation={0} tone="tinted">
        {NAME_PRESETS.map((p, i) => (
          <View key={p.id}>
            {i > 0 ? <Divider inset="text" /> : null}
            <ListItem
              title={t(p.labelKey)}
              subtitle={exampleOf(p.template)}
              radioSelected={!custom && preset === p.id}
              onPress={() => {
                setEditing(false);
                setTemplate(p.template);
              }}
              testID={`name-preset-${p.id}`}
            />
          </View>
        ))}
        <Divider inset="text" />
        <ListItem
          title={t('settings.fileNames.custom')}
          subtitle={preset === 'custom' ? exampleOf(template) : t('settings.fileNames.customHint')}
          radioSelected={custom}
          onPress={() => setEditing(true)}
          testID="name-preset-custom"
        />
      </Card>
      {custom ? <NameTemplateSection template={template} onChange={setTemplate} example={suggestName(template, ctx)} /> : null}
      <Text variant="caption" color="muted" style={styles.footnote}>
        {t('settings.fileNames.footnote', { fallback: FALLBACK_NAME_TEMPLATE })}
      </Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  footnote: {
    paddingHorizontal: spacing.xs,
  },
});
