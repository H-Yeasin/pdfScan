import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance } from 'react-native';
import { DEFAULT_ACCENT, themeTokens, type AccentId, ThemeName, ThemeTokens } from './tokens';
import { useProFeature } from '../services/pro/entitlement';

export type ThemePref = 'system' | 'light' | 'dark';

type ThemeContextValue = {
  themePref: ThemePref;
  theme: ThemeName;
  tokens: ThemeTokens;
  setThemePref: (pref: ThemePref) => void;
  // §10 M4: the accent the student chose (Pro). `tokens` use it only while Pro is active (lapse
  // rule 'stop'): when a pass ends the app goes back to teal, and the choice comes back with Pro.
  accentPref: AccentId;
  accent: AccentId;
  setAccentPref: (accent: AccentId) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const [themePref, setThemePref] = useState<ThemePref>('system');
  const [accentPref, setAccentPref] = useState<AccentId>(DEFAULT_ACCENT);
  const accentAllowed = useProFeature('themeAccents', 'keep');
  const accent = accentAllowed ? accentPref : DEFAULT_ACCENT;
  const [systemScheme, setSystemScheme] = useState(Appearance.getColorScheme());

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => setSystemScheme(colorScheme));
    return () => sub.remove();
  }, []);

  const theme: ThemeName = themePref === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : themePref;

  const value = useMemo<ThemeContextValue>(
    () => ({ themePref, theme, tokens: themeTokens(theme, accent), setThemePref, accentPref, accent, setAccentPref }),
    [themePref, theme, accentPref, accent]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
