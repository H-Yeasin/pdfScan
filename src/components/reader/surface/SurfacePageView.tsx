import { memo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { mapRect, overlayMatrix } from '../../../services/reader/pageSpace';
import type { PageFrame } from '../../../services/reader/renderPlan';
import type { SurfacePage } from '../../../services/reader/surfacePages';
import type { PageRotation } from '../../../types/models';
import { usePageImages, type RenderedImage, type RenderImages } from './useRenderQueue';

type Rect = { left: number; top: number; width: number; height: number };

// An image of an unturned picture, placed so that it covers `rect` once turned clockwise by
// `turn` (a sideways one is laid out with its sides swapped, then turned about its middle).
function turnedStyle(rect: Rect, turn: PageRotation) {
  if (turn !== 90 && turn !== 270) return { ...rect, transform: turn ? [{ rotate: `${turn}deg` }] : undefined };
  return {
    left: rect.left + (rect.width - rect.height) / 2,
    top: rect.top + (rect.height - rect.width) / 2,
    width: rect.height,
    height: rect.width,
    transform: [{ rotate: `${turn}deg` }],
  };
}

function frameRect(frame: PageFrame, width: number, height: number): Rect {
  return { left: frame.x * width, top: frame.y * height, width: frame.width * width, height: frame.height * height };
}

type PictureProps = { image: RenderedImage; width: number; height: number; onLost: () => void };

// One rendered image on the page. `resizeMethod="scale"`: the file is drawn as it is and the
// layer's zoom scales it, where the default would first shrink it to the view's unzoomed size.
function Picture({ image, width, height, onLoad, onLost }: PictureProps & { onLoad?: () => void }) {
  return (
    <Image
      source={{ uri: image.uri }}
      style={[styles.image, turnedStyle(frameRect(image.spec.frame, width, height), image.spec.turn)]}
      fadeDuration={0}
      resizeMethod="scale"
      resizeMode="stretch"
      onLoad={onLoad}
      onError={onLost}
    />
  );
}

// A whole-page image that gives way to a sharper one: the old picture stays until the new one
// has loaded, so the page never blinks back to its paper in between.
function Layer({ image, width, height, onLost }: PictureProps) {
  const [loaded, setLoaded] = useState<RenderedImage | null>(null);
  const under = loaded && loaded.uri !== image.uri ? loaded : null;
  return (
    <>
      {under ? <Picture key={under.uri} image={under} width={width} height={height} onLost={onLost} /> : null}
      <Picture key={image.uri} image={image} width={width} height={height} onLoad={() => setLoaded(image)} onLost={onLost} />
    </>
  );
}

type SurfacePageViewProps = {
  page: SurfacePage;
  // The page's box in content coordinates (surfaceGeometry.pageBox).
  x: number;
  y: number;
  width: number;
  height: number;
  images: RenderImages;
  // Inside the memory window (renderPlan.memoryWindow's `images`): the page shows its renders.
  // Outside it only the small pictures, which cost next to nothing decoded.
  live: boolean;
  night: boolean;
  paper: string;
  edge?: string;
  // A file the page was showing is gone (the system cleared the cache).
  onLost: (page: number) => void;
};

// §18 W10 (A4): one page of the surface, bottom to top: the paper, the stored thumbnail (by day;
// it is light), the small placeholder render, the page's own render, and from a deep zoom the
// tiles of the part on screen. It re-renders alone when one of its images arrives.
export const SurfacePageView = memo(function SurfacePageView({ page, x, y, width, height, images, live, night, paper, edge, onLost }: SurfacePageViewProps) {
  const held = usePageImages(images, page.index);
  const lost = () => onLost(page.index);
  // The thumbnail is of the page's own picture (a master, or the page as it was indexed): it sits
  // where that picture does on the page, turned with it.
  const space = page.space;
  const thumb = page.thumbUri && !night ? mapRect(overlayMatrix({ x: 0, y: 0, width, height }, space), { left: 0, top: 0, width: space.width, height: space.height }) : null;

  return (
    <View style={[styles.page, { left: x, top: y, width, height, backgroundColor: paper }, edge ? { borderColor: edge, borderWidth: StyleSheet.hairlineWidth } : null]}>
      {thumb ? (
        <Image source={{ uri: page.thumbUri }} style={[styles.image, turnedStyle(thumb, space.turn)]} fadeDuration={0} resizeMethod="scale" resizeMode="stretch" />
      ) : null}
      {held.low ? <Layer image={held.low} width={width} height={height} onLost={lost} /> : null}
      {live && held.base ? <Layer image={held.base} width={width} height={height} onLost={lost} /> : null}
      {live ? held.tiles.map((tile) => <Picture key={tile.spec.key} image={tile} width={width} height={height} onLost={lost} />) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  page: { position: 'absolute', overflow: 'hidden' },
  image: { position: 'absolute' },
});
