import * as Sentry from '@sentry/react-native';

// Opt-in crash reporting. Off by default; nothing is initialized - so no SDK network traffic at
// all - until the user turns "Send anonymous crash reports" on in Settings. Even then, reports
// carry stack traces only: the scrubbers below strip anything that could hold a document name,
// a file path or scanned text.

type Breadcrumb = Sentry.Breadcrumb;
type ErrorEvent = Parameters<NonNullable<Sentry.ReactNativeOptions['beforeSend']>>[0];

// console.* breadcrumbs can quote file names or OCR text (the app's own console.warn calls do),
// and navigation crumbs aren't needed to read a stack trace.
const DROPPED_BREADCRUMB_CATEGORIES = new Set(['console', 'navigation']);

const LOCAL_PATH = /\b(?:file|content):\/\/[^\s'"`)]+/gi;

export function stripLocalPaths<T extends string | undefined>(value: T): T {
  return (value ? value.replace(LOCAL_PATH, '<path>') : value) as T;
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (breadcrumb.category && DROPPED_BREADCRUMB_CATEGORIES.has(breadcrumb.category)) return null;
  return { ...breadcrumb, message: stripLocalPaths(breadcrumb.message), data: undefined };
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const scrubbed: ErrorEvent = { ...event, extra: undefined, user: undefined };
  if (scrubbed.contexts) {
    const contexts = { ...scrubbed.contexts };
    if (contexts.app) contexts.app = { ...contexts.app, device_name: undefined };
    if (contexts.device) contexts.device = { ...contexts.device, name: undefined };
    scrubbed.contexts = contexts;
  }
  scrubbed.message = stripLocalPaths(scrubbed.message);
  if (scrubbed.exception?.values) {
    scrubbed.exception = {
      ...scrubbed.exception,
      values: scrubbed.exception.values.map((value) => ({ ...value, value: stripLocalPaths(value.value) })),
    };
  }
  if (scrubbed.breadcrumbs) {
    scrubbed.breadcrumbs = scrubbed.breadcrumbs
      .map(scrubBreadcrumb)
      .filter((b): b is Breadcrumb => b !== null);
  }
  return scrubbed;
}

let active = false;

// Idempotent; call whenever the setting changes. Without a DSN (EXPO_PUBLIC_SENTRY_DSN, set as an
// EAS environment variable) it stays off even when enabled - e.g. local dev builds.
export function initCrashReporting(enabled: boolean, dsn: string | undefined = process.env.EXPO_PUBLIC_SENTRY_DSN): void {
  if (enabled && dsn && !active) {
    Sentry.init({
      dsn,
      sendDefaultPii: false,
      attachScreenshot: false,
      attachViewHierarchy: false,
      beforeBreadcrumb: scrubBreadcrumb,
      beforeSend: scrubEvent,
    });
    active = true;
  } else if (!enabled && active) {
    void Sentry.close();
    active = false;
  }
}

// For errors the app catches itself (e.g. the root ErrorBoundary), which never reach Sentry's
// global handler. A no-op while reporting is off.
export function reportCrash(error: unknown): void {
  if (active) Sentry.captureException(error);
}
