// Extends app.json. The Firebase files aren't committed (the repo is public): EAS builds get
// their paths from the file environment variables GOOGLE_SERVICES_JSON (Android) and
// GOOGLE_SERVICE_INFO_PLIST (iOS) - see docs/firebase.md. Without them the Firebase plugin is
// left out, so local builds still work; Remote Config then keeps its bundled defaults.
//
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

module.exports = ({ config: base }) => {
  const config = withAdMobIds(base);
  const androidFile = process.env.GOOGLE_SERVICES_JSON;
  const iosFile = process.env.GOOGLE_SERVICE_INFO_PLIST;
  if (!androidFile && !iosFile) return config;
  return {
    ...config,
    android: { ...config.android, ...(androidFile ? { googleServicesFile: androidFile } : {}) },
    ios: { ...config.ios, ...(iosFile ? { googleServicesFile: iosFile } : {}) },
    plugins: [...(config.plugins ?? []), '@react-native-firebase/app'],
  };
};
