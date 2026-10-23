// §19 X1: a release build that Perfetto's CPU and heap profilers, simpleperf and Android Studio's
// profilers can look inside, for the measurements in docs/qa/performance.md (§19). Android lets a
// tool sample a non-debuggable app only when its manifest says <profileable android:shell="true"/>
// (Android 10 and newer; older ones ignore it). A debuggable build is no use for timing: it runs
// the JavaScript and the Kotlin unoptimised.
//
// Only when the build is prebuilt with PDFSCAN_PROFILEABLE=1 (scripts/perf/README.md); a plain
// prebuild, and so the build that goes to Play, is unchanged.
//
// Reviewed like any config file (AGENTS.md, Security): it only adds that one manifest element.
const { withAndroidManifest } = require('expo/config-plugins');

function addProfileable(manifest) {
  const application = manifest.manifest.application?.[0];
  if (!application) throw new Error('withProfileable: the manifest has no <application>');
  application.profileable = [{ $: { 'android:shell': 'true' } }];
  return manifest;
}

const withProfileable = (config) => {
  if (process.env.PDFSCAN_PROFILEABLE !== '1') return config;
  return withAndroidManifest(config, (config) => {
    config.modResults = addProfileable(config.modResults);
    return config;
  });
};

module.exports = withProfileable;
module.exports.addProfileable = addProfileable;
