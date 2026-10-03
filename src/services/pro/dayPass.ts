import * as SecureStore from 'expo-secure-store';
import { getEntitlement, grantPass, setEntitlement, type Entitlement } from './entitlement';

// §10 M6: the rewarded "Pro day pass". Watching one ad to the end gives `pass_hours` (Remote
// Config, 24 by default) of every Pro feature, at most `pass_max_per_day` times a calendar day
// (local time). The reward is checked on the phone only: server-side verification needs a paid
// Firebase plan, and the plan accepts the risk.
//
// The log of when passes were granted sits beside the entitlement in expo-secure-store (not in
// settings or a backup), so the daily cap can't be reset by editing a file or restoring one.

const LOG_KEY = 'pro.passLog';
// Only today's entries matter; a week is kept so a clock moved back a day still counts them.
const KEEP_MS = 7 * 24 * 60 * 60 * 1000;

// "2026-10-03" in local time: the cap resets at the student's midnight.
function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function passesOnDay(log: readonly number[], now: number): number {
  const today = dayKey(now);
  return log.filter((at) => dayKey(at) === today).length;
}

export function passesLeftToday(log: readonly number[], now: number, maxPerDay: number): number {
  return Math.max(0, maxPerDay - passesOnDay(log, now));
}

export type RewardResult = { entitlement: Entitlement; log: number[] } | { capped: true };

// What an earned reward does: a pass (added to one that's running, see grantPass) and a log
// entry, or nothing once today's passes are used up. Pure.
export function applyReward(
  entitlement: Entitlement | null,
  log: readonly number[],
  now: number,
  hours: number,
  maxPerDay: number
): RewardResult {
  if (passesLeftToday(log, now, maxPerDay) === 0) return { capped: true };
  const kept = log.filter((at) => at > now - KEEP_MS && at <= now);
  return { entitlement: grantPass(entitlement, now, hours), log: [...kept, now] };
}

export function normalizePassLog(raw: unknown): number[] {
  return Array.isArray(raw) ? raw.filter((n): n is number => typeof n === 'number' && Number.isFinite(n)) : [];
}

export async function loadPassLog(): Promise<number[]> {
  try {
    const stored = await SecureStore.getItemAsync(LOG_KEY);
    return stored ? normalizePassLog(JSON.parse(stored)) : [];
  } catch (e) {
    console.warn('Could not read the pass log', e);
    return [];
  }
}

// Called on the rewarded ad's reward event. Returns whether a pass was granted.
export async function claimDayPass(now: number, hours: number, maxPerDay: number): Promise<boolean> {
  const result = applyReward(getEntitlement(), await loadPassLog(), now, hours, maxPerDay);
  if ('capped' in result) return false;
  await setEntitlement(result.entitlement);
  try {
    await SecureStore.setItemAsync(LOG_KEY, JSON.stringify(result.log));
  } catch (e) {
    console.warn('Could not save the pass log', e);
  }
  return true;
}
