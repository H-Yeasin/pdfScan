import { readFileSync } from 'fs';
import { join } from 'path';

// §11 L1: what Google Play reviews in the release manifest. Libraries add permissions the app never
// uses, and two of them get an upload questioned or rejected:
// - READ_MEDIA_IMAGES comes from expo-screen-capture (for its screenshot listener; the app only
//   calls prevent/allowScreenCaptureAsync). Play's Photo and Video Permissions policy allows it
//   only for apps whose core purpose is broad photo access; picking an image goes through the
//   system Photo Picker on Android 13+ (expo-image-picker asks for nothing there).
// - SYSTEM_ALERT_WINDOW comes from the Expo template; the app draws over nothing.
// RECORD_AUDIO is blocked since expo-camera (scans never record). The AdMob app id must come from
// the EAS environment (app.config.js), so app.json keeps Google's sample id and never a real one.

const ROOT = join(__dirname, '../..');
type AppJson = {
  expo: {
    android: { permissions?: string[]; blockedPermissions?: string[] };
    plugins?: (string | [string, Record<string, unknown>])[];
  };
};
const app = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8')) as AppJson;
const pluginNames = (app.expo.plugins ?? []).map((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin));

describe('release manifest (§11 L1)', () => {
  it('blocks the permissions Play questions', () => {
    expect(app.expo.android.blockedPermissions).toEqual(
      expect.arrayContaining([
        'android.permission.RECORD_AUDIO',
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.READ_MEDIA_IMAGES',
      ])
    );
  });

  it('asks for no permission it also blocks', () => {
    const blocked = new Set(app.expo.android.blockedPermissions ?? []);
    expect((app.expo.android.permissions ?? []).filter((p) => blocked.has(p))).toEqual([]);
  });

  it('lists the Sentry plugin once, with its options', () => {
    // A bare '@sentry/react-native' entry ahead of '/expo' wins and drops the options.
    expect(pluginNames.filter((name) => name.startsWith('@sentry/react-native'))).toEqual(['@sentry/react-native/expo']);
  });

  it('keeps predictive back off, so Android 13-15 deliver Back to JS', () => {
    // With the opt-in on (`enableOnBackInvokedCallback="true"`), Android 13-15 stop calling
    // `Activity.onBackPressed()` and only run OnBackPressedDispatcher callbacks. React Native 0.86's
    // `ReactActivity` registers its callback only on Android 16+ with targetSdk 36
    // (`AndroidVersion.isAtLeastTargetSdk36`), so on an Android 13-15 phone the press never reached
    // `hardwareBackPress` and the activity finished: Back and the edge swipe closed the app from
    // any screen (a Galaxy A51, Android 13). The API 36 emulator hid it. On Android 16 predictive
    // back is enforced whatever this says, and RN's callback handles it there.
    const android = app.expo.android as { predictiveBackGestureEnabled?: boolean };
    expect(android.predictiveBackGestureEnabled).toBe(false);
  });

  it("keeps Google's sample AdMob app id in app.json", () => {
    const ads = (app.expo.plugins ?? []).find((p) => Array.isArray(p) && p[0] === 'react-native-google-mobile-ads');
    const options = (Array.isArray(ads) ? ads[1] : {}) as { androidAppId?: string };
    expect(options.androidAppId).toMatch(/^ca-app-pub-3940256099942544~/);
  });
});
