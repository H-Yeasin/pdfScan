import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

export const INK_COLORS = ['#1a1a1a', '#1d4ed8', '#b91c1c'];

type SignaturePadProps = {
  strokeColor?: string;
  onChangeEmpty?: (empty: boolean) => void;
};

// Remount this component (e.g. via a `key` prop) to clear it — simpler and more reliable
// than imperative ref-based clearing for a component this small.
export function SignaturePad({ strokeColor = INK_COLORS[0], onChangeEmpty }: SignaturePadProps) {
  const [paths, setPaths] = useState<string[]>([]);
  const [current, setCurrent] = useState('');

  // Notified via effect, not from inside the setState updaters below — calling a parent
  // setState during another component's render (which updater functions can run in) trips
  // React's "Cannot update a component while rendering a different component" warning.
  useEffect(() => {
    onChangeEmpty?.(paths.length === 0 && current.length === 0);
  }, [paths, current, onChangeEmpty]);

  const appendPoint = (cmd: string) => {
    setCurrent((c) => c + cmd);
  };

  const commitStroke = () => {
    setCurrent((c) => {
      if (!c) return c;
      setPaths((p) => [...p, c]);
      return '';
    });
  };

  const pan = Gesture.Pan()
    .minDistance(0)
    .onStart((e) => {
      runOnJS(appendPoint)(`M${e.x.toFixed(1)},${e.y.toFixed(1)} `);
    })
    .onUpdate((e) => {
      runOnJS(appendPoint)(`L${e.x.toFixed(1)},${e.y.toFixed(1)} `);
    })
    .onEnd(() => {
      runOnJS(commitStroke)();
    });

  return (
    <GestureDetector gesture={pan}>
      <Svg style={styles.svg}>
        {paths.map((d, i) => (
          <Path key={i} d={d} stroke={strokeColor} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {current ? (
          <Path d={current} stroke={strokeColor} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ) : null}
      </Svg>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  svg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
