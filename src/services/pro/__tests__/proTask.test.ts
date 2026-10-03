import {
  consumeGrant,
  decide,
  findGrant,
  grantAfterReward,
  normalizePendingTask,
  normalizeTaskState,
  offlineRunsOnDay,
  pruneGrants,
  recordOfflineRun,
  resumeDecision,
  type DecideInput,
  type PendingProTask,
} from '../proTask';

const NOON = new Date(2026, 9, 3, 12, 0).getTime();
const MIN = 60 * 1000;

const base: DecideInput = {
  isPro: false,
  grants: [],
  feature: 'convert',
  docId: 'doc1',
  now: NOON,
  adsEnabled: true,
  adsAvailable: true,
  offlineRunsToday: 0,
  offlineFreePerDay: 5,
};

describe('decide', () => {
  it('runs for Pro (a day pass) without any ad', () => {
    expect(decide({ ...base, isPro: true })).toBe('run');
    expect(decide({ ...base, isPro: true, adsAvailable: false, offlineRunsToday: 99 })).toBe('run');
  });

  it('offers the ad to a free student when one could load', () => {
    expect(decide(base)).toBe('offerAd');
  });

  it('runs without an ad when none can load, up to the daily allowance, then offers the day pass', () => {
    expect(decide({ ...base, adsAvailable: false, offlineRunsToday: 4 })).toBe('runWithoutAd');
    expect(decide({ ...base, adsAvailable: false, offlineRunsToday: 5 })).toBe('offerPro');
    expect(decide({ ...base, adsAvailable: false, offlineFreePerDay: 0 })).toBe('offerPro');
  });

  it('runs, uncounted, when the owner switched ads off (no ad and no pass to unlock with)', () => {
    expect(decide({ ...base, adsEnabled: false, adsAvailable: false, offlineRunsToday: 99 })).toBe('run');
  });

  it('runs with a once grant for the same task and document only', () => {
    const grants = [grantAfterReward('convert', 'doc1', NOON, 30)];
    expect(decide({ ...base, grants })).toBe('run');
    expect(decide({ ...base, grants, docId: 'doc2' })).toBe('offerAd');
    expect(decide({ ...base, grants, feature: 'editFiles' })).toBe('offerAd');
  });

  it('lets an editing session skip the sheet until it ends', () => {
    const grants = [grantAfterReward('editFiles', 'doc1', NOON, 30)];
    const edit = { ...base, feature: 'editFiles' as const, grants };
    expect(decide({ ...edit, now: NOON + 29 * MIN })).toBe('run');
    expect(decide({ ...edit, now: NOON + 30 * MIN })).toBe('offerAd');
    // Setting the clock back to before the reward doesn't stretch it.
    expect(decide({ ...edit, now: NOON - MIN })).toBe('offerAd');
  });
});

describe('grants', () => {
  it('gives a conversion one task and editing a session of edit_unlock_minutes', () => {
    expect(grantAfterReward('convert', 'd', NOON, 30)).toEqual({ kind: 'once', feature: 'convert', docId: 'd', from: NOON });
    expect(grantAfterReward('pdfForms', 'd', NOON, 45)).toEqual({ kind: 'session', feature: 'pdfForms', docId: 'd', from: NOON, until: NOON + 45 * MIN });
  });

  it('uses up a once grant when its task finishes, and keeps sessions', () => {
    const grants = [grantAfterReward('convert', 'd', NOON, 30), grantAfterReward('editFiles', 'd', NOON, 30)];
    expect(consumeGrant(grants, 'convert', 'd')).toEqual([grants[1]]);
    expect(consumeGrant(grants, 'editFiles', 'd')).toEqual(grants);
  });

  it('drops a once grant left unused for an hour, and sessions once they end', () => {
    const grants = [grantAfterReward('convert', 'd', NOON, 30), grantAfterReward('editFiles', 'd', NOON, 30)];
    expect(pruneGrants(grants, NOON + 31 * MIN)).toEqual([grants[0]]);
    expect(pruneGrants(grants, NOON + 60 * MIN)).toEqual([]);
    expect(findGrant(grants, 'convert', 'd', NOON + 59 * MIN)).toBe(grants[0]);
  });
});

describe('offline allowance', () => {
  it("counts today's runs in local time and resets at midnight", () => {
    let log: number[] = [];
    log = recordOfflineRun(log, NOON);
    log = recordOfflineRun(log, NOON + 60 * MIN);
    expect(offlineRunsOnDay(log, NOON + 2 * 60 * MIN)).toBe(2);
    const tomorrow = new Date(2026, 9, 4, 0, 1).getTime();
    expect(offlineRunsOnDay(log, tomorrow)).toBe(0);
  });

  it('keeps a week of entries and drops ones from the future', () => {
    const old = NOON - 8 * 24 * 60 * MIN;
    expect(recordOfflineRun([old, NOON - MIN, NOON + MIN], NOON)).toEqual([NOON - MIN, NOON]);
  });
});

describe('stored state', () => {
  it('reads back only valid grants and run times', () => {
    expect(
      normalizeTaskState({
        grants: [
          { kind: 'once', feature: 'convert', docId: 'a', from: 1 },
          { kind: 'session', feature: 'editFiles', docId: 'b', from: 1 },
          { kind: 'once', feature: 'appLock', docId: 'c', from: 1 },
          null,
        ],
        offlineRuns: [1, 'x', 2],
      })
    ).toEqual({ grants: [{ kind: 'once', feature: 'convert', docId: 'a', from: 1 }], offlineRuns: [1, 2] });
    expect(normalizeTaskState('junk')).toEqual({ grants: [], offlineRuns: [] });
  });
});

describe('pending task', () => {
  const task: PendingProTask = {
    id: 't1',
    feature: 'convert',
    kind: 'docxToPdf',
    docId: 'doc1',
    title: 'Handout.docx',
    params: { preset: 'a4' },
    rewarded: true,
    createdAt: NOON,
  };

  it('offers a rewarded task under an hour old after a restart and drops anything else', () => {
    expect(resumeDecision(task, NOON + 59 * MIN)).toBe('offer');
    expect(resumeDecision(task, NOON + 60 * MIN)).toBe('drop');
    expect(resumeDecision({ ...task, rewarded: false }, NOON + MIN)).toBe('drop');
    expect(resumeDecision(task, NOON - MIN)).toBe('drop');
  });

  it('reads back a stored task and rejects a damaged one', () => {
    expect(normalizePendingTask(JSON.parse(JSON.stringify(task)))).toEqual(task);
    expect(normalizePendingTask({ ...task, feature: 'nope' })).toBeNull();
    expect(normalizePendingTask({ ...task, rewarded: 'yes' })).toBeNull();
    expect(normalizePendingTask({ ...task, params: [1] })).toEqual({ ...task, params: {} });
  });
});
