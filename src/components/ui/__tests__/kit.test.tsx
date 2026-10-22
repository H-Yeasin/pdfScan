import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text as RNText } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fontFamily, ThemeProvider, themeTokens, tokens, ACCENT_IDS, type ThemeName } from '../../../theme';
import { contrastRatio, AA_TEXT } from '../../../theme/contrast';
import { Button, buttonLook, Chip, FilterChip, IconButton, ListItem, ProgressBar, ScreenHeader, Text, TextField, type ButtonVariant } from '..';
import { familyFor, maxScaleFor } from '../Text';
import { slopFor } from '../Touchable';
import { largeTitleHeight, visibleActions } from '../ScreenHeader';
import { onDanger } from '../kitColors';

// §17 U2: the kit renders with the states and names TalkBack reads. Reanimated needs its native
// module, so the few hooks the kit uses are faked here: a shared value is a plain object and an
// animated style is computed once.
jest.mock('react-native-reanimated', () => {
  const { View: RNView, Pressable, ScrollView } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View: RNView, ScrollView, createAnimatedComponent: (c: unknown) => (c === Pressable ? Pressable : c) },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: (style: () => object) => style(),
    useAnimatedScrollHandler: () => () => {},
    withSpring: (v: unknown) => v,
    withTiming: (v: unknown) => v,
    withRepeat: (v: unknown) => v,
    cancelAnimation: () => {},
    interpolate: () => 0,
    Extrapolation: { CLAMP: 'clamp' },
    Easing: { inOut: () => () => 0, quad: () => 0 },
  };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: (props: { name: string }) => `icon:${props.name}` }));

const metrics = { frame: { x: 0, y: 0, width: 360, height: 780 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };

let root: ReactTestRenderer | null = null;
function render(node: ReactNode): ReactTestRenderer {
  act(() => {
    root = create(
      <SafeAreaProvider initialMetrics={metrics}>
        <ThemeProvider>{node}</ThemeProvider>
      </SafeAreaProvider>
    );
  });
  return root!;
}
afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

// The host element TalkBack sees for a control: the one carrying its role.
function control(r: ReactTestRenderer, role: string): ReactTestInstance {
  return r.root.findAll((n) => typeof n.type !== 'string' && n.props.accessibilityRole === role && n.props.onPress !== undefined)[0] ??
    r.root.findAll((n) => n.props.accessibilityRole === role)[0];
}

describe('Text', () => {
  it('takes its family from the variant and a weight, never a fontWeight', () => {
    const r = render(
      <>
        <Text variant="headline">A</Text>
        <Text variant="body" weight="bold">B</Text>
        <Text variant="title" weight="bold">C</Text>
      </>
    );
    const [a, b, c] = r.root.findAllByType(RNText).map((n) => StyleSheet.flatten(n.props.style));
    expect(a.fontFamily).toBe(fontFamily.heading);
    expect(b.fontFamily).toBe(fontFamily.bodyBold);
    // Caprasimo has one weight: a weight on a heading changes nothing.
    expect(c.fontFamily).toBe(fontFamily.heading);
    for (const style of [a, b, c]) expect(style.fontWeight).toBeUndefined();
  });

  it('resolves a token name to its colour and leaves a value alone', () => {
    const r = render(
      <>
        <Text color="muted">A</Text>
        <Text color="#123456">B</Text>
      </>
    );
    const [a, b] = r.root.findAllByType(RNText).map((n) => StyleSheet.flatten(n.props.style));
    expect(a.color).toBe(tokens.light.muted);
    expect(b.color).toBe('#123456');
  });

  it('caps the big headings and chrome', () => {
    expect(familyFor('caption', 'semibold')).toBe(fontFamily.bodySemiBold);
    expect(maxScaleFor('body')).toBeUndefined();
    expect(maxScaleFor('body', true)).toBe(1.4);
    expect(maxScaleFor('display', true)).toBe(1.3);
  });
});

describe('Touchable', () => {
  it('grows anything under 48 dp to 48 with slop', () => {
    expect(slopFor(36, 36)).toEqual({ top: 6, bottom: 6, left: 6, right: 6 });
    expect(slopFor(200, 44)).toEqual({ top: 2, bottom: 2, left: 0, right: 0 });
    expect(slopFor(60, 60)).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
  });
});

describe('Button', () => {
  it('is a button named by its label', () => {
    const onPress = jest.fn();
    const r = render(<Button label="Save" onPress={onPress} />);
    const button = control(r, 'button');
    expect(button.props.accessibilityLabel).toBe('Save');
    expect(button.props.accessibilityState).toEqual({ disabled: false, busy: false });
    act(() => button.props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('while loading: busy, a spinner, the label kept for width, and no press', () => {
    const onPress = jest.fn();
    const r = render(<Button label="Save" loading onPress={onPress} />);
    const button = control(r, 'button');
    expect(button.props.accessibilityState).toEqual({ disabled: true, busy: true });
    expect(button.props.onPress).toBeUndefined();
    expect(r.root.findAllByType(ActivityIndicator)).toHaveLength(1);
    expect(r.root.findAllByType(RNText).map((n) => n.props.children)).toContain('Save');
  });

  it('disabled: said, faded, and no press', () => {
    const onPress = jest.fn();
    const r = render(<Button label="Save" disabled onPress={onPress} />);
    const button = control(r, 'button');
    expect(button.props.accessibilityState).toEqual({ disabled: true, busy: false });
    expect(button.props.onPress).toBeUndefined();
    expect(r.root.findAllByType(ActivityIndicator)).toHaveLength(0);
  });

  it("every look's label is readable, in both themes and every accent", () => {
    const variants: ButtonVariant[] = ['primary', 'tonal', 'danger', 'highlight'];
    for (const theme of ['light', 'dark'] as ThemeName[]) {
      for (const accent of ACCENT_IDS) {
        const t = themeTokens(theme, accent);
        for (const v of variants) {
          const { bg, fg } = buttonLook(v, t);
          expect([theme, accent, v, contrastRatio(fg, bg) >= AA_TEXT]).toEqual([theme, accent, v, true]);
        }
        // outline and ghost: their label sits on the page.
        expect(contrastRatio(buttonLook('ghost', t).fg, t.bg)).toBeGreaterThanOrEqual(AA_TEXT);
      }
    }
    expect(onDanger(tokens.light)).toBe('#ffffff');
  });
});

describe('IconButton', () => {
  it('carries its label and selected state', () => {
    const r = render(<IconButton icon="search-outline" accessibilityLabel="Find" selected onPress={() => {}} />);
    const button = control(r, 'button');
    expect(button.props.accessibilityLabel).toBe('Find');
    expect(button.props.accessibilityState).toEqual({ disabled: false, selected: true });
  });
});

describe('ListItem', () => {
  it('in selection mode is a checkbox TalkBack reads as checked or not', () => {
    const r = render(<ListItem title="Lecture 4" selected onPress={() => {}} />);
    expect(control(r, 'checkbox').props.accessibilityState).toEqual({ disabled: false, checked: true });
    act(() => r.update(
      <SafeAreaProvider initialMetrics={metrics}>
        <ThemeProvider>
          <ListItem title="Lecture 4" selected={false} onPress={() => {}} />
        </ThemeProvider>
      </SafeAreaProvider>
    ));
    expect(control(r, 'checkbox').props.accessibilityState).toEqual({ disabled: false, checked: false });
  });

  it('a switch row is the switch: one tap toggles it', () => {
    const onValueChange = jest.fn();
    const r = render(<ListItem title="Lock" switchValue={false} onValueChange={onValueChange} />);
    const row = control(r, 'switch');
    expect(row.props.accessibilityState).toEqual({ disabled: false, checked: false });
    act(() => row.props.onPress());
    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it('outside selection it is a plain button with no checked state', () => {
    const r = render(<ListItem title="Settings" trailing="chevron" onPress={() => {}} />);
    expect(control(r, 'button').props.accessibilityState).toEqual({ disabled: false, checked: undefined });
  });
});

describe('Chips', () => {
  it('a filter chip says selected and shows a check', () => {
    const r = render(<FilterChip label="Notes" selected onPress={() => {}} />);
    expect(control(r, 'button').props.accessibilityState).toEqual({ selected: true, disabled: false });
    expect(JSON.stringify(r.toJSON())).toContain('icon:checkmark');
  });

  it("a removable chip's × is its own named button", () => {
    const onRemove = jest.fn();
    const r = render(<Chip label="Physics" onRemove={onRemove} />);
    const remove = r.root.findAll((n) => typeof n.type !== 'string' && n.props.accessibilityLabel === 'Remove Physics' && n.props.onPress)[0];
    act(() => remove.props.onPress());
    expect(onRemove).toHaveBeenCalled();
  });
});

describe('TextField', () => {
  it('shows the error in place of the helper and reads it as the hint', () => {
    const r = render(<TextField label="Name" value="" onChangeText={() => {}} helper="Shown on the cover" error="Give it a name" />);
    const texts = r.root.findAllByType(RNText).map((n) => n.props.children);
    expect(texts).toContain('Give it a name');
    expect(texts).not.toContain('Shown on the cover');
    const input = r.root.findAll((n) => n.props.accessibilityHint === 'Give it a name' && n.props.onChangeText)[0];
    expect(input.props.accessibilityLabel).toBe('Name');
  });

  it('clears with its × only while it has text', () => {
    const onChangeText = jest.fn();
    const r = render(<TextField label="Name" value="Lecture" onChangeText={onChangeText} clearable />);
    const clear = r.root.findAll((n) => typeof n.type !== 'string' && n.props.accessibilityLabel === 'Clear' && n.props.onPress)[0];
    act(() => clear.props.onPress());
    expect(onChangeText).toHaveBeenCalledWith('');
  });
});

describe('ProgressBar', () => {
  it('reads its percentage, or nothing while indeterminate', () => {
    const r = render(
      <>
        <ProgressBar value={0.426} />
        <ProgressBar />
      </>
    );
    const [a, b] = r.root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'progressbar');
    expect(a.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 43 });
    expect(b.props.accessibilityValue).toBeUndefined();
  });
});

describe('ScreenHeader', () => {
  it('draws the top inset, a named back button and a header title', () => {
    const back = jest.fn();
    const r = render(<ScreenHeader title="Files" back={back} />);
    const outer = r.root.findAll((n) => typeof n.type === 'string' && StyleSheet.flatten(n.props.style)?.paddingTop === 24);
    expect(outer.length).toBeGreaterThan(0);
    act(() => control(r, 'button').props.onPress());
    expect(back).toHaveBeenCalled();
    expect(r.root.findAll((n) => n.type === RNText && n.props.accessibilityRole === 'header')[0].props.children).toBe('Files');
  });

  it('shows three actions at most, the ⋯ among them', () => {
    const a = (label: string) => ({ icon: 'add' as const, label, onPress: () => {} });
    expect(visibleActions([a('1'), a('2'), a('3'), a('4')], false).map((x) => x.label)).toEqual(['1', '2', '3']);
    expect(visibleActions([a('1'), a('2'), a('3')], true).map((x) => x.label)).toEqual(['1', '2']);
  });

  it('folds by the large block, which grows with the font but stops at the headline cap', () => {
    expect(largeTitleHeight(1, false)).toBe(48);
    expect(largeTitleHeight(1, true)).toBeGreaterThan(largeTitleHeight(1, false));
    expect(largeTitleHeight(2, false)).toBe(largeTitleHeight(1.4, false));
  });
});
