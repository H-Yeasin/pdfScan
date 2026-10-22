import { Component, type ErrorInfo, type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { t } from '../i18n';
import { DEFAULT_ACCENT, MIN_TOUCH, radii, spacing, themeTokens, typeScale, useOptionalTheme } from '../theme';

type State = { error: Error | null; generation: number };

// Last line of defence for a render-time crash: instead of a white screen, say the documents are
// safe (they're on disk; nothing in-memory is load-bearing for them) and offer a restart. Restart
// remounts the whole app tree, which reloads the library from storage. Plain RN views, not the kit,
// since whatever crashed may be in it (CrashScreen).
export class ErrorBoundary extends Component<PropsWithChildren<{ onError?: (error: Error, info: ErrorInfo) => void }>, State> {
  state: State = { error: null, generation: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn('Unhandled render error', error, info.componentStack);
    this.props.onError?.(error, info);
  }

  private restart = () => {
    this.setState((s) => ({ error: null, generation: s.generation + 1 }));
  };

  render() {
    if (this.state.error) return <CrashScreen onRestart={this.restart} />;
    // Keyed by generation so Restart mounts a completely fresh tree.
    return <View key={this.state.generation} style={styles.fill}>{this.props.children}</View>;
  }
}

// §17 U13: in the app's theme (light or dark, the student's accent) instead of always white, read
// straight from the theme's context: the boundary sits inside ThemeProvider, but not the kit
// (components/ui), which could be what crashed. Outside a provider (tests), the light tokens.
function CrashScreen({ onRestart }: { onRestart: () => void }) {
  const tokens = useOptionalTheme()?.tokens ?? themeTokens('light', DEFAULT_ACCENT);
  return (
    <View style={[styles.container, { backgroundColor: tokens.bg }]} accessibilityRole="alert">
      <Text style={[typeScale.title, styles.center, { color: tokens.ink }]}>{t('shared.crash.title')}</Text>
      <Text style={[typeScale.body, styles.center, { color: tokens.muted }]}>{t('shared.crash.body')}</Text>
      <Pressable
        style={({ pressed }) => [styles.button, { backgroundColor: tokens.accent, opacity: pressed ? 0.85 : 1 }]}
        android_ripple={{ color: tokens.onAccent, foreground: true }}
        onPress={onRestart}
        accessibilityRole="button"
      >
        <Text style={[typeScale.label, { color: tokens.onAccent }]}>{t('shared.crash.restart')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  center: { textAlign: 'center' },
  button: {
    marginTop: spacing.md,
    minHeight: MIN_TOUCH,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.button,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
