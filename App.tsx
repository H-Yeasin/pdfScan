import { AppProviders } from './src/bootstrap/AppProviders';
import { AppNavigator } from './src/bootstrap/AppNavigator';
import { Snackbar } from './src/components/shared/Snackbar';
import { holdSplash } from './src/bootstrap/splash';
import { warmDb } from './src/services/persistence/dbService';
import { warmSettings } from './src/services/persistence/settingsStorage';
import React from 'react';

// §9 O1: at module scope so the native splash can't auto-hide before AppNavigator picks the start
// screen (see src/bootstrap/splash.ts).
holdSplash();
// §16 G4: the two reads the start screen waits for (the database open with its migration check,
// and the settings) start here, while React is still building its first tree, instead of in
// AppNavigator's first effects. The boot hooks pick up the same promises.
warmDb();
warmSettings();

// No Sentry here (§16 G1): crash reports are opt-in and start only in services/telemetry/crash.ts,
// after boot, when the setting is on. The ErrorBoundary in AppProviders reports through it.
export default function App() {
  return (
    <AppProviders>
      <AppNavigator />
      <Snackbar />
    </AppProviders>
  );
}
