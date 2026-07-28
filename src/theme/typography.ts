import { useFonts } from 'expo-font';
import { Caprasimo_400Regular } from '@expo-google-fonts/caprasimo';
import {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
} from '@expo-google-fonts/figtree';

export const fontFamily = {
  heading: 'Caprasimo_400Regular',
  bodyRegular: 'Figtree_400Regular',
  bodyMedium: 'Figtree_500Medium',
  bodySemiBold: 'Figtree_600SemiBold',
  bodyBold: 'Figtree_700Bold',
} as const;

const fontAssets = {
  Caprasimo_400Regular,
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
};

export function useAppFonts() {
  const [loaded, error] = useFonts(fontAssets);
  return { fontsReady: loaded || !!error };
}

export const typeScale = {
  display: { fontFamily: fontFamily.heading, fontSize: 28, lineHeight: 32 },
  title: { fontFamily: fontFamily.heading, fontSize: 20, lineHeight: 24 },
  body: { fontFamily: fontFamily.bodyRegular, fontSize: 16, lineHeight: 22 },
  label: { fontFamily: fontFamily.bodySemiBold, fontSize: 14, lineHeight: 18 },
  caption: { fontFamily: fontFamily.bodyRegular, fontSize: 13, lineHeight: 17 },
  mono: { fontFamily: 'monospace', fontSize: 13, lineHeight: 17 },
} as const;
