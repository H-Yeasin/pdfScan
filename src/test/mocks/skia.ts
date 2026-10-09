// Skia can't run under Jest (native GPU module, ESM build). This stub lets modules that import it
// load; tests that exercise pixel code mock the higher-level function instead (renderPage,
// splitSpread, composeIdCard, ...). Any accidental real use fails loudly.
function unavailable(): never {
  throw new Error('@shopify/react-native-skia is not available under Jest - mock the caller instead');
}

export const Skia = new Proxy({}, { get: () => unavailable });
export enum AlphaType {
  Unpremul = 3,
}
export enum ColorType {
  RGBA_8888 = 4,
}
export enum FilterMode {
  Nearest = 0,
  Linear = 1,
}
export enum MipmapMode {
  None = 0,
  Nearest = 1,
  Linear = 2,
}
export enum ImageFormat {
  JPEG = 3,
  PNG = 4,
}
export enum FontWeight {
  Normal = 400,
  Bold = 700,
}
export enum TextAlign {
  Left = 0,
  Center = 2,
}
export enum TileMode {
  Clamp = 0,
}
export type SkImage = unknown;
export type SkPaint = unknown;

// §15 V4: Skia's drawing components as host elements, so a test can render a component that draws
// (BrandMark) and look at what it draws. They render their children and draw nothing.
export const Canvas = 'Canvas';
export const Group = 'Group';
export const Path = 'Path';
export const RoundedRect = 'RoundedRect';
export const LinearGradient = 'LinearGradient';
export const Shadow = 'Shadow';
export const Blur = 'Blur';
export const Paint = 'Paint';
export const vec = (x = 0, y = 0) => ({ x, y });
export const Rect = 'Rect';
