// §8 B1: Android Auto Backup and device-to-device transfer rules.
//
// Without rules, Android backs up the whole app data folder, and cloud backup silently backs up
// nothing once it passes 25 MB. A restore could then bring back the database without the files,
// or the other way round. These rules name exactly what makes up the library, so a device
// transfer is complete: the database (files/SQLite/), the documents (files/library/), the saved
// signature (files/signature/), settings (AsyncStorage lives in the databases folder) and the
// shared preferences. Caches are never backed up; files/external-open/ (recently opened outside
// files) and the library's trash and restore staging folders are left out.
//
// Reviewed like any config file (AGENTS.md, Security): it only writes the two XML files below and
// two manifest attributes.
const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const INCLUDE = [
  { domain: 'file', path: 'SQLite/' },
  { domain: 'file', path: 'library/' },
  { domain: 'file', path: 'signature/' },
  { domain: 'database', path: '.' },
  { domain: 'sharedpref', path: '.' },
];

const EXCLUDE = [
  { domain: 'file', path: 'library/.trash/' },
  { domain: 'file', path: 'library/.incoming/' },
  // §10 M3: expo-secure-store's values (the Pro entitlement) are encrypted with a key that never
  // leaves this phone's keystore, so a restored copy couldn't be read on another phone.
  { domain: 'sharedpref', path: 'SecureStore.xml' },
];

function ruleLines(indent) {
  return [
    ...INCLUDE.map((rule) => `${indent}<include domain="${rule.domain}" path="${rule.path}" />`),
    ...EXCLUDE.map((rule) => `${indent}<exclude domain="${rule.domain}" path="${rule.path}" />`),
  ];
}

// Android 11 and older (android:fullBackupContent).
function buildFullBackupContent() {
  return ['<?xml version="1.0" encoding="utf-8"?>', '<full-backup-content>', ...ruleLines('  '), '</full-backup-content>', ''].join(
    '\n'
  );
}

// Android 12 and newer (android:dataExtractionRules): the same rules for cloud backup and for a
// device-to-device transfer.
function buildDataExtractionRules() {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<data-extraction-rules>',
    '  <cloud-backup>',
    ...ruleLines('    '),
    '  </cloud-backup>',
    '  <device-transfer>',
    ...ruleLines('    '),
    '  </device-transfer>',
    '</data-extraction-rules>',
    '',
  ].join('\n');
}

function setBackupAttributes(manifest) {
  const application = manifest.manifest.application && manifest.manifest.application[0];
  if (!application) throw new Error('withBackupRules: AndroidManifest.xml has no <application>');
  application.$['android:allowBackup'] = 'true';
  application.$['android:fullBackupContent'] = '@xml/full_backup_content';
  application.$['android:dataExtractionRules'] = '@xml/data_extraction_rules';
  return manifest;
}

function withBackupRules(config) {
  config = withAndroidManifest(config, (mod) => {
    mod.modResults = setBackupAttributes(mod.modResults);
    return mod;
  });
  return withDangerousMod(config, [
    'android',
    async (mod) => {
      const dir = path.join(mod.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'full_backup_content.xml'), buildFullBackupContent());
      fs.writeFileSync(path.join(dir, 'data_extraction_rules.xml'), buildDataExtractionRules());
      return mod;
    },
  ]);
}

module.exports = withBackupRules;
module.exports.buildFullBackupContent = buildFullBackupContent;
module.exports.buildDataExtractionRules = buildDataExtractionRules;
module.exports.setBackupAttributes = setBackupAttributes;
