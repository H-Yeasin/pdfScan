import fs from 'fs';
import path from 'path';
import { fontFamily } from '../typography';

const root = path.resolve(__dirname, '../../..');
const appJson = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')) as {
  expo: { plugins: (string | [string, { android?: { fonts?: string[] } }])[] };
};

// §16 G4: the fonts are embedded in the Android build (the expo-font config plugin), where a
// font's family name is its file name. A family missing from app.json's list isn't an error on a
// phone - useFonts quietly falls back to loading all of them at run time - so the boot would just
// get slower. This is what notices.
describe('embedded fonts (app.json)', () => {
  const plugin = appJson.expo.plugins.find((entry) => Array.isArray(entry) && entry[0] === 'expo-font');
  const files = (Array.isArray(plugin) ? plugin[1].android?.fonts : undefined) ?? [];

  it('embeds exactly the families the app styles text with', () => {
    const embedded = files.map((file) => path.basename(file).replace(/\.(ttf|otf)$/, '')).sort();
    expect(embedded).toEqual(Object.values(fontFamily).sort());
  });

  it('points at files that exist', () => {
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) expect(fs.existsSync(path.join(root, file))).toBe(true);
  });
});
