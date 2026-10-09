import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { en } from '../../../i18n/en';
import { BRAND, ThemeProvider, TILE_RIM, useTheme } from '../../../theme';
import { BrandMark } from '../BrandMark';
import { MARK_PIECES, TILE_SIZE } from '../markGeometry';

// §15 V4: the logo in the app. Skia's components are host elements under Jest (test/mocks/skia.ts),
// so this checks what BrandMark asks Skia to draw, and what TalkBack hears.

let root: ReactTestRenderer | null = null;

function mount(element: React.ReactElement, theme: 'light' | 'dark' = 'light') {
  let setThemePref!: ReturnType<typeof useTheme>['setThemePref'];
  function Probe() {
    setThemePref = useTheme().setThemePref;
    return null;
  }
  act(() => {
    root = create(
      <ThemeProvider>
        <Probe />
        {element}
      </ThemeProvider>
    );
  });
  act(() => setThemePref(theme));
  return root!;
}

// Unmounted, so useIsPro's timer for the pass's end doesn't keep Jest running.
afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

// Skia's stubs are plain strings, which aren't JSX intrinsic elements, so compare against a string.
const within = (node: ReactTestInstance, type: string) => node.findAll((n) => n.type === type);
const hosts = (r: ReactTestRenderer, type: string) => within(r.root, type);
const has = (node: ReactTestInstance, type: string) => within(node, type).length > 0;

describe('BrandMark', () => {
  it.each(['light', 'dark'] as const)('draws the tile and the eight pieces in paint order (%s)', (theme) => {
    const r = mount(<BrandMark size={72} />, theme);
    const paths = hosts(r, 'Path');
    const pathsOf = (keep: (props: ReactTestInstance['props']) => boolean) => paths.filter((p) => keep(p.props)).map((p) => p.props.path);
    expect(pathsOf((p) => p.style === 'fill')).toEqual(MARK_PIECES.map((piece) => piece.d));
    // Each fill's seam-closing hairline (width 0: one device pixel).
    expect(pathsOf((p) => p.style === 'stroke' && p.strokeWidth === 0)).toEqual(MARK_PIECES.map((piece) => piece.d));
    // The fold's and topBar's outlines.
    expect(pathsOf((p) => p.style === 'stroke' && p.strokeWidth > 0)).toEqual(MARK_PIECES.filter((piece) => piece.stroke).map((piece) => piece.d));
    // Everything on the mark is clipped to the tile: 72 wide, 72 × 802 / 819 high.
    const clip = hosts(r, 'Group').find((g) => g.props.clip)!.props.clip;
    expect(clip.rect.width).toBe(72);
    expect(clip.rect.height).toBeCloseTo((72 * TILE_SIZE.height) / TILE_SIZE.width, 6);
    // One shadow, on a layer holding the whole mark (a prop, so it isn't in the rendered tree).
    const layered = hosts(r, 'Group').filter((g) => g.props.layer);
    expect(layered).toHaveLength(1);
    expect(layered[0].props.layer.props.children.type).toBe('Shadow');
    expect(within(layered[0], 'Path')).toHaveLength(paths.length);
  });

  it('puts a soft shadow under the tile in light, and no rim', () => {
    const r = mount(<BrandMark size={72} />, 'light');
    const rects = hosts(r, 'RoundedRect');
    expect(rects.filter((rect) => has(rect, 'Blur'))).toHaveLength(1);
    expect(rects.filter((rect) => rect.props.style === 'stroke')).toHaveLength(0);
  });

  it('draws a faint light rim in dark, and no tile shadow', () => {
    const r = mount(<BrandMark size={72} />, 'dark');
    const rects = hosts(r, 'RoundedRect');
    expect(rects.filter((rect) => has(rect, 'Blur'))).toHaveLength(0);
    const rim = rects.filter((rect) => rect.props.style === 'stroke');
    expect(rim).toHaveLength(1);
    expect(rim[0].props).toMatchObject({ color: BRAND.paper, opacity: TILE_RIM.opacity });
  });

  it('is one image for TalkBack, named from the catalog', () => {
    const r = mount(<BrandMark size={72} wordmark />);
    const labelled = r.root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityLabel !== undefined);
    expect(labelled).toHaveLength(1);
    expect(labelled[0].props).toMatchObject({ accessible: true, accessibilityRole: 'image', accessibilityLabel: en.brand.logoLabel });
    // The drawing and the wordmark under it aren't read again.
    const hidden = r.root.findAll((n) => typeof n.type === 'string' && n.props.importantForAccessibility === 'no-hide-descendants');
    expect(hidden).toHaveLength(1);
    expect(hidden[0].props.accessibilityElementsHidden).toBe(true);
    expect(has(hidden[0], 'Canvas')).toBe(true);
  });

  it('shows the wordmark only when asked', () => {
    const texts = (r: ReactTestRenderer) => hosts(r, 'Text').map((n) => n.props.children);
    expect(texts(mount(<BrandMark size={72} wordmark />))).toEqual([en.brand.name]);
    act(() => root?.unmount());
    expect(texts(mount(<BrandMark size={32} />))).toEqual([]);
  });
});
