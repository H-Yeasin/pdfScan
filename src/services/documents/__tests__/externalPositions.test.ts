import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReaderPosition } from '../../../types/models';
import {
  EXTERNAL_POSITIONS_MAX,
  externalPositionKey,
  loadExternalPosition,
  parseExternalPositions,
  saveExternalPosition,
  withExternalPosition,
} from '../externalPositions';

const at = (index: number): ReaderPosition => ({ kind: 'page', index, fy: 0 });

beforeEach(() => AsyncStorage.clear());

describe('externalPositionKey', () => {
  it('names a file by where it came from and its size, not by the app\'s copy of it', () => {
    const first = externalPositionKey({ sourceUri: 'content://wa/handout.pdf', uri: 'file:///cache/a/handout.pdf', sizeBytes: 900 });
    const again = externalPositionKey({ sourceUri: 'content://wa/handout.pdf', uri: 'file:///cache/b/handout.pdf', sizeBytes: 900 });
    expect(again).toBe(first);
    expect(externalPositionKey({ sourceUri: 'content://wa/handout.pdf', uri: 'file:///cache/b/handout.pdf', sizeBytes: 901 })).not.toBe(first);
  });
});

describe('the list', () => {
  it('puts the file just read first and keeps the rest in order', () => {
    const list = withExternalPosition(withExternalPosition(withExternalPosition([], 'a', at(1)), 'b', at(2)), 'a', at(9));
    expect(list).toEqual([
      ['a', at(9)],
      ['b', at(2)],
    ]);
  });

  it('forgets the least recently read past the limit', () => {
    let list: [string, ReaderPosition][] = [];
    for (let i = 0; i < EXTERNAL_POSITIONS_MAX + 5; i += 1) list = withExternalPosition(list, `f${i}`, at(i));
    expect(list).toHaveLength(EXTERNAL_POSITIONS_MAX);
    expect(list[0][0]).toBe(`f${EXTERNAL_POSITIONS_MAX + 4}`);
    expect(list.some(([key]) => key === 'f4')).toBe(false);
    expect(list.some(([key]) => key === 'f5')).toBe(true);
  });

  it('drops whatever is damaged', () => {
    expect(parseExternalPositions(null)).toEqual([]);
    expect(parseExternalPositions('not json')).toEqual([]);
    expect(parseExternalPositions('{"a":1}')).toEqual([]);
    const stored = JSON.stringify([['a', at(3)], ['b', { kind: 'page', index: 'x' }], [7, at(1)], 'junk', ['c', { kind: 'docx', fraction: 4 }]]);
    expect(parseExternalPositions(stored)).toEqual([
      ['a', at(3)],
      ['c', { kind: 'docx', fraction: 1 }],
    ]);
  });
});

describe('save and load', () => {
  it('remembers a position per file', async () => {
    await saveExternalPosition('a', { kind: 'txt', chunk: 4, fy: 0.5 });
    await saveExternalPosition('b', at(12));
    expect(await loadExternalPosition('a')).toEqual({ kind: 'txt', chunk: 4, fy: 0.5 });
    expect(await loadExternalPosition('b')).toEqual(at(12));
    expect(await loadExternalPosition('never')).toBeUndefined();
  });

  it('keeps every save made in a row', async () => {
    await Promise.all([saveExternalPosition('a', at(1)), saveExternalPosition('b', at(2)), saveExternalPosition('a', at(3))]);
    expect(await loadExternalPosition('a')).toEqual(at(3));
    expect(await loadExternalPosition('b')).toEqual(at(2));
  });

  it('opens at the start when the stored list is damaged', async () => {
    await AsyncStorage.setItem('reader:externalPositions', '{{{');
    expect(await loadExternalPosition('a')).toBeUndefined();
    await saveExternalPosition('a', at(2));
    expect(await loadExternalPosition('a')).toEqual(at(2));
  });
});
