import { useSyncExternalStore } from 'react';

// §10 M2: settings the owner can change from the Firebase console without an app update (ads on
// or off, the Pro pass, the support contact). No login: Remote Config only needs Firebase's
// installation id.
//
// The bundled defaults below are what the app does when Firebase isn't there at all (local dev
// builds without the config files), before the first fetch, and offline. They must always be a
// safe state: sales off, and Pro tasks never free (§14 Q1: they cost a rewarded ad unless the
// owner turns `pro_tasks_free` on). Ads default to on in release builds so a phone that never
// reached Firebase can still show a task's ad; development builds keep them off. A value from the
// console that has the wrong type or is out of range is ignored and its default kept, so a typo
// can't turn into a broken app; keys this build doesn't know (added for a newer version) are
// ignored too.

export type RemoteConfig = {
  // The owner's switch for banners and the ads SDK. Turning it off in the console stops banners
  // **and** makes Pro tasks unavailable (not free: no ad can unlock them) unless `pro_tasks_free`
  // is on too. On by default in release builds (§14 Q1).
  adsEnabled: boolean;
  // Screens a banner may show on (M5's adPolicy); never capture, review, deliver or the reader.
  adsBannerScreens: string[];
  // M5: the AdMob banner unit per platform ('ca-app-pub-…/…'). '' = no banner in release builds;
  // development builds always use Google's test unit.
  adsBannerUnitAndroid: string;
  adsBannerUnitIos: string;
  // M6: the AdMob rewarded unit per platform, for the Pro pass. Same rules as the banner's.
  adsRewardedUnitAndroid: string;
  adsRewardedUnitIos: string;
  // Length of a rewarded Pro pass (M6), in hours, and how many a day.
  passHours: number;
  passMaxPerDay: number;
  // §12 D1, Pro tasks: how long one ad unlocks editing a document, how many tasks a day may run
  // without an ad on a phone that is really offline (§14 Q1: never for no fill, a broken SDK or
  // consent), and how long to wait for a task's ad.
  editUnlockMinutes: number;
  offlineFreeTasksPerDay: number;
  taskAdTimeoutMs: number;
  // §14 Q1: the owner's only switch to make Pro tasks free for everyone (a promotion, an ads
  // outage). `ads_enabled` off no longer does.
  proTasksFree: boolean;
  // M7's Help & feedback contact: international digits for wa.me, and an address ('' = none).
  supportWhatsapp: string;
  supportEmail: string;
  // M9: paid Pro. While false, no prices and no purchase buttons anywhere.
  proSalesEnabled: boolean;
  // Builds older than this get a message asking to update; never blocks the app. '' = none.
  minSupportedVersion: string;
};

export const REMOTE_DEFAULTS: RemoteConfig = {
  adsEnabled: !__DEV__,
  adsBannerScreens: ['home', 'library'],
  adsBannerUnitAndroid: '',
  adsBannerUnitIos: '',
  adsRewardedUnitAndroid: '',
  adsRewardedUnitIos: '',
  passHours: 1,
  passMaxPerDay: 3,
  editUnlockMinutes: 30,
  offlineFreeTasksPerDay: 1,
  taskAdTimeoutMs: 8_000,
  proTasksFree: false,
  supportWhatsapp: '8801645724080',
  supportEmail: '',
  proSalesEnabled: false,
  minSupportedVersion: '',
};

// A parser returns undefined for a value it can't accept, which keeps the default.
type Parser<T> = (raw: string) => T | undefined;

const bool: Parser<boolean> = (raw) => {
  const v = raw.trim().toLowerCase();
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return undefined;
};

const int =
  (min: number, max: number): Parser<number> =>
  (raw) => {
    if (!raw.trim()) return undefined;
    const n = Number(raw);
    return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
  };

const matching =
  (pattern: RegExp): Parser<string> =>
  (raw) => {
    const v = raw.trim();
    return v === '' || pattern.test(v) ? v : undefined;
  };

// A JSON array of strings, as the console's JSON value type stores it.
const stringList: Parser<string[]> = (raw) => {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((s) => typeof s === 'string')) return parsed;
  } catch {
    // Not JSON: keep the default.
  }
  return undefined;
};

// Firebase key → field and parser. The console uses snake_case keys.
const KEYS: { [K in keyof RemoteConfig]: { key: string; parse: Parser<RemoteConfig[K]> } } = {
  adsEnabled: { key: 'ads_enabled', parse: bool },
  adsBannerScreens: { key: 'ads_banner_screens', parse: stringList },
  adsBannerUnitAndroid: { key: 'ads_banner_unit_android', parse: matching(/^ca-app-pub-\d+\/\d+$/) },
  adsBannerUnitIos: { key: 'ads_banner_unit_ios', parse: matching(/^ca-app-pub-\d+\/\d+$/) },
  adsRewardedUnitAndroid: { key: 'ads_rewarded_unit_android', parse: matching(/^ca-app-pub-\d+\/\d+$/) },
  adsRewardedUnitIos: { key: 'ads_rewarded_unit_ios', parse: matching(/^ca-app-pub-\d+\/\d+$/) },
  passHours: { key: 'pass_hours', parse: int(1, 168) },
  passMaxPerDay: { key: 'pass_max_per_day', parse: int(0, 10) },
  editUnlockMinutes: { key: 'edit_unlock_minutes', parse: int(5, 240) },
  offlineFreeTasksPerDay: { key: 'offline_free_tasks_per_day', parse: int(0, 50) },
  // Under 2 s almost no ad loads; over 30 s the student has given up.
  taskAdTimeoutMs: { key: 'task_ad_timeout_ms', parse: int(2_000, 30_000) },
  proTasksFree: { key: 'pro_tasks_free', parse: bool },
  // An empty number would leave Help & feedback without a contact, so it isn't accepted.
  supportWhatsapp: { key: 'support_whatsapp', parse: (raw) => (/^\d{8,15}$/.test(raw.trim()) ? raw.trim() : undefined) },
  supportEmail: { key: 'support_email', parse: matching(/^[^\s@]+@[^\s@]+\.[^\s@]+$/) },
  proSalesEnabled: { key: 'pro_sales_enabled', parse: bool },
  minSupportedVersion: { key: 'min_supported_version', parse: matching(/^\d+(\.\d+)*$/) },
};

// Raw console values (strings, as Remote Config hands them over) → a full, typed config.
export function parseRemoteConfig(raw: Record<string, string>): RemoteConfig {
  const config = { ...REMOTE_DEFAULTS };
  for (const field of Object.keys(KEYS) as (keyof RemoteConfig)[]) {
    const { key, parse } = KEYS[field];
    const value = raw[key];
    if (typeof value !== 'string') continue;
    const parsed = parse(value);
    if (parsed !== undefined) (config as Record<keyof RemoteConfig, unknown>)[field] = parsed;
  }
  return config;
}

// '1.2' < '1.10'; missing parts count as 0. For the min_supported_version message.
export function isVersionBelow(version: string, min: string): boolean {
  if (!min) return false;
  const a = version.split('.').map((p) => Number(p) || 0);
  const b = min.split('.').map((p) => Number(p) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d < 0;
  }
  return false;
}

// The values in use. Module state rather than a store slice: nothing persists it (Firebase
// keeps its own cache on disk) and only a few screens read it.
let current: RemoteConfig = REMOTE_DEFAULTS;
const listeners = new Set<() => void>();

// §14 Q2: where the values in use came from, for the dev diagnostics line in Settings (a release
// check on a dev build: did this phone ever see the console's values?). 'defaults' = the bundled
// ones (no Firebase in this build, not loaded yet, or an error before anything was read);
// 'cached' = console values from the last fetch, read from disk; 'fetched' = a fetch just now
// reached Firebase (even if the console sets nothing).
export type RemoteConfigSource = 'defaults' | 'cached' | 'fetched';
let source: RemoteConfigSource = 'defaults';

export function getRemoteConfig(): RemoteConfig {
  return current;
}

export function setRemoteConfig(next: RemoteConfig): void {
  if (JSON.stringify(next) === JSON.stringify(current)) return;
  current = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useRemoteConfig(): RemoteConfig {
  return useSyncExternalStore(subscribe, getRemoteConfig, getRemoteConfig);
}

export function getRemoteConfigSource(): RemoteConfigSource {
  return source;
}

function setSource(next: RemoteConfigSource): void {
  if (next === source) return;
  source = next;
  listeners.forEach((l) => l());
}

export function useRemoteConfigSource(): RemoteConfigSource {
  return useSyncExternalStore(subscribe, getRemoteConfigSource, getRemoteConfigSource);
}

// For tests.
export function resetRemoteConfig(): void {
  current = REMOTE_DEFAULTS;
  source = 'defaults';
}

// Between fetches the cached values are used. An hour keeps a console change to "the next
// start" for anyone who opens the app now and then, well inside the free plan's quotas.
const FETCH_INTERVAL_MS = __DEV__ ? 0 : 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;

type RemoteValue = { getSource(): string; asString(): string };

// Only values from the console count: 'static' means the key isn't set there, and the app never
// gives Firebase defaults of its own (they live above).
export function remoteValuesOf(all: Record<string, RemoteValue>): Record<string, string> {
  const raw: Record<string, string> = {};
  for (const [key, value] of Object.entries(all)) {
    if (value.getSource() === 'remote') raw[key] = value.asString();
  }
  return raw;
}

// Called once after the first frame (§9 O5's deferred boot). First the values fetched last time
// (cached on disk, so this works offline), then a fetch for fresh ones. Best-effort: without
// Firebase (no config files in this build), offline or on any error, the app keeps what it has.
// The SDK is required lazily so it costs nothing at cold start.
export async function loadRemoteConfig(): Promise<void> {
  try {
    const { getApps } = require('@react-native-firebase/app') as typeof import('@react-native-firebase/app');
    if (getApps().length === 0) return;
    const rc = require('@react-native-firebase/remote-config') as typeof import('@react-native-firebase/remote-config');
    const remoteConfig = rc.getRemoteConfig();
    remoteConfig.settings = { minimumFetchIntervalMillis: FETCH_INTERVAL_MS, fetchTimeoutMillis: FETCH_TIMEOUT_MS };
    await rc.ensureInitialized(remoteConfig);
    const cached = remoteValuesOf(rc.getAll(remoteConfig));
    setRemoteConfig(parseRemoteConfig(cached));
    if (Object.keys(cached).length > 0) setSource('cached');
    await rc.fetchAndActivate(remoteConfig);
    setRemoteConfig(parseRemoteConfig(remoteValuesOf(rc.getAll(remoteConfig))));
    setSource('fetched');
  } catch (e) {
    console.warn('Remote Config not loaded; keeping the values in use', e);
  }
}
