import * as Haptics from 'expo-haptics';

// Fire-and-forget haptic cues, used the same way everywhere (§9 O6): success when a scan, save or
// submission is done, a light tick when selection starts, a warning when something failed. A device without a vibrator (or with haptics
// disabled) must never turn feedback into an error, so every call swallows failures.
function safely(run: () => Promise<void>): void {
  run().catch(() => {});
}

// The scanner handed pages back.
export function hapticPagesReceived(): void {
  safely(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

// Processing finished and the pages are in Review.
export function hapticSuccess(): void {
  safely(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

// Selection mode started (a long-press on a document).
export function hapticSelection(): void {
  safely(() => Haptics.selectionAsync());
}

// Something failed (or the batch was cut short).
export function hapticWarning(): void {
  safely(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}
