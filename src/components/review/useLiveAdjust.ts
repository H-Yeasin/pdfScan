import { useEffect } from 'react';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import type { AdjustValues } from '../../types/models';

// §16 G7: the sliders' values as they are under the finger, one shared value each. A slider
// writes its own from the UI thread on every frame of a drag, and the preview draws from them
// (FilteredPreview) - nothing on the way goes through React, so Review doesn't render while a
// slider moves. The store still gets one value, on release (AdjustSlider's onCommit).
export type LiveAdjust = { readonly [K in keyof AdjustValues]: SharedValue<number> };

// Follows `committed` (another page, undo, Reset, "apply to all"); between two commits the
// sliders own the values.
export function useLiveAdjust(committed: AdjustValues): LiveAdjust {
  const brightness = useSharedValue(committed.brightness);
  const contrast = useSharedValue(committed.contrast);
  const saturation = useSharedValue(committed.saturation);
  useEffect(() => {
    brightness.value = committed.brightness;
    contrast.value = committed.contrast;
    saturation.value = committed.saturation;
  }, [brightness, contrast, saturation, committed.brightness, committed.contrast, committed.saturation]);
  // The shared values never change identity, so neither needs this object to.
  return { brightness, contrast, saturation };
}
