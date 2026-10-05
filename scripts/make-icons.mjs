// Generates the app icons in assets/ from the logo mark (assets/brand/pdfscan-mark.svg). Every
// variant is the same two paths - the folded-page "P" and its scan-corner bar - in different
// colours and sizes, so they are drawn here from the path data rather than exported one by one
// from a design tool (the appicon.co pack ran the mark edge to edge, which Android's adaptive mask
// clips).
//
// Rerun after changing the mark:
//   npm i --prefix /tmp/resvg @resvg/resvg-js
//   NODE_PATH=/tmp/resvg/node_modules node scripts/make-icons.mjs
//   for f in assets/icon.png assets/store/playstore-icon.png assets/favicon.png \
//            assets/android-icon-background.png; do
//     sips -s format jpeg -s formatOptions 100 $f --out /tmp/i.jpg && sips -s format png /tmp/i.jpg --out $f
//   done
// (the loop drops the alpha channel from the opaque icons: App Store Connect rejects a 1024 icon
// that has one, even when every pixel is opaque),
// then `npx expo prebuild --clean` so android/ and ios/ pick the new files up.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Resvg } = require('@resvg/resvg-js');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// The mark's own grid is 456 x 514 (see assets/brand/pdfscan-construction.svg).
const MARK_W = 456;
const MARK_H = 514;
const P_PATH =
  'M326 190C326 219.9 302.5 242 262 242H96C44.2 242 0 286.2 0 340V514H122V364H300C390 364 456 310 456 200V160L296 0H62C27.76 0 0 27.76 0 62V276.5L28 246.6V62C28 43.22 43.22 28 62 28H274V130C274 152.09 291.91 170 314 170H428V200C428 294 378 336 300 336H122V290H94V486H28V340C28 297.8 55.8 270 96 270H262C313.5 270 354 232.1 354 190ZM302 45.6L398.4 142H314C307.37 142 302 136.63 302 130Z';
const BAR_PATH = 'M96 96H254V124H124V222H96Z';

const INK = '#201e1d';
const TEAL = '#16a085';
const CREAM = '#fffdf8';
const MINT = '#4fd1b0';
const GREEN = '#12332c';

/**
 * One square SVG with the mark centred at `height` (a fraction of the canvas). The launcher
 * icon uses 0.5625 like the designer's pdfscan-app-icon.svg; adaptive layers use 0.4 so the
 * mark's bounding box stays inside Android's 66% safe-zone circle under any mask shape and
 * looks the same size as the launcher icon once the launcher crops to the inner two thirds.
 */
function iconSvg({ size, height, ink, bar, background }) {
  const s = (height * size) / MARK_H;
  const tx = (size - MARK_W * s) / 2;
  const ty = (size - MARK_H * s) / 2;
  const bg = background ? `<rect width="${size}" height="${size}" fill="${background}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${bg}<g transform="translate(${tx} ${ty}) scale(${s})"><path fill="${ink}" fill-rule="evenodd" d="${P_PATH}"/><path fill="${bar}" d="${BAR_PATH}"/></g></svg>`;
}

function solidSvg(size, color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="${color}"/></svg>`;
}

function write(file, svg) {
  const out = join(root, file);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, new Resvg(svg).render().asPng());
  console.log('wrote', file);
}

const launcher = { ink: CREAM, bar: MINT, background: GREEN };

write('assets/icon.png', iconSvg({ size: 1024, height: 0.5625, ...launcher }));
write('assets/store/playstore-icon.png', iconSvg({ size: 512, height: 0.5625, ...launcher }));
write('assets/favicon.png', iconSvg({ size: 48, height: 0.625, ...launcher }));

write('assets/android-icon-background.png', solidSvg(512, GREEN));
write('assets/android-icon-foreground.png', iconSvg({ size: 512, height: 0.4, ink: CREAM, bar: MINT }));
// Themed icon (Android 13+) and the notification icon: Android only reads the alpha channel.
write('assets/android-icon-monochrome.png', iconSvg({ size: 432, height: 0.4, ink: '#ffffff', bar: '#ffffff' }));

// The splash draws this at imageWidth 160 on #f5ead8 (light) or #14120f (dark), so the dark
// splash needs the cream mark or it disappears.
write('assets/splash-icon.png', iconSvg({ size: 1024, height: 0.9, ink: INK, bar: TEAL }));
write('assets/splash-icon-dark.png', iconSvg({ size: 1024, height: 0.9, ink: CREAM, bar: MINT }));
