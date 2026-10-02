// @ts-nocheck
import { AppProviders } from './src/bootstrap/AppProviders';
import { AppNavigator } from './src/bootstrap/AppNavigator';
import { Snackbar } from './src/components/shared/Snackbar';
import { holdSplash } from './src/bootstrap/splash';

// §9 O1: at module scope so the native splash can't auto-hide before AppNavigator picks the start
// screen (see src/bootstrap/splash.ts).
holdSplash();

export default function App() {
  return (
    <AppProviders>
      <AppNavigator />
      <Snackbar />
    </AppProviders>
  );
}
