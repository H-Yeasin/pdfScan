import type { EnhanceMode } from '../../../types/models';

// §16 G3: the filter ids without the filters. Settings load at boot and only need to know which
// ids exist (settingsStorage.sanitizeDefaultEnhance); registry.ts brings every filter's shaders
// and colour maths with it, so it loads with Review, not at app start. registry.ts re-exports
// these, and filters/__tests__/filterIds.test.ts checks that FILTERS has exactly these ids, in
// this order, with the same `available` flags.

// In the Review picker's order.
export const FILTER_IDS: readonly EnhanceMode[] = ['original', 'auto', 'color', 'gray', 'ink', 'board', 'bw'];

// The ids whose FilterSpec has `available: true` (a filter whose pipeline isn't built yet is left
// out). Every filter is built today.
export const AVAILABLE_FILTER_IDS: readonly EnhanceMode[] = FILTER_IDS;
