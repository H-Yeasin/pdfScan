// §17 U8: the tool ids and the Tools tab's "Recently used" list. Apart from toolRegistry because the
// settings slice keeps the list and is on the boot path (§16 G3): this file imports nothing.

export const TOOL_IDS = [
  'scan',
  'importPhotos',
  'importFile',
  'merge',
  'split',
  'compress',
  'editPages',
  'addCover',
  'toPdf',
  'toWord',
  'sign',
  'fillForm',
  'examPack',
  'extractText',
  'search',
  'submit',
  'exportZip',
  'print',
  'backup',
] as const;

export type ToolId = (typeof TOOL_IDS)[number];

export function isToolId(value: unknown): value is ToolId {
  return typeof value === 'string' && (TOOL_IDS as readonly string[]).includes(value);
}

// The last four tools, newest first, kept in settings.
export const RECENT_TOOLS_MAX = 4;

export function pushRecentTool(recent: readonly ToolId[], id: ToolId): ToolId[] {
  if (recent[0] === id) return recent as ToolId[];
  return [id, ...recent.filter((x) => x !== id)].slice(0, RECENT_TOOLS_MAX);
}

// Whatever was stored (nothing before U8, a tool a later build dropped) as a usable list.
export function normalizeRecentTools(raw: unknown): ToolId[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter(isToolId))].slice(0, RECENT_TOOLS_MAX);
}
