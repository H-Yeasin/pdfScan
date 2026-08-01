export type Rect = { x: number; y: number; width: number; height: number };
export type Size = { width: number; height: number };

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// Maps the on-screen guide frame onto a captured photo's own pixel space, so a page placed
// inside the frame is auto-cropped without needing live edge detection. Assumes the camera
// preview fills `container` with "cover" scaling (expo-camera's default scaleType when no
// `ratio` prop is set: the feed is uniformly scaled up to cover the view, then center-cropped)
// — inverting that same scale maps the frame rect back into the photo's pixels.
export function mapFrameToPhotoCropRect(frame: Rect, container: Size, photo: Size): Rect {
  const scale = Math.max(container.width / photo.width, container.height / photo.height);
  const offsetX = (photo.width * scale - container.width) / 2;
  const offsetY = (photo.height * scale - container.height) / 2;

  const originX = clamp((frame.x + offsetX) / scale, 0, photo.width);
  const originY = clamp((frame.y + offsetY) / scale, 0, photo.height);
  const width = clamp(frame.width / scale, 1, photo.width - originX);
  const height = clamp(frame.height / scale, 1, photo.height - originY);

  return {
    x: Math.round(originX),
    y: Math.round(originY),
    width: Math.round(width),
    height: Math.round(height),
  };
}
