import * as fs from 'fs';
import * as path from 'path';
import { isUsageCollectionOn, logUsage, resetUsage, setUsageCollection, usageParams, USAGE_EVENTS } from '../usage';

const mockApps: unknown[] = [{}];
jest.mock('@react-native-firebase/app', () => ({ getApps: () => mockApps }));
const mockSdk = {
  getAnalytics: jest.fn(() => 'analytics'),
  setAnalyticsCollectionEnabled: jest.fn(async () => {}),
  resetAnalyticsData: jest.fn(async () => {}),
  logEvent: jest.fn(),
};
jest.mock('@react-native-firebase/analytics', () => mockSdk);

beforeEach(() => {
  resetUsage();
  jest.clearAllMocks();
  mockApps.length = 1;
});

describe('usage counts', () => {
  it('sends nothing until the toggle is on', () => {
    logUsage('app_open');
    expect(mockSdk.logEvent).not.toHaveBeenCalled();
    expect(isUsageCollectionOn()).toBe(false);
  });

  it('applies "off" on the first call, since Analytics remembers its state across runs', async () => {
    await setUsageCollection(false);
    expect(mockSdk.setAnalyticsCollectionEnabled).toHaveBeenCalledWith('analytics', false);
    expect(mockSdk.resetAnalyticsData).not.toHaveBeenCalled();
  });

  it('logs allowed events with only their number parameters while on', async () => {
    await setUsageCollection(true);
    expect(mockSdk.setAnalyticsCollectionEnabled).toHaveBeenCalledWith('analytics', true);
    logUsage('scan_completed', { pages: 4 });
    // Anything else slipped in at runtime is dropped.
    (logUsage as (e: string, p?: unknown) => void)('scan_completed', { pages: 2.6, name: 'Rahim', course: 'CSE 101' });
    (logUsage as (e: string, p?: unknown) => void)('document_named', { name: 'x' });
    expect(mockSdk.logEvent.mock.calls).toEqual([
      ['analytics', 'scan_completed', { pages: 4 }],
      ['analytics', 'scan_completed', { pages: 3 }],
    ]);
  });

  it('turning it off stops logging and clears the app instance', async () => {
    await setUsageCollection(true);
    await setUsageCollection(false);
    expect(mockSdk.resetAnalyticsData).toHaveBeenCalledTimes(1);
    logUsage('document_saved');
    expect(mockSdk.logEvent).not.toHaveBeenCalled();
  });

  it('does nothing without Firebase in the build', async () => {
    mockApps.length = 0;
    await setUsageCollection(true);
    logUsage('app_open');
    expect(mockSdk.setAnalyticsCollectionEnabled).not.toHaveBeenCalled();
    expect(mockSdk.logEvent).not.toHaveBeenCalled();
  });

  it('keeps only number parameters', () => {
    expect(usageParams('scan_completed', { pages: '3' })).toEqual({});
    expect(usageParams('app_open', { pages: 3 })).toEqual({});
  });
});

// The allow-list is the whole list: every logUsage call in the app names an event on it, and the
// list is the one docs/plan/10-monetization.md (M8) fixes.
describe('allow-list', () => {
  it('is exactly the planned events', () => {
    expect(Object.keys(USAGE_EVENTS).sort()).toEqual(
      ['app_open', 'backup_made', 'document_saved', 'document_submitted', 'pass_started', 'scan_completed'].sort()
    );
    expect(USAGE_EVENTS.scan_completed).toEqual(['pages']);
  });

  it('covers every logUsage call in the source', () => {
    const root = path.join(__dirname, '../../..');
    const calls: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== '__tests__' && entry.name !== 'test') walk(full);
        } else if (/\.tsx?$/.test(entry.name)) {
          const source = fs.readFileSync(full, 'utf8');
          for (const m of source.matchAll(/logUsage\(\s*([^,)\s]+)/g)) calls.push(`${path.relative(root, full)}: ${m[1]}`);
        }
      }
    };
    walk(root);
    const definition = 'services/telemetry/usage.ts';
    const outside = calls.filter((c) => !c.startsWith(definition));
    expect(outside.length).toBeGreaterThanOrEqual(6);
    for (const call of outside) {
      const name = call.split(': ')[1];
      // A literal event name, on the list.
      expect([call, /^'[a-z_]+'$/.test(name)]).toEqual([call, true]);
      expect([call, name.slice(1, -1) in USAGE_EVENTS]).toEqual([call, true]);
    }
  });
});
