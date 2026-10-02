import { useCallback, useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useRouter } from '../navigation/router';
import {
  cancelStaleReminders,
  ensureNotificationPermission,
  scheduleReminders,
  type DeadlineNotificationData,
} from '../services/submit/deadlines';
import type { Deadline } from '../types/models';
import { createId } from '../utils/id';
import { useAppDispatch, useAppSlices } from './AppStateContext';

// Reminders show while the app is open too (a banner, not silently in the tray).
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

// Always mounted (AppNavigator). Keeps scheduled reminders in step with the deadlines - a deleted
// deadline, one deleted with its course, or one marked done loses its reminders - and opens the
// course page, with the deadline highlighted, when a reminder is tapped (also from a cold start).
// `cleanupReady` (§9 O5): the stale-reminder clean-up waits until after boot; opening a tapped
// reminder only needs the library.
export function useDeadlineReminders(libraryLoaded: boolean, cleanupReady = libraryLoaded) {
  const dispatch = useAppDispatch();
  const state = useAppSlices('library');
  const { go } = useRouter();
  const { deadlines, courses } = state.library;

  useEffect(() => {
    if (!cleanupReady) return;
    cancelStaleReminders(deadlines).catch((error) => console.warn('useDeadlineReminders: cleanup failed', error));
  }, [cleanupReady, deadlines]);

  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!libraryLoaded || !response) return;
    const key = `${response.notification.request.identifier}:${response.notification.date}`;
    if (handled.current === key) return;
    handled.current = key;
    const data = response.notification.request.content.data as Partial<DeadlineNotificationData> | undefined;
    if (!data?.courseId || !courses.some((c) => c.id === data.courseId)) return;
    dispatch({ type: 'library/SET_ACTIVE_COURSE', id: data.courseId });
    dispatch({ type: 'library/SET_HIGHLIGHT_DEADLINE', id: data.deadlineId ?? null });
    go('course');
  }, [libraryLoaded, response, courses, dispatch, go]);
}

export type DeadlineDraft = Pick<Deadline, 'courseId' | 'title' | 'dueAt' | 'docType'>;

// Saving, deleting and settling deadlines. Saving (re)schedules the reminders; the first save
// is when notification permission is asked for.
export function useDeadlineActions() {
  const dispatch = useAppDispatch();
  const state = useAppSlices('library');
  const { courses } = state.library;

  const save = useCallback(
    async (draft: DeadlineDraft, existing?: Deadline): Promise<{ remindersOn: boolean }> => {
      const course = courses.find((c) => c.id === draft.courseId);
      const base: Deadline = existing
        ? { ...existing, ...draft }
        : { id: createId('deadline'), reminderIds: [], createdAt: Date.now(), ...draft };
      const remindersOn = await ensureNotificationPermission().catch(() => false);
      let reminderIds: string[] = [];
      if (remindersOn) {
        try {
          reminderIds = await scheduleReminders(base, course?.code || course?.name || 'Course');
        } catch (error) {
          console.warn('useDeadlineActions: scheduling failed', error);
        }
      }
      const deadline = { ...base, reminderIds };
      if (existing) dispatch({ type: 'library/UPDATE_DEADLINE', id: existing.id, patch: deadline });
      else dispatch({ type: 'library/ADD_DEADLINE', deadline });
      return { remindersOn };
    },
    [courses, dispatch]
  );

  // Its reminders are cancelled by useDeadlineReminders once it's gone.
  const remove = useCallback((id: string) => dispatch({ type: 'library/DELETE_DEADLINE', id }), [dispatch]);

  const markDone = useCallback(
    (id: string, submissionId: string) => dispatch({ type: 'library/UPDATE_DEADLINE', id, patch: { doneSubmissionId: submissionId } }),
    [dispatch]
  );

  return { save, remove, markDone };
}
