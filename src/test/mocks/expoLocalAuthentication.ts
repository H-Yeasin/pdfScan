// expo-local-authentication for tests: a phone with a PIN and fingerprint that unlocks unless a
// test says otherwise (__setResult / __setLevel).
export enum SecurityLevel {
  NONE = 0,
  SECRET = 1,
  BIOMETRIC_WEAK = 2,
  BIOMETRIC_STRONG = 3,
}

let level = SecurityLevel.BIOMETRIC_STRONG;
let result: { success: true } | { success: false; error: string } = { success: true };

export const authenticateAsync = jest.fn(async () => result);
export async function getEnrolledLevelAsync(): Promise<SecurityLevel> {
  return level;
}
export async function hasHardwareAsync(): Promise<boolean> {
  return true;
}
export async function isEnrolledAsync(): Promise<boolean> {
  return level !== SecurityLevel.NONE;
}
export function __setResult(next: typeof result): void {
  result = next;
}
export function __setLevel(next: SecurityLevel): void {
  level = next;
}
export function __reset(): void {
  level = SecurityLevel.BIOMETRIC_STRONG;
  result = { success: true };
  authenticateAsync.mockClear();
}
