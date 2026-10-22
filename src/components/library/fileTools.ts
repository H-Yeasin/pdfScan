import type { TKey } from '../../i18n';
import type { useT } from '../../i18n/useT';
import { canAddCover, canSign, canSubmit, canUsePageTools, isPageRasterFormat, isPasswordProtected } from '../../services/documents/formatCapabilities';
import { ICONS } from '../../theme';
import type { LibraryDocument } from '../../types/models';
import type { MenuItem, MenuSection } from '../ui';

// §17 U7: everything Files can do to its documents, from a row's ⋯ menu and from the selection
// bar. One id per action so both run through the same handler (useDocumentListActions.runTool).
export type FileToolId =
  | 'open'
  | 'share'
  | 'rename'
  | 'move'
  | 'star'
  | 'type'
  | 'merge'
  | 'split'
  | 'compress'
  | 'sign'
  | 'cover'
  | 'submit'
  | 'archive'
  | 'export'
  | 'delete';

type Translate = ReturnType<typeof useT>['t'];

// A row's ⋯ menu, in its four groups. A tool that can't work on this document's format is left out
// (formatCapabilities): a Word file has no page tools, a password-protected PDF none either.
export function rowMenuSections(doc: LibraryDocument, t: Translate): MenuSection<FileToolId>[] {
  const pageTools = canUsePageTools(doc);
  return [
    {
      items: [
        { id: 'open', label: t('library.menu.open'), icon: ICONS.open },
        { id: 'share', label: t('library.menu.share'), icon: ICONS.share },
        { id: 'rename', label: t('library.menu.rename'), icon: ICONS.rename },
      ],
    },
    {
      items: [
        { id: 'move', label: t('library.menu.move'), icon: ICONS.move },
        { id: 'star', label: doc.star ? t('library.menu.unstar') : t('library.menu.star'), icon: ICONS.star },
        { id: 'type', label: t('library.menu.type'), icon: ICONS.docType },
      ],
    },
    {
      items: [
        ...(pageTools ? [{ id: 'merge' as const, label: t('library.menu.mergeWith'), icon: ICONS.merge }] : []),
        // One page splits into itself.
        ...(pageTools && doc.pages.length !== 1 ? [{ id: 'split' as const, label: t('library.menu.split'), icon: ICONS.split }] : []),
        ...(pageTools ? [{ id: 'compress' as const, label: t('library.menu.compress'), icon: ICONS.compress }] : []),
        ...(canSign(doc) ? [{ id: 'sign' as const, label: t('library.menu.sign'), icon: ICONS.sign }] : []),
        ...(canAddCover(doc) ? [{ id: 'cover' as const, label: t('library.menu.cover'), icon: ICONS.addCover }] : []),
      ],
    },
    { items: [{ id: 'delete', label: t('library.menu.delete'), icon: ICONS.delete, destructive: true }] },
  ];
}

// The selection bar: four tools always in view, the rest under More. Nothing scrolls sideways.
export const BAR_TOOLS = ['share', 'move', 'merge', 'delete'] as const satisfies readonly FileToolId[];
export const MORE_TOOLS = ['submit', 'type', 'archive', 'export', 'split', 'compress', 'sign', 'cover'] as const satisfies readonly FileToolId[];

const ONE_AT_A_TIME: readonly FileToolId[] = ['split', 'sign', 'submit', 'cover'];
const PAGE_TOOLS: readonly FileToolId[] = ['merge', 'split', 'compress', 'sign', 'submit'];

// Why a tool can't run on this selection, as the message the student sees when they tap it anyway
// (a tool never just sits there greyed out). null: it can run.
export function blockedReason(id: FileToolId, docs: readonly LibraryDocument[]): TKey | null {
  if (docs.length === 0) return 'library.why.pickFirst';
  if (id === 'merge' && docs.length < 2) return 'library.why.mergeTwo';
  if (ONE_AT_A_TIME.includes(id) && docs.length !== 1) return 'library.why.oneAtATime';
  if (id === 'cover') {
    const [doc] = docs;
    if (isPasswordProtected(doc)) return 'library.passwordProtected';
    return canAddCover(doc) ? null : 'library.cover.convertFirst';
  }
  if (!PAGE_TOOLS.includes(id)) return null;
  if (!docs.every((d) => isPageRasterFormat(d.format))) return 'library.why.pdfOnly';
  if (docs.some(isPasswordProtected)) return 'library.passwordProtected';
  if (id === 'sign' && !canSign(docs[0])) return 'library.why.pdfOnly';
  if (id === 'submit' && !canSubmit(docs[0])) return 'library.why.pdfOnly';
  return null;
}

const TOOL_ICON: Record<FileToolId, MenuItem['icon']> = {
  open: ICONS.open,
  share: ICONS.share,
  rename: ICONS.rename,
  move: ICONS.move,
  star: ICONS.star,
  type: ICONS.docType,
  merge: ICONS.merge,
  split: ICONS.split,
  compress: ICONS.compress,
  sign: ICONS.sign,
  cover: ICONS.addCover,
  submit: ICONS.submit,
  archive: ICONS.archive,
  export: ICONS.exportZip,
  delete: ICONS.delete,
};

export function toolIcon(id: FileToolId): MenuItem['icon'] {
  return TOOL_ICON[id];
}

export function toolLabel(id: FileToolId, docs: readonly LibraryDocument[], t: Translate): string {
  if (id === 'archive' && docs.length > 0 && docs.every((d) => d.archived)) return t('library.tools.unarchive');
  return t(`library.tools.${id}`);
}

// The selection bar's More: every other tool, a blocked one with its reason under the label.
export function moreMenuSections(docs: readonly LibraryDocument[], t: Translate): MenuSection<FileToolId>[] {
  return [
    {
      items: MORE_TOOLS.map((id) => {
        const why = blockedReason(id, docs);
        return { id, label: toolLabel(id, docs, t), icon: toolIcon(id), hint: why ? t(why) : undefined };
      }),
    },
  ];
}
