import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance } from 'react-native';
import { tokens, ThemeName, ThemeTokens } from './tokens';

export type ThemePref = 'system' | 'light' | 'dark';

type ThemeContextValue = {
  themePref: ThemePref;
  theme: ThemeName;
  tokens: ThemeTokens;
  setThemePref: (pref: ThemePref) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const [themePref, setThemePref] = useState<ThemePref>('system');
  const [systemScheme, setSystemScheme] = useState(Appearance.getColorScheme());

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => setSystemScheme(colorScheme));
    return () => sub.remove();
  }, []);

  const theme: ThemeName = themePref === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : themePref;

  const value = useMemo<ThemeContextValue>(
    () => ({ themePref, theme, tokens: tokens[theme], setThemePref }),
    [themePref, theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
