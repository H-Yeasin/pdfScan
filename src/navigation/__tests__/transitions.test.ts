import { Animated } from 'react-native';
import { transitionStyle } from '../transitions';

describe('screen transitions', () => {
  const progress = new Animated.Value(0);

  it('slide horizontally by default', () => {
    const style = transitionStyle(progress, 400, 'incoming', 'fwd', false);
    expect(style).toHaveProperty('transform');
    expect(style).not.toHaveProperty('opacity');
  });

  it('fade in place when the system asks for reduced motion (§9 O4b)', () => {
    const incoming = transitionStyle(progress, 400, 'incoming', 'fwd', true);
    const outgoing = transitionStyle(progress, 400, 'outgoing', 'back', true);
    expect(incoming).toEqual({ opacity: progress });
    expect(outgoing).toHaveProperty('opacity');
    expect(outgoing).not.toHaveProperty('transform');
  });
});
