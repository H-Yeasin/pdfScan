import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Ads from 'react-native-google-mobile-ads';
import * as SecureStore from 'expo-secure-store';
import { resetAdsSdk } from '../../ads/adsSdk';
import { resetRewarded } from '../../ads/rewarded';
import { REMOTE_DEFAULTS, setRemoteConfig } from '../../remote/remoteConfig';
import { isExternalScreenOpen, resetExternalScreens } from '../../security/externalScreen';
import { grantPass, setEntitlement } from '../entitlement';
import { loadPendingTask, loadTaskState, registerProTaskRunner, resetProTaskRunners, savePendingTask, type PendingProTask } from '../proTask';
import { checkProTask, completeProTask, pendingTaskToResume, resumeProTask, watchAdForTask, type ProTaskRequest } from '../proTaskFlow';
import type { AppStore } from '../../../store/AppStateContext';

type Mock = typeof Ads & { rewardedBehaviour: { loads: boolean; script: string[] } };
const mock = Ads as unknown as Mock;
const EARNED = 'rewarded_earned_reward';
const CLOSED = 'closed';
const NOON = new Date(2026, 9, 3, 12, 0).getTime();
const MIN = 60 * 1000;
const store = {} as AppStore;

function request(overrides: Partial<ProTaskRequest> = {}): ProTaskRequest & { run: jest.Mock } {
  return { feature: 'convert', kind: 'docxToPdf', docId: 'doc1', title: 'Handout.docx', run: jest.fn(async () => {}), ...overrides } as ProTaskRequest & {
    run: jest.Mock;
  };
}
const watch = (req: ProTaskRequest, at = NOON) => watchAdForTask(req, { personalizedAdsEnabled: true, now: () => at });

beforeEach(async () => {
  (SecureStore as unknown as { __reset(): void }).__reset();
  await AsyncStorage.clear();
  await setEntitlement(null);
  resetAdsSdk();
  resetRewarded();
  resetExternalScreens();
  resetProTaskRunners();
  setRemoteConfig({ ...REMOTE_DEFAULTS, adsEnabled: true, offlineFreeTasksPerDay: 2, editUnlockMinutes: 30 });
  mock.rewardedBehaviour.loads = true;
  mock.rewardedBehaviour.script = [EARNED, CLOSED];
});

afterAll(() => setRemoteConfig(REMOTE_DEFAULTS));

describe('checkProTask', () => {
  it('offers the ad to a free student, and runs for a Pro pass or with ads switched off', async () => {
    expect(await checkProTask(request(), NOON)).toBe('offerAd');
    await setEntitlement(grantPass(null, NOON, 24));
    expect(await checkProTask(request(), NOON)).toBe('run');
    await setEntitlement(null);
    setRemoteConfig({ ...REMOTE_DEFAULTS, adsEnabled: false });
    expect(await checkProTask(request(), NOON)).toBe('run');
  });
});

describe('watchAdForTask', () => {
  it('writes the pending task, grants on the reward, and clears it once the task has run', async () => {
    const req = request();
    const result = await watch(req);
    expect(result).toEqual({ outcome: 'rewarded', taskId: expect.any(String) });
    expect(await loadPendingTask()).toMatchObject({ kind: 'docxToPdf', docId: 'doc1', rewarded: true });
    expect((await loadTaskState()).grants).toEqual([{ kind: 'once', feature: 'convert', docId: 'doc1', from: NOON }]);
    // Until it runs, a second try at the same conversion needs no second ad.
    expect(await checkProTask(req, NOON + MIN)).toBe('run');

    await completeProTask(req, result.outcome === 'rewarded' ? result.taskId : undefined, () => NOON + MIN);
    expect(req.run).toHaveBeenCalledTimes(1);
    expect(await loadPendingTask()).toBeNull();
    expect((await loadTaskState()).grants).toEqual([]);
    expect(await checkProTask(req, NOON + 2 * MIN)).toBe('offerAd');
  });

  it('unlocks editing the document for edit_unlock_minutes', async () => {
    const req = request({ feature: 'editFiles', kind: 'editTxt' });
    await watch(req);
    expect(await checkProTask(req, NOON + 29 * MIN)).toBe('run');
    expect(await checkProTask(req, NOON + 30 * MIN)).toBe('offerAd');
    expect(await checkProTask({ ...req, docId: 'other' }, NOON + MIN)).toBe('offerAd');
  });

  it('marks the ad as an external screen while it is up, so the app lock ignores it', async () => {
    // Watched to the end and still on screen until the test closes it.
    mock.rewardedBehaviour.script = [EARNED];
    const result = watch(request());
    await new Promise((r) => setTimeout(r, 10));
    expect(isExternalScreenOpen()).toBe(true);
    (mock as unknown as { lastRewarded: { emit(type: string): void } }).lastRewarded.emit(CLOSED);
    expect((await result).outcome).toBe('rewarded');
    expect(isExternalScreenOpen()).toBe(false);
  });

  it('runs nothing and leaves nothing pending when the ad is closed early', async () => {
    mock.rewardedBehaviour.script = [CLOSED];
    const req = request();
    expect(await watch(req)).toEqual({ outcome: 'closedEarly' });
    expect(req.run).not.toHaveBeenCalled();
    expect(await loadPendingTask()).toBeNull();
    expect((await loadTaskState()).grants).toEqual([]);
  });

  it('runs without an ad when none loads, up to offline_free_tasks_per_day, then offers the Pro pass', async () => {
    mock.rewardedBehaviour.loads = false;
    expect(await watch(request())).toEqual({ outcome: 'runWithoutAd' });
    expect(await watch(request())).toEqual({ outcome: 'runWithoutAd' });
    expect(await watch(request())).toEqual({ outcome: 'offerPro' });
    expect((await loadTaskState()).offlineRuns).toEqual([NOON, NOON]);
    expect(await loadPendingTask()).toBeNull();
    // A new day, a new allowance.
    expect(await watch(request(), new Date(2026, 9, 4, 9, 0).getTime())).toEqual({ outcome: 'runWithoutAd' });
  });
});

describe('after a restart', () => {
  const pending = (overrides: Partial<PendingProTask> = {}): PendingProTask => ({
    id: 't1',
    feature: 'convert',
    kind: 'docxToPdf',
    docId: 'doc1',
    title: 'Handout.docx',
    params: { preset: 'a4' },
    rewarded: true,
    createdAt: NOON,
    ...overrides,
  });

  it('keeps the reward when the app dies with the ad still up', async () => {
    // Watched to the end, never closed: the process was killed.
    mock.rewardedBehaviour.script = [EARNED];
    void watch(request());
    await new Promise((r) => setTimeout(r, 10));
    expect(await loadPendingTask()).toMatchObject({ rewarded: true, title: 'Handout.docx' });
  });

  it('offers and runs a rewarded task under an hour old with its stored params', async () => {
    const runner = jest.fn(async () => {});
    registerProTaskRunner('docxToPdf', runner);
    await savePendingTask(pending());
    const task = await pendingTaskToResume(NOON + 10 * MIN);
    expect(task).toMatchObject({ id: 't1' });
    await resumeProTask(task!, store, () => NOON + 10 * MIN);
    expect(runner).toHaveBeenCalledWith(expect.objectContaining({ params: { preset: 'a4' } }), { store });
    expect(await loadPendingTask()).toBeNull();
  });

  it('drops an old, unrewarded or unrunnable task', async () => {
    registerProTaskRunner('docxToPdf', jest.fn(async () => {}));
    await savePendingTask(pending());
    expect(await pendingTaskToResume(NOON + 61 * MIN)).toBeNull();
    expect(await loadPendingTask()).toBeNull();

    await savePendingTask(pending({ rewarded: false }));
    expect(await pendingTaskToResume(NOON + MIN)).toBeNull();

    await savePendingTask(pending({ kind: 'unknownKind' }));
    expect(await pendingTaskToResume(NOON + MIN)).toBeNull();
    expect(await loadPendingTask()).toBeNull();
  });
});
