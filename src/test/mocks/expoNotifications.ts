// In-memory stand-in for expo-notifications: scheduled requests are kept in a map so tests can see
// what would fire and when. Permission state is settable via __setPermission.
type Request = { identifier: string; content: { title?: string; body?: string; data?: Record<string, unknown> }; trigger: unknown };

let scheduled = new Map<string, Request>();
let nextId = 1;
let permission: 'granted' | 'denied' | 'undetermined' = 'undetermined';
let grantOnRequest = true;

export enum SchedulableTriggerInputTypes {
  DATE = 'date',
}
export enum AndroidImportance {
  DEFAULT = 3,
  HIGH = 4,
}

export async function scheduleNotificationAsync(request: Omit<Request, 'identifier'>): Promise<string> {
  const identifier = `n${nextId++}`;
  scheduled.set(identifier, { identifier, ...request });
  return identifier;
}
export async function cancelScheduledNotificationAsync(identifier: string): Promise<void> {
  scheduled.delete(identifier);
}
export async function getAllScheduledNotificationsAsync(): Promise<Request[]> {
  return [...scheduled.values()];
}
export async function getPermissionsAsync() {
  return { status: permission, granted: permission === 'granted', canAskAgain: permission === 'undetermined' };
}
export async function requestPermissionsAsync() {
  if (permission === 'undetermined') permission = grantOnRequest ? 'granted' : 'denied';
  return getPermissionsAsync();
}
export async function setNotificationChannelAsync() {
  return null;
}
export function setNotificationHandler() {}
export function useLastNotificationResponse() {
  return undefined;
}

export function __reset(options: { permission?: typeof permission; grantOnRequest?: boolean } = {}) {
  scheduled = new Map();
  nextId = 1;
  permission = options.permission ?? 'undetermined';
  grantOnRequest = options.grantOnRequest ?? true;
}
export function __scheduled(): Request[] {
  return [...scheduled.values()];
}
