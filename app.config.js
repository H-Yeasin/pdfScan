// Extends app.json. The Firebase files aren't committed (the repo is public): EAS builds get
// their paths from the file environment variables GOOGLE_SERVICES_JSON (Android) and
// GOOGLE_SERVICE_INFO_PLIST (iOS) - see docs/firebase.md. Without them the Firebase plugin is
// left out, so local builds still work; Remote Config then keeps its bundled defaults.
module.exports = ({ config }) => {
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
