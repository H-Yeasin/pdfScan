import { Animated } from 'react-native';
import { RESTING_STYLE, transitionStyle } from '../transitions';

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

  // Fabric asserts these keep their types after the native driver animated them (RN 0.86).
  it('keep transform an array and opacity a number at rest', () => {
    expect(Array.isArray(RESTING_STYLE.transform)).toBe(true);
    expect(typeof RESTING_STYLE.opacity).toBe('number');
  });
});
