// @ts-nocheck
import { AppProviders } from './src/bootstrap/AppProviders';
import { AppNavigator } from './src/bootstrap/AppNavigator';
import { Snackbar } from './src/components/shared/Snackbar';
import { holdSplash } from './src/bootstrap/splash';
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://d74633bd61d0a2981f9333390788a109@o4512198345687040.ingest.us.sentry.io/4512198352175104',

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: true,

  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration()],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

// §9 O1: at module scope so the native splash can't auto-hide before AppNavigator picks the start
// screen (see src/bootstrap/splash.ts).
holdSplash();

export default Sentry.wrap(function App() {
  return (
    <AppProviders>
      <AppNavigator />
      <Snackbar />
    </AppProviders>
  );
});
