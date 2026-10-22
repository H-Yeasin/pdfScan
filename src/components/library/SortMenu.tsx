import type { TKey } from '../../i18n';
import { useT } from '../../i18n/useT';
import { defaultDirFor, SORT_KEYS, type DocumentSort, type SortKey } from '../../services/library/documentSort';
import { ICONS } from '../../theme';
import { Menu, type MenuSection } from '../ui';

type SortMenuProps = {
  visible: boolean;
  sort: DocumentSort;
  onChange: (sort: DocumentSort) => void;
  onClose: () => void;
};

type SortMenuId = SortKey | 'asc' | 'desc';

// The two directions, worded for the order in use ("Newest first", "A to Z", "Largest first").
function dirLabels(key: SortKey): Record<'asc' | 'desc', TKey> {
  switch (key) {
    case 'name':
    case 'course':
      return { asc: 'library.sortDir.aToZ', desc: 'library.sortDir.zToA' };
    case 'size':
      return { asc: 'library.sortDir.smallest', desc: 'library.sortDir.largest' };
    default:
      return { asc: 'library.sortDir.oldest', desc: 'library.sortDir.newest' };
  }
}

// §17 U7: Sort - the order, then its direction. The ones in use carry a check. Picking another
// order starts it in its natural direction (documentSort.defaultDirFor).
export function SortMenu({ visible, sort, onChange, onClose }: SortMenuProps) {
  const { t } = useT();
  const labels = dirLabels(sort.key);
  const sections: MenuSection<SortMenuId>[] = [
    {
      title: t('library.sortBy'),
      items: SORT_KEYS.map((key) => ({ id: key, label: t(`library.sort.${key}`), icon: key === sort.key ? ICONS.done : ICONS.sort })),
    },
    {
      title: t('library.sortOrder'),
      items: (['desc', 'asc'] as const).map((dir) => ({ id: dir, label: t(labels[dir]), icon: dir === sort.dir ? ICONS.done : ICONS.sort })),
    },
  ];

  return (
    <Menu
      visible={visible}
      onClose={onClose}
      title={t('library.sortTitle')}
      sections={sections}
      onSelect={(id) => {
        if (id === 'asc' || id === 'desc') onChange({ ...sort, dir: id });
        else if (id !== sort.key) onChange({ key: id, dir: defaultDirFor(id) });
      }}
    />
  );
}
