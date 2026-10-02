import { Platform } from 'react-native';

// §9 O5: FlatList windowing for the document lists (Library, Course). Rows vary in height (search
// snippets, index notes), so there's no getItemLayout; a smaller window and batch keep a
// 500-document list cheap on a mid-range phone. Measured numbers: docs/qa/performance.md.
export const DOC_LIST_TUNING = {
  initialNumToRender: 12,
  maxToRenderPerBatch: 8,
  windowSize: 7,
  // Detaches off-screen rows' native views; only reliable on Android.
  removeClippedSubviews: Platform.OS === 'android',
} as const;
