import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { FormField, FormValues } from '../../services/edit/pdfForm';
import { useT } from '../../i18n/useT';
import { radii, spacing, touchSlop, useTheme } from '../../theme';

export type FormFillRequest = { name: string; fields: FormField[] };

type FormFillSheetProps = {
  form: FormFillRequest | null;
  // Resolves true once the copy is saved (the sheet closes); false keeps the answers on screen.
  onSave: (values: FormValues, opts: { flatten: boolean }) => Promise<boolean>;
  onClose: () => void;
};

function initialValues(fields: readonly FormField[]): FormValues {
  return Object.fromEntries(fields.map((f) => [f.name, f.value]));
}

// §12 D10: the PDF's form fields, one per row in the form's order: text (one line or several, kept
// to the field's length), checkboxes, and one-of choices (radio groups, dropdowns, list boxes) as
// chips. Saving always makes a filled copy; Flatten is off by default (a portal that wants it says
// so, and a flattened copy can't be filled in again).
export function FormFillSheet({ form, onSave, onClose }: FormFillSheetProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const [values, setValues] = useState<FormValues>({});
  const [dirty, setDirty] = useState(false);
  const [flatten, setFlatten] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!form) return;
    setValues(initialValues(form.fields));
    setDirty(false);
    setFlatten(false);
  }, [form]);

  const set = (name: string, value: string | boolean) => {
    setValues((v) => ({ ...v, [name]: value }));
    setDirty(true);
  };

  const save = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (await onSave(values, { flatten })) setDirty(false);
    } finally {
      setSaving(false);
    }
  }, [saving, onSave, values, flatten]);

  const close = useCallback(() => {
    if (saving) return;
    if (!dirty) {
      onClose();
      return;
    }
    Alert.alert(t('reader.form.discardTitle'), t('reader.form.discardBody'), [
      { text: t('reader.form.keepEditing'), style: 'cancel' },
      { text: t('reader.form.discard'), style: 'destructive', onPress: onClose },
    ]);
  }, [dirty, saving, onClose, t]);

  const chip = (label: string, selected: boolean, onPress: () => void, key: string) => (
    <Pressable
      key={key}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[styles.chip, { borderColor: selected ? tokens.accent : tokens.edge, backgroundColor: selected ? tokens.accentSoft : tokens.surface }]}
    >
      <Text style={[styles.chipLabel, { color: selected ? tokens.accentInk : tokens.ink }]}>{label}</Text>
    </Pressable>
  );

  const renderField = ({ item }: { item: FormField }) => {
    const value = values[item.name];
    if (item.kind === 'checkbox') {
      return (
        <View style={[styles.row, styles.checkRow, { borderColor: tokens.edge }]}>
          <Text style={[styles.label, styles.checkLabel, { color: tokens.ink }]}>{item.label}</Text>
          <Switch value={value === true} onValueChange={(on) => set(item.name, on)} accessibilityLabel={item.label} />
        </View>
      );
    }
    if (item.kind === 'choice') {
      const selected = typeof value === 'string' ? value : '';
      return (
        <View style={[styles.row, { borderColor: tokens.edge }]}>
          <Text style={[styles.label, { color: tokens.ink }]}>{item.label}</Text>
          <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={item.label}>
            {chip(t('reader.form.none'), selected === '', () => set(item.name, ''), '')}
            {item.options.map((option) => chip(option, selected === option, () => set(item.name, option), `o:${option}`))}
          </View>
        </View>
      );
    }
    return (
      <View style={[styles.row, { borderColor: tokens.edge }]}>
        <Text style={[styles.label, { color: tokens.ink }]}>{item.label}</Text>
        <TextInput
          value={typeof value === 'string' ? value : ''}
          onChangeText={(text) => set(item.name, text)}
          multiline={item.multiline}
          maxLength={item.maxLength}
          accessibilityLabel={item.label}
          textAlignVertical={item.multiline ? 'top' : 'center'}
          style={[styles.input, item.multiline && styles.multiline, { color: tokens.ink, backgroundColor: tokens.surface2, borderColor: tokens.edge }]}
        />
      </View>
    );
  };

  return (
    <Modal statusBarTranslucent navigationBarTranslucent visible={form !== null} animationType="slide" onRequestClose={close}>
      <SafeAreaView style={[styles.root, { backgroundColor: tokens.bg }]}>
        <View style={[styles.header, { borderBottomColor: tokens.edge }]}>
          <Pressable hitSlop={touchSlop(44)} accessibilityRole="button" style={styles.iconButton} onPress={close} accessibilityLabel={t('common.close')}>
            <Ionicons name="close" size={22} color={tokens.ink} />
          </Pressable>
          <View style={styles.titleWrap}>
            <Text style={[styles.title, { color: tokens.ink }]} numberOfLines={1}>
              {form?.name ?? ''}
            </Text>
            <Text style={[styles.subtitle, { color: tokens.muted }]}>{t('reader.form.fieldCount', { count: form?.fields.length ?? 0 })}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: saving }}
            disabled={saving}
            onPress={() => void save()}
            style={[styles.saveButton, { backgroundColor: tokens.accent, opacity: saving ? 0.5 : 1 }]}
          >
            {saving ? <ActivityIndicator color={tokens.onAccent} size="small" /> : <Text style={[styles.saveLabel, { color: tokens.onAccent }]}>{t('reader.form.save')}</Text>}
          </Pressable>
        </View>
        <View style={[styles.banner, { backgroundColor: tokens.surface2 }]}>
          <Text style={[styles.bannerText, { color: tokens.muted }]}>{t('reader.form.copyNote')}</Text>
        </View>
        <KeyboardAvoidingView style={styles.root} behavior="padding">
          <FlatList
            data={form?.fields ?? []}
            keyExtractor={(f) => f.name}
            renderItem={renderField}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.list}
            ListFooterComponent={
              <View style={[styles.row, styles.checkRow, { borderColor: tokens.edge }]}>
                <View style={styles.checkLabel}>
                  <Text style={[styles.label, { color: tokens.ink }]}>{t('reader.form.flatten')}</Text>
                  <Text style={[styles.hint, { color: tokens.muted }]}>{t('reader.form.flattenHint')}</Text>
                </View>
                <Switch value={flatten} onValueChange={setFlatten} accessibilityLabel={t('reader.form.flatten')} />
              </View>
            }
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    height: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  titleWrap: { flex: 1 },
  title: { fontSize: 16, fontWeight: '600' },
  subtitle: { fontSize: 12.5 },
  saveButton: {
    minWidth: 72,
    height: 36,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveLabel: { fontSize: 15, fontWeight: '600' },
  banner: { padding: spacing.sm },
  bannerText: { fontSize: 12.5, textAlign: 'center' },
  list: { padding: spacing.md, gap: spacing.sm },
  row: {
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  checkRow: { flexDirection: 'row', alignItems: 'center' },
  checkLabel: { flex: 1, gap: 2 },
  label: { fontSize: 14.5, fontWeight: '600' },
  hint: { fontSize: 12.5 },
  input: {
    minHeight: 44,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    fontSize: 15,
  },
  multiline: { minHeight: 96, paddingVertical: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  chipLabel: { fontSize: 14 },
});
