import { Component, type ErrorInfo, type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { t } from '../i18n';

type State = { error: Error | null; generation: number };

// Last line of defence for a render-time crash: instead of a white screen, say the documents are
// safe (they're on disk; nothing in-memory is load-bearing for them) and offer a restart. Restart
// remounts the whole app tree, which reloads the library from storage. Deliberately uses plain
// colors and no theme/context, since whatever crashed may be one of those.
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
    if (this.state.error) {
      return (
        <View style={styles.container} accessibilityRole="alert">
          <Text style={styles.title}>{t('shared.crash.title')}</Text>
          <Text style={styles.body}>{t('shared.crash.body')}</Text>
          <Pressable style={styles.button} onPress={this.restart} accessibilityRole="button">
            <Text style={styles.buttonLabel}>{t('shared.crash.restart')}</Text>
          </Pressable>
        </View>
      );
    }
    // Keyed by generation so Restart mounts a completely fresh tree.
    return <View key={this.state.generation} style={styles.fill}>{this.props.children}</View>;
  }
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
    backgroundColor: '#ffffff',
  },
  title: { fontSize: 20, fontWeight: '700', color: '#1a1a1a', textAlign: 'center' },
  body: { fontSize: 15, color: '#555555', textAlign: 'center' },
  button: {
    marginTop: 12,
    height: 48,
    paddingHorizontal: 28,
    borderRadius: 999,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
});
