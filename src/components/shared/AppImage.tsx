import { Image, type ImageProps } from 'expo-image';
import { memo } from 'react';
import { useTheme } from '../../theme';

type AppImageProps = Omit<ImageProps, 'source' | 'cachePolicy'> & {
  uri: string;
  // Transparent while it loads (a logo on a page, a picture over a dark camera), instead of the
  // theme's placeholder colour.
  bare?: boolean;
};

// §16 G6: every thumbnail and page preview goes through here (expo-image: decoded off the UI
// thread at the size it is shown, kept in memory and on disk). In a recycled row (FlashList) pass
// `recyclingKey`, or the row shows the previous document's picture until its own has loaded.
// Fills its box like RN's `resizeMode="cover"` unless `contentFit` says otherwise; no fade, so a
// row scrolled back into view doesn't blink.
export const AppImage = memo(function AppImage({ uri, bare, style, contentFit = 'cover', ...rest }: AppImageProps) {
  const { tokens } = useTheme();
  return (
    <Image
      source={uri}
      cachePolicy="memory-disk"
      contentFit={contentFit}
      transition={0}
      style={bare ? style : [{ backgroundColor: tokens.surface2 }, style]}
      {...rest}
    />
  );
});
