import { Ionicons } from '@expo/vector-icons';
import { Fragment, type ReactNode } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '../../i18n/useT';
import { ICON_SIZE, MIN_TOUCH, radii, spacing, useTheme, type IoniconName } from '../../theme';
import { Badge, type BadgeProps } from './Badge';
import { Text } from './Text';
import { Touchable } from './Touchable';

// §17 U3 (built early by §18 W23, the Reader's More sheet): an action sheet of grouped items. It
// replaces the hand-made overflow sheets and every `Alert` used as a menu. Until U3's `Sheet` lands
// it sits in its own Modal (Android Back closes it through `onRequestClose`); U3 moves it onto
// `Sheet` without changing what callers pass.
//
// Picking an item closes the menu first, then calls `onSelect`: the item may open another sheet,
// and the two must not be on screen together.

export type MenuItem<Id extends string = string> = {
  id: Id;
  label: string;
  icon: IoniconName;
  destructive?: boolean;
  disabled?: boolean;
  badge?: BadgeProps;
  // A second line under the label (§17 U5: what each capture mode is for).
  hint?: string;
  // Shown under the item, inside the menu (a one-time hint: §9 O3's Submit hint).
  below?: ReactNode;
};

export type MenuSection<Id extends string = string> = { title?: string; items: MenuItem<Id>[] };

export type MenuProps<Id extends string = string> = {
  visible: boolean;
  onClose: () => void;
  onSelect: (id: Id) => void;
  sections: MenuSection<Id>[];
  title?: string;
};

// Row height: one line of label at the minimum touch size.
export const MENU_ROW_HEIGHT = MIN_TOUCH + spacing.xs;

export function Menu<Id extends string = string>({ visible, onClose, onSelect, sections, title }: MenuProps<Id>) {
  const { tokens } = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  // An empty section leaves no title or divider behind.
  const shown = sections.filter((s) => s.items.length > 0);

  return (
    <Modal statusBarTranslucent navigationBarTranslucent transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <Touchable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={onClose}
          scale={false}
          ripple="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: tokens.scrim }]}
        />
        <View style={[styles.sheet, { backgroundColor: tokens.surface, paddingBottom: insets.bottom + spacing.sm }]}>
          <View style={[styles.handle, { backgroundColor: tokens.edge }]} />
          {title ? (
            <Text variant="subtitle" style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
          {/* A scan has over a dozen items: on a small phone they scroll. */}
          <ScrollView style={styles.list} bounces={false}>
            {shown.map((section, s) => (
              <View key={section.title ?? `section-${s}`} style={s > 0 ? [styles.section, { borderTopColor: tokens.edge }] : undefined}>
                {section.title ? (
                  <Text variant="overline" color="muted" style={styles.sectionTitle} accessibilityRole="header">
                    {section.title}
                  </Text>
                ) : null}
                {section.items.map((item) => {
                  const ink = item.destructive ? tokens.danger : tokens.ink;
                  return (
                    <Fragment key={item.id}>
                      <Touchable
                        accessibilityRole="button"
                        accessibilityState={{ disabled: !!item.disabled }}
                        disabled={item.disabled}
                        scale={false}
                        style={[styles.item, item.disabled && styles.disabled]}
                        testID={`menu-${item.id}`}
                        onPress={() => {
                          onClose();
                          onSelect(item.id);
                        }}
                      >
                        <Ionicons name={item.icon} size={ICON_SIZE.row} color={ink} />
                        {item.hint ? (
                          <View style={styles.label}>
                            <Text variant="bodyStrong" color={ink} numberOfLines={1}>
                              {item.label}
                            </Text>
                            <Text variant="caption" color="muted" numberOfLines={2}>
                              {item.hint}
                            </Text>
                          </View>
                        ) : (
                          <Text variant="body" color={ink} style={styles.label} numberOfLines={1}>
                            {item.label}
                          </Text>
                        )}
                        {item.badge ? <Badge {...item.badge} /> : null}
                      </Touchable>
                      {item.below}
                    </Fragment>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    paddingTop: spacing.xs,
    maxHeight: '90%',
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: radii.full,
    alignSelf: 'center',
    marginVertical: spacing.sm,
  },
  title: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  list: {
    flexGrow: 0,
  },
  section: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
  },
  sectionTitle: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: MENU_ROW_HEIGHT,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  label: {
    flex: 1,
  },
  disabled: {
    opacity: 0.45,
  },
});
