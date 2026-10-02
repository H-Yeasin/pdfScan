// §8 B1: the Android Auto Backup rules written by plugins/withBackupRules.js.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const plugin = require('../../../plugins/withBackupRules') as {
  buildFullBackupContent: () => string;
  buildDataExtractionRules: () => string;
  setBackupAttributes: (manifest: { manifest: { application?: { $: Record<string, string> }[] } }) => {
    manifest: { application: { $: Record<string, string> }[] };
  };
};

describe('withBackupRules', () => {
  it('writes the full backup rules (Android 11 and older)', () => {
    expect(plugin.buildFullBackupContent()).toMatchSnapshot();
  });

  it('writes the same rules for cloud backup and device transfer (Android 12+)', () => {
    const xml = plugin.buildDataExtractionRules();
    expect(xml).toMatchSnapshot();
    const cloud = /<cloud-backup>([\s\S]*)<\/cloud-backup>/.exec(xml)?.[1];
    const transfer = /<device-transfer>([\s\S]*)<\/device-transfer>/.exec(xml)?.[1];
    expect(cloud).toBe(transfer);
  });

  it('includes the database, library, signature and settings, and never caches or external-open', () => {
    const xml = plugin.buildFullBackupContent();
    for (const path of ['SQLite/', 'library/', 'signature/']) expect(xml).toContain(`<include domain="file" path="${path}" />`);
    expect(xml).toContain('<include domain="database" path="." />');
    expect(xml).not.toMatch(/include domain="(root|file)" path="(\.|external-open\/?)"/);
    expect(xml).not.toContain('domain="cache"');
  });

  it('points the manifest at both files', () => {
    const result = plugin.setBackupAttributes({ manifest: { application: [{ $: { 'android:name': '.MainApplication' } }] } });
    expect(result.manifest.application[0].$).toEqual({
      'android:name': '.MainApplication',
      'android:allowBackup': 'true',
      'android:fullBackupContent': '@xml/full_backup_content',
      'android:dataExtractionRules': '@xml/data_extraction_rules',
    });
  });
});
