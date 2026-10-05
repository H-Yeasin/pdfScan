import { useEffect, useRef } from 'react';
import { FlatList, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radii, spacing, useTheme } from '../../theme';
import { useT } from '../../i18n/useT';
import type { LibraryPage } from '../../types/models';
import { rotationStyle } from '../../utils/rotation';

const THUMB_WIDTH = 72;
const THUMB_GAP = spacing.sm;

type PageScrubberSheetProps = {
  visible: boolean;
  pages: LibraryPage[];
  // The library page on screen, outlined and scrolled into view.
  currentIdx: number;
  onPick: (idx: number) => void;
  onClose: () => void;
};

// §7 R4: every page of the document as a strip of thumbnails (F5's for scans, R1's for imported
// PDFs); tapping one jumps there. A page without a thumbnail shows its number only.
export function PageScrubberSheet({ visible, pages, currentIdx, onPick, onClose }: PageScrubberSheetProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<LibraryPage>>(null);

  useEffect(() => {
    if (!visible || currentIdx <= 0) return;
    const timer = setTimeout(() => listRef.current?.scrollToIndex({ index: currentIdx, viewPosition: 0.5, animated: false }), 0);
    return () => clearTimeout(timer);
  }, [visible, currentIdx]);

  return (
    <Modal statusBarTranslucent navigationBarTranslucent transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityRole="button" style={styles.backdrop} onPress={onClose}>
        <View style={[styles.sheet, { backgroundColor: tokens.surface, paddingBottom: insets.bottom + spacing.md }]}>
          <View style={[styles.handle, { backgroundColor: tokens.edge }]} />
          <Text style={[styles.title, { color: tokens.ink }]}>{t('reader.pages')}</Text>
          <FlatList
            ref={listRef}
            horizontal
            data={pages}
            keyExtractor={(page) => page.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.strip}
            getItemLayout={(_, index) => ({ length: THUMB_WIDTH + THUMB_GAP, offset: (THUMB_WIDTH + THUMB_GAP) * index, index })}
            onScrollToIndexFailed={() => {}}
            renderItem={({ item, index }) => {
              const uri = item.thumbUri || item.fileUri;
              return (
                <Pressable accessibilityRole="button"
                  onPress={() => onPick(index)}
                  style={[styles.thumb, { borderColor: index === currentIdx ? tokens.accent : tokens.edge, backgroundColor: tokens.surface2 }]}
                  accessibilityLabel={t('reader.pageIndicator', { page: index + 1, count: pages.length })}
                >
                  {uri ? <Image source={{ uri }} style={[styles.image, rotationStyle(item.rotation)]} resizeMode="cover" /> : null}
                  <View style={styles.number}>
                    <Text style={styles.numberText}>{index + 1}</Text>
                  </View>
                </Pressable>
              );
            }}
          />
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radii.card * 2, borderTopRightRadius: radii.card * 2, paddingTop: spacing.sm },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: spacing.sm },
  title: { fontWeight: '700', paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  strip: { paddingHorizontal: spacing.lg, gap: THUMB_GAP },
  thumb: { width: THUMB_WIDTH, aspectRatio: 3 / 4, borderRadius: radii.thumb, borderWidth: 2, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  number: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    minWidth: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,.65)',
    alignItems: 'center',
  },
  numberText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
