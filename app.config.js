// Extends app.json. The Firebase files aren't committed (the repo is public): EAS builds get
// their paths from the file environment variables GOOGLE_SERVICES_JSON (Android) and
// GOOGLE_SERVICE_INFO_PLIST (iOS) - see docs/firebase.md. Without them the Firebase plugin is
// left out, so local builds still work; Remote Config then keeps its bundled defaults.
const path = require('path');
const { withPlugins } = require('expo/config-plugins');

// §10 M5: app.json carries Google's sample AdMob app ids (they only ever serve test ads). Release
// builds get the real ones from the EAS environment variables ADMOB_ANDROID_APP_ID and
// ADMOB_IOS_APP_ID - see docs/ads.md.
function withAdMobIds(config) {
  const android = process.env.ADMOB_ANDROID_APP_ID;
  const ios = process.env.ADMOB_IOS_APP_ID;
  if (!android && !ios) return config;
  const plugins = (config.plugins ?? []).map((plugin) =>
    Array.isArray(plugin) && plugin[0] === 'react-native-google-mobile-ads'
      ? [plugin[0], { ...plugin[1], ...(android ? { androidAppId: android } : {}), ...(ios ? { iosAppId: ios } : {}) }]
      : plugin
  );
  return { ...config, plugins };
}

// The Firebase plugin always runs both its iOS and Android halves, and each one throws without its
// own file. So a local `npx expo prebuild` (both platforms) failed with only google-services.json.
// Worse, the iOS half would add FirebaseApp.configure() to the AppDelegate, which crashes at launch
// with no plist. With one file, only that platform's half runs. The package's "exports" hide the
// halves, so they load by file path (checked against @react-native-firebase/app 26.4).
function firebasePluginHalf(platform) {
  const pkg = require.resolve('@react-native-firebase/app/package.json');
  return require(path.join(path.dirname(pkg), 'plugin', 'build', platform));
}

function withFirebaseFor({ android, ios }) {
  if (android && ios) return '@react-native-firebase/app';
  return (config) => {
    if (ios) {
      const half = firebasePluginHalf('ios');
      return withPlugins(config, [
        half.withFirebaseAppDelegate,
        half.withIosGoogleServicesFile,
        half.withIosDisableSPM,
      ]);
    }
    const half = firebasePluginHalf('android');
    return withPlugins(config, [
      half.withBuildscriptDependency,
      half.withApplyGoogleServicesPlugin,
      half.withCopyAndroidGoogleServices,
    ]);
  };
}

module.exports = ({ config: base }) => {
  const config = withAdMobIds(base);
  const androidFile = process.env.GOOGLE_SERVICES_JSON;
  const iosFile = process.env.GOOGLE_SERVICE_INFO_PLIST;
  if (!androidFile && !iosFile) return config;
  return {
    ...config,
    android: { ...config.android, ...(androidFile ? { googleServicesFile: androidFile } : {}) },
    ios: { ...config.ios, ...(iosFile ? { googleServicesFile: iosFile } : {}) },
    plugins: [
      ...(config.plugins ?? []),
      withFirebaseFor({ android: Boolean(androidFile), ios: Boolean(iosFile) }),
    ],
  };
};
