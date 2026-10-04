import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type { AppStore } from '../../store/AppStateContext';
import { dayKey } from './dayPass';
import type { ProFeatureId } from './proFeatures';

// §12 D1: the Pro task gate. Conversions and file editing are Pro; without a Pro pass, one
// rewarded (full-screen) ad unlocks one task: one conversion, or editing one document for
// `edit_unlock_minutes` (Remote Config, 30 by default). If no ad can load (offline, no fill), the
// task runs anyway, up to `offline_free_tasks_per_day`, so nobody is stuck; past that the Pro pass
// is offered with a kind message, which stops airplane-mode abuse.
//
// The rules here are pure; components/pro/useProTask.tsx applies them. Grants and the offline
// log sit in expo-secure-store beside the entitlement (not in settings or a backup), so the
// offline cap can't be reset by editing a file. The pending task (what to finish if Android
// kills the app during an ad) is plain AsyncStorage: it grants nothing on its own beyond the hour.

export type ProTaskFeature = Extract<ProFeatureId, 'convert' | 'editFiles' | 'pdfForms'>;

// For the M8 usage events: a fixed number per feature, never anything about the document.
export const PRO_TASK_FEATURE_CODES: Record<ProTaskFeature, number> = { convert: 1, editFiles: 2, pdfForms: 3 };

// A conversion is one task; editing (files, forms) unlocks the document for a while, so saving
// twice doesn't mean two ads.
export function grantKindFor(feature: ProTaskFeature): 'once' | 'session' {
  return feature === 'convert' ? 'once' : 'session';
}

// `from`: when the reward came in. A grant is only good from then on, so setting the clock back
// can't stretch a session (as with the Pro pass, services/pro/entitlement.isProActive).
export type ProTaskGrant =
  // One task on one document; used up when the task finishes. Kept if the task fails, so a retry
  // doesn't cost another ad.
  | { kind: 'once'; feature: ProTaskFeature; docId: string; from: number }
  | { kind: 'session'; feature: ProTaskFeature; docId: string; from: number; until: number };

const MINUTE_MS = 60 * 1000;
// A once grant (and a pending task) left unused this long is dropped.
export const ONCE_GRANT_MS = 60 * MINUTE_MS;
export const PENDING_MAX_AGE_MS = 60 * MINUTE_MS;
// Only today's offline runs count; a week is kept so a clock moved back a day still counts them.
const KEEP_OFFLINE_MS = 7 * 24 * 60 * MINUTE_MS;

export function grantAfterReward(feature: ProTaskFeature, docId: string, now: number, editUnlockMinutes: number): ProTaskGrant {
  return grantKindFor(feature) === 'once'
    ? { kind: 'once', feature, docId, from: now }
    : { kind: 'session', feature, docId, from: now, until: now + editUnlockMinutes * MINUTE_MS };
}

function isGrantLive(grant: ProTaskGrant, now: number): boolean {
  if (now < grant.from) return false;
  return grant.kind === 'session' ? now < grant.until : now - grant.from < ONCE_GRANT_MS;
}

export function findGrant(grants: readonly ProTaskGrant[], feature: ProTaskFeature, docId: string, now: number): ProTaskGrant | undefined {
  return grants.find((g) => g.feature === feature && g.docId === docId && isGrantLive(g, now));
}

export function pruneGrants(grants: readonly ProTaskGrant[], now: number): ProTaskGrant[] {
  return grants.filter((g) => isGrantLive(g, now));
}

// After a task finishes: its once grant is used up; a session stays until it ends.
export function consumeGrant(grants: readonly ProTaskGrant[], feature: ProTaskFeature, docId: string): ProTaskGrant[] {
  return grants.filter((g) => !(g.kind === 'once' && g.feature === feature && g.docId === docId));
}

// §12 D7: a file from outside, edited and saved, becomes a library document with a new id. The
// session the ad unlocked goes with it (same end time), so the student isn't asked again for the
// file they're still editing.
export function carryGrant(grants: readonly ProTaskGrant[], feature: ProTaskFeature, fromDocId: string, toDocId: string, now: number): ProTaskGrant[] {
  const grant = findGrant(grants, feature, fromDocId, now);
  if (!grant || grant.kind !== 'session' || findGrant(grants, feature, toDocId, now)) return grants.slice();
  return [...grants, { ...grant, docId: toDocId }];
}

export function offlineRunsOnDay(log: readonly number[], now: number): number {
  const today = dayKey(now);
  return log.filter((at) => dayKey(at) === today).length;
}

export function recordOfflineRun(log: readonly number[], now: number): number[] {
  return [...log.filter((at) => at > now - KEEP_OFFLINE_MS && at <= now), now];
}

export type ProTaskDecision =
  // Pro (a Pro pass), an unlocked session or a once grant, or ads switched off: just run it.
  | 'run'
  // Show ProTaskSheet: "Watch a short ad to convert …".
  | 'offerAd'
  // No ad can load; run it and count it against today's offline allowance.
  | 'runWithoutAd'
  // Today's offline allowance is used up: offer the Pro pass.
  | 'offerPro';

export type DecideInput = {
  isPro: boolean;
  grants: readonly ProTaskGrant[];
  feature: ProTaskFeature;
  docId: string;
  now: number;
  // Remote Config `ads_enabled`. Off means the owner switched ads off: there is no ad (and no day
  // pass) to unlock anything with, so tasks run, uncounted.
  adsEnabled: boolean;
  // Whether an ad could still come: false once one failed to load or isn't allowed (consent).
  adsAvailable: boolean;
  offlineRunsToday: number;
  // Remote Config `offline_free_tasks_per_day`.
  offlineFreePerDay: number;
};

export function decide(input: DecideInput): ProTaskDecision {
  if (input.isPro) return 'run';
  if (findGrant(input.grants, input.feature, input.docId, input.now)) return 'run';
  if (!input.adsEnabled) return 'run';
  if (input.adsAvailable) return 'offerAd';
  return input.offlineRunsToday < input.offlineFreePerDay ? 'runWithoutAd' : 'offerPro';
}

// --- Grants and the offline log (secure store) ---

export type ProTaskState = { grants: ProTaskGrant[]; offlineRuns: number[] };

const STATE_KEY = 'pro.taskState';
const FEATURES: readonly ProTaskFeature[] = ['convert', 'editFiles', 'pdfForms'];

function normalizeGrant(raw: unknown): ProTaskGrant | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!FEATURES.includes(r.feature as ProTaskFeature) || typeof r.docId !== 'string' || typeof r.from !== 'number') return null;
  const feature = r.feature as ProTaskFeature;
  if (r.kind === 'once') return { kind: 'once', feature, docId: r.docId, from: r.from };
  if (r.kind === 'session' && typeof r.until === 'number') return { kind: 'session', feature, docId: r.docId, from: r.from, until: r.until };
  return null;
}

export function normalizeTaskState(raw: unknown): ProTaskState {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const grants = Array.isArray(r.grants) ? r.grants.map(normalizeGrant).filter((g): g is ProTaskGrant => g !== null) : [];
  const offlineRuns = Array.isArray(r.offlineRuns) ? r.offlineRuns.filter((n): n is number => typeof n === 'number' && Number.isFinite(n)) : [];
  return { grants, offlineRuns };
}

export async function loadTaskState(): Promise<ProTaskState> {
  try {
    const stored = await SecureStore.getItemAsync(STATE_KEY);
    return stored ? normalizeTaskState(JSON.parse(stored)) : { grants: [], offlineRuns: [] };
  } catch (e) {
    console.warn('Could not read the Pro task state', e);
    return { grants: [], offlineRuns: [] };
  }
}

// Read, change and write back; expired grants are dropped on the way.
export async function updateTaskState(now: number, change: (state: ProTaskState) => ProTaskState): Promise<ProTaskState> {
  const current = await loadTaskState();
  const next = change({ ...current, grants: pruneGrants(current.grants, now) });
  try {
    await SecureStore.setItemAsync(STATE_KEY, JSON.stringify(next));
  } catch (e) {
    console.warn('Could not save the Pro task state', e);
  }
  return next;
}

// --- The pending task (AsyncStorage): what to finish if the app dies during the ad ---

// JSON only: it is written to storage and read back after a restart.
export type ProTaskParams = Record<string, string | number | boolean | null>;

export type PendingProTask = {
  id: string;
  feature: ProTaskFeature;
  // Which runner finishes it (registerProTaskRunner), e.g. 'docxToPdf'.
  kind: string;
  docId: string;
  // The document's name, for "Finish converting 'Handout.docx'?".
  title: string;
  params: ProTaskParams;
  rewarded: boolean;
  createdAt: number;
};

const PENDING_KEY = 'pro.pendingTask';

export function normalizePendingTask(raw: unknown): PendingProTask | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.kind !== 'string' || typeof r.docId !== 'string' || typeof r.title !== 'string') return null;
  if (!FEATURES.includes(r.feature as ProTaskFeature) || typeof r.createdAt !== 'number' || typeof r.rewarded !== 'boolean') return null;
  const params = r.params && typeof r.params === 'object' && !Array.isArray(r.params) ? (r.params as ProTaskParams) : {};
  return { id: r.id, feature: r.feature as ProTaskFeature, kind: r.kind, docId: r.docId, title: r.title, params, rewarded: r.rewarded, createdAt: r.createdAt };
}

export async function loadPendingTask(): Promise<PendingProTask | null> {
  try {
    const stored = await AsyncStorage.getItem(PENDING_KEY);
    return stored ? normalizePendingTask(JSON.parse(stored)) : null;
  } catch (e) {
    console.warn('Could not read the pending Pro task', e);
    return null;
  }
}

export async function savePendingTask(task: PendingProTask): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(task));
  } catch (e) {
    console.warn('Could not save the pending Pro task', e);
  }
}

// On the reward event. Only the task with this id: a newer task may have replaced it.
export async function markPendingRewarded(id: string): Promise<void> {
  const task = await loadPendingTask();
  if (task?.id === id) await savePendingTask({ ...task, rewarded: true });
}

// When the task is done (or won't run). Without an id, whatever is there.
export async function clearPendingTask(id?: string): Promise<void> {
  try {
    if (id !== undefined && (await loadPendingTask())?.id !== id) return;
    await AsyncStorage.removeItem(PENDING_KEY);
  } catch (e) {
    console.warn('Could not clear the pending Pro task', e);
  }
}

// At start: a task whose ad was watched to the end in the last hour is offered again; anything
// else (not rewarded, older, from the future) is dropped.
export function resumeDecision(task: PendingProTask, now: number): 'offer' | 'drop' {
  const age = now - task.createdAt;
  return task.rewarded && age >= 0 && age < PENDING_MAX_AGE_MS ? 'offer' : 'drop';
}

// --- Runners: how each kind of task is finished after a restart ---

// A screen runs its task with its own progress UI; a task resumed after a restart has no screen,
// so each kind registers how to run it from the stored params alone (D5, D6 add theirs, at module
// load of a module imported at start).
export type ProTaskRunner = (task: PendingProTask, ctx: { store: AppStore }) => Promise<void>;

const runners = new Map<string, ProTaskRunner>();

export function registerProTaskRunner(kind: string, runner: ProTaskRunner): void {
  runners.set(kind, runner);
}

export function getProTaskRunner(kind: string): ProTaskRunner | undefined {
  return runners.get(kind);
}

// For tests.
export function resetProTaskRunners(): void {
  runners.clear();
}
