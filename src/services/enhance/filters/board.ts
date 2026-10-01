import { Skia } from '@shopify/react-native-skia';
import type { SkShader } from '@shopify/react-native-skia';
import { CHALK_INK, DARK_FLOOR } from './boardMath';
import type { Rgb, WhiteboardParams } from './boardMath';

// --- Board: whiteboards, blackboards, slides --------------------------------------------------
//
// GPU half of boardMath.ts (read that first); whiteboardPixel, darkBoardPixel and offsetScale
// below must match their JS versions. `source` is the light-corrected page.
const BOARD_SKSL = `
uniform shader source;
uniform float darkBoard;
uniform float keepDark;
uniform float3 board;
uniform float chalk;
uniform float whitePoint;
uniform float satBoost;
uniform float markerGamma;
uniform float glareLuma;
uniform float glareChroma;
uniform float darkFloor;
uniform float chalkInk;

float lumaOf(float3 c) {
  return dot(c, float3(0.299, 0.587, 0.114));
}

float chromaOf(float3 c) {
  return max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b);
}

float3 whiteboardPixel(float3 c) {
  float glare = smoothstep(glareLuma - 0.02, glareLuma + 0.02, lumaOf(c))
    * (1.0 - smoothstep(glareChroma - 0.04, glareChroma + 0.04, chromaOf(c)));
  float3 lifted = clamp(c / whitePoint, 0.0, 1.0);
  float l = lumaOf(lifted);
  float3 saturated = clamp(float3(l) + (lifted - float3(l)) * (1.0 + satBoost), 0.0, 1.0);
  float3 darkened = pow(saturated, float3(markerGamma));
  return darkened + (float3(1.0) - darkened) * glare;
}

float offsetScale(float outLuma, float3 offset) {
  float k = 1.0;
  for (int i = 0; i < 3; i++) {
    float d = offset[i];
    if (d < 0.0) k = min(k, outLuma / -d);
    else if (d > 0.0) k = min(k, (1.0 - outLuma) / d);
  }
  return max(0.0, k);
}

float3 darkBoardPixel(float3 c) {
  float boardLuma = lumaOf(board);
  float l = lumaOf(c);
  float t = clamp((l - boardLuma) / max(chalk - boardLuma, 0.01), 0.0, 1.0);
  float outLuma = keepDark > 0.5 ? darkFloor + (1.0 - darkFloor) * t : 1.0 - (1.0 - chalkInk) * t;
  float3 offset = c - float3(l) - (board - float3(boardLuma)) * (1.0 - t);
  return clamp(float3(outLuma) + offset * offsetScale(outLuma, offset), 0.0, 1.0);
}

half4 main(float2 p) {
  half4 src = source.eval(p);
  float3 c = float3(src.rgb);
  float3 outRgb = darkBoard > 0.5 ? darkBoardPixel(c) : whiteboardPixel(c);
  return half4(half3(outRgb), src.a);
}
`;

let boardEffect: ReturnType<typeof Skia.RuntimeEffect.Make> | null = null;
function getBoardEffect() {
  if (!boardEffect) {
    boardEffect = Skia.RuntimeEffect.Make(BOARD_SKSL);
    if (!boardEffect) throw new Error('Skia failed to compile the Board shader');
  }
  return boardEffect;
}

export function makeBoardShader(
  source: SkShader,
  dark: { board: Rgb; chalk: number; keepDark: boolean } | null,
  whiteboard: WhiteboardParams
): SkShader {
  return getBoardEffect().makeShaderWithChildren(
    [
      dark ? 1 : 0,
      dark?.keepDark ? 1 : 0,
      ...(dark?.board ?? [1, 1, 1]),
      dark?.chalk ?? 1,
      whiteboard.whitePoint,
      whiteboard.satBoost,
      whiteboard.markerGamma,
      whiteboard.glareLuma,
      whiteboard.glareChroma,
      DARK_FLOOR,
      CHALK_INK,
    ],
    [source]
  );
}
