// expo-network for tests: online unless a test says otherwise (__setOnline).
let state = { isConnected: true as boolean | undefined, isInternetReachable: true as boolean | undefined };
const listeners = new Set<() => void>();
export function useNetworkState() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useSyncExternalStore } = require('react') as typeof import('react');
  return useSyncExternalStore(
    (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state
  );
}
export async function getNetworkStateAsync() {
  return state;
}
export function __setOnline(online: boolean | undefined): void {
  state = { isConnected: online, isInternetReachable: online };
  listeners.forEach((l) => l());
}
