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

// §16 G4: on Android the five files are embedded at build time (app.json, the expo-font plugin's
// android.fonts), where a font's family name is its file name - the names above. useFonts starts
// out `loaded` when every family is already registered natively, so there the first render has
// the fonts and nothing is loaded at run time. Everywhere else (Expo Go, the web, iOS, a dev build
// made before the fonts were embedded) the same call loads them from the bundle, as before.
// Changing a font means changing all three: `fontFamily`, `fontAssets` and app.json's list
// (theme/__tests__/embeddedFonts.test.ts compares them).
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

// §9 O4b: text follows the system font size everywhere, except dense chrome (the tab bar, filter
// chips and tabs, the Reader's top and bottom bars), which stops growing at 1.4x so its labels
// don't push the bar's icons off screen at 200 %.
export const CHROME_MAX_FONT_SCALE = 1.4;
