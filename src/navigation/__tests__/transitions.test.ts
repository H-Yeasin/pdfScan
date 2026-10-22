import { Animated } from 'react-native';
import {
  FADE_DURATION_MS,
  modalAnimation,
  pickTransition,
  RESTING_STYLE,
  SLIDE_DURATION_MS,
  transitionDuration,
  transitionStyle,
} from '../transitions';

const size = { width: 400, height: 800 };
const keysOf = (style: object | undefined) => (style && 'transform' in style ? (style.transform as object[]).map((t) => Object.keys(t)[0]) : []);

describe('picking a transition (§17 U13)', () => {
  it('slides a push and a pop', () => {
    expect(pickTransition('slide', 'library', 'reader', 'fwd', false)).toBe('push');
    expect(pickTransition('slide', 'reader', 'library', 'back', false)).toBe('push');
  });

  it('cross-fades a tab switch', () => {
    expect(pickTransition('fade', 'home', 'library', 'fwd', false)).toBe('tab');
  });

  it('brings a modal screen up and takes it down again', () => {
    expect(pickTransition('slide', 'reader', 'pro', 'fwd', false)).toBe('modal');
    expect(pickTransition('slide', 'pro', 'reader', 'back', false)).toBe('modal');
    // A push onwards from a modal screen is an ordinary push.
    expect(pickTransition('slide', 'academicOptions', 'pro', 'fwd', false)).toBe('modal');
    expect(pickTransition('slide', 'pro', 'storage', 'fwd', false)).toBe('push');
  });

  it('cross-fades everything under reduced motion (§9 O4b)', () => {
    expect(pickTransition('slide', 'library', 'reader', 'fwd', true)).toBe('fade');
    expect(pickTransition('fade', 'home', 'library', 'fwd', true)).toBe('fade');
    expect(pickTransition('slide', 'reader', 'pro', 'fwd', true)).toBe('fade');
    expect(modalAnimation(true)).toBe('fade');
    expect(modalAnimation(false)).toBe('slide');
  });

  it('times a tab switch shorter than a slide', () => {
    expect(transitionDuration('tab')).toBe(FADE_DURATION_MS);
    expect(transitionDuration('fade')).toBe(FADE_DURATION_MS);
    expect(transitionDuration('push')).toBe(SLIDE_DURATION_MS);
    expect(transitionDuration('modal')).toBe(SLIDE_DURATION_MS);
  });
});

describe('transition styles', () => {
  const progress = new Animated.Value(0);

  it('slide a push horizontally', () => {
    const style = transitionStyle(progress, size, 'incoming', 'fwd', 'push');
    expect(keysOf(style)).toEqual(['translateX', 'translateY']);
    expect(style).not.toHaveProperty('opacity');
  });

  it('fade in place under reduced motion', () => {
    expect(transitionStyle(progress, size, 'incoming', 'fwd', 'fade')).toEqual({ opacity: progress });
    const outgoing = transitionStyle(progress, size, 'outgoing', 'back', 'fade');
    expect(outgoing).toHaveProperty('opacity');
    expect(outgoing).not.toHaveProperty('transform');
  });

  it('cross-fade a tab switch, the incoming root rising', () => {
    const incoming = transitionStyle(progress, size, 'incoming', 'fwd', 'tab');
    expect(incoming).toHaveProperty('opacity', progress);
    expect(keysOf(incoming)).toEqual(['translateX', 'translateY']);
    expect(transitionStyle(progress, size, 'outgoing', 'fwd', 'tab')).not.toHaveProperty('transform');
  });

  it('move only the modal screen', () => {
    expect(keysOf(transitionStyle(progress, size, 'incoming', 'fwd', 'modal'))).toEqual(['translateX', 'translateY']);
    expect(transitionStyle(progress, size, 'outgoing', 'fwd', 'modal')).toBeUndefined();
    expect(transitionStyle(progress, size, 'incoming', 'back', 'modal')).toBeUndefined();
    expect(keysOf(transitionStyle(progress, size, 'outgoing', 'back', 'modal'))).toEqual(['translateX', 'translateY']);
  });

  // Fabric asserts these keep their types after the native driver animated them (RN 0.86).
  it('keep transform an array (both axes) and opacity a number at rest', () => {
    expect(Array.isArray(RESTING_STYLE.transform)).toBe(true);
    expect(keysOf(RESTING_STYLE)).toEqual(['translateX', 'translateY']);
    expect(typeof RESTING_STYLE.opacity).toBe('number');
  });
});
