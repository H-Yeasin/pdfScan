import type { SessionPage } from '../../../types/models';
import { composeIdCard } from '../../enhance/composeIdCard';
import { composeIdCardPages } from '../idCardPages';

jest.mock('../../enhance/composeIdCard', () => ({
  composeIdCard: jest.fn(async (front: { uri: string }, back?: { uri: string }) => ({
    uri: `card(${front.uri},${back?.uri ?? '-'})`,
    width: 1654,
    height: 2339,
  })),
}));
jest.mock('../ingest', () => ({
  ingestPage: jest.fn(),
  pageFromMaster: jest.fn(async (m: { uri: string; width: number; height: number }, _s: string, o: { enhance?: string }) => ({
    id: `p_${m.uri}`,
    uri: m.uri,
    thumbUri: `${m.uri}.thumb`,
    width: m.width,
    height: m.height,
    rotation: 0,
    enhance: o.enhance ?? 'auto',
  })),
}));

const scan = (id: string): SessionPage => ({ id, uri: `${id}.jpg`, width: 1712, height: 1080, rotation: 0, enhance: 'color' });

describe('composeIdCardPages', () => {
  it('composes scans in front/back pairs as full-page cards that keep their sources', async () => {
    const pages = await composeIdCardPages([scan('f'), scan('b')], 'latin');
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({
      uri: 'card(f.jpg,b.jpg)',
      layout: 'fullPage',
      enhance: 'color',
      idCard: { front: { uri: 'f.jpg' }, back: { uri: 'b.jpg' } },
    });
  });

  it('makes a front-only card from a single scan', async () => {
    const pages = await composeIdCardPages([scan('only')], 'latin');
    expect(pages[0].uri).toBe('card(only.jpg,-)');
    expect(pages[0].idCard?.back).toBeUndefined();
  });

  it('keeps the scans as plain pages if composing fails', async () => {
    jest.mocked(composeIdCard).mockRejectedValueOnce(new Error('skia'));
    const pages = await composeIdCardPages([scan('f'), scan('b'), scan('f2')], 'latin');
    expect(pages.map((p) => p.uri)).toEqual(['f.jpg', 'b.jpg', 'card(f2.jpg,-)']);
  });
});
