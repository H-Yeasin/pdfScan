import { createElement } from 'react';
import { View } from 'react-native';

// Stands in for expo-image (§16 G6): its native view doesn't load under Node. A plain View that
// keeps the props, so a test can read `source` and `recyclingKey`.
export function Image(props: Record<string, unknown>) {
  return createElement(View, props);
}
