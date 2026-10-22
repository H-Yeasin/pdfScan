import type { TKey } from '../../i18n';
import { ICONS, type IoniconName } from '../../theme/icons';
import type { DocFormat, LibraryDocument } from '../../types/models';
import {
  canAddCover,
  canConvertToPdf,
  canSign,
  canSubmit,
  canUsePageTools,
  CONVERTIBLE_TO_PDF,
  hasPageMasters,
  isPageRasterFormat,
  isPdfLevel,
  OPENABLE_FORMATS,
  PAGE_RASTER_FORMATS,
} from '../documents/formatCapabilities';
import type { ProTaskFeature } from '../pro/proTask';
import { TOOL_IDS, type ToolId } from './recentTools';

// §17 U8: every tool the app has, in one list, for the Tools tab. Pure: what a tool is called,
// what it works on and how its flow goes. What it *does* is components/tools/useToolRunners, a
// table keyed by the same ids (a runner needs hooks: the Pro gate, the signing overlays), so a
// new id here doesn't compile until it has one there.
//
// The other entry points stay (Files' row menu and selection bar, the Reader's tools and More);
// this is the one place that lists them all.

export type ToolSection = 'scan' | 'organise' | 'convert' | 'signFill' | 'study' | 'share';

export const TOOL_SECTIONS: readonly ToolSection[] = ['scan', 'organise', 'convert', 'signFill', 'study', 'share'];

export type { ToolId } from './recentTools';

// How a tool's flow goes after it is tapped (toolFlow.ts):
// - 'launch': nothing to pick; it starts something (the scanner, a screen) and the flow is over.
// - 'run': pick → options (if it has any) → a progress sheet → the result sheet. The work is ours.
// - 'handoff': pick, then a flow that already has its own screen or overlay (Edit pages, Academic
//   options, the signing overlays, Submit's sheet, the share and print dialogs) takes over.
// - 'gated': pick, then the Pro task gate (useProTask, the ad) and the tool's own progress; the
//   result sheet comes up when it reports back.
export type ToolKind = 'launch' | 'run' | 'handoff' | 'gated';

export type ToolDef = {
  id: ToolId;
  section: ToolSection;
  labelKey: TKey;
  descKey: TKey;
  icon: IoniconName;
  kind: ToolKind;
  // The formats it can pick; [] for a 'launch' tool.
  accepts: readonly DocFormat[];
  // How many documents it takes (Merge: 2 or more). 0 for a 'launch' tool.
  min: number;
  max: number;
  // A document of an accepted format that still can't be used (formatCapabilities: a
  // password-protected PDF, an imported PDF where the tool needs page masters). Not offered.
  fits?: (doc: LibraryDocument) => boolean;
  // The Pro task feature the gate asks about; null: free (FREE_FOREVER).
  pro: ProTaskFeature | null;
  // An options step between Pick and Run (Merge/Split: keep the originals; Compress: how small).
  options: boolean;
};

const ANY = Number.POSITIVE_INFINITY;
const ALL_FORMATS: readonly DocFormat[] = [...new Set<DocFormat>([...OPENABLE_FORMATS, ...PAGE_RASTER_FORMATS])];

// Page tools work on PDF/JPG documents that aren't password-protected (fileTools.blockedReason
// says the same in Files).
const pageTool = { accepts: PAGE_RASTER_FORMATS, fits: canUsePageTools } as const;

export const TOOLS: readonly ToolDef[] = [
  // Scan & import
  { id: 'scan', section: 'scan', labelKey: 'tools.items.scan', descKey: 'tools.desc.scan', icon: ICONS.scan, kind: 'launch', accepts: [], min: 0, max: 0, pro: null, options: false },
  { id: 'importPhotos', section: 'scan', labelKey: 'tools.items.importPhotos', descKey: 'tools.desc.importPhotos', icon: ICONS.gallery, kind: 'launch', accepts: [], min: 0, max: 0, pro: null, options: false },
  { id: 'importFile', section: 'scan', labelKey: 'tools.items.importFile', descKey: 'tools.desc.importFile', icon: ICONS.import, kind: 'launch', accepts: [], min: 0, max: 0, pro: null, options: false },
  // Organise
  { id: 'merge', section: 'organise', labelKey: 'tools.items.merge', descKey: 'tools.desc.merge', icon: ICONS.merge, kind: 'run', ...pageTool, min: 2, max: ANY, pro: null, options: true },
  // One page splits into itself.
  { id: 'split', section: 'organise', labelKey: 'tools.items.split', descKey: 'tools.desc.split', icon: ICONS.split, kind: 'run', accepts: PAGE_RASTER_FORMATS, fits: (d) => canUsePageTools(d) && d.pages.length > 1, min: 1, max: 1, pro: null, options: true },
  { id: 'compress', section: 'organise', labelKey: 'tools.items.compress', descKey: 'tools.desc.compress', icon: ICONS.compress, kind: 'run', ...pageTool, min: 1, max: ANY, pro: null, options: true },
  { id: 'editPages', section: 'organise', labelKey: 'tools.items.editPages', descKey: 'tools.desc.editPages', icon: ICONS.reorder, kind: 'handoff', ...pageTool, min: 1, max: 1, pro: null, options: false },
  { id: 'addCover', section: 'organise', labelKey: 'tools.items.addCover', descKey: 'tools.desc.addCover', icon: ICONS.addCover, kind: 'handoff', accepts: ['PDF'], fits: canAddCover, min: 1, max: 1, pro: null, options: false },
  // Convert. Office → PDF reads the document's own file (contentUri), as the Reader does.
  { id: 'toPdf', section: 'convert', labelKey: 'tools.items.toPdf', descKey: 'tools.desc.toPdf', icon: ICONS.convertToPdf, kind: 'gated', accepts: CONVERTIBLE_TO_PDF, fits: (d) => canConvertToPdf(d.format) && !!d.contentUri, min: 1, max: 1, pro: 'convert', options: false },
  { id: 'toWord', section: 'convert', labelKey: 'tools.items.toWord', descKey: 'tools.desc.toWord', icon: ICONS.convertToWord, kind: 'gated', ...pageTool, min: 1, max: 1, pro: 'convert', options: false },
  // Sign & fill. A form is an imported PDF's (a scan has no fields), as readerTools.readerProTasks.
  { id: 'sign', section: 'signFill', labelKey: 'tools.items.sign', descKey: 'tools.desc.sign', icon: ICONS.sign, kind: 'handoff', accepts: PAGE_RASTER_FORMATS, fits: canSign, min: 1, max: 1, pro: null, options: false },
  { id: 'fillForm', section: 'signFill', labelKey: 'tools.items.fillForm', descKey: 'tools.desc.fillForm', icon: ICONS.fillForm, kind: 'gated', accepts: ['PDF'], fits: (d) => isPdfLevel(d) && canUsePageTools(d), min: 1, max: 1, pro: 'pdfForms', options: false },
  // Study. An exam pack and a text export are made from page masters (hasPageMasters).
  { id: 'examPack', section: 'study', labelKey: 'tools.items.examPack', descKey: 'tools.desc.examPack', icon: ICONS.examPack, kind: 'handoff', accepts: PAGE_RASTER_FORMATS, fits: hasPageMasters, min: 1, max: ANY, pro: null, options: false },
  { id: 'extractText', section: 'study', labelKey: 'tools.items.extractText', descKey: 'tools.desc.extractText', icon: ICONS.extractText, kind: 'handoff', accepts: PAGE_RASTER_FORMATS, fits: hasPageMasters, min: 1, max: 1, pro: null, options: false },
  { id: 'search', section: 'study', labelKey: 'tools.items.search', descKey: 'tools.desc.search', icon: ICONS.find, kind: 'launch', accepts: [], min: 0, max: 0, pro: null, options: false },
  // Share & back up
  { id: 'submit', section: 'share', labelKey: 'tools.items.submit', descKey: 'tools.desc.submit', icon: ICONS.submit, kind: 'handoff', accepts: PAGE_RASTER_FORMATS, fits: canSubmit, min: 1, max: 1, pro: null, options: false },
  { id: 'exportZip', section: 'share', labelKey: 'tools.items.exportZip', descKey: 'tools.desc.exportZip', icon: ICONS.exportZip, kind: 'handoff', accepts: ALL_FORMATS, min: 1, max: ANY, pro: null, options: false },
  // printDocument: a page document through its PDF, any other through its own file.
  { id: 'print', section: 'share', labelKey: 'tools.items.print', descKey: 'tools.desc.print', icon: ICONS.print, kind: 'handoff', accepts: ALL_FORMATS, fits: (d) => isPageRasterFormat(d.format) || !!d.contentUri, min: 1, max: 1, pro: null, options: false },
  { id: 'backup', section: 'share', labelKey: 'tools.items.backup', descKey: 'tools.desc.backup', icon: ICONS.backup, kind: 'launch', accepts: [], min: 0, max: 0, pro: null, options: false },
];

const BY_ID = new Map<ToolId, ToolDef>(TOOLS.map((tool) => [tool.id, tool]));

export function getTool(id: ToolId): ToolDef {
  const tool = BY_ID.get(id);
  if (!tool) throw new Error(`Unknown tool: ${id}`);
  return tool;
}

export function toolsIn(section: ToolSection): ToolDef[] {
  return TOOLS.filter((tool) => tool.section === section);
}

export function needsPick(tool: ToolDef): boolean {
  return tool.kind !== 'launch';
}

// The documents the picker offers for a tool: the formats it accepts, not archived, and that it can
// really work on. Files' order (newest first) is the caller's.
export function pickableDocs(tool: ToolDef, docs: readonly LibraryDocument[]): LibraryDocument[] {
  return docs.filter((doc) => !doc.archived && tool.accepts.includes(doc.format) && (!tool.fits || tool.fits(doc)));
}

// Why the picked documents can't go on yet (the picker's hint and its disabled Continue); null: they can.
export function pickProblem(tool: ToolDef, count: number): { key: TKey; count: number } | null {
  if (count < tool.min) return { key: tool.min > 1 ? 'tools.pick.atLeast' : 'tools.pick.one', count: tool.min };
  if (count > tool.max) return { key: 'tools.pick.atMost', count: tool.max };
  return null;
}

// How a Pro tool shows, as useProFeature and Remote Config say. With a Pro pass it is a plain tool;
// with Pro tasks made free (`pro_tasks_free`) it says "Free today"; with ads off and tasks not free
// no ad can unlock it, so it is hidden (§14 Q1: unavailable, not free); otherwise a Pro badge.
export type ToolBadge = 'none' | 'pro' | 'freeToday' | 'hidden';

export function toolBadge(tool: ToolDef, ctx: { isPro: boolean; adsEnabled: boolean; proTasksFree: boolean }): ToolBadge {
  if (!tool.pro || ctx.isPro) return 'none';
  if (ctx.proTasksFree) return 'freeToday';
  if (!ctx.adsEnabled) return 'hidden';
  return 'pro';
}

// Every id has exactly one entry (tested), so the table of runners and this list can't drift.
export const ALL_TOOL_IDS = TOOL_IDS;
