import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadSettings, warmSettings } from '../settingsStorage';

const reads = AsyncStorage.getItem as jest.Mock;

beforeEach(async () => {
  await AsyncStorage.clear();
  reads.mockClear();
});

// §16 G4: App.tsx starts the settings read as the bundle loads; the boot takes that read.
describe('warmSettings', () => {
  it('starts the read, and the first loadSettings takes it', async () => {
    await AsyncStorage.setItem('app:settings', JSON.stringify({ themePref: 'dark', firstRun: false, ocrScript: 'latin' }));
    warmSettings();
    warmSettings();
    expect(reads).toHaveBeenCalledTimes(1);

    expect(await loadSettings()).toMatchObject({ themePref: 'dark' });
    expect(reads).toHaveBeenCalledTimes(1);
  });

  it('is used once: a later load reads what is stored by then', async () => {
    warmSettings();
    expect(await loadSettings()).toBeNull();
    await AsyncStorage.setItem('app:settings', JSON.stringify({ themePref: 'light', firstRun: false, ocrScript: 'latin' }));
    expect(await loadSettings()).toMatchObject({ themePref: 'light' });
    expect(reads).toHaveBeenCalledTimes(2);
  });

  it('loadSettings alone still reads', async () => {
    expect(await loadSettings()).toBeNull();
    expect(reads).toHaveBeenCalledTimes(1);
  });
});
