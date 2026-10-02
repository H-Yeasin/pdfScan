import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import * as SecureStore from 'expo-secure-store';
import { grantPass, setEntitlement } from '../../services/pro/entitlement';
import { ACCENTS, ThemeProvider, tokens, useTheme } from '..';

// §10 M4: an accent is Pro, lapse rule 'stop': without Pro the app is teal, and the choice
// comes back with Pro.
let root: ReactTestRenderer | null = null;

function mount() {
  let theme!: ReturnType<typeof useTheme>;
  function Probe() {
    theme = useTheme();
    return null;
  }
  act(() => {
    root = create(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );
  });
  return () => theme;
}

// Unmounted, so useIsPro's timer for the pass's end doesn't keep Jest running.
afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

beforeEach(async () => {
  (SecureStore as unknown as { __reset(): void }).__reset();
  await act(async () => setEntitlement(null));
});

describe('theme accents', () => {
  it('uses the chosen accent only while Pro is active', async () => {
    const theme = mount();
    await act(async () => setEntitlement(grantPass(null, Date.now(), 24)));
    act(() => theme().setAccentPref('rose'));
    expect(theme().accent).toBe('rose');
    expect(theme().tokens.accent).toBe(ACCENTS.rose[theme().theme].accent);
    // Only the accent tokens change.
    expect(theme().tokens.bg).toBe(tokens[theme().theme].bg);

    await act(async () => setEntitlement(null));
    expect(theme().accent).toBe('teal');
    expect(theme().tokens.accent).toBe(tokens[theme().theme].accent);
    expect(theme().accentPref).toBe('rose');

    await act(async () => setEntitlement(grantPass(null, Date.now(), 24)));
    expect(theme().tokens.accent).toBe(ACCENTS.rose[theme().theme].accent);
  });
});
