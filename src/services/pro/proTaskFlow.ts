import { showRewarded } from '../ads/rewarded';
import { getRemoteConfig } from '../remote/remoteConfig';
import { logUsage } from '../telemetry/usage';
import { createId } from '../../utils/id';
import type { AppStore } from '../../store/AppStateContext';
import { getEntitlement, isProActive } from './entitlement';
import {
  carryGrant,
  clearPendingTask,
  consumeGrant,
  decide,
  getProTaskRunner,
  grantAfterReward,
  loadPendingTask,
  loadTaskState,
  markPendingRewarded,
  offlineRunsOnDay,
  PRO_TASK_FEATURE_CODES,
  recordOfflineRun,
  resumeDecision,
  savePendingTask,
  updateTaskState,
  type PendingProTask,
  type ProTaskDecision,
  type ProTaskFeature,
  type ProTaskParams,
} from './proTask';

// §12 D1: the steps of a Pro task, in order, without UI (components/pro/useProTask.tsx shows the
// sheet and snacks around them):
// 1. checkProTask: run now, or offer the ad.
// 2. watchAdForTask, after the student tapped "Watch ad" (and the sheet has closed): the pending
//    task is written first, marked rewarded on the reward event, and the grant saved then too, so
//    a process death during the ad loses nothing (resumePendingTask offers it at the next start).
// 3. completeProTask: the screen's own run (same progress UI as without an ad), then the once
//    grant is used up and the pending task cleared.

export type ProTaskRequest = {
  feature: ProTaskFeature;
  // The runner that can finish it after a restart (proTask.registerProTaskRunner).
  kind: string;
  docId: string;
  title: string;
  params?: ProTaskParams;
  // The screen's task, with its own progress and error handling.
  run: () => Promise<void> | void;
};

export async function checkProTask(req: Pick<ProTaskRequest, 'feature' | 'docId'>, now: number): Promise<ProTaskDecision> {
  const remote = getRemoteConfig();
  const { grants, offlineRuns } = await loadTaskState();
  return decide({
    isPro: isProActive(getEntitlement(), now),
    grants,
    feature: req.feature,
    docId: req.docId,
    now,
    adsEnabled: remote.adsEnabled,
    // Not known until one is asked for; a failure comes back through watchAdForTask.
    adsAvailable: true,
    offlineRunsToday: offlineRunsOnDay(offlineRuns, now),
    offlineFreePerDay: remote.offlineFreeTasksPerDay,
  });
}

export type TaskAdOutcome =
  // Watched to the end: run it (completeProTask with this taskId).
  | { outcome: 'rewarded'; taskId: string }
  // Closed early: nothing runs, the screen stays as it was.
  | { outcome: 'closedEarly' }
  // No ad could load; today's offline allowance covers it: run it.
  | { outcome: 'runWithoutAd' }
  // No ad, and the allowance is used up: offer the Pro pass.
  | { outcome: 'offerPro' };

export async function watchAdForTask(
  req: ProTaskRequest,
  opts: { personalizedAdsEnabled: boolean; now?: () => number }
): Promise<TaskAdOutcome> {
  const now = opts.now ?? Date.now;
  const remote = getRemoteConfig();
  const feature = PRO_TASK_FEATURE_CODES[req.feature];
  const pending: PendingProTask = {
    id: createId('protask'),
    feature: req.feature,
    kind: req.kind,
    docId: req.docId,
    title: req.title,
    params: req.params ?? {},
    rewarded: false,
    createdAt: now(),
  };
  await savePendingTask(pending);

  let saved: Promise<unknown> | null = null;
  const result = await showRewarded({
    timeoutMs: remote.taskAdTimeoutMs,
    personalizedAdsEnabled: opts.personalizedAdsEnabled,
    now,
    onShow: () => logUsage('pro_task_ad_shown', { feature }),
    onReward: () => {
      logUsage('pro_task_ad_rewarded', { feature });
      const at = now();
      saved = Promise.all([
        markPendingRewarded(pending.id),
        updateTaskState(at, (s) => ({ ...s, grants: [...s.grants, grantAfterReward(req.feature, req.docId, at, getRemoteConfig().editUnlockMinutes)] })),
      ]);
    },
  });
  if (result === 'rewarded') {
    await saved;
    return { outcome: 'rewarded', taskId: pending.id };
  }
  await clearPendingTask(pending.id);
  if (result === 'closedEarly') return { outcome: 'closedEarly' };

  // No ad (no fill, offline, consent): fail open, within today's allowance.
  const at = now();
  const { offlineRuns } = await loadTaskState();
  if (offlineRunsOnDay(offlineRuns, at) >= remote.offlineFreeTasksPerDay) return { outcome: 'offerPro' };
  await updateTaskState(at, (s) => ({ ...s, offlineRuns: recordOfflineRun(s.offlineRuns, at) }));
  logUsage('pro_task_run_without_ad', { feature });
  return { outcome: 'runWithoutAd' };
}

// Runs the task. A once grant is used up only when the task finishes, so a failed conversion can
// be retried without another ad; the pending task is cleared either way (a file that fails isn't
// retried at every start).
export async function completeProTask(req: Pick<ProTaskRequest, 'feature' | 'docId' | 'run'>, taskId?: string, now: () => number = Date.now): Promise<void> {
  try {
    await req.run();
    await updateTaskState(now(), (s) => ({ ...s, grants: consumeGrant(s.grants, req.feature, req.docId) }));
  } finally {
    if (taskId) await clearPendingTask(taskId);
  }
}

// At start (components/pro/ProTaskResumeHost): a task whose ad was watched to the end but whose
// app was killed before it ran, if it is under an hour old and its kind can be run without its
// screen. Anything else is cleared.
export async function pendingTaskToResume(now: number): Promise<PendingProTask | null> {
  const task = await loadPendingTask();
  if (!task) return null;
  if (resumeDecision(task, now) === 'offer' && getProTaskRunner(task.kind)) return task;
  await clearPendingTask(task.id);
  return null;
}

export async function resumeProTask(task: PendingProTask, store: AppStore, now: () => number = Date.now): Promise<void> {
  const runner = getProTaskRunner(task.kind);
  if (!runner) {
    await clearPendingTask(task.id);
    return;
  }
  await completeProTask({ feature: task.feature, docId: task.docId, run: () => runner(task, { store }) }, task.id, now);
}

// §12 D7: see proTask.carryGrant.
export async function carryProTaskGrant(feature: ProTaskFeature, fromDocId: string, toDocId: string, now: () => number = Date.now): Promise<void> {
  const at = now();
  await updateTaskState(at, (s) => ({ ...s, grants: carryGrant(s.grants, feature, fromDocId, toDocId, at) }));
}
