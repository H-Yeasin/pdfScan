import { Ionicons } from '@expo/vector-icons';
import { FlatList, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { radii, spacing, fontFamily, typeScale, useTheme } from '../../theme';
import type { SessionPage } from '../../types/models';

const COLUMNS = 3;
const GAP = spacing.sm;

type GridPagesModalProps = {
  visible: boolean;
  pages: SessionPage[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
};

export function GridPagesModal({ visible, pages, selectedIndex, onSelect, onDelete, onClose }: GridPagesModalProps) {
  const { tokens } = useTheme();

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: tokens.bg }]} edges={['top']}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: tokens.ink, fontFamily: fontFamily.heading }]}>All Pages</Text>
          <Pressable style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={22} color={tokens.ink} />
          </Pressable>
        </View>

        <FlatList
          data={pages}
          keyExtractor={(page) => page.id}
          numColumns={COLUMNS}
          contentContainerStyle={styles.content}
          columnWrapperStyle={styles.row}
          renderItem={({ item, index }) => (
            <Pressable
              style={[
                styles.tile,
                { backgroundColor: tokens.surface, borderColor: index === selectedIndex ? tokens.accent : tokens.edge },
              ]}
              onPress={() => {
                onSelect(index);
                onClose();
              }}
            >
              <Image source={{ uri: item.uri }} style={styles.tileImage} resizeMode="cover" />
              <View style={styles.indexBadge}>
                <Text style={styles.indexBadgeText}>{index + 1}</Text>
              </View>
              <Pressable
                hitSlop={8}
                style={[styles.deleteBadge, { backgroundColor: tokens.danger }]}
                onPress={() => onDelete(item.id)}
              >
                <Ionicons name="close" size={13} color="#fff" />
              </Pressable>
            </Pressable>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  title: {
    fontSize: typeScale.title.fontSize,
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: spacing.lg,
    gap: GAP,
  },
  row: {
    gap: GAP,
  },
  tile: {
    flex: 1 / COLUMNS,
    aspectRatio: 3 / 4,
    borderRadius: radii.thumb,
    borderWidth: 2,
    overflow: 'hidden',
  },
  tileImage: {
    width: '100%',
    height: '100%',
  },
  indexBadge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  indexBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  deleteBadge: {
    position: 'absolute',
    right: 6,
    top: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
