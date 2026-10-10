import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '../../i18n/useT';
import { MIN_TOUCH, radii, spacing, typeScale, useTheme } from '../../theme';

type CellDetailSheetProps = {
  // null: closed. "C12", and everything the cell holds.
  cell: { address: string; text: string } | null;
  onCopy: (text: string) => void;
  onClose: () => void;
};

// The share of the window's height the text may take.
const TEXT_SHARE = 0.5;

// §18 W21: a cell's whole text. The grid shows one line per cell, cut at the column's width; a tap
// on a cell opens this, with the cell's name and Copy.
export function CellDetailSheet({ cell, onCopy, onClose }: CellDetailSheetProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();

  return (
    <Modal statusBarTranslucent navigationBarTranslucent transparent visible={cell !== null} animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} style={styles.backdrop} onPress={onClose}>
        <Pressable
          accessible={false}
          style={[
            styles.sheet,
            { backgroundColor: tokens.surface, paddingBottom: insets.bottom + spacing.md, paddingLeft: insets.left, paddingRight: insets.right },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: tokens.edge }]} />
          <View style={styles.head}>
            <Text accessibilityRole="header" style={[styles.title, { color: tokens.ink }]}>
              {t('reader.cell.title', { address: cell?.address ?? '' })}
            </Text>
            <Pressable accessibilityRole="button" style={styles.copy} onPress={() => cell && onCopy(cell.text)}>
              <Text style={[styles.copyText, { color: tokens.accentInk }]}>{t('reader.cell.copy')}</Text>
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: window.height * TEXT_SHARE }} contentContainerStyle={styles.body}>
            <Text selectable style={[styles.text, { color: tokens.ink }]}>
              {cell?.text ?? ''}
            </Text>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radii.card * 2, borderTopRightRadius: radii.card * 2, paddingTop: spacing.sm },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.lg, paddingRight: spacing.sm },
  title: { flex: 1, fontWeight: '700' },
  copy: { minHeight: MIN_TOUCH, minWidth: MIN_TOUCH, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center' },
  copyText: { fontWeight: '700' },
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  text: { fontSize: typeScale.body.fontSize, lineHeight: typeScale.body.lineHeight, fontFamily: typeScale.body.fontFamily },
});
