import { Blur, Canvas, Group, LinearGradient, Paint, Path, RoundedRect, Shadow } from '@shopify/react-native-skia';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useT } from '../../i18n/useT';
import { BRAND, rgba, TILE_RIM, TILE_SHADOW, spacing, typeScale, useTheme, type ThemeName } from '../../theme';
import { MARK_GRADIENTS, MARK_IN_TILE, MARK_PIECES, TILE_GRADIENT, TILE_SIZE, type MarkGradientName, type MarkPiece, type Point } from './markGeometry';

// §15 V4: the logo, drawn with Skia from the shared geometry (markGeometry.ts, theme/brand.ts), so
// it matches the icons and the splash images made from the same SVGs (scripts/make-icons.mjs). Skia
// is loaded at boot anyway (Review's crop and filters), so this adds nothing to cold start.
//
// It always draws the tile: the bare mark's white pieces vanish on the cream background. The theme
// rules are the splash images': in light a soft shadow under the tile, in dark no tile shadow (it
// turns muddy) and a faint light rim instead. The mark's own shadow is part of the logo: both.
//
// Paths go to <Path path={d}> as strings. Nothing here calls Skia.* (no Skia.Path.MakeFromSVGString
// at module scope): the Jest mock throws on any use, and this file must load under it.

// The width Skia draws as a hairline: one device pixel at any scale.
const HAIRLINE = 0;

// One piece of the mark in mark units, filled as in the SVG, then its outline (SVG paints a shape's
// fill, then its stroke).
//
// Where two pieces meet edge to edge, each one's antialiased edge only partly covers the boundary
// pixel, so the tile (or the shadow) shows through: at 72 dp a grey line runs down the top of the
// stem (218 instead of 255; 208 at 32 dp). So each fill also gets a hairline in its own paint,
// which overlaps its neighbours by half a pixel and closes the seam at any size. (The PNGs avoid it
// by rendering at 4x, scripts/make-icons.mjs; half a pixel more of white can't be seen.)
export function MarkPieceShape({ piece }: { piece: MarkPiece }) {
  const fill = BRAND[piece.fill];
  const shapes = [{ key: 'fill', style: 'fill' as const }, { key: 'seam', style: 'stroke' as const }].map(({ key, style }) => {
    const width = style === 'stroke' ? HAIRLINE : undefined;
    if (typeof fill === 'string') return <Path key={key} path={piece.d} style={style} strokeWidth={width} color={fill} />;
    // A gradient fill is the BRAND entry of the same name, along the line in MARK_GRADIENTS.
    const line = MARK_GRADIENTS[piece.fill as MarkGradientName];
    return (
      <Path key={key} path={piece.d} style={style} strokeWidth={width}>
        <LinearGradient start={line.from} end={line.to} colors={[...fill.stops]} positions={[...fill.offsets]} />
      </Path>
    );
  });
  return (
    <>
      {shapes}
      {piece.stroke ? <Path path={piece.d} style="stroke" strokeWidth={piece.stroke.width} color={BRAND.paper} /> : null}
    </>
  );
}

type TileProps = {
  // The tile's top-left corner and width in canvas units; its height follows (819 × 802).
  x: number;
  y: number;
  width: number;
  theme: ThemeName;
  // The mark's content in mark units, instead of the eight still pieces: the splash intro (V5) passes
  // its animated pieces. It still gets the tile, the clip, the shadow and the scale.
  mark?: ReactNode;
};

// The full logo, as the owner's render: the tile, the mark on it at scale 1 with its shadow, both
// clipped to the tile. Skia elements: put it inside a <Canvas> (BrandMark; the splash intro, V5).
// In light it draws a shadow below the tile (to 3σ: TILE_SHADOW.dy + 3 × blur tile units), so leave
// room for it.
export function BrandTile({ x, y, width, theme, mark }: TileProps) {
  const s = width / TILE_SIZE.width;
  const height = TILE_SIZE.height * s;
  const r = TILE_SIZE.rx * s;
  const at = (p: Point) => ({ x: x + p.x * s, y: y + p.y * s });
  const shadow = BRAND.shadow;
  // The shadow is a layer on the whole mark, as the SVG's filter is on its <g>: one shadow of all
  // eight pieces (inside the P's counter too), not one per piece falling on its neighbours. Its
  // numbers are in canvas units because the layer sits outside the mark's scale.
  const markShadow = (
    <Paint>
      <Shadow dx={shadow.dx * s} dy={shadow.dy * s} blur={shadow.blur * s} color={rgba(shadow.color, shadow.opacity)} />
    </Paint>
  );
  return (
    <Group>
      {theme === 'light' ? (
        <RoundedRect x={x} y={y + TILE_SHADOW.dy * s} width={width} height={height} r={r} color={shadow.color} opacity={TILE_SHADOW.opacity}>
          <Blur blur={TILE_SHADOW.blur * s} />
        </RoundedRect>
      ) : null}
      <RoundedRect x={x} y={y} width={width} height={height} r={r}>
        <LinearGradient start={at(TILE_GRADIENT.from)} end={at(TILE_GRADIENT.to)} colors={[...BRAND.tile.stops]} positions={[...BRAND.tile.offsets]} />
      </RoundedRect>
      <Group clip={{ rect: { x, y, width, height }, rx: r, ry: r }}>
        <Group layer={markShadow}>
          <Group transform={[{ translateX: x + MARK_IN_TILE.x * s }, { translateY: y + MARK_IN_TILE.y * s }, { scale: MARK_IN_TILE.scale * s }]}>
            {mark ?? MARK_PIECES.map((piece) => <MarkPieceShape key={piece.name} piece={piece} />)}
          </Group>
        </Group>
        {theme === 'dark' ? (
          // An inside stroke: twice the width, centred on the edge, the outer half clipped away.
          <RoundedRect x={x} y={y} width={width} height={height} r={r} style="stroke" strokeWidth={TILE_RIM.width * 2 * s} color={BRAND.paper} opacity={TILE_RIM.opacity} />
        ) : null}
      </Group>
    </Group>
  );
}

type Props = {
  // The tile's width in dp; its height is size × 802 / 819.
  size: number;
  // "PDF Scan" under the tile.
  wordmark?: boolean;
};

// The logo where a student meets the brand (Onboarding page 1, Settings → About). Its layout box is
// the tile; the light theme's shadow draws outside it. TalkBack reads it once, as "PDF Scan logo".
export function BrandMark({ size, wordmark = false }: Props) {
  const { tokens, theme } = useTheme();
  const { t } = useT();
  const height = (size * TILE_SIZE.height) / TILE_SIZE.width;
  const pad = Math.ceil(((TILE_SHADOW.dy + 3 * TILE_SHADOW.blur) * size) / TILE_SIZE.width);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={t('brand.logoLabel')} style={styles.wrap}>
      <View style={styles.wrap} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <View style={{ width: size, height }}>
          <Canvas style={{ position: 'absolute', left: -pad, top: -pad, width: size + 2 * pad, height: height + 2 * pad }}>
            <BrandTile x={pad} y={pad} width={size} theme={theme} />
          </Canvas>
        </View>
        {wordmark ? <Text style={[typeScale.title, styles.wordmark, { color: tokens.ink }]}>{t('brand.name')}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
  wordmark: {
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});
