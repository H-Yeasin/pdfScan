import { Group, LinearGradient, Rect, type SkPoint, type Transforms3d } from '@shopify/react-native-skia';
import type { SharedValue } from 'react-native-reanimated';
import { foldTransform, introFrame, PAINT_RUNS, PIECE_DIRECTIONS, pieceTransform, SWEEP_PEAK, sweepLine, type IntroFrame } from '../../bootstrap/splashIntro';
import { BRAND, rgba } from '../../theme';
import { MarkPieceShape } from './BrandMark';
import { FOLD_PIVOT, MARK_VIEWBOX, type MarkPiece, type WhitePieceName } from './markGeometry';

// §15 V5: the splash intro's mark, in mark units (BrandTile scales and clips it). Its props are the
// moving parts, each a plain value or a Reanimated shared value: SplashIntro passes shared values
// derived from its clock; introMarkProps() gives the still values of one frame (to draw a frame
// without Reanimated, e.g. Skia's headless renderer). The file imports no Reanimated code.

type Animatable<T> = T | SharedValue<T>;

export type IntroMarkProps = {
  // Each white piece's offset.
  pieces: Record<WhitePieceName, Animatable<Transforms3d>>;
  // The fold's lift, around FOLD_PIVOT.
  fold: Animatable<Transforms3d>;
  // The light band's gradient line.
  bandStart: Animatable<SkPoint>;
  bandEnd: Animatable<SkPoint>;
};

// The light band: white, transparent at both ends (the gradient is clamped, so it lights nothing
// outside its line).
const SWEEP_COLORS = [rgba(BRAND.paper, 0), rgba(BRAND.paper, SWEEP_PEAK), rgba(BRAND.paper, 0)];
const SWEEP_POSITIONS = [0, 0.5, 1];

// The mark in paint order. The green pieces are one layer, so the band, blended srcATop, lights only
// them (PAINT_RUNS: they are consecutive in the logo's paint order, so the layer doesn't change it).
export function IntroMark({ pieces, fold, bandStart, bandEnd }: IntroMarkProps) {
  const white = (piece: MarkPiece) => (
    <Group key={piece.name} transform={pieces[piece.name as WhitePieceName]}>
      <MarkPieceShape piece={piece} />
    </Group>
  );
  return (
    <>
      {PAINT_RUNS.before.map(white)}
      <Group layer>
        {PAINT_RUNS.greens.map((piece) =>
          piece.name === 'fold' ? (
            <Group key={piece.name} origin={FOLD_PIVOT} transform={fold}>
              <MarkPieceShape piece={piece} />
            </Group>
          ) : (
            <MarkPieceShape key={piece.name} piece={piece} />
          )
        )}
        <Rect x={0} y={0} width={MARK_VIEWBOX.width} height={MARK_VIEWBOX.height} blendMode="srcATop">
          <LinearGradient start={bandStart} end={bandEnd} colors={SWEEP_COLORS} positions={SWEEP_POSITIONS} />
        </Rect>
      </Group>
      {PAINT_RUNS.after.map(white)}
    </>
  );
}

// The still props of the frame at `t` ms after the release.
export function introMarkProps(t: number): IntroMarkProps {
  const frame: IntroFrame = introFrame(t);
  const band = sweepLine(frame.sweep);
  return {
    pieces: {
      stemTop: pieceTransform(PIECE_DIRECTIONS.stemTop, frame.part),
      topBar: pieceTransform(PIECE_DIRECTIONS.topBar, frame.part),
      bowl: pieceTransform(PIECE_DIRECTIONS.bowl, frame.part),
      stemBottom: pieceTransform(PIECE_DIRECTIONS.stemBottom, frame.part),
    },
    fold: foldTransform(frame.fold),
    bandStart: band.start,
    bandEnd: band.end,
  };
}
