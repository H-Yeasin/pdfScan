import { en } from '../../../i18n/en';
import { makeDoc, makePage } from '../../../test/fixtures';
import { ICONS } from '../../../theme/icons';
import { CONVERTIBLE_TO_PDF, PAGE_RASTER_FORMATS } from '../../documents/formatCapabilities';
import { normalizeRecentTools, pushRecentTool, TOOL_IDS } from '../recentTools';
import { getTool, needsPick, pickableDocs, pickProblem, TOOL_SECTIONS, TOOLS, toolBadge, toolsIn } from '../toolRegistry';

jest.mock('../../pdf/pdfNative', () => ({ isPdfNativeAvailable: () => true }));

// A key like 'tools.items.merge' looked up in the English catalog.
function lookup(key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), en);
}

describe('toolRegistry', () => {
  it('lists every tool id exactly once', () => {
    const ids = TOOLS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...TOOL_IDS].sort());
  });

  it('gives every tool a label, a description, an icon and a section', () => {
    const icons = new Set(Object.values(ICONS));
    for (const tool of TOOLS) {
      expect(typeof lookup(tool.labelKey)).toBe('string');
      expect(typeof lookup(tool.descKey)).toBe('string');
      expect(icons.has(tool.icon)).toBe(true);
      expect(TOOL_SECTIONS).toContain(tool.section);
      expect(typeof lookup(`tools.section.${tool.section}`)).toBe('string');
    }
  });

  it('has the plan’s sections in order, none empty', () => {
    expect(TOOL_SECTIONS).toEqual(['scan', 'organise', 'convert', 'signFill', 'study', 'share']);
    for (const section of TOOL_SECTIONS) expect(toolsIn(section).length).toBeGreaterThan(0);
  });

  it('keeps min and max sensible: launch tools pick nothing, the others at least one', () => {
    for (const tool of TOOLS) {
      if (tool.kind === 'launch') {
        expect(needsPick(tool)).toBe(false);
        expect(tool.accepts).toEqual([]);
        expect(tool.min).toBe(0);
      } else {
        expect(needsPick(tool)).toBe(true);
        expect(tool.accepts.length).toBeGreaterThan(0);
        expect(tool.min).toBeGreaterThanOrEqual(1);
        expect(tool.max).toBeGreaterThanOrEqual(tool.min);
      }
    }
    expect(getTool('merge').min).toBe(2);
    expect(getTool('split').max).toBe(1);
  });

  it('accepts what formatCapabilities allows', () => {
    for (const id of ['merge', 'split', 'compress', 'editPages', 'toWord', 'sign', 'examPack', 'extractText', 'submit'] as const) {
      for (const format of getTool(id).accepts) expect(PAGE_RASTER_FORMATS).toContain(format);
    }
    expect([...getTool('toPdf').accepts]).toEqual([...CONVERTIBLE_TO_PDF]);
    expect(getTool('fillForm').accepts).toEqual(['PDF']);
    expect(getTool('addCover').accepts).toEqual(['PDF']);
  });

  it('only marks the convert and form tools as Pro', () => {
    const pro = TOOLS.filter((t) => t.pro).map((t) => [t.id, t.pro]);
    expect(pro).toEqual([
      ['toPdf', 'convert'],
      ['toWord', 'convert'],
      ['fillForm', 'pdfForms'],
    ]);
    for (const tool of TOOLS) if (tool.pro) expect(tool.kind).toBe('gated');
  });

  describe('pickableDocs', () => {
    const scan = makeDoc({ id: 'scan', format: 'PDF', pages: [makePage({ id: 'a' }), makePage({ id: 'b' })] });
    const onePage = makeDoc({ id: 'one', format: 'PDF', pages: [makePage({ id: 'c' })] });
    const locked = makeDoc({ id: 'locked', format: 'PDF', indexState: 'encrypted', sourceKind: 'imported_pdf' });
    const word = makeDoc({ id: 'word', format: 'DOCX', pages: [], contentUri: 'file:///w.docx' });
    const archived = makeDoc({ id: 'old', format: 'PDF', archived: true });

    it('offers only the formats a tool accepts, not archived, not password-protected', () => {
      const ids = (id: Parameters<typeof getTool>[0]) => pickableDocs(getTool(id), [scan, onePage, locked, word, archived]).map((d) => d.id);
      expect(ids('merge')).toEqual(['scan', 'one']);
      expect(ids('split')).toEqual(['scan']);
      expect(ids('toPdf')).toEqual(['word']);
      expect(ids('exportZip')).toEqual(['scan', 'one', 'locked', 'word']);
    });
  });

  it('says what the pick still needs', () => {
    expect(pickProblem(getTool('merge'), 1)).toEqual({ key: 'tools.pick.atLeast', count: 2 });
    expect(pickProblem(getTool('merge'), 2)).toBeNull();
    expect(pickProblem(getTool('compress'), 0)).toEqual({ key: 'tools.pick.one', count: 1 });
    expect(pickProblem(getTool('split'), 2)).toEqual({ key: 'tools.pick.atMost', count: 1 });
  });

  it('shows a Pro tool as useProFeature and Remote Config say', () => {
    const word = getTool('toWord');
    const ctx = { isPro: false, adsEnabled: true, proTasksFree: false };
    expect(toolBadge(getTool('merge'), ctx)).toBe('none');
    expect(toolBadge(word, ctx)).toBe('pro');
    expect(toolBadge(word, { ...ctx, isPro: true })).toBe('none');
    expect(toolBadge(word, { ...ctx, proTasksFree: true })).toBe('freeToday');
    expect(toolBadge(word, { ...ctx, adsEnabled: false })).toBe('hidden');
    expect(toolBadge(word, { ...ctx, adsEnabled: false, proTasksFree: true })).toBe('freeToday');
  });
});

describe('recent tools', () => {
  it('keeps the last four, newest first, without repeats', () => {
    let recent = pushRecentTool([], 'merge');
    recent = pushRecentTool(recent, 'split');
    recent = pushRecentTool(recent, 'merge');
    expect(recent).toEqual(['merge', 'split']);
    for (const id of ['sign', 'print', 'toWord'] as const) recent = pushRecentTool(recent, id);
    expect(recent).toEqual(['toWord', 'print', 'sign', 'merge']);
  });

  it('returns the same list when the tool is already first', () => {
    const recent = pushRecentTool([], 'merge');
    expect(pushRecentTool(recent, 'merge')).toBe(recent);
  });

  it('reads back only known ids', () => {
    expect(normalizeRecentTools(undefined)).toEqual([]);
    expect(normalizeRecentTools(['merge', 'nope', 3, 'merge', 'split', 'sign', 'print', 'scan'])).toEqual(['merge', 'split', 'sign', 'print']);
  });
});
