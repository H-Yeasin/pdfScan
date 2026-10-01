import { migrateLibraryIndex } from '../legacyLibrary';

const doc = { id: 'doc_1', name: 'A' };

describe('migrateLibraryIndex', () => {
  it('passes a v2 index through', () => {
    const folders = [{ id: 'f1', name: 'Math', createdAt: 1 }];
    expect(migrateLibraryIndex({ version: 2, documents: [doc], folders })).toEqual({
      version: 2,
      documents: [doc],
      folders,
    });
  });

  it('upgrades a v1 index with an empty folder list', () => {
    expect(migrateLibraryIndex({ version: 1, documents: [doc] })).toEqual({ version: 2, documents: [doc], folders: [] });
  });

  it('normalizes garbage to an empty v2 index', () => {
    expect(migrateLibraryIndex(null)).toEqual({ version: 2, documents: [], folders: [] });
    expect(migrateLibraryIndex({ version: 2, documents: 'nope' })).toEqual({ version: 2, documents: [], folders: [] });
  });
});
