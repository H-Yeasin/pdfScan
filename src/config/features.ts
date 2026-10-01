// Compile-time switches for features that exist in code but aren't ready to ship. A disabled
// feature must have no reachable entry point in the UI.
export const FEATURES = {
  // The Pro screen's purchase flow isn't implemented ("Unlock Pro" does nothing yet).
  pro: false,
} as const;
