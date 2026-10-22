import type { SessionPage } from '../../../types/models';
import { looksLikeSpread, reviewSuggestion, suggestionKey, type SuggestionInput } from '../suggestion';

function page(over: Partial<SessionPage> = {}): SessionPage {
  return { id: 'p1', uri: 'file:///p1.jpg', width: 1000, height: 1400, rotation: 0, enhance: 'auto', ...over };
}

function input(over: Partial<SuggestionInput> = {}): SuggestionInput {
  return { page: page(), mode: 'doc', cropCheckCount: 0, processing: false, dismissed: new Set(), ...over };
}

describe('reviewSuggestion', () => {
  it('says nothing for a plain page', () => {
    expect(reviewSuggestion(input())).toBeNull();
  });

  it('puts crops to check first, then a faint page, then a spread', () => {
    const spread = page({ width: 3000, height: 2000, err: true });
    expect(reviewSuggestion(input({ page: spread, cropCheckCount: 2 }))?.kind).toBe('cropCheck');
    expect(reviewSuggestion(input({ page: spread }))?.kind).toBe('lowContrast');
    expect(reviewSuggestion(input({ page: { ...spread, err: false } }))?.kind).toBe('bookSpread');
  });

  it('waits for a batch before asking to check crops', () => {
    expect(reviewSuggestion(input({ cropCheckCount: 1, processing: true }))).toBeNull();
  });

  it("doesn't call a page faint once it is black and white", () => {
    expect(reviewSuggestion(input({ page: page({ err: true, enhance: 'bw' }) }))).toBeNull();
  });

  it('offers Book only for notes and documents', () => {
    const spread = page({ width: 3000, height: 2000 });
    expect(reviewSuggestion(input({ page: spread, mode: 'notes' }))?.kind).toBe('bookSpread');
    expect(reviewSuggestion(input({ page: spread, mode: 'board' }))).toBeNull();
    expect(reviewSuggestion(input({ page: spread, mode: 'book' }))).toBeNull();
  });

  it('shows the next one once the first is dismissed, per page', () => {
    const halfAndFaint = page({ err: true, splitFrom: { groupId: 'g', uri: 'file:///s.jpg', width: 2, height: 1 } });
    const dismissed = new Set([suggestionKey('lowContrast', 'p1')]);
    expect(reviewSuggestion(input({ page: halfAndFaint, mode: 'book', dismissed }))?.kind).toBe('splitFrom');
    expect(reviewSuggestion(input({ page: { ...halfAndFaint, id: 'p2' }, mode: 'book', dismissed }))?.kind).toBe('lowContrast');
  });

  it('an ID card page says its print size', () => {
    expect(reviewSuggestion(input({ page: page({ idCard: { front: { uri: 'f', width: 1, height: 1 } } }), mode: 'id' }))?.kind).toBe('idCard');
  });
});

describe('looksLikeSpread', () => {
  it('reads the page as shown, after its turn', () => {
    expect(looksLikeSpread({ width: 3000, height: 2000, rotation: 0 })).toBe(true);
    expect(looksLikeSpread({ width: 3000, height: 2000, rotation: 90 })).toBe(false);
    expect(looksLikeSpread({ width: 1100, height: 1000, rotation: 0 })).toBe(false);
  });
});
