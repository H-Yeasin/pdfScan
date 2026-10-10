import { PropsWithChildren } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../theme';
import { AppStateProvider } from '../store/AppStateContext';
import { RouterProvider } from '../navigation/router';
import { ErrorBoundary } from './ErrorBoundary';
import { reportCrash } from '../services/telemetry/crash';

// §16 G4: no font gate here. It sat above the store and the navigator, so nothing loaded until
// the fonts had; AppNavigator now waits for them along with the data, before its first screen.
export function AppProviders({ children }: PropsWithChildren) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ErrorBoundary onError={reportCrash}>
            <AppStateProvider>
              <RouterProvider>{children}</RouterProvider>
            </AppStateProvider>
          </ErrorBoundary>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
