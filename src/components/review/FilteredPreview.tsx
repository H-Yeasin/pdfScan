import { memo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { Canvas, ColorMatrix, Group, Paint, Picture } from '@shopify/react-native-skia';
import type { SkPicture } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { brightnessMatrix, contrastMatrix, saturationMatrix } from '../../services/enhance/filters/filterMath';
import { fitBox } from '../../utils/fitBox';
import type { LiveAdjust } from './useLiveAdjust';

type FilteredPreviewProps = {
  picture: SkPicture;
  // The picture's own recorded size (the preview image's pixels), aspect-fit into this view.
  contentWidth: number;
  contentHeight: number;
  // §16 G7: `picture` was recorded without the sliders (useFilteredPicture's `adjustLive`); they
  // are applied here, from these shared values, as the page is drawn.
  liveAdjust?: LiveAdjust;
  // Drawn over the adjusted page and not adjusted itself (the academic border, header, footer).
  overlayPicture?: SkPicture;
};

// <Canvas> equivalent of an <Image resizeMode="contain"> for an SkPicture from useFilteredPicture.
// memo: its props only change when the picture does, so nothing above it re-renders it for less.
export const FilteredPreview = memo(function FilteredPreview({ picture, contentWidth, contentHeight, liveAdjust, overlayPicture }: FilteredPreviewProps) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  const handleLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  };

  const fit = size && size.width > 0 && size.height > 0 ? fitBox(contentWidth, contentHeight, 0, 0, size.width, size.height) : null;

  return (
    <View style={styles.fill} onLayout={handleLayout}>
      {fit && (
        <Canvas style={styles.fill}>
          <Group transform={[{ translateX: fit.origin.x }, { translateY: fit.origin.y }, { scale: fit.scale }]}>
            {liveAdjust ? <AdjustedPicture picture={picture} live={liveAdjust} /> : <Picture picture={picture} />}
            {overlayPicture ? <Picture picture={overlayPicture} /> : null}
          </Group>
        </Canvas>
      )}
    </View>
  );
});

// The page under the sliders. drawFiltered puts the adjustment on top of the filter as three
// chained colour matrices (filterMath.adjustMatrices: brightness, then contrast, then
// saturation); this is the same chain as a layer's paint, with each matrix derived on the UI
// thread from the slider's shared value - a drag redraws the canvas and runs no JS. The innermost
// filter is applied first. It differs from the export by the layer's 8-bit rounding at most, and
// only while the Adjust panel is open: closed, the picture carries the adjustment itself.
function AdjustedPicture({ picture, live }: { picture: SkPicture; live: LiveAdjust }) {
  const { brightness, contrast, saturation } = live;
  const brightnessM = useDerivedValue(() => brightnessMatrix(brightness.value));
  const contrastM = useDerivedValue(() => contrastMatrix(1 + contrast.value));
  const saturationM = useDerivedValue(() => saturationMatrix(saturation.value));
  return (
    <Group
      layer={
        <Paint>
          <ColorMatrix matrix={saturationM}>
            <ColorMatrix matrix={contrastM}>
              <ColorMatrix matrix={brightnessM} />
            </ColorMatrix>
          </ColorMatrix>
        </Paint>
      }
    >
      <Picture picture={picture} />
    </Group>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
