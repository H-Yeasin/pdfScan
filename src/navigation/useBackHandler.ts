import { useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';
import { useScreenRole } from './screenRole';

// §9 O1: lets an inline overlay (a panel or find bar that isn't an RN `Modal`) take the Android
// back press while it's open. RN calls the most recently added listener first, and this one is
// added when `enabled` turns true - after AppNavigator's app-level listener, which is added once at
// boot - so the overlay closes before the screen navigates. RN `Modal`s don't need this: their
// `onRequestClose` gets the press before any listener.
//
// The callback is read through a ref so a re-render doesn't re-register (which would move the
// listener above overlays opened later).
//
// §16 G2: only on the active screen. A screen left with an overlay open stays mounted under the
// next one (or on another tab), and its overlay mustn't take the press from what's on screen.
export function useBackHandler(onBack: () => void, enabled = true) {
  const ref = useRef(onBack);
  ref.current = onBack;
  const active = useScreenRole() === 'active';
  const on = enabled && active;

  useEffect(() => {
    if (!on) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      ref.current();
      return true;
    });
    return () => sub.remove();
  }, [on]);
}
