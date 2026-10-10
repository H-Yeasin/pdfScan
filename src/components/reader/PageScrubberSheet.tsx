import { useEffect, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SegmentedControl } from '../shared/SegmentedControl';
import { radii, spacing, useTheme } from '../../theme';
import { useT } from '../../i18n/useT';
import { sectionIndex, type OutlineEntry } from '../../services/reader/outline';
import type { LibraryPage } from '../../types/models';
import { PageThumb } from '../shared/PageThumb';
import { OutlineList } from './OutlineList';

const THUMB_WIDTH = 72;
const THUMB_GAP = spacing.sm;

type PageScrubberSheetProps = {
  visible: boolean;
  // The pages' document: a page without a thumbnail gets one made (§16 G6).
  documentId: string;
  pages: LibraryPage[];
  // The library page on screen, outlined and scrolled into view.
  currentIdx: number;
  onPick: (idx: number) => void;
  // §18 W11: the PDF's outline (the page surface reads it). With entries the sheet has two tabs,
  // "Pages | Contents"; an entry's page is a page of the file, 0-based.
  outline?: OutlineEntry[];
  onPickOutline?: (page: number) => void;
  onClose: () => void;
};

type Tab = 'pages' | 'contents';
// The share of the window's height the contents list may take (the sheet is short in landscape).
const CONTENTS_SHARE = 0.55;

// §7 R4: every page of the document as a strip of thumbnails (F5's for scans, R1's for imported
// PDFs); tapping one jumps there. A page without a thumbnail shows its number only.
// §18 W11: a PDF with an outline also has a Contents tab (OutlineList). The tab last used stays
// for as long as the document is open.
export function PageScrubberSheet({ visible, documentId, pages, currentIdx, onPick, outline, onPickOutline, onClose }: PageScrubberSheetProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const listRef = useRef<FlatList<LibraryPage>>(null);
  const hasContents = !!outline?.length && !!onPickOutline;
  const [picked, setPicked] = useState<Tab>('pages');
  const tab: Tab = hasContents ? picked : 'pages';

  useEffect(() => {
    if (!visible || tab !== 'pages' || currentIdx <= 0) return;
    const timer = setTimeout(() => listRef.current?.scrollToIndex({ index: currentIdx, viewPosition: 0.5, animated: false }), 0);
    return () => clearTimeout(timer);
  }, [visible, tab, currentIdx]);

  return (
    <Modal statusBarTranslucent navigationBarTranslucent transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} style={styles.backdrop} onPress={onClose}>
        {/* The body takes its own taps: one on a heading that goes nowhere must not close the sheet. */}
        <Pressable
          accessible={false}
          style={[
            styles.sheet,
            { backgroundColor: tokens.surface, paddingBottom: insets.bottom + spacing.md, paddingLeft: insets.left, paddingRight: insets.right },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: tokens.edge }]} />
          {hasContents ? (
            <View style={styles.tabs}>
              <SegmentedControl<Tab>
                segments={[
                  { id: 'pages', label: t('reader.pages') },
                  { id: 'contents', label: t('reader.contents') },
                ]}
                value={tab}
                onChange={setPicked}
              />
            </View>
          ) : (
            <Text style={[styles.title, { color: tokens.ink }]}>{t('reader.pages')}</Text>
          )}
          {tab === 'contents' && outline && onPickOutline ? (
            // Mounted when the sheet opens, so it starts on the section being read each time.
            visible ? (
              <OutlineList entries={outline} currentIndex={sectionIndex(outline, currentIdx)} onPick={onPickOutline} maxHeight={window.height * CONTENTS_SHARE} />
            ) : null
          ) : (
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
                return (
                  <Pressable accessibilityRole="button"
                    onPress={() => onPick(index)}
                    style={[styles.thumb, { borderColor: index === currentIdx ? tokens.accent : tokens.edge, backgroundColor: tokens.surface2 }]}
                    accessibilityLabel={t('reader.pageIndicator', { page: index + 1, count: pages.length })}
                  >
                    <PageThumb documentId={documentId} page={item} style={styles.image} />
                    <View style={styles.number}>
                      <Text style={styles.numberText}>{index + 1}</Text>
                    </View>
                  </Pressable>
                );
              }}
            />
          )}
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
  tabs: { paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
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
