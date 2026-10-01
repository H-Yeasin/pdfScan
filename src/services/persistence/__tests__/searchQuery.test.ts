import { buildFtsMatchQuery } from '../searchQuery';

describe('buildFtsMatchQuery', () => {
  it('quotes each token as a prefix term', () => {
    expect(buildFtsMatchQuery('linear  algebra')).toBe('"linear"* "algebra"*');
  });

  it('escapes embedded double quotes so input cannot break out of the phrase', () => {
    expect(buildFtsMatchQuery('say "hi')).toBe('"say"* """hi"*');
  });

  it('keeps FTS operators as literal terms', () => {
    expect(buildFtsMatchQuery('a OR b')).toBe('"a"* "OR"* "b"*');
  });

  it('returns an empty string for blank input', () => {
    expect(buildFtsMatchQuery('   ')).toBe('');
  });
});
