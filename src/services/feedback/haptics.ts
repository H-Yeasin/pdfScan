import * as Haptics from 'expo-haptics';

// Fire-and-forget haptic cues, used the same way everywhere (§9 O6). A device without a vibrator (or
// with haptics disabled) must never turn feedback into an error, so every call swallows failures.
//
// §17 U13: one map from what happened to how it feels, and the only module that calls expo-haptics
// (src/services/feedback/__tests__/haptics.test.ts fails on another):
// - selection: a tick for a choice: a filter chip, a switch, selection mode starting;
// - light: something settling into place: a snack swiped away, a sheet snapping (U3);
// - success: work done: pages scanned in, saved, submitted, a tool's result;
// - warning: something failed, or a destructive confirm asking (delete, discard, clear).
export type HapticKind = 'selection' | 'light' | 'success' | 'warning';

export const HAPTICS: Record<HapticKind, () => Promise<void>> = {
  selection: () => Haptics.selectionAsync(),
  light: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  warning: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
};

export function haptic(kind: HapticKind): void {
  HAPTICS[kind]().catch(() => {});
}

// The scanner handed pages back.
export function hapticPagesReceived(): void {
  haptic('light');
}

// Processing finished and the pages are in Review; saved; submitted; a tool's result.
export function hapticSuccess(): void {
  haptic('success');
}

// A choice ticked: selection mode started (a long-press on a document), a chip, a switch.
export function hapticSelection(): void {
  haptic('selection');
}

// Something failed (or the batch was cut short), or a destructive confirm is asking.
export function hapticWarning(): void {
  haptic('warning');
}

// Something settled: a snack swiped away.
export function hapticLight(): void {
  haptic('light');
}
