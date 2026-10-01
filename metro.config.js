// Sentry's wrapper around expo/metro-config's getDefaultConfig: identical config, plus debug IDs
// in the bundle so uploaded source maps match crash reports (see services/telemetry/crash.ts).
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);

// Some native modules (e.g. expo-modules-core's bundled Gradle plugin) build
// a .gradle cache directory inside node_modules during Android builds. Gradle
// rewrites/deletes files in there while Metro's watcher is still crawling it,
// causing an ENOENT race on Windows. Exclude those transient build caches.
const existingBlockList = Array.isArray(config.resolver.blockList)
  ? config.resolver.blockList
  : [config.resolver.blockList];

config.resolver.blockList = [
  ...existingBlockList,
  /[\\/]\.gradle[\\/]/,
  /[\\/]expo-module-gradle-plugin[\\/]bin[\\/]/,
];

module.exports = config;
