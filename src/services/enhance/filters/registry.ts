import { Skia } from '@shopify/react-native-skia';
import type { SkColorFilter, SkImage, SkShader } from '@shopify/react-native-skia';
import type { Ionicons } from '@expo/vector-icons';
import { autoMatrices, COLOR_MIN_SPAN, COLOR_SATURATION_BOOST, colorMatrices, grayMatrices, LUMA_MIN_SPAN } from './filterMath';
import type { ColorMatrix } from './filterMath';
import { makeSauvolaShader, SAMPLE_RADIUS_RATIO, SAUVOLA_K, SAUVOLA_R } from './sauvola';
import type { AdjustValues, EnhanceMode, FilterOptions, ImageStats } from '../../../types/models';

export type FilterContext = {
  image: SkImage;
  stats: ImageStats;
  width: number;
  height: number;
  adjust: AdjustValues;
  options: FilterOptions;
  // Every declared param, resolved: its default, or the Filter Lab's override.
  params: Record<string, number>;
};

// A tunable constant of a filter. The app always uses `default`; only the dev Filter Lab passes
// overrides (through drawFiltered), so E3-E7 can tune a value before changing its default here.
export type FilterParam = { key: string; label: string; min: number; max: number; default: number };
export type FilterParamOverrides = Record<string, number>;

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
  params: FilterParam[];
  build: (ctx: FilterContext) => FilterOutput;
};

const COLOR_MIN_SPAN_PARAM: FilterParam = { key: 'minSpan', label: 'Min span', min: 0.05, max: 0.6, default: COLOR_MIN_SPAN };
const LUMA_MIN_SPAN_PARAM: FilterParam = { key: 'minSpan', label: 'Min span', min: 0.05, max: 0.6, default: LUMA_MIN_SPAN };

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
    params: [],
    build: () => ({ colorFilter: null }),
  },
  {
    id: 'auto',
    label: 'Auto',
    icon: 'sparkles-outline',
    adjustable: true,
    lightCorrect: false,
    available: true,
    params: [COLOR_MIN_SPAN_PARAM],
    build: ({ stats, params }) => ({ colorFilter: matrixChainFilter(autoMatrices(stats, params.minSpan)) }),
  },
  {
    id: 'color',
    label: 'Color',
    icon: 'color-palette-outline',
    adjustable: true,
    lightCorrect: false,
    available: true,
    params: [
      COLOR_MIN_SPAN_PARAM,
      { key: 'saturationBoost', label: 'Saturation boost', min: 0, max: 1, default: COLOR_SATURATION_BOOST },
    ],
    build: ({ stats, params }) => ({
      colorFilter: matrixChainFilter(colorMatrices(stats, params.minSpan, params.saturationBoost)),
    }),
  },
  {
    id: 'gray',
    label: 'Gray',
    icon: 'contrast-outline',
    adjustable: true,
    lightCorrect: false,
    available: true,
    params: [LUMA_MIN_SPAN_PARAM],
    build: ({ stats, params }) => ({ colorFilter: matrixChainFilter(grayMatrices(stats, params.minSpan)) }),
  },
  {
    // Placeholder until E4: renders as Gray so a page set to 'ink' never looks broken.
    id: 'ink',
    label: 'Ink',
    icon: 'create-outline',
    adjustable: true,
    lightCorrect: false,
    available: false,
    params: [],
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
    params: [],
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
    params: [
      { key: 'k', label: 'k (sensitivity)', min: 0.02, max: 0.6, default: SAUVOLA_K },
      { key: 'r', label: 'R (dynamic range)', min: 0.1, max: 1, default: SAUVOLA_R },
      { key: 'radiusRatio', label: 'Window radius', min: 0.001, max: 0.02, default: SAMPLE_RADIUS_RATIO },
    ],
    build: ({ image, width, height, params }) => ({
      shader: makeSauvolaShader(image, width, height, { k: params.k, r: params.r, radiusRatio: params.radiusRatio }),
    }),
  },
];

const FILTERS_BY_ID = new Map(FILTERS.map((spec) => [spec.id, spec]));

export function resolveFilterParams(spec: FilterSpec, overrides?: FilterParamOverrides): Record<string, number> {
  const params: Record<string, number> = {};
  for (const param of spec.params) params[param.key] = overrides?.[param.key] ?? param.default;
  return params;
}

export function getFilter(id: EnhanceMode): FilterSpec {
  const spec = FILTERS_BY_ID.get(id);
  if (!spec) throw new Error(`No filter registered for enhance mode "${id}"`);
  return spec;
}
