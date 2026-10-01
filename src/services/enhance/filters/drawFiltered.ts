import { FilterMode, MipmapMode, Skia, TileMode } from '@shopify/react-native-skia';
import type { SkCanvas, SkImage, SkPaint, SkRect } from '@shopify/react-native-skia';
import { DEFAULT_ADJUST } from '../adjust';
import { adjustMatrices } from './filterMath';
import { makeLightCorrectedShader } from './lightCorrect';
import { getFilter, lightParamsFrom, matrixChainFilter, resolveFilterParams } from './registry';
import type { FilterParamOverrides } from './registry';
import { analyzeImage } from './stats';
import type { SessionPage } from '../../../types/models';

export type FilterPage = Pick<SessionPage, 'enhance' | 'adjust' | 'stats' | 'filterOptions'>;

// The only place a filter is applied to pixels. Export (bakeEnhance today, F5's renderPage later)
// draws into a full-size offscreen surface and E2's preview records the same call into an
// SkPicture, so the preview can never drift from the export.
//
// Manual brightness/contrast/saturation adjustments are composed on TOP of the filter (not before
// it): the filter's stats are measured from the original pixels, so it must see the original
// distribution, and the user's adjustment then applies as a relative nudge on the corrected result.
// `paramOverrides` is for the dev Filter Lab only; the app always renders with the defaults.
export function drawFiltered(
  canvas: SkCanvas,
  image: SkImage,
  page: FilterPage,
  targetRect: SkRect,
  paramOverrides?: FilterParamOverrides
) {
  const spec = getFilter(page.enhance);
  const width = image.width();
  const height = image.height();
  const adjust = page.adjust ?? DEFAULT_ADJUST;
  const params = resolveFilterParams(spec, paramOverrides);
  // Pages normally arrive with stats measured at ingest; this fallback covers pages whose uri
  // changed (crop, rotate) and haven't been re-measured yet. It's two small read-backs, so cheap.
  const stats = page.stats ?? analyzeImage(image);
  const source = spec.lightCorrect
    ? makeLightCorrectedShader(
        image,
        width,
        height,
        spec.lightStats ? spec.lightStats(stats, page.filterOptions ?? {}) : stats.light,
        lightParamsFrom(params)
      )
    : image.makeShaderOptions(TileMode.Clamp, TileMode.Clamp, FilterMode.Linear, MipmapMode.Linear);
  const output = spec.build({
    image,
    source,
    stats,
    width,
    height,
    adjust,
    options: page.filterOptions ?? {},
    params,
  });
  const adjustFilter = spec.adjustable ? matrixChainFilter(adjustMatrices(adjust)) : null;
  const paint = Skia.Paint();

  if ('shader' in output) {
    paint.setShader(output.shader);
    if (adjustFilter) paint.setColorFilter(adjustFilter);
    drawInImageSpace(canvas, paint, width, height, targetRect);
    return;
  }

  const { colorFilter } = output;
  const combined =
    colorFilter && adjustFilter ? Skia.ColorFilter.MakeCompose(adjustFilter, colorFilter) : colorFilter ?? adjustFilter;
  if (combined) paint.setColorFilter(combined);
  if (!spec.lightCorrect) {
    canvas.drawImageRect(image, Skia.XYWHRect(0, 0, width, height), targetRect, paint);
    return;
  }
  // Light-corrected: the colour filter applies to the corrected shader's output, so the levels
  // stretch sees even paper.
  paint.setShader(source);
  drawInImageSpace(canvas, paint, width, height, targetRect);
}

// Shaders are built in the image's own pixel space, so map that space onto targetRect.
function drawInImageSpace(canvas: SkCanvas, paint: SkPaint, width: number, height: number, targetRect: SkRect) {
  canvas.save();
  canvas.translate(targetRect.x, targetRect.y);
  canvas.scale(targetRect.width / width, targetRect.height / height);
  canvas.drawRect(Skia.XYWHRect(0, 0, width, height), paint);
  canvas.restore();
}
