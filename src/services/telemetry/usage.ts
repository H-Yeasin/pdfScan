// §10 M8: opt-in usage counts through Firebase Analytics, for docs/PLAN.md's metrics (how many
// students scan, save, submit, take a pass, back up). Off by default: `firebase.json` turns
// Analytics' automatic collection off at build time, and collection is switched on only while
// Settings → Privacy → "Help improve PDF Scan" is on (settings.usageStatsEnabled).
//
// Only the events below are ever sent, each with only its listed number parameters: no names,
// course names, file names, document text or anything a student typed, ever. logUsage drops
// anything else, and __tests__/usage.test.ts checks every logUsage call in the source against
// this list. The SDK is required lazily, like Remote Config's.

export const USAGE_EVENTS = {
  app_open: [],
  // How many pages the scan (or gallery import) added.
  scan_completed: ['pages'],
  document_saved: [],
  document_submitted: [],
  pass_started: [],
  backup_made: [],
  // §12 D1: a Pro task's ad shown, or watched to the end. `feature` is services/pro/proTask.ts's
  // PRO_TASK_FEATURE_CODES number, never a document.
  pro_task_ad_shown: ['feature'],
  pro_task_ad_rewarded: ['feature'],
  // §14 Q2: a task ran without an ad on a phone that was really offline (§14 Q1's daily grace).
  // Since Q1 that's the only way a task runs without an ad, so it replaced D1's
  // pro_task_run_without_ad (renamed before launch, so no counts were split).
  pro_task_offline_free: ['feature'],
  // §14 Q1: online, but no ad could show, so the task didn't run. `reason` is
  // services/pro/proTaskFlow.ts's AD_UNAVAILABLE_CODES number.
  pro_task_ad_unavailable: ['feature', 'reason'],
} as const satisfies Record<string, readonly string[]>;

export type UsageEvent = keyof typeof USAGE_EVENTS;
type ParamsOf<E extends UsageEvent> = { [K in (typeof USAGE_EVENTS)[E][number]]: number };

let enabled = false;
// null until the first setUsageCollection: Analytics keeps its on/off state on the phone across
// runs, so the first call always applies the setting, even "off".
let applied: boolean | null = null;

function analytics() {
  const { getApps } = require('@react-native-firebase/app') as typeof import('@react-native-firebase/app');
  if (getApps().length === 0) return null;
  return require('@react-native-firebase/analytics') as typeof import('@react-native-firebase/analytics');
}

// Follows the setting; call whenever it changes (AppNavigator, after the first frame). Turning
// it off also clears what Analytics kept on the phone (its app instance id).
export async function setUsageCollection(on: boolean): Promise<void> {
  enabled = on;
  if (applied === on) return;
  const wasOn = applied === true;
  applied = on;
  try {
    const sdk = analytics();
    if (!sdk) return;
    const instance = sdk.getAnalytics();
    await sdk.setAnalyticsCollectionEnabled(instance, on);
    // Turned off by the student (not just "still off" at start): forget the app instance id too.
    if (!on && wasOn) await sdk.resetAnalyticsData(instance);
  } catch (e) {
    console.warn('Usage counts: could not change collection', e);
  }
}

export function isUsageCollectionOn(): boolean {
  return enabled;
}

// Only the allowed parameters, rounded whole numbers; anything else is left out.
export function usageParams(event: UsageEvent, params: Record<string, unknown> = {}): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of USAGE_EVENTS[event] as readonly string[]) {
    const value = params[key];
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = Math.round(value);
  }
  return out;
}

// Best-effort and silent: nothing happens while the toggle is off, without Firebase, or for an
// event that isn't on the list.
export function logUsage<E extends UsageEvent>(event: E, ...params: (typeof USAGE_EVENTS)[E] extends readonly [] ? [] : [ParamsOf<E>]): void {
  if (!enabled || !(event in USAGE_EVENTS)) return;
  try {
    const sdk = analytics();
    if (!sdk) return;
    sdk.logEvent(sdk.getAnalytics(), event, usageParams(event, params[0]));
  } catch (e) {
    console.warn('Usage counts: could not log', e);
  }
}

// For tests.
export function resetUsage(): void {
  enabled = false;
  applied = null;
}
