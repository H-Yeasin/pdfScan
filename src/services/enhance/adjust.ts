import type { AdjustValues } from '../../types/models';

export const DEFAULT_ADJUST: AdjustValues = { brightness: 0, contrast: 0, saturation: 0 };

export function isDefaultAdjust(adjust: AdjustValues): boolean {
  return adjust.brightness === 0 && adjust.contrast === 0 && adjust.saturation === 0;
}
