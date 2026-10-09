// §15 V2: makes every app icon and the splash images in assets/ from the owner's logo files,
// assets/brand/pdfscan-mark.svg (the "P") and pdfscan-tile.svg (the rounded tile behind it). The
// full-colour images nest each file's markup unchanged (an inner <svg> with the file's viewBox), so
// the owner's gradients and drop-shadow filter are rendered as drawn; the two files' ids don't clash.
// The alpha-only icons (themed, notification) can't use colour, so they redraw the mark's paths,
// read from the same file. Like the owner's render (assets/brand/reference/), the mark and its
// shadow are clipped to the tile wherever both appear.
//
// Rerun after changing the logo:
//   npm i --prefix /tmp/resvg @resvg/resvg-js
//   NODE_PATH=/tmp/resvg/node_modules node scripts/make-icons.mjs
// then open every PNG it wrote (compare icon.png with the reference), and run
// `npx expo prebuild --clean` so android/ and ios/ pick the new files up, then make a new dev build.
// The opaque icons are written without an alpha channel (App Store Connect rejects a 1024 icon that
// has one, even when every pixel is opaque), so they need no sips pass. Needs Node 22.2+ (zlib.crc32).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { crc32, deflateSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const { Resvg } = require('@resvg/resvg-js');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Copies of values in the app (src/theme/brand.ts, src/components/brand/markGeometry.ts), so the
// splash intro (§15 V5) can draw the identical frame. theme/__tests__/brandSync.test.ts reads them
// from this file and fails if they differ.
// The pieces' real extent in mark units (markGeometry's MARK_CONTENT_BOX).
const MARK_CONTENT_BOX = { x: 62.7, y: 61.2, width: 500, height: 610 };
// The splash tile's width as a fraction of the splash image (brand.ts: 140 dp of the 160 dp
// imageWidth, so its corners stay inside Android 12's 192 dp circle).
const SPLASH_TILE_FRACTION = 0.875;
// The tile's own shadow (light) and rim (dark), in tile units (the tile is 819 wide).
const TILE_SHADOW = { dy: 12, blur: 24, opacity: 0.22 };
const TILE_RIM = { width: 6, opacity: 0.12 };

// The themed icon keeps the logo's two tones as alpha: the white pieces 1, the green ones this.
const MONO_GREEN_ALPHA = 0.45;

function attrs(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
}

// A file's viewBox size and the markup inside its root <svg>.
function readSvg(name) {
  const source = readFileSync(join(root, 'assets/brand', name), 'utf8');
  const open = /<svg\b([^>]*)>/.exec(source);
  const [, , width, height] = attrs(open[1]).viewBox.split(/\s+/).map(Number);
  return { width, height, inner: source.slice(open.index + open[0].length, source.lastIndexOf('</svg>')) };
}

const MARK = readSvg('pdfscan-mark.svg');
const TILE = readSvg('pdfscan-tile.svg');
const TILE_RX = Number(attrs(/<rect\b([^>]*)>/.exec(TILE.inner)[1]).rx);
const PIECES = [...MARK.inner.matchAll(/<path\b([^>]*)>/g)].map((m) => attrs(m[1]));
const isWhite = (fill) => /^(white|#fff|#ffffff)$/i.test(fill);

// `inner` in the mark's viewBox, placed so the content box is `height` px tall and centred on (cx, cy).
function placeMark(inner, cx, cy, height) {
  const s = height / MARK_CONTENT_BOX.height;
  const x = cx - (MARK_CONTENT_BOX.x + MARK_CONTENT_BOX.width / 2) * s;
  const y = cy - (MARK_CONTENT_BOX.y + MARK_CONTENT_BOX.height / 2) * s;
  return `<svg x="${x}" y="${y}" width="${MARK.width * s}" height="${MARK.height * s}" viewBox="0 0 ${MARK.width} ${MARK.height}">${inner}</svg>`;
}

// The tile's gradient filling a square edge to edge: iOS and Play put their own corner masks on, and
// the 819 × 802 tile isn't square (stretched 2% here, which nobody can see).
function squareGradient(size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${TILE.width} ${TILE.height}" preserveAspectRatio="none">${TILE.inner.replace(/\srx="[^"]*"/, '')}</svg>`;
}

// The full logo as the owner's render: the rounded tile, the mark centred on it at scale 1, the
// mark's shadow clipped to the tile. `width` px wide at (x, y); optionally the dark theme's rim.
function logoTile({ x, y, width, rim = false }) {
  const height = (width * TILE.height) / TILE.width;
  const clip = `<clipPath id="tile-clip"><rect width="${TILE.width}" height="${TILE.height}" rx="${TILE_RX}"/></clipPath>`;
  const mark = placeMark(MARK.inner, TILE.width / 2, TILE.height / 2, MARK_CONTENT_BOX.height);
  // An inside stroke: twice the width, centred on the edge, the outer half clipped away.
  const rimRect = rim
    ? `<rect width="${TILE.width}" height="${TILE.height}" rx="${TILE_RX}" fill="none" stroke="#ffffff" stroke-opacity="${TILE_RIM.opacity}" stroke-width="${TILE_RIM.width * 2}" clip-path="url(#tile-clip)"/>`
    : '';
  return `<svg x="${x}" y="${y}" width="${width}" height="${height}" viewBox="0 0 ${TILE.width} ${TILE.height}"><defs>${clip}</defs>${TILE.inner}<g clip-path="url(#tile-clip)">${mark}</g>${rimRect}</svg>`;
}

// A soft black shadow under a tile drawn by logoTile at the same place.
function tileShadow({ x, y, width }) {
  const s = width / TILE.width;
  return `<filter id="tile-shadow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${TILE_SHADOW.blur * s}"/></filter><rect x="${x}" y="${y + TILE_SHADOW.dy * s}" width="${width}" height="${TILE.height * s}" rx="${TILE_RX * s}" fill="#000000" fill-opacity="${TILE_SHADOW.opacity}" filter="url(#tile-shadow)"/>`;
}

// The mark's pieces in paint order with plain fills and no shadow: white ones in `white`, green
// ones in `green`, the outlines (the fold's, topBar's hairline) in `white`.
function flatPieces({ white, green }) {
  return PIECES.map((p) => {
    const stroke = p.stroke ? ` stroke="${white}" stroke-width="${p['stroke-width'] ?? 1}"` : '';
    return `<path d="${p.d}" fill="${isWhite(p.fill) ? white : green}"${stroke}/>`;
  }).join('');
}

function svg(size, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${body}</svg>`;
}

// The gradient edge to edge with the mark centred; `height` is the content's fraction of the canvas.
function squareIcon(size, height) {
  return svg(size, squareGradient(size) + placeMark(MARK.inner, size / 2, size / 2, height * size));
}

// Rendered at 4x and averaged down. Where two pieces meet edge to edge, each one's antialiased edge
// only half covers the boundary pixel, so a 1x render leaves a faint dark seam (the shadow shows
// through: 246 instead of 255 down the top of the stem). At 4x the gap shrinks to about 1%.
const SUPERSAMPLE = 4;

function write(file, image, { opaque = false } = {}) {
  const out = join(root, file);
  mkdirSync(dirname(out), { recursive: true });
  const big = new Resvg(image, { fitTo: { mode: 'zoom', value: SUPERSAMPLE } }).render();
  const [width, height] = [big.width / SUPERSAMPLE, big.height / SUPERSAMPLE];
  // resvg's pixels are premultiplied RGBA, so a plain average is the right box filter. Read them once:
  // the getter copies the whole buffer.
  const src = big.pixels;
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let ch = 0; ch < 4; ch++) {
        let sum = 0;
        for (let sy = 0; sy < SUPERSAMPLE; sy++) {
          for (let sx = 0; sx < SUPERSAMPLE; sx++) {
            sum += src[((y * SUPERSAMPLE + sy) * big.width + x * SUPERSAMPLE + sx) * 4 + ch];
          }
        }
        pixels[(y * width + x) * 4 + ch] = Math.round(sum / SUPERSAMPLE ** 2);
      }
    }
  }
  writeFileSync(out, png(width, height, pixels, opaque));
  console.log('wrote', file);
}

// An 8-bit PNG from premultiplied RGBA pixels: RGB with no alpha channel when `opaque` (every pixel
// must be), otherwise RGBA with the colours un-premultiplied. Rows use the Paeth filter, which keeps
// the gradients small.
function png(width, height, rgba, opaque) {
  const channels = opaque ? 3 : 4;
  const stride = width * channels;
  const plain = Buffer.alloc(stride * height);
  for (let i = 0; i < width * height; i++) {
    const alpha = rgba[i * 4 + 3];
    if (opaque && alpha !== 255) throw new Error('An opaque icon has a transparent pixel');
    for (let ch = 0; ch < 3; ch++) {
      plain[i * channels + ch] = alpha === 0 ? 0 : Math.min(255, Math.round((rgba[i * 4 + ch] * 255) / alpha));
    }
    if (!opaque) plain[i * 4 + 3] = alpha;
  }
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (stride + 1);
    raw[row] = 4;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? plain[y * stride + x - channels] : 0;
      const b = y > 0 ? plain[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? plain[(y - 1) * stride + x - channels] : 0;
      const p = a + b - c;
      const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
      const predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      raw[row + 1 + x] = (plain[y * stride + x] - predictor) & 0xff;
    }
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = opaque ? 2 : 6; // colour type: RGB or RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Launcher (iOS, and Android before adaptive icons), store and web. The reference's mark is 0.76 of
// its much rounder tile; 0.62 looks the same size once a launcher's mask rounds the square.
write('assets/icon.png', squareIcon(1024, 0.62), { opaque: true });
write('assets/store/playstore-icon.png', squareIcon(512, 0.62), { opaque: true });
write('assets/favicon.png', squareIcon(48, 0.7), { opaque: true });

// Adaptive icon (Android 8+). The foreground's content is 0.4 of the layer so it stays inside the
// 66% safe-zone circle under any mask shape, and looks the size of icon.png once the launcher crops
// the layer to its inner two thirds.
write('assets/android-icon-background.png', svg(512, squareGradient(512)), { opaque: true });
write('assets/android-icon-foreground.png', svg(512, placeMark(MARK.inner, 256, 256, 0.4 * 512)));

// Themed icon (Android 13+): the launcher reads only the alpha and tints it, so the logo's two tones
// become two alphas. A luminance mask does it: the pieces are drawn opaque in paint order (white,
// or grey for the green ones), so a later piece replaces what it covers, as in the colour logo,
// and each pixel's grey becomes its alpha. resvg takes the mask's luminance straight from the sRGB
// values (grey 115 gives alpha 115). No shadow; the counter is already a hole.
const grey = Math.round(MONO_GREEN_ALPHA * 255);
const monoPieces = flatPieces({ white: '#ffffff', green: `rgb(${grey},${grey},${grey})` });
write(
  'assets/android-icon-monochrome.png',
  svg(432, `<mask id="mono" maskUnits="userSpaceOnUse" x="0" y="0" width="432" height="432">${placeMark(monoPieces, 216, 216, 0.4 * 432)}</mask><rect width="432" height="432" fill="#ffffff" mask="url(#mono)"/>`)
);

// Notification icon (the 24 dp status bar icon, made at 4x): a solid white silhouette of all eight
// pieces, filling Material's 20 dp live area. Android tints it, and colours it with
// expo-notifications' `color` in the shade.
write('assets/notification-icon.png', svg(96, placeMark(flatPieces({ white: '#ffffff', green: '#ffffff' }), 48, 48, (20 / 24) * 96)));

// Splash (expo-splash-screen draws it at imageWidth 160 dp on the theme's bg, #f5ead8 or #14120f):
// the full logo tile, centred, SPLASH_TILE_FRACTION of the image wide. Light: a soft shadow under
// the tile. Dark: no tile shadow (it turns muddy on #14120f), and a faint light rim so the tile's
// dark-green top-right corner (about 2.1:1 against the background) doesn't sink into it. The mark's
// own shadow is part of the logo, so it stays in both.
const splashWidth = 1024 * SPLASH_TILE_FRACTION;
const splash = { x: (1024 - splashWidth) / 2, y: (1024 - (splashWidth * TILE.height) / TILE.width) / 2, width: splashWidth };
write('assets/splash-icon.png', svg(1024, tileShadow(splash) + logoTile(splash)));
write('assets/splash-icon-dark.png', svg(1024, logoTile({ ...splash, rim: true })));
