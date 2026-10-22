import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { CHROME_MAX_FONT_SCALE, ICON_SIZE, ICONS, spacing, useTheme } from '../../theme';
import type { LibraryDocument } from '../../types/models';
import { useT } from '../../i18n/useT';
import { BottomBar } from '../shared/BottomBar';
import { Menu, Text, Touchable } from '../ui';
import { BAR_TOOLS, blockedReason, moreMenuSections, toolIcon, toolLabel, type FileToolId } from './fileTools';

// The selection bar's ids are the Files tools (fileTools.ts); the old name stays for its callers.
export type SelectionToolId = FileToolId;

type SelectionBarProps = {
  selectedDocs: LibraryDocument[];
  onPress: (id: SelectionToolId) => void;
};

// §17 U7: in selection mode, in place of the tab bar - Share, Move, Merge and Delete, then More
// with the rest (fileTools.MORE_TOOLS). Five fixed slots, so nothing scrolls sideways. A tool that
// can't run on this selection is drawn faded but still answers a tap, with the reason
// (useDocumentListActions shows fileTools.blockedReason in a snack).
export function SelectionBar({ selectedDocs, onPress }: SelectionBarProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const [moreOpen, setMoreOpen] = useState(false);

  const slot = (id: FileToolId | 'more') => {
    const isMore = id === 'more';
    const faded = !isMore && blockedReason(id, selectedDocs) !== null;
    const color = id === 'delete' ? tokens.danger : tokens.ink;
    const label = isMore ? t('library.tools.more') : toolLabel(id, selectedDocs, t);
    return (
      <Touchable
        accessibilityRole="button"
        accessibilityState={{ disabled: faded }}
        key={id}
        testID={`selection-tool-${id}`}
        scale={false}
        style={[styles.item, faded && styles.faded]}
        onPress={() => (isMore ? setMoreOpen(true) : onPress(id))}
      >
        <Ionicons name={isMore ? ICONS.more : toolIcon(id)} size={ICON_SIZE.bar} color={color} />
        <Text variant="caption" weight="semibold" color={color} numberOfLines={1} maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE}>
          {label}
        </Text>
      </Touchable>
    );
  };

  return (
    <BottomBar testID="selection-bar" backgroundColor={tokens.surface} style={[styles.bar, { borderTopColor: tokens.edge }]}>
      <View style={styles.row}>
        {BAR_TOOLS.map(slot)}
        {slot('more')}
      </View>
      <Menu
        visible={moreOpen}
        onClose={() => setMoreOpen(false)}
        title={t('library.selected', { count: selectedDocs.length })}
        sections={moreMenuSections(selectedDocs, t)}
        onSelect={onPress}
      />
    </BottomBar>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: spacing.xs,
  },
  item: {
    flex: 1,
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  faded: {
    opacity: 0.45,
  },
});
