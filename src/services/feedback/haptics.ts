import * as Haptics from 'expo-haptics';

// Fire-and-forget haptic cues for the capture loop. A device without a vibrator (or with haptics
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

// Something failed (or the batch was cut short).
export function hapticWarning(): void {
  safely(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}
