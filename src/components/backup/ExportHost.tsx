import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/AppStateContext';
import { useBackupExport } from './useBackupExport';

// §8 B5: runs an export or backup asked for with ui/REQUEST_EXPORT - from a snack action ("Back up
// Spring 2026 before you forget?") or Home's reminder card - where the asking component can't
// keep a dialog open. Always mounted (AppNavigator).
export function ExportHost() {
  const dispatch = useAppDispatch();
  const request = useAppSelector((s) => s.ui.exportRequest);
  const { backUpEverything, exportScope, busy, overlay } = useBackupExport();

  useEffect(() => {
    if (!request || busy) return;
    dispatch({ type: 'ui/REQUEST_EXPORT', request: null });
    if (request.scope.kind === 'all') void backUpEverything();
    else exportScope(request.scope, request.courseName);
  }, [request, busy, dispatch, backUpEverything, exportScope]);

  return overlay;
}
