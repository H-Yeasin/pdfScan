import { useEffect, useState, useSyncExternalStore } from 'react';
import * as SecureStore from 'expo-secure-store';
import { canUseProFeature, type ProFeatureId, type ProUse } from './proFeatures';

// §10 M3: whether this phone has Pro, and until when. Today the only source is the rewarded day
// pass (M6); 'lifetime' and 'yearly' are for paid Pro (M9) and are never granted before then.
// Kept in expo-secure-store (not AsyncStorage, not a backup) so it can't be edited in a settings
// file and doesn't follow a backup to another phone (plugins/withBackupRules.js leaves it out).
// The pass is checked on the phone only; the plan accepts that risk.

export type EntitlementSource = 'pass' | 'lifetime' | 'yearly';

export type Entitlement = {
  tier: 'pro';
  source: EntitlementSource;
  // Required for 'pass' and 'yearly'; a lifetime licence never ends.
  expiresAt?: number;
  // When it was granted or last confirmed. For a pass: when the ad's reward came in.
  checkedAt: number;
};

const HOUR_MS = 60 * 60 * 1000;

export function isProActive(entitlement: Entitlement | null, now: number): boolean {
  if (!entitlement) return false;
  if (entitlement.source === 'lifetime') return true;
  if (entitlement.expiresAt === undefined || now >= entitlement.expiresAt) return false;
  // A pass can't be stretched by setting the clock back to before it was granted.
  if (entitlement.source === 'pass' && now < entitlement.checkedAt) return false;
  return true;
}

// A pass for `hours` from now. Watching again while a pass runs adds to its end; a paid licence
// (M9) is never replaced by a pass. M6 applies the daily cap before calling this.
export function grantPass(existing: Entitlement | null, now: number, hours: number): Entitlement {
  if (existing && existing.source !== 'pass' && isProActive(existing, now)) return existing;
  const from = existing?.source === 'pass' && isProActive(existing, now) && existing.expiresAt ? existing.expiresAt : now;
  return { tier: 'pro', source: 'pass', expiresAt: from + hours * HOUR_MS, checkedAt: now };
}

// Stored JSON → an Entitlement, or null for anything that isn't one.
export function normalizeEntitlement(raw: unknown): Entitlement | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.tier !== 'pro' || typeof r.checkedAt !== 'number') return null;
  if (r.source !== 'pass' && r.source !== 'lifetime' && r.source !== 'yearly') return null;
  if (r.source !== 'lifetime' && typeof r.expiresAt !== 'number') return null;
  return {
    tier: 'pro',
    source: r.source,
    ...(typeof r.expiresAt === 'number' ? { expiresAt: r.expiresAt } : {}),
    checkedAt: r.checkedAt,
  };
}

const STORE_KEY = 'pro.entitlement';

let current: Entitlement | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((l) => l());
}

export function getEntitlement(): Entitlement | null {
  return current;
}

// Read once at start. Until then (and on any error) the app is free, the safe side: no lapse
// rule depends on knowing about Pro early (app lock's own setting keeps it on).
export async function loadEntitlement(): Promise<void> {
  try {
    const stored = await SecureStore.getItemAsync(STORE_KEY);
    current = stored ? normalizeEntitlement(JSON.parse(stored)) : null;
    notify();
  } catch (e) {
    console.warn('Could not read the Pro entitlement', e);
  }
}

export async function setEntitlement(next: Entitlement | null): Promise<void> {
  current = next;
  notify();
  try {
    if (next) await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(next));
    else await SecureStore.deleteItemAsync(STORE_KEY);
  } catch (e) {
    console.warn('Could not save the Pro entitlement', e);
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useEntitlement(): Entitlement | null {
  return useSyncExternalStore(subscribe, getEntitlement, getEntitlement);
}

// setTimeout's longest delay; a longer wait just re-checks then.
const MAX_TIMER_MS = 2 ** 31 - 1;

// Re-renders when Pro ends, so a pass that runs out while the app is open lapses on screen.
export function useIsPro(): boolean {
  const entitlement = useEntitlement();
  const [now, setNow] = useState(() => Date.now());
  const active = isProActive(entitlement, now);
  useEffect(() => {
    setNow(Date.now());
  }, [entitlement]);
  useEffect(() => {
    if (!active || entitlement?.expiresAt === undefined) return;
    const id = setTimeout(() => setNow(Date.now()), Math.min(Math.max(entitlement.expiresAt - Date.now(), 0), MAX_TIMER_MS));
    return () => clearTimeout(id);
  }, [active, entitlement, now]);
  return active;
}

export function useProFeature(id: ProFeatureId, use: ProUse = 'start'): boolean {
  return canUseProFeature(id, use, useIsPro());
}
