// §17 U9: the Save screen's "Size: Small · Medium · Original", over the 1-5 export quality
// (capture/imageSpec's presets) that the old slider set. Small stays readable for a page of
// handwriting; Original keeps the masters as they are.

export type SizeChoice = 'small' | 'medium' | 'original';

export const SIZE_CHOICES: readonly SizeChoice[] = ['small', 'medium', 'original'];

export const SIZE_QUALITY: Record<SizeChoice, number> = { small: 2, medium: 3, original: 5 };

// A quality the slider could set (1 and 4 too) shows as the nearest choice.
export function sizeChoiceOf(quality: number): SizeChoice {
  if (quality <= 2) return 'small';
  if (quality >= 5) return 'original';
  return 'medium';
}
