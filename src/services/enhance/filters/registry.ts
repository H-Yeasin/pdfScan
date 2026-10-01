import { Skia } from '@shopify/react-native-skia';
import type { SkColorFilter, SkImage, SkShader } from '@shopify/react-native-skia';
import type { Ionicons } from '@expo/vector-icons';
import { autoMatrices, COLOR_MIN_SPAN, COLOR_SATURATION_BOOST, colorMatrices, grayMatrices, LUMA_MIN_SPAN } from './filterMath';
import type { ColorMatrix } from './filterMath';
import { makeBoardShader } from './board';
import { chalkLevel, GLARE_CHROMA, GLARE_LUMA, isDarkBoard, MARKER_GAMMA, SAT_BOOST, WHITE_POINT } from './boardMath';
import { kneesFromStats, makeInkShader } from './ink';
import { DEFAULT_FADE_LINES, DEFAULT_KEEP_INK_COLOR, INK_CEIL, INK_GAMMA, LINE_FRAC, LINE_SAT_MAX } from './inkMath';
import { LIGHT_RADIUS, LIGHT_SIGMA, PAPER_WHITE } from './lightCorrect';
import type { LightCorrectParams } from './lightCorrect';
import { makeSauvolaShader, SAMPLE_RADIUS_RATIO, SAUVOLA_K, SAUVOLA_R } from './sauvola';
import type { AdjustValues, EnhanceMode, FilterOptions, ImageStats } from '../../../types/models';

export type FilterContext = {
  image: SkImage;
  // What the filter draws from, in image space: the light-corrected page when the spec has
  // lightCorrect: true, otherwise the raw image. Colour-filter specs get it implicitly.
  source: SkShader;
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
  // Whether the shared flat-field light correction (lightCorrect.ts) runs before this filter, so
  // shadows and lamp tints are divided out before levels. Its stats are measured on the corrected
  // page too (stats.ts), so this is only meaningful for filters built on `source` or a colour filter.
  lightCorrect: boolean;
  // False hides a filter from the Review picker (for one whose pipeline isn't built yet).
  available: boolean;
  params: FilterParam[];
  // Overrides which light correction runs (light or dark page) when the filter knows better than
  // the detection - Board's forced board type. Defaults to stats.light.
  lightStats?: (stats: ImageStats, options: FilterOptions) => ImageStats['light'];
  build: (ctx: FilterContext) => FilterOutput;
};

const COLOR_MIN_SPAN_PARAM: FilterParam = { key: 'minSpan', label: 'Min span', min: 0.05, max: 0.6, default: COLOR_MIN_SPAN };
const LUMA_MIN_SPAN_PARAM: FilterParam = { key: 'minSpan', label: 'Min span', min: 0.05, max: 0.6, default: LUMA_MIN_SPAN };

// Light-correction constants, tunable per filter in the Filter Lab. Lab overrides change the drawn
// correction only; the cached stats (and so the levels) stay measured with the defaults.
const LIGHT_PARAMS: FilterParam[] = [
  { key: 'lcRadius', label: 'Light: ink removal radius', min: 1, max: 8, default: LIGHT_RADIUS },
  { key: 'lcSigma', label: 'Light: smoothing', min: 1, max: 16, default: LIGHT_SIGMA },
  { key: 'lcPaperWhite', label: 'Light: paper white', min: 0.7, max: 1, default: PAPER_WHITE },
];

export function lightParamsFrom(params: Record<string, number>): LightCorrectParams {
  return {
    radius: params.lcRadius ?? LIGHT_RADIUS,
    sigma: params.lcSigma ?? LIGHT_SIGMA,
    paperWhite: params.lcPaperWhite ?? PAPER_WHITE,
  };
}

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
    lightCorrect: true,
    available: true,
    params: [COLOR_MIN_SPAN_PARAM, ...LIGHT_PARAMS],
    build: ({ stats, params }) => ({ colorFilter: matrixChainFilter(autoMatrices(stats, params.minSpan)) }),
  },
  {
    id: 'color',
    label: 'Color',
    icon: 'color-palette-outline',
    adjustable: true,
    lightCorrect: true,
    available: true,
    params: [
      COLOR_MIN_SPAN_PARAM,
      { key: 'saturationBoost', label: 'Saturation boost', min: 0, max: 1, default: COLOR_SATURATION_BOOST },
      ...LIGHT_PARAMS,
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
    lightCorrect: true,
    available: true,
    params: [LUMA_MIN_SPAN_PARAM, ...LIGHT_PARAMS],
    build: ({ stats, params }) => ({ colorFilter: matrixChainFilter(grayMatrices(stats, params.minSpan)) }),
  },
  {
    // Handwritten notes: a soft tone curve instead of a threshold, so pencil keeps smooth edges;
    // optional ruling-line fade and pen colour (FilterOptions). See inkMath.ts.
    id: 'ink',
    label: 'Ink',
    icon: 'create-outline',
    adjustable: true,
    lightCorrect: true,
    available: true,
    params: [
      { key: 'inkCeil', label: 'Ink tone at knee', min: 0, max: 0.6, default: INK_CEIL },
      { key: 'inkGamma', label: 'Ink darkening (gamma)', min: 0.5, max: 3, default: INK_GAMMA },
      { key: 'lineFrac', label: 'Line threshold', min: 0, max: 1, default: LINE_FRAC },
      { key: 'lineSatMax', label: 'Line max chroma', min: 0.05, max: 0.6, default: LINE_SAT_MAX },
      ...LIGHT_PARAMS,
    ],
    build: ({ source, stats, options, params }) => ({
      shader: makeInkShader(
        source,
        kneesFromStats(stats),
        { inkCeil: params.inkCeil, inkGamma: params.inkGamma },
        { lineFrac: params.lineFrac, lineSatMax: params.lineSatMax },
        {
          fadeLines: options.fadeLines ?? DEFAULT_FADE_LINES,
          keepInkColor: options.keepInkColor ?? DEFAULT_KEEP_INK_COLOR,
        }
      ),
    }),
  },
  {
    // Whiteboards, blackboards and slides. See boardMath.ts.
    id: 'board',
    label: 'Board',
    icon: 'easel-outline',
    adjustable: true,
    lightCorrect: true,
    available: true,
    params: [
      { key: 'whitePoint', label: 'White point', min: 0.6, max: 1, default: WHITE_POINT },
      { key: 'satBoost', label: 'Marker saturation boost', min: 0, max: 1.5, default: SAT_BOOST },
      { key: 'markerGamma', label: 'Marker darkening (gamma)', min: 0.5, max: 3, default: MARKER_GAMMA },
      { key: 'glareLuma', label: 'Glare luma', min: 0.8, max: 1, default: GLARE_LUMA },
      { key: 'glareChroma', label: 'Glare max chroma', min: 0, max: 0.4, default: GLARE_CHROMA },
      ...LIGHT_PARAMS,
    ],
    // A forced board type also switches the correction, so a blackboard the detection called light
    // is still estimated with erode and kept at its own colour. Its bgMean was measured with the
    // other morphology then - close enough for a page near the detection threshold.
    lightStats: (stats, options) => {
      const dark = isDarkBoard(options.boardStyle, stats);
      return { dark, bgMean: stats.light?.bgMean ?? [1, 1, 1] };
    },
    build: ({ source, stats, options, params }) => {
      const dark = isDarkBoard(options.boardStyle, stats);
      const board = stats.light?.bgMean ?? [0.2, 0.2, 0.2];
      return {
        shader: makeBoardShader(
          source,
          dark ? { board, chalk: chalkLevel(board, stats.tone?.bright), keepDark: !!options.keepDarkBoard } : null,
          {
            whitePoint: params.whitePoint,
            satBoost: params.satBoost,
            markerGamma: params.markerGamma,
            glareLuma: params.glareLuma,
            glareChroma: params.glareChroma,
          }
        ),
      };
    },
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
