import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas, Circle, ColorMatrix, DashPathEffect, Group, Image, Paragraph, Path, Rect, RoundedRect, Skia, usePathValue, useImage, type SkParagraph, type Transforms3d } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import type { FindCursor, FindHits } from '../../../services/reader/findCursor';
import { markShapes, shapesKey, type MarkShape } from '../../../services/reader/markShapes';
import { overlayPalette } from '../../../services/reader/overlayPalette';
import { matrix3, overlayMatrix, type UnitRect } from '../../../services/reader/pageSpace';
import { HANDLE_RADIUS, type HandlePoints } from '../../../services/reader/selection';
import { pageBox, type ContentRect, type SurfaceLayout } from '../../../services/reader/surfaceGeometry';
import type { SurfacePage } from '../../../services/reader/surfacePages';
import { ASCENT } from '../../../services/pdf/textAppearance';
import { signatureUri } from '../../../services/signature/signatureRows';
import type { Annotation, OcrBounding } from '../../../types/models';
import type { SurfaceMotion } from './useSurfaceView';

// A mark picked in the Notes panel, shown for a moment: its boxes on library page `index`, in
// fractions of the page as shown.
export type SurfaceFlash = { index: number; rects: readonly UnitRect[] };

// The selected words (a box per line) and the handles' tips, in content coordinates.
export type SurfaceSelected = { rects: readonly ContentRect[]; handles: HandlePoints };

// §18 W15: the stroke being drawn. Its points and width live on the UI thread (the gesture
// writes them); its colour is the tool's.
export type SurfaceInk = { points: SharedValue<number[]>; width: SharedValue<number>; color: string; opacity: number };

// §18 W16: the signature being placed: its box in content coordinates (moved and resized by the
// gesture) and its PNG.
export type SurfaceSigning = { box: SharedValue<ContentRect | null>; uri: string };

// Which boxes get a dashed frame, so the student sees what a tap or a drag takes hold of: the
// text boxes (the Text tool), the signatures (every tool that can move them), or none.
export type MarkOutlines = { text: boolean; signature: boolean };

type SurfaceOverlayProps = {
  layout: SurfaceLayout;
  motion: SurfaceMotion;
  // The pages near the view (the ones the surface has mounted): only theirs are drawn.
  pages: readonly number[];
  surfacePages: readonly SurfacePage[];
  hits: FindHits;
  cursor: FindCursor | null;
  flash: SurfaceFlash | null;
  // The document's marks by library page.
  marks: ReadonlyMap<number, readonly Annotation[]>;
  // A box being dragged (a text box, a signature): drawn where the finger has it.
  moved: { id: string; box: OcrBounding } | null;
  outlines: MarkOutlines;
  outlineColor: string;
  selected: SurfaceSelected | null;
  ink: SurfaceInk | null;
  signing: SurfaceSigning | null;
  // Night pages: the palette's colour change for ink-like marks (a colour at a time, and as
  // Skia's colour matrix for a signature's image). null by day.
  night: NightInk | null;
};

export type NightInk = { color: (hex: string) => string; matrix: number[] };

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

// One line of a text box, shaped by Skia with the phone's own fonts (any script), like the text
// the PDF gets (pdf/skiaText). Its baseline sits where the PDF writer puts it: ASCENT of the
// size under the line's top.
function makeLine(text: string, size: number, color: string): { paragraph: SkParagraph; dy: number } {
  const builder = Skia.ParagraphBuilder.Make({ maxLines: 1 });
  builder.pushStyle({ color: Skia.Color(color), fontSize: size });
  builder.addText(text);
  const paragraph = builder.build();
  paragraph.layout(LINE_WIDTH);
  const baseline = paragraph.getLineMetrics()[0]?.baseline ?? size * ASCENT;
  return { paragraph, dy: size * ASCENT - baseline };
}
// Wide enough that no line wraps inside Skia.
const LINE_WIDTH = 100_000;

function TextBox({ shape }: { shape: Extract<MarkShape, { type: 'text' }> }) {
  const lines = useMemo(
    () => shape.lines.map((line) => (line.text ? { ...makeLine(line.text, shape.size, shape.color), top: line.top } : null)),
    [shape.lines, shape.size, shape.color]
  );
  return (
    <Group matrix={matrix3(shape.frame)}>
      {lines.map((line, i) => (line ? <Paragraph key={i} paragraph={line.paragraph} x={0} y={line.top + line.dy} width={LINE_WIDTH} /> : null))}
    </Group>
  );
}

// A placed signature: its PNG from the document's folder, in the unit square under the frame
// that turns it the way it was placed.
function SignatureMark({ shape, night }: { shape: Extract<MarkShape, { type: 'signature' }>; night: number[] | null }) {
  const uri = useMemo(() => signatureUri({ documentId: shape.documentId, data: { box: shape.box, file: shape.file } }), [shape.documentId, shape.box, shape.file]);
  const image = useImage(uri ?? null);
  if (!image) return null;
  return (
    <Group matrix={matrix3(shape.frame)}>
      <Image image={image} x={0} y={0} width={1} height={1} fit="fill">
        {night ? <ColorMatrix matrix={night} /> : null}
      </Image>
    </Group>
  );
}

function Frame({ box, color, width }: { box: OcrBounding; color: string; width: number }) {
  return (
    <Rect x={box.left} y={box.top} width={box.width} height={box.height} style="stroke" strokeWidth={width} color={color}>
      <DashPathEffect intervals={[width * 4, width * 3]} />
    </Rect>
  );
}

type ShapeProps = { shape: MarkShape; outlines: MarkOutlines; outlineColor: string; outlineWidth: number; night: number[] | null };

function Shape({ shape, outlines, outlineColor, outlineWidth, night }: ShapeProps) {
  switch (shape.type) {
    case 'rect':
      return <Rect x={shape.rect.left} y={shape.rect.top} width={shape.rect.width} height={shape.rect.height} color={shape.color} opacity={shape.alpha} />;
    case 'stroke':
      return <Path path={shape.path} style="stroke" strokeWidth={shape.width} strokeCap="round" strokeJoin="round" color={shape.color} />;
    case 'dot':
      return <Circle cx={shape.x} cy={shape.y} r={shape.r} color={shape.color} />;
    case 'note':
      return (
        <>
          <RoundedRect x={shape.rect.left} y={shape.rect.top} width={shape.rect.width} height={shape.rect.height} r={shape.radius} color={shape.fill} />
          <RoundedRect x={shape.rect.left} y={shape.rect.top} width={shape.rect.width} height={shape.rect.height} r={shape.radius} style="stroke" strokeWidth={shape.edgeWidth} color={shape.edge} />
        </>
      );
    case 'text':
      return (
        <>
          {outlines.text ? <Frame box={shape.box} color={outlineColor} width={outlineWidth} /> : null}
          <TextBox shape={shape} />
        </>
      );
    case 'signature':
      return (
        <>
          {outlines.signature ? <Frame box={shape.box} color={outlineColor} width={outlineWidth} /> : null}
          <SignatureMark shape={shape} night={night} />
        </>
      );
  }
}

type PageMarksProps = {
  box: ContentRect;
  page: SurfacePage;
  rows: readonly Annotation[];
  highlightAlpha: number;
  moved: { id: string; box: OcrBounding } | null;
  outlines: MarkOutlines;
  outlineColor: string;
  night: NightInk | null;
};

// A dashed frame's line, in screen points at zoom 1.
const OUTLINE_WIDTH = 1.5;

// One page's marks, each in the page's own space under the page's matrix (A6): a turned page, a
// scan merged into a PDF and any zoom draw them right with no mapping here. The shapes are built
// once per state of the page's rows.
const PageMarks = memo(function PageMarks({ box, page, rows, highlightAlpha, moved, outlines, outlineColor, night }: PageMarksProps) {
  const key = shapesKey(rows);
  const shapes = useMemo(
    () => rows.flatMap((row) => markShapes(row, { highlightAlpha, moved, ink: night?.color })),
    // `key` stands for `rows`: a new array of the same rows builds nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, highlightAlpha, moved, night]
  );
  const matrix = useMemo(() => overlayMatrix(box, page.space), [box, page.space]);
  // The frame's line keeps its width on the page whatever the space's unit is.
  const outlineWidth = OUTLINE_WIDTH / Math.max(1e-6, Math.hypot(matrix[0], matrix[1]));
  return (
    <Group matrix={matrix3(matrix)}>
      {shapes.map((shape) => (
        <Shape key={shape.key} shape={shape} outlines={outlines} outlineColor={outlineColor} outlineWidth={outlineWidth} night={night?.matrix ?? null} />
      ))}
    </Group>
  );
});

// §18 W15 (A5): the provisional stroke. The path is rebuilt on the UI thread whenever the
// gesture adds a point; React renders nothing while the finger moves.
function LiveInk({ ink }: { ink: SurfaceInk }) {
  const { points } = ink;
  const path = usePathValue((builder) => {
    'worklet';
    const p = points.value;
    if (p.length < 4) return;
    builder.moveTo(p[0], p[1]);
    for (let i = 2; i + 1 < p.length; i += 2) builder.lineTo(p[i], p[i + 1]);
  });
  return <Path path={path} style="stroke" strokeWidth={ink.width} strokeCap="round" strokeJoin="round" color={ink.color} opacity={ink.opacity} />;
}

// The resize knob at the placement box's corner, in screen points (it keeps its size at any zoom).
const SIGN_KNOB = 9;

// §18 W16 (A10): the signature being placed, on the page itself: the image, a dashed frame and
// the knob at its bottom-right corner. All of it follows the shared box on the UI thread.
function SignBox({ signing, motion, color, night }: { signing: SurfaceSigning; motion: SurfaceMotion; color: string; night: number[] | null }) {
  const { box } = signing;
  const image = useImage(signing.uri);
  const x = useDerivedValue(() => box.value?.x ?? 0);
  const y = useDerivedValue(() => box.value?.y ?? 0);
  const width = useDerivedValue(() => box.value?.width ?? 0);
  const height = useDerivedValue(() => box.value?.height ?? 0);
  const right = useDerivedValue(() => (box.value ? box.value.x + box.value.width : 0));
  const bottom = useDerivedValue(() => (box.value ? box.value.y + box.value.height : 0));
  // Screen sizes, undone for the zoom they are drawn under.
  const line = useDerivedValue(() => OUTLINE_WIDTH / motion.scale.value);
  const knob = useDerivedValue(() => SIGN_KNOB / motion.scale.value);
  const dashes = useDerivedValue(() => [6 / motion.scale.value, 4 / motion.scale.value]);
  return (
    <>
      {image ? (
        <Image image={image} x={x} y={y} width={width} height={height} fit="fill">
          {night ? <ColorMatrix matrix={night} /> : null}
        </Image>
      ) : null}
      <Rect x={x} y={y} width={width} height={height} style="stroke" strokeWidth={line} color={color}>
        <DashPathEffect intervals={dashes} />
      </Rect>
      <Circle cx={right} cy={bottom} r={knob} color={color} />
    </>
  );
}

// §18 W12 (A6): what is drawn over the pages, on one screen-sized Skia canvas above the page
// layer. Everything is given in content coordinates under the layer's own transform, which is
// read from the same shared values on the UI thread, so the overlay zooms and scrolls with the
// pages without a React render, and Skia redraws it sharp at any zoom. Its layers, bottom to top:
// Find's matches (the one Find is on stronger), the Notes panel's flash, the marks (§18 W15: all
// of them, each page's in its own space; §18 W16: signatures among them), the selection and its
// handles, the stroke being drawn, the signature being placed. It never takes a touch.
export const SurfaceOverlay = memo(function SurfaceOverlay({
  layout,
  motion,
  pages,
  surfacePages,
  hits,
  cursor,
  flash,
  marks,
  moved,
  outlines,
  outlineColor,
  selected,
  ink,
  signing,
  night,
}: SurfaceOverlayProps) {
  const { scale, tx, ty } = motion;
  // The page layer's transform (PageSurface's layerStyle): screen = content × scale + translate.
  const transform = useDerivedValue<Transforms3d>(() => [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }]);
  const colors = overlayPalette(!!night);
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
          {pages.map((index) => {
            const rows = marks.get(index);
            const page = surfacePages[index];
            if (!rows?.length || !page || index >= layout.tops.length) return null;
            return (
              <PageMarks
                key={`marks:${page.id}`}
                box={pageBox(layout, index)}
                page={page}
                rows={rows}
                highlightAlpha={colors.highlightAlpha}
                moved={moved && rows.some((row) => row.id === moved.id) ? moved : null}
                outlines={outlines}
                outlineColor={outlineColor}
                night={night}
              />
            );
          })}
          {selected ? selected.rects.map((r, k) => <Rect key={`selected:${k}`} x={r.x} y={r.y} width={r.width} height={r.height} color={colors.selection} />) : null}
          {ink ? <LiveInk ink={ink} /> : null}
          {signing ? <SignBox signing={signing} motion={motion} color={outlineColor} night={night?.matrix ?? null} /> : null}
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
