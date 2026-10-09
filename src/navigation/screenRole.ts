import { createContext, useContext } from 'react';

// §16 G2: screens stay mounted when they're not on screen (a tab's root while another tab shows,
// the screens under the top of a stack), so a screen can't take "mounted" to mean "visible".
// Each layer AppNavigator draws says what it is right now:
// - 'active': the top screen, from the moment it starts sliding in;
// - 'outgoing': the screen sliding (or fading) away, for the length of the transition;
// - 'hidden': mounted, not drawn, and not touchable.
// Hooks that act on behalf of what's on screen check it: the Android back handler of an overlay
// (useBackHandler), one-time hints (useHint), bottom bar heights for the Snackbar
// (useReportBottomBar), banner requests (BannerSlot), Capture's status bar and the Reader's
// keep-awake. Anything rendered outside a layer (and every test) counts as active.
export type ScreenRole = 'active' | 'hidden' | 'outgoing';

export const ScreenRoleContext = createContext<ScreenRole>('active');

export function useScreenRole(): ScreenRole {
  return useContext(ScreenRoleContext);
}
