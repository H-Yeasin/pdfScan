import { PropsWithChildren } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useAppFonts, useTheme } from '../theme';
import { AppStateProvider } from '../store/AppStateContext';
import { RouterProvider } from '../navigation/router';

function FontGate({ children }: PropsWithChildren) {
  const { fontsReady } = useAppFonts();
  const { tokens } = useTheme();
  if (!fontsReady) return <View style={{ flex: 1, backgroundColor: tokens.bg }} />;
  return <>{children}</>;
}

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <FontGate>
            <AppStateProvider>
              <RouterProvider>{children}</RouterProvider>
            </AppStateProvider>
          </FontGate>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
