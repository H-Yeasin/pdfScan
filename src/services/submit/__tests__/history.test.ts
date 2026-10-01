import { File, Paths } from 'expo-file-system';
import { makePng } from '../../../test/png';
import { renderPage } from '../../enhance/skiaEnhance';
import type { LibraryDocument, LibraryPage } from '../../../types/models';
import { ensureSubmissionFile, submissionFile, submissionRecord, submittedSummary } from '../history';
import { defaultSubmitPreset } from '../preset';
import { submitDocument } from '../submitDocument';

jest.mock('../../enhance/skiaEnhance', () => ({ renderPage: jest.fn(), encodedBytes: jest.fn(async () => 10_000) }));

function png(): string {
  const file = new File(Paths.cache, `h_${Math.random()}.png`);
  file.write(makePng(20, 28));
  return file.uri;
}

function doc(): LibraryDocument {
  const page = { id: 'p1', fileUri: png(), width: 1000, height: 1400 } as LibraryPage;
  return {
    id: `doc_${Math.random().toString(36).slice(2)}`,
    name: 'CSE101_HW3',
    format: 'PDF',
    mode: 'doc',
    pages: [page, { ...page, id: 'p2', fileUri: png() }],
    sizeBytes: 0,
    createdAt: 1,
    star: false,
    locked: false,
    searchHaystack: '',
    courseId: 'cse',
    docType: 'assignment',
  } as LibraryDocument;
}

const profile = { name: 'Rahim', roll: '1', section: '', institution: '' };

beforeEach(() => {
  (renderPage as jest.Mock).mockImplementation(async () => ({ uri: png(), width: 20, height: 28 }));
});

describe('submission history', () => {
  it('records what was submitted and how', async () => {
    const d = doc();
    const preset = { ...defaultSubmitPreset('cse'), sizeLimitBytes: 2_000_000 };
    const result = await submitDocument({ doc: d, preset, profile, n: 3 });
    const record = submissionRecord(d, result, preset, 3, 1234);
    expect(record).toMatchObject({
      documentId: d.id,
      courseId: 'cse',
      fileName: 'CSE101_HW3.pdf',
      sizeBytes: result.sizeBytes,
      sizeLimitBytes: 2_000_000,
      pageCount: 2,
      createdAt: 1234,
      preset,
      typeNumber: 3,
    });
    expect(submissionFile(record).uri).toBe(result.uri);
  });

  it('shares the stored file when it is there', async () => {
    const d = doc();
    const preset = defaultSubmitPreset('cse');
    const result = await submitDocument({ doc: d, preset, profile, n: 1 });
    const record = submissionRecord(d, result, preset, 1);
    expect(await ensureSubmissionFile(record, d, { profile, docs: [d] })).toEqual({ uri: result.uri, rebuilt: false });
  });

  it('rebuilds a missing file under the same name with the stored settings', async () => {
    const d = doc();
    const preset = { ...defaultSubmitPreset('cse'), footerPreset: 'none' as const };
    const result = await submitDocument({ doc: d, preset, profile, n: 1 });
    const record = submissionRecord(d, result, preset, 1);
    new File(result.uri).delete();

    const again = await ensureSubmissionFile(record, d, { profile, docs: [d] });
    expect(again.rebuilt).toBe(true);
    expect(again.uri).toBe(result.uri);
    expect(new File(again.uri).exists).toBe(true);
  });

  it('summarizes for the Reader', () => {
    const d = doc();
    const at = (createdAt: number) => ({ ...submissionRecord(d, { uri: '', fileName: 'a.pdf', sizeBytes: 1, fits: true, level: 0 }, defaultSubmitPreset(null), 1, createdAt) });
    expect(submittedSummary([], String)).toBeNull();
    expect(submittedSummary([at(5), at(9), at(7)], (t) => `day ${t}`)).toBe('Submitted 3× · last on day 9');
  });
});
