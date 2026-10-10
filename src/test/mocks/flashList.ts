import { createElement, forwardRef } from 'react';
import { FlatList, type FlatListProps } from 'react-native';

// Stands in for @shopify/flash-list (§16 G6). The real list measures its rows over several
// frames, which outlives a test and never settles under Node; a FlatList renders the same rows
// from the same props (data, renderItem, keyExtractor, numColumns, the header and footer).
export const FlashList = forwardRef(function FlashList(props: FlatListProps<unknown>, ref) {
  return createElement(FlatList, { ...props, ref } as FlatListProps<unknown>);
});
