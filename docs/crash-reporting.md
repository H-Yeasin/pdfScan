# Crash reporting (Sentry, opt-in)

Off by default. Nothing is initialized, so there is no SDK network traffic, until the user turns on
**Settings ▸ Privacy ▸ Send anonymous crash reports**. Reports are scrubbed before sending
(`src/services/telemetry/crash.ts`): no PII, no screenshots or view hierarchy, no `extra`, no
device name, no `file://`/`content://` paths, and no console or navigation breadcrumbs.

## One-time setup (manual)

1. Create a Sentry project (platform: React Native).
2. In EAS (expo.dev ▸ project ▸ Environment variables), add:
   - `EXPO_PUBLIC_SENTRY_DSN`: the project's DSN. Without it, reporting stays off even when the
     toggle is on (e.g. local dev builds).
   - `SENTRY_ORG` and `SENTRY_PROJECT`: used by the `@sentry/react-native` config plugin, which
     falls back to these when `app.json` doesn't name them.
   - `SENTRY_AUTH_TOKEN` (secret): lets EAS builds upload source maps.
3. `metro.config.js` uses `getSentryExpoConfig`, which adds the debug IDs that match uploaded
   source maps to crash reports.

## Verify

- Toggle on, trigger a test crash: it appears in Sentry with a readable stack and no file paths.
- Toggle off (fresh launch): no requests to `*.sentry.io` in a proxy or Android's network inspector.
