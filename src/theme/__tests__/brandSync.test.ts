import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { BRAND, SPLASH_IMAGE_DP, SPLASH_TILE_FRACTION, TILE_RIM, TILE_SHADOW, type BrandGradient } from '../brand';
import { tokens } from '../tokens';
import {
  FOLD_PIVOT,
  GREEN_PIECES,
  MARK_CONTENT_BOX,
  MARK_GRADIENTS,
  MARK_IN_TILE,
  MARK_PIECES,
  MARK_VIEWBOX,
  TILE_GRADIENT,
  TILE_SIZE,
  WHITE_PIECE_CENTRES,
  WHITE_PIECES,
  type GradientLine,
  type MarkGradientName,
} from '../../components/brand/markGeometry';

// §15 V1: the app draws the logo from typed copies of the owner's SVGs (theme/brand.ts for the
// colours, components/brand/markGeometry.ts for the shapes), and the icon script renders the SVGs
// themselves. This reads the SVGs and fails when the two drift apart: a logo changed in one place
// and not the other. A source scan, like i18n/__tests__/hardcodedStrings.test.ts. §15 V2: also
// app.json's icon and splash colours, and the values scripts/make-icons.mjs copies from the app.

const ROOT = join(__dirname, '../../..');
const BRAND_DIR = join(ROOT, 'assets/brand');
const markSvg = readFileSync(join(BRAND_DIR, 'pdfscan-mark.svg'), 'utf8');
const tileSvg = readFileSync(join(BRAND_DIR, 'pdfscan-tile.svg'), 'utf8');

type Attrs = Record<string, string>;

function attrs(tag: string): Attrs {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
}

function tags(svg: string, name: string): Attrs[] {
  return [...svg.matchAll(new RegExp(`<${name}\\b([^>]*)>`, 'g'))].map((m) => attrs(m[1]));
}

// The root <svg> tag's attributes.
function root(svg: string): Attrs {
  return tags(svg, 'svg')[0];
}

type ParsedGradient = { line: GradientLine; stops: string[]; offsets: number[] };

function gradients(svg: string): Map<string, ParsedGradient> {
  const found = new Map<string, ParsedGradient>();
  for (const m of svg.matchAll(/<linearGradient\b([^>]*)>([\s\S]*?)<\/linearGradient>/g)) {
    const a = attrs(m[1]);
    const stops = tags(m[2], 'stop');
    found.set(a.id, {
      line: { from: { x: +a.x1, y: +a.y1 }, to: { x: +a.x2, y: +a.y2 } },
      stops: stops.map((s) => colour(s['stop-color'])),
      // A stop without an offset is at 0.
      offsets: stops.map((s) => (s.offset === undefined ? 0 : +s.offset)),
    });
  }
  return found;
}

// The SVGs say "white" and use upper-case hex; brand.ts may write either.
function colour(value: string): string {
  return value === 'white' ? '#ffffff' : value.toLowerCase();
}

function gradientRef(fill: string): string | undefined {
  return /^url\(#([^)]+)\)$/.exec(fill)?.[1];
}

function brandGradient(g: BrandGradient) {
  return { stops: g.stops.map(colour), offsets: [...g.offsets] };
}

describe('the mark (assets/brand/pdfscan-mark.svg)', () => {
  const paths = tags(markSvg, 'path');
  const markGradients = gradients(markSvg);

  it('has the viewBox in markGeometry', () => {
    const { width, height } = MARK_VIEWBOX;
    expect(root(markSvg)).toMatchObject({ width: `${width}`, height: `${height}`, viewBox: `0 0 ${width} ${height}` });
  });

  it('has the pieces of MARK_PIECES, in paint order, with the same paths', () => {
    expect(paths.map((p) => p.d)).toEqual(MARK_PIECES.map((piece) => piece.d));
  });

  it.each(MARK_PIECES.map((piece, i) => [piece.name, i] as const))('%s has the fill and stroke in brand.ts', (_name, i) => {
    const piece = MARK_PIECES[i];
    const path = paths[i];
    const brand = BRAND[piece.fill];
    const ref = gradientRef(path.fill);
    if (typeof brand === 'string') {
      expect(ref).toBeUndefined();
      expect(colour(path.fill)).toBe(colour(brand));
    } else {
      const parsed = ref === undefined ? undefined : markGradients.get(ref);
      expect(parsed).toBeDefined();
      expect({ stops: parsed!.stops, offsets: parsed!.offsets }).toEqual(brandGradient(brand));
      expect(parsed!.line).toEqual(MARK_GRADIENTS[piece.fill as MarkGradientName]);
    }
    // An outline is always BRAND.paper; SVG's default stroke width is 1.
    if (piece.stroke) {
      expect(colour(path.stroke)).toBe(colour(BRAND.paper));
      expect(path['stroke-width'] === undefined ? 1 : +path['stroke-width']).toBe(piece.stroke.width);
    } else {
      expect(path.stroke).toBeUndefined();
    }
  });

  it('uses each gradient in markGeometry once, and no others', () => {
    const used = paths.map((p) => gradientRef(p.fill)).filter((id): id is string => id !== undefined);
    expect(used.sort()).toEqual([...markGradients.keys()].sort());
    expect(MARK_PIECES.filter((piece) => piece.fill in MARK_GRADIENTS).length).toBe(used.length);
  });

  it('has the drop shadow in BRAND.shadow', () => {
    const offset = tags(markSvg, 'feOffset')[0];
    expect({ dx: +offset.dx, dy: +offset.dy }).toEqual({ dx: BRAND.shadow.dx, dy: BRAND.shadow.dy });
    expect(+tags(markSvg, 'feGaussianBlur')[0].stdDeviation).toBe(BRAND.shadow.blur);
    // The shadow's colour matrix is black (every row 0) with the alpha scaled to the opacity. The
    // other matrix in the filter (in="SourceAlpha") only makes the hard alpha the blur cuts out.
    const tint = tags(markSvg, 'feColorMatrix').find((m) => m.in === undefined);
    const values = tint!.values.split(/\s+/).map(Number);
    expect(values).toEqual([...Array(18).fill(0), BRAND.shadow.opacity, 0]);
    expect(BRAND.shadow.color).toBe('#000000');
  });

  it('splits the pieces into the white page and the green ribbons', () => {
    expect(WHITE_PIECES.map((p) => p.name)).toEqual(['stemTop', 'topBar', 'bowl', 'stemBottom']);
    expect(GREEN_PIECES.map((p) => p.name)).toEqual(['ribbon', 'bowlInner', 'diagonal', 'fold']);
  });

  it('fills MARK_CONTENT_BOX', () => {
    const box = pathsBounds(MARK_PIECES.map((piece) => piece.d));
    const { x, y, width, height } = MARK_CONTENT_BOX;
    expect(box.x0).toBeCloseTo(x, 1);
    expect(box.y0).toBeCloseTo(y, 1);
    expect(box.x1).toBeCloseTo(x + width, 1);
    expect(box.y1).toBeCloseTo(y + height, 1);
  });
});

// §15 V5: what the splash intro moves.
describe('the splash intro geometry', () => {
  it.each(Object.entries(WHITE_PIECE_CENTRES))("puts %s's centre in the middle of its bounds", (name, centre) => {
    const box = pathsBounds([MARK_PIECES.find((piece) => piece.name === name)!.d]);
    expect(centre.x).toBeCloseTo((box.x0 + box.x1) / 2, 1);
    expect(centre.y).toBeCloseTo((box.y0 + box.y1) / 2, 1);
  });

  it("pins the fold at its right-angle corner (smallest x, largest y)", () => {
    const box = pathsBounds([MARK_PIECES.find((piece) => piece.name === 'fold')!.d]);
    expect(FOLD_PIVOT).toEqual({ x: box.x0, y: box.y1 });
  });
});

describe('the tile (assets/brand/pdfscan-tile.svg)', () => {
  it('has the size and corner radius in markGeometry', () => {
    const { width, height, rx } = TILE_SIZE;
    expect(root(tileSvg)).toMatchObject({ width: `${width}`, height: `${height}`, viewBox: `0 0 ${width} ${height}` });
    expect(tags(tileSvg, 'rect')).toEqual([expect.objectContaining({ width: `${width}`, height: `${height}`, rx: `${rx}` })]);
  });

  it('has the gradient in BRAND.tile and TILE_GRADIENT', () => {
    const ref = gradientRef(tags(tileSvg, 'rect')[0].fill);
    const parsed = gradients(tileSvg).get(ref!);
    expect({ stops: parsed!.stops, offsets: parsed!.offsets }).toEqual(brandGradient(BRAND.tile));
    expect(parsed!.line).toEqual(TILE_GRADIENT);
  });

  it('centres the mark like the reference render', () => {
    const { x, y, width, height } = MARK_CONTENT_BOX;
    expect(MARK_IN_TILE.scale).toBe(1);
    expect(MARK_IN_TILE.x + x + width / 2).toBeCloseTo(TILE_SIZE.width / 2, 6);
    expect(MARK_IN_TILE.y + y + height / 2).toBeCloseTo(TILE_SIZE.height / 2, 6);
    // The reference is the tile at 1:1 (a PNG's IHDR holds its width and height at bytes 16 and 20).
    const png = readFileSync(join(BRAND_DIR, 'reference/pdfscan-applogo.png'));
    expect({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) }).toEqual({ width: TILE_SIZE.width, height: TILE_SIZE.height });
  });
});

// §15 V2: the native splash must look exactly like the splash intro's first frame (V5), which draws
// on the theme's bg, and the icon script can't import the app's TypeScript, so it keeps copies.
describe('app.json and the icon script', () => {
  const expo = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8')).expo;
  const plugin = (name: string) => expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === name)?.[1];
  const script = readFileSync(join(ROOT, 'scripts/make-icons.mjs'), 'utf8');

  // A top-level `const NAME = 0.875;` or `const NAME = { a: 1, b: 2 };` in the script.
  function scriptConst(name: string): unknown {
    const text = new RegExp(`^const ${name} = (.+);$`, 'm').exec(script)?.[1];
    if (text === undefined) throw new Error(`make-icons.mjs has no top-level const ${name}`);
    if (!text.startsWith('{')) return Number(text);
    return Object.fromEntries([...text.matchAll(/(\w+):\s*(-?[\d.]+)/g)].map((m) => [m[1], Number(m[2])]));
  }

  it('gives the splash the theme backgrounds and SPLASH_IMAGE_DP', () => {
    const splash = plugin('expo-splash-screen');
    expect(splash.backgroundColor).toBe(tokens.light.bg);
    expect(splash.dark.backgroundColor).toBe(tokens.dark.bg);
    expect(splash.imageWidth).toBe(SPLASH_IMAGE_DP);
  });

  it("gives the adaptive icon the tile's top-right colour", () => {
    expect(colour(expo.android.adaptiveIcon.backgroundColor)).toBe(colour(BRAND.tile.stops[0]));
  });

  // §15 V3: the shade colours the notification icon in the app's own colour, the light accent
  // (the logo's solid green, BRAND.green).
  it('colours notifications in the light accent', () => {
    expect(colour(plugin('expo-notifications').color)).toBe(colour(tokens.light.accent));
  });

  it('has the copies in make-icons.mjs', () => {
    expect(scriptConst('SPLASH_TILE_FRACTION')).toBe(SPLASH_TILE_FRACTION);
    expect(scriptConst('MARK_CONTENT_BOX')).toEqual(MARK_CONTENT_BOX);
    expect(scriptConst('TILE_SHADOW')).toEqual(TILE_SHADOW);
    expect(scriptConst('TILE_RIM')).toEqual(TILE_RIM);
  });
});

// AGENTS.md security rule: brand assets stay plain drawings. The icon script (V2) renders them with
// resvg, and a design tool's export is easy to swap in unchecked.
describe('brand SVGs carry no code or links', () => {
  const svgs = readdirSync(BRAND_DIR).filter((name) => name.endsWith('.svg'));
  const FORBIDDEN: [string, RegExp][] = [
    ['script tag', /<script/i],
    ['foreignObject', /foreignObject/i],
    ['href or xlink:href', /href\s*=/i],
    ['on… event handler', /\son[a-z]+\s*=/i],
    ['javascript: URL', /javascript:/i],
    ['entity declaration', /<!ENTITY/i],
  ];

  it('finds both sources', () => {
    expect(svgs.sort()).toEqual(['pdfscan-mark.svg', 'pdfscan-tile.svg']);
  });

  it.each(svgs.flatMap((name) => FORBIDDEN.map(([what, re]) => [name, what, re] as const)))('%s contains no %s', (name, _what, re) => {
    expect(readFileSync(join(BRAND_DIR, name), 'utf8')).not.toMatch(re);
  });
});

// The exact bounds of SVG paths drawn with absolute M, L, H, V, C and Z (all the owner's export
// uses; anything else fails here, so a new export with other commands gets a look first).
function pathsBounds(ds: string[]) {
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const add = (x: number, y: number) => {
    box.x0 = Math.min(box.x0, x);
    box.y0 = Math.min(box.y0, y);
    box.x1 = Math.max(box.x1, x);
    box.y1 = Math.max(box.y1, y);
  };
  for (const d of ds) {
    const tokens = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? [];
    let i = 0;
    let command = '';
    let [x, y, startX, startY] = [0, 0, 0, 0];
    const next = () => Number(tokens[i++]);
    while (i < tokens.length) {
      if (/[A-Za-z]/.test(tokens[i])) command = tokens[i++];
      switch (command) {
        case 'M':
          [x, y] = [next(), next()];
          [startX, startY] = [x, y];
          command = 'L';
          break;
        case 'L':
          [x, y] = [next(), next()];
          break;
        case 'H':
          x = next();
          break;
        case 'V':
          y = next();
          break;
        case 'C': {
          const [c1x, c1y, c2x, c2y, ex, ey] = [next(), next(), next(), next(), next(), next()];
          for (const t of cubicExtremes(x, c1x, c2x, ex).concat(cubicExtremes(y, c1y, c2y, ey))) {
            add(cubicAt(x, c1x, c2x, ex, t), cubicAt(y, c1y, c2y, ey, t));
          }
          [x, y] = [ex, ey];
          break;
        }
        case 'Z':
          [x, y] = [startX, startY];
          break;
        default:
          throw new Error(`Path command ${command} isn't handled: ${d}`);
      }
      add(x, y);
    }
  }
  return box;
}

function cubicAt(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

// Where a cubic's derivative is 0 inside (0, 1): a·t² + b·t + c = 0.
function cubicExtremes(p0: number, p1: number, p2: number, p3: number): number[] {
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  const roots =
    Math.abs(a) < 1e-12
      ? Math.abs(b) < 1e-12
        ? []
        : [-c / b]
      : b * b - 4 * a * c < 0
        ? []
        : [(-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a), (-b - Math.sqrt(b * b - 4 * a * c)) / (2 * a)];
  return roots.filter((t) => t > 0 && t < 1);
}
