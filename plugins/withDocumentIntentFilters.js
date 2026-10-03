// "Open with" for PDF / DOCX / XLSX / CSV / TXT from a file manager.
//
// expo-dev-client's prebuild plugin (withGeneratedAndroidScheme → Scheme.appendScheme) adds
// <data android:scheme="exp+<slug>"/> to every non-launcher VIEW intent filter, including the
// MIME-type filters from app.json. Once a filter names any scheme, Android stops implicitly
// matching content: and file: URIs, so the filter only matched "exp+yeasin:" URIs and the app
// never showed up in a file manager's "Open with" sheet. It runs in release builds too (the
// plugin is applied whenever expo-dev-client is installed).
//
// This strips those injected schemes again from the document filters only: filters that carry
// a mimeType, or the file:// pathPattern filter. The deep-link filter (pdfscan + exp+yeasin) has
// neither, so the dev client can still be launched through its scheme.
//
// User plugins' mods run after expo's auto plugins, so the injected data is already there here.
//
// Reviewed like any config file (AGENTS.md, Security): it only removes <data> entries from the
// manifest.
const { withAndroidManifest } = require('expo/config-plugins');

function isDocumentFilter(intentFilter) {
  return (intentFilter.data || []).some(
    (data) => data?.$?.['android:mimeType'] || data?.$?.['android:pathPattern']
  );
}

function isInjectedScheme(data, appSchemes) {
  const scheme = data?.$?.['android:scheme'];
  if (!scheme) return false;
  // Only a bare <data android:scheme="..."/> is injected; keep file:// with its host/pathPattern.
  const keys = Object.keys(data.$);
  if (keys.length !== 1) return false;
  return scheme.startsWith('exp+') || appSchemes.includes(scheme);
}

const withDocumentIntentFilters = (config) =>
  withAndroidManifest(config, (config) => {
    const appSchemes = [].concat(config.scheme || []);
    for (const application of config.modResults.manifest.application || []) {
      for (const activity of application.activity || []) {
        for (const intentFilter of activity['intent-filter'] || []) {
          if (!isDocumentFilter(intentFilter)) continue;
          intentFilter.data = intentFilter.data.filter(
            (data) => !isInjectedScheme(data, appSchemes)
          );
        }
      }
    }
    return config;
  });

module.exports = withDocumentIntentFilters;
