import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import * as Haptics from 'expo-haptics';
import { haptic, HAPTICS } from '../haptics';

// §17 U13: one haptics map, and only haptics.ts talks to expo-haptics.
const SRC = join(__dirname, '../../..');
const LOADS = /(?:from\s*|require\(\s*|import\(\s*)['"]expo-haptics['"]/;

function sourceFiles(path: string): string[] {
  if (!statSync(path).isDirectory()) return /\.[jt]sx?$/.test(path) ? [path] : [];
  return readdirSync(path).flatMap((name) => (name === '__tests__' || name === 'test' ? [] : sourceFiles(join(path, name))));
}

describe('haptics (§17 U13)', () => {
  it('maps each kind to one cue', async () => {
    expect(Object.keys(HAPTICS).sort()).toEqual(['light', 'selection', 'success', 'warning']);
    haptic('selection');
    haptic('success');
    expect(Haptics.selectionAsync).toHaveBeenCalled();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success);
  });

  it('never throws when the device has no vibrator', () => {
    (Haptics.impactAsync as jest.Mock).mockRejectedValueOnce(new Error('no vibrator'));
    expect(() => haptic('light')).not.toThrow();
  });

  it('is the only module that calls expo-haptics', () => {
    const callers = sourceFiles(SRC)
      .filter((path) => LOADS.test(readFileSync(path, 'utf8')))
      .map((path) => relative(SRC, path).split('\\').join('/'));
    expect(callers).toEqual(['services/feedback/haptics.ts']);
  });
});
