import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

type SignaturePadProps = {
  strokeColor?: string;
  onChangeEmpty?: (empty: boolean) => void;
};

// Remount this component (e.g. via a `key` prop) to clear it — simpler and more reliable
// than imperative ref-based clearing for a component this small.
export function SignaturePad({ strokeColor = '#1a1a1a', onChangeEmpty }: SignaturePadProps) {
  const [paths, setPaths] = useState<string[]>([]);
  const [current, setCurrent] = useState('');

  const notifyEmpty = (nextPaths: string[], nextCurrent: string) => {
    onChangeEmpty?.(nextPaths.length === 0 && nextCurrent.length === 0);
  };

  const appendPoint = (cmd: string) => {
    setCurrent((c) => {
      const next = c + cmd;
      notifyEmpty(paths, next);
      return next;
    });
  };

  const commitStroke = () => {
    setCurrent((c) => {
      if (!c) return c;
      setPaths((p) => {
        const next = [...p, c];
        notifyEmpty(next, '');
        return next;
      });
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
