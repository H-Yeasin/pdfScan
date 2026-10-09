import { useEffect, useState } from 'react';
import { useRouter } from '../../navigation/router';
import { useScreenRole } from '../../navigation/screenRole';
import { hintScheduler, type HintId } from '../../services/hints/hints';
import { useAppDispatch, useAppSelector } from '../../store/AppStateContext';

// §9 O3: whether the one-time hint `id` shows here, now. `enabled: false` while its anchor is
// hidden or covered (a sheet is open); the hint then waits, or hides again until it's uncovered.
// Marked seen as soon as it appears. §16 G2: a screen kept mounted off screen is "hidden" too,
// so it can't use up a hint nobody sees.
export function useHint(id: HintId, enabledHere = true): { visible: boolean; dismiss: () => void } {
  const onScreen = useScreenRole() === 'active';
  const enabled = enabledHere && onScreen;
  const dispatch = useAppDispatch();
  const { navTick } = useRouter();
  const loaded = useAppSelector((s) => s.settings.loaded);
  const seen = useAppSelector((s) => s.settings.hintsSeen);
  const busy = useAppSelector((s) => s.capture.processingStatus === 'scanning' || s.capture.processingStatus === 'processing');
  const [shown, setShown] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Waits for settings, so a hint seen in an earlier session isn't shown again before they load.
    if (shown || !loaded) return;
    if (hintScheduler.tryClaim(id, { seen, busy, blocked: !enabled, visitKey: navTick })) {
      setShown(true);
      dispatch({ type: 'settings/MARK_HINT_SEEN', id });
    }
  }, [shown, loaded, id, seen, busy, enabled, navTick, dispatch]);

  return { visible: shown && !dismissed && enabled && !busy, dismiss: () => setDismissed(true) };
}
