const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

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
