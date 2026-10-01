import { Skia } from '@shopify/react-native-skia';
import type { SkColorFilter, SkImage, SkShader } from '@shopify/react-native-skia';
import type { Ionicons } from '@expo/vector-icons';
import { autoMatrices, colorMatrices, grayMatrices } from './filterMath';
import type { ColorMatrix } from './filterMath';
import { makeSauvolaShader } from './sauvola';
import type { AdjustValues, EnhanceMode, FilterOptions, ImageStats } from '../../../types/models';

export type FilterContext = {
  image: SkImage;
  stats: ImageStats;
  width: number;
  height: number;
  adjust: AdjustValues;
  options: FilterOptions;
};

// A filter is either a colour filter applied while drawing the image (null = draw it untouched),
// or a shader that replaces the image entirely and is evaluated in the image's own pixel space.
export type FilterOutput = { colorFilter: SkColorFilter | null } | { shader: SkShader };

export type FilterSpec = {
  id: EnhanceMode;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  // Whether the brightness/contrast/saturation sliders apply (drawFiltered composes them on top).
  adjustable: boolean;
  // Whether the shared flat-field light correction runs before this filter. Nothing reads it yet:
  // E3 adds the correction pass, so every spec is false for now to keep output unchanged.
  lightCorrect: boolean;
  // False hides the filter from the Review picker. Ink (E4) and Board (E5) have registry entries
  // so every EnhanceMode has a spec, but their real pipelines don't exist yet.
  available: boolean;
  build: (ctx: FilterContext) => FilterOutput;
};

// Folds an ordered matrix chain (first applied first) into one Skia colour filter, or null for an
// empty chain. MakeCompose(outer, inner) is outer(inner(x)), so each later matrix wraps the result.
export function matrixChainFilter(matrices: ColorMatrix[]): SkColorFilter | null {
  let filter: SkColorFilter | null = null;
  for (const matrix of matrices) {
    const next = Skia.ColorFilter.MakeMatrix(matrix);
    filter = filter ? Skia.ColorFilter.MakeCompose(next, filter) : next;
  }
  return filter;
}

export const FILTERS: FilterSpec[] = [
  {
    id: 'original',
    label: 'Original',
    icon: 'image-outline',
    adjustable: true,
    lightCorrect: false,
    available: true,
    build: () => ({ colorFilter: null }),
  },
  {
    id: 'auto',
    label: 'Auto',
    icon: 'sparkles-outline',
    adjustable: true,
    lightCorrect: false,
    available: true,
    build: ({ stats }) => ({ colorFilter: matrixChainFilter(autoMatrices(stats)) }),
  },
  {
    id: 'color',
    label: 'Color',
    icon: 'color-palette-outline',
    adjustable: true,
    lightCorrect: false,
    available: true,
    build: ({ stats }) => ({ colorFilter: matrixChainFilter(colorMatrices(stats)) }),
  },
  {
    id: 'gray',
    label: 'Gray',
    icon: 'contrast-outline',
    adjustable: true,
    lightCorrect: false,
    available: true,
    build: ({ stats }) => ({ colorFilter: matrixChainFilter(grayMatrices(stats)) }),
  },
  {
    // Placeholder until E4: renders as Gray so a page set to 'ink' never looks broken.
    id: 'ink',
    label: 'Ink',
    icon: 'create-outline',
    adjustable: true,
    lightCorrect: false,
    available: false,
    build: ({ stats }) => ({ colorFilter: matrixChainFilter(grayMatrices(stats)) }),
  },
  {
    // Placeholder until E5: renders as Auto.
    id: 'board',
    label: 'Board',
    icon: 'easel-outline',
    adjustable: true,
    lightCorrect: false,
    available: false,
    build: ({ stats }) => ({ colorFilter: matrixChainFilter(autoMatrices(stats)) }),
  },
  {
    // A binarized page has no continuous tone for the sliders to act on.
    id: 'bw',
    label: 'B&W',
    icon: 'document-text-outline',
    adjustable: false,
    lightCorrect: false,
    available: true,
    build: ({ image, width, height }) => ({ shader: makeSauvolaShader(image, width, height) }),
  },
];

const FILTERS_BY_ID = new Map(FILTERS.map((spec) => [spec.id, spec]));

export function getFilter(id: EnhanceMode): FilterSpec {
  const spec = FILTERS_BY_ID.get(id);
  if (!spec) throw new Error(`No filter registered for enhance mode "${id}"`);
  return spec;
}
