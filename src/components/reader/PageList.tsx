import { forwardRef } from 'react';
import { Dimensions, FlatList, NativeScrollEvent, NativeSyntheticEvent, Pressable, StyleSheet, View } from 'react-native';
import { NightImage } from './NightImage';
import { ZoomableImage } from '../shared/ZoomableImage';
import type { LibraryPage } from '../../types/models';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PAGE_HORIZONTAL_MARGIN = 20;
const PAGE_WIDTH = SCREEN_WIDTH - PAGE_HORIZONTAL_MARGIN * 2;
const PAGE_HEIGHT = (PAGE_WIDTH * 4) / 3;
export const PAGE_SLOT = PAGE_HEIGHT + 16;

type PageListProps = {
  pages: LibraryPage[];
  night: boolean;
  onTapCenter: () => void;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  highlightedIndex?: number;
};

export const PageList = forwardRef<FlatList<LibraryPage>, PageListProps>(function PageList(
  { pages, night, onTapCenter, onScroll, highlightedIndex },
  ref
) {
  return (
    <FlatList
      ref={ref}
      data={pages}
      keyExtractor={(page) => page.id}
      contentContainerStyle={styles.content}
      onScroll={onScroll}
      scrollEventThrottle={32}
      getItemLayout={(_, index) => ({ length: PAGE_SLOT, offset: PAGE_SLOT * index, index })}
      renderItem={({ item, index }) => (
        <Pressable onPress={onTapCenter} style={styles.pageWrap}>
          <View style={[styles.page, highlightedIndex === index && styles.pageHighlighted]}>
            {night ? <NightImage uri={item.fileUri} /> : <ZoomableImage uri={item.fileUri} panEnabled={false} />}
          </View>
        </Pressable>
      )}
    />
  );
});

const styles = StyleSheet.create({
  content: {
    paddingTop: 64,
    paddingBottom: 96,
    paddingHorizontal: PAGE_HORIZONTAL_MARGIN,
    gap: 16,
  },
  pageWrap: {
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
  },
  page: {
    flex: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  pageHighlighted: {
    borderWidth: 2,
    borderColor: '#1abc9c',
  },
});
