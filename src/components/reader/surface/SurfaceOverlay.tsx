import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas, Circle, Group, Rect, type Transforms3d } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import type { FindCursor, FindHits } from '../../../services/reader/findCursor';
import { overlayPalette } from '../../../services/reader/overlayPalette';
import type { UnitRect } from '../../../services/reader/pageSpace';
import { HANDLE_RADIUS, type HandlePoints } from '../../../services/reader/selection';
import { pageBox, type ContentRect, type SurfaceLayout } from '../../../services/reader/surfaceGeometry';
import type { SurfaceMotion } from './useSurfaceView';

// A mark picked in the Notes panel, shown for a moment: its boxes on library page `index`, in
// fractions of the page as shown.
export type SurfaceFlash = { index: number; rects: readonly UnitRect[] };

// §18 W13: a highlight or underline on library page `index`, as what is filled in content
// coordinates (a highlight's box per line; an underline's thin line, marks.markLine), and its
// colour.
export type SurfaceMark = { id: string; index: number; kind: 'highlight' | 'underline'; color: string; rects: readonly ContentRect[] };

// The selected words (a box per line) and the handles' tips, in content coordinates.
export type SurfaceSelected = { rects: readonly ContentRect[]; handles: HandlePoints };

type SurfaceOverlayProps = {
  layout: SurfaceLayout;
  motion: SurfaceMotion;
  // The pages near the view (the ones the surface has mounted): only theirs are drawn.
  pages: readonly number[];
  hits: FindHits;
  cursor: FindCursor | null;
  flash: SurfaceFlash | null;
  marks: readonly SurfaceMark[];
  selected: SurfaceSelected | null;
  night: boolean;
};

// A selection handle: a disc hanging under its tip. It is drawn outside the zooming group, at
// the tip's place on screen, so it stays the size of a fingertip at any zoom.
function Handle({ motion, tip, color }: { motion: SurfaceMotion; tip: { x: number; y: number }; color: string }) {
  const { scale, tx, ty } = motion;
  const { x, y } = tip;
  const transform = useDerivedValue<Transforms3d>(() => [{ translateX: x * scale.value + tx.value }, { translateY: y * scale.value + ty.value }], [x, y]);
  return (
    <Group transform={transform}>
      <Circle cx={0} cy={HANDLE_RADIUS} r={HANDLE_RADIUS} color={color} />
    </Group>
  );
}

// §18 W12 (A6): what is drawn over the pages, on one screen-sized Skia canvas above the page
// layer. Everything is given in content coordinates under the layer's own transform, which is
// read from the same shared values on the UI thread, so the overlay zooms and scrolls with the
// pages without a React render, and Skia redraws it sharp at any zoom. Its layers, bottom to top:
// Find's matches (the one Find is on stronger), the Notes panel's flash, §18 W13's highlights and
// underlines, the selection and its handles. W15 adds the other marks and live ink here. It never
// takes a touch.
export const SurfaceOverlay = memo(function SurfaceOverlay({ layout, motion, pages, hits, cursor, flash, marks, selected, night }: SurfaceOverlayProps) {
  const { scale, tx, ty } = motion;
  // The page layer's transform (PageSurface's layerStyle): screen = content × scale + translate.
  const transform = useDerivedValue<Transforms3d>(() => [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }]);
  const colors = overlayPalette(night);
  const flashBox = flash && flash.index < layout.tops.length ? pageBox(layout, flash.index) : null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Canvas style={StyleSheet.absoluteFill}>
        <Group transform={transform}>
          {pages.map((index) => {
            const matches = hits.get(index);
            if (!matches || index >= layout.tops.length) return null;
            const box = pageBox(layout, index);
            return matches.map((rects, n) => {
              const current = !!cursor && cursor.page === index && cursor.n === n;
              return rects.map((r, k) => (
                <Rect
                  key={`${index}:${n}:${k}`}
                  x={box.x + r.x * box.width}
                  y={box.y + r.y * box.height}
                  width={r.width * box.width}
                  height={r.height * box.height}
                  color={current ? colors.currentMatch : colors.match}
                />
              ));
            });
          })}
          {flash && flashBox
            ? flash.rects.map((r, k) => (
                <Rect
                  key={`flash:${k}`}
                  x={flashBox.x + r.x * flashBox.width}
                  y={flashBox.y + r.y * flashBox.height}
                  width={r.width * flashBox.width}
                  height={r.height * flashBox.height}
                  color={colors.flash}
                />
              ))
            : null}
          {marks.map((mark) =>
            mark.rects.map((r, k) => (
              <Rect
                key={`${mark.id}:${k}`}
                x={r.x}
                y={r.y}
                width={r.width}
                height={r.height}
                color={mark.color}
                opacity={mark.kind === 'highlight' ? colors.highlightAlpha : 1}
              />
            ))
          )}
          {selected ? selected.rects.map((r, k) => <Rect key={`selected:${k}`} x={r.x} y={r.y} width={r.width} height={r.height} color={colors.selection} />) : null}
        </Group>
        {selected ? (
          <>
            <Handle motion={motion} tip={selected.handles.start} color={colors.handle} />
            <Handle motion={motion} tip={selected.handles.end} color={colors.handle} />
          </>
        ) : null}
      </Canvas>
    </View>
  );
});
