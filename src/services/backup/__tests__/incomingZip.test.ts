import { File, Paths } from 'expo-file-system';
import { discardIncomingZip, looksLikeZip, stageIncomingZip } from '../incomingZip';

describe('looksLikeZip', () => {
  it('goes by the MIME type or the name', () => {
    expect(looksLikeZip('PDF Scan backup 2026-10-02.zip')).toBe(true);
    expect(looksLikeZip('content://com.android.providers/document/Chemistry%202026-10-02.ZIP')).toBe(true);
    expect(looksLikeZip('content://x/document/1234', 'application/zip')).toBe(true);
    expect(looksLikeZip('notes.pdf', 'application/pdf')).toBe(false);
    expect(looksLikeZip(null)).toBe(false);
  });
});

describe('stageIncomingZip', () => {
  it('copies the zip into the cache, and discarding removes it', async () => {
    const source = new File(Paths.document, 'Downloads', 'backup.zip');
    source.write('PK zip');
    const staged = await stageIncomingZip(source.uri);
    expect(staged.uri.startsWith(Paths.cache.uri)).toBe(true);
    expect(staged.textSync()).toBe('PK zip');
    discardIncomingZip();
    expect(staged.exists).toBe(false);
    expect(source.exists).toBe(true);
  });
});
