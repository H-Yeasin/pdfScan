import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '../../i18n/useT';
import { radii, spacing, typeScale, useTheme } from '../../theme';

type PageTextSheetProps = {
  visible: boolean;
  // "Page 12 of 300".
  title: string;
  // The page's text; '' when it has none. Called each time the sheet opens.
  load: () => Promise<string>;
  onClose: () => void;
};

// The share of the window's height the text may take.
const TEXT_SHARE = 0.6;

// §18 W11 (A14): a page's text as plain text, for a screen reader's "Read page text" action on the
// page surface (a page there is a picture). OCR text for a scan, the PDF's own for the rest.
export function PageTextSheet({ visible, title, load, onClose }: PageTextSheetProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  // null while it is being read.
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setText(null);
    load()
      .then((found) => {
        if (!cancelled) setText(found.trim());
      })
      .catch(() => {
        if (!cancelled) setText('');
      });
    return () => {
      cancelled = true;
    };
    // `load` is a new function each render; the sheet reads once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <Modal statusBarTranslucent navigationBarTranslucent transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} style={styles.backdrop} onPress={onClose}>
        <Pressable
          accessible={false}
          style={[
            styles.sheet,
            { backgroundColor: tokens.surface, paddingBottom: insets.bottom + spacing.md, paddingLeft: insets.left, paddingRight: insets.right },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: tokens.edge }]} />
          <Text accessibilityRole="header" style={[styles.title, { color: tokens.ink }]}>
            {title}
          </Text>
          <ScrollView style={{ maxHeight: window.height * TEXT_SHARE }} contentContainerStyle={styles.body}>
            {text ? (
              <Text selectable style={[styles.text, { color: tokens.ink }]}>
                {text}
              </Text>
            ) : (
              <Text accessibilityLiveRegion="polite" style={[styles.text, { color: tokens.muted }]}>
                {text === null ? t('reader.pageText.loading') : t('reader.pageText.none')}
              </Text>
            )}
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
  title: { fontWeight: '700', paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  text: { fontSize: typeScale.body.fontSize, lineHeight: typeScale.body.lineHeight, fontFamily: typeScale.body.fontFamily },
});
