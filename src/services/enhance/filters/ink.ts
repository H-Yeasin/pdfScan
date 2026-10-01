import { Skia } from '@shopify/react-native-skia';
import type { SkShader } from '@shopify/react-native-skia';
import { DEFAULT_KNEES, inkKnees } from './inkMath';
import type { InkKnees, InkToneParams, LineFadeParams } from './inkMath';
import type { ImageStats } from '../../../types/models';

// --- Ink: handwritten notes ------------------------------------------------------------------
//
// GPU half of inkMath.ts (read that first). `source` is the light-corrected page. inkTone and
// lineFade below must match their JS versions; the luma weights match filterMath's LUMA_*.
const INK_SKSL = `
uniform shader source;
uniform float inkKnee;
uniform float paperKnee;
uniform float inkCeil;
uniform float inkGamma;
uniform float lineFrac;
uniform float lineSatMax;
uniform float fadeLines;
uniform float keepColor;

float inkTone(float l) {
  if (l <= inkKnee) return pow(max(l, 0.0) / inkKnee, inkGamma) * inkCeil;
  return inkCeil + (1.0 - inkCeil) * smoothstep(inkKnee, paperKnee, l);
}

float lineFade(float l, float chroma) {
  float threshold = inkKnee + lineFrac * (paperKnee - inkKnee);
  return smoothstep(threshold - 0.03, threshold + 0.03, l) * (1.0 - smoothstep(lineSatMax - 0.05, lineSatMax + 0.05, chroma));
}

half4 main(float2 p) {
  half4 c = source.eval(p);
  float l = dot(float3(c.rgb), float3(0.299, 0.587, 0.114));
  float chroma = max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b);
  float tone = inkTone(l);
  float fade = lineFade(l, chroma) * fadeLines;

  // Keep pen colour: scale the corrected colour by tone/luma, which keeps its hue and chroma
  // ratios while taking the same tone curve - neutral paper still goes to white.
  float3 colored = clamp(float3(c.rgb) * (tone / max(l, 0.02)), 0.0, 1.0);
  float3 outRgb = mix(float3(tone), colored, keepColor);
  return half4(half3(mix(outRgb, float3(1.0), fade)), c.a);
}
`;

let inkEffect: ReturnType<typeof Skia.RuntimeEffect.Make> | null = null;
function getInkEffect() {
  if (!inkEffect) {
    inkEffect = Skia.RuntimeEffect.Make(INK_SKSL);
    if (!inkEffect) throw new Error('Skia failed to compile the Ink shader');
  }
  return inkEffect;
}

export function kneesFromStats(stats: ImageStats): InkKnees {
  return stats.tone ? inkKnees(stats.tone.paper, stats.tone.ink) : DEFAULT_KNEES;
}

export function makeInkShader(
  source: SkShader,
  knees: InkKnees,
  tone: InkToneParams,
  lines: LineFadeParams,
  options: { fadeLines: boolean; keepInkColor: boolean }
): SkShader {
  return getInkEffect().makeShaderWithChildren(
    [
      knees.ink,
      knees.paper,
      tone.inkCeil,
      tone.inkGamma,
      lines.lineFrac,
      lines.lineSatMax,
      options.fadeLines ? 1 : 0,
      options.keepInkColor ? 1 : 0,
    ],
    [source]
  );
}
