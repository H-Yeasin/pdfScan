import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { useT } from '../../i18n/useT';
import type { ReaderMoreItemId, ReaderMoreSection } from '../../services/documents/readerTools';
import { ICONS, spacing, type IoniconName } from '../../theme';
import { Menu, type MenuSection } from '../ui';
import { Hint } from '../shared/Hint';

export type OverflowItemId = ReaderMoreItemId;

// Each item's icon, from theme/icons where the action has one there.
const ITEM_ICONS: Record<OverflowItemId, IoniconName> = {
  submit: ICONS.submit,
  share: ICONS.share,
  shareAsPdf: ICONS.convertToPdf,
  shareImages: ICONS.gallery,
  print: ICONS.print,
  addToLibrary: ICONS.addToLibrary,
  rename: ICONS.rename,
  move: ICONS.move,
  star: ICONS.star,
  changeType: ICONS.docType,
  editPages: ICONS.reorder,
  addCover: ICONS.addCover,
  changeCover: ICONS.changeCover,
  split: ICONS.split,
  compress: ICONS.compress,
  saveText: ICONS.extractText,
  sign: ICONS.sign,
  readingSettings: ICONS.readingSettings,
  delete: ICONS.delete,
};

type OverflowSheetProps = {
  visible: boolean;
  onClose: () => void;
  onSelect: (id: OverflowItemId) => void;
  // services/documents/readerTools.readerMoreSections decides which apply, and in what order.
  sections: ReaderMoreSection[];
  // Star reads "Unstar" on a starred document.
  starred: boolean;
  // §9 O3: the one-time hint shown under Submit (inside this sheet, never over it).
  submitHint?: { text: string; onDismiss: () => void };
};

// §12 D2, §18 W23: the Reader's More sheet, on the kit's Menu, in sections: Share & export,
// Organise, Study, Document. Study actions are in the bottom tool bar; Delete is last, as the one,
// deliberately-gated path to a destructive action.
export function OverflowSheet({ visible, onClose, onSelect, sections, starred, submitHint }: OverflowSheetProps) {
  const { t } = useT();

  const below = (id: OverflowItemId): ReactNode =>
    id === 'submit' && submitHint ? (
      <Hint text={submitHint.text} onDismiss={submitHint.onDismiss} arrow="up" arrowAlign="left" style={styles.hint} />
    ) : undefined;

  const menu: MenuSection<OverflowItemId>[] = sections.map((section) => ({
    title: t(`reader.moreSections.${section.id}`),
    items: section.items.map((id) => ({
      id,
      label: id === 'star' && starred ? t('reader.actions.unstar') : t(`reader.actions.${id}`),
      icon: id === 'star' && starred ? 'star' : ITEM_ICONS[id],
      destructive: id === 'delete',
      below: below(id),
    })),
  }));

  return <Menu visible={visible} onClose={onClose} onSelect={onSelect} sections={menu} />;
}

const styles = StyleSheet.create({
  hint: {
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
});
