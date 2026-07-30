import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { spacing, typeScale, useTheme } from '../../theme';

type ContextBarItem = {
  id: 'crop' | 'rotate' | 'retake' | 'ocr' | 'academic';
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active?: boolean;
};

type ContextBarProps = {
  onPress: (id: ContextBarItem['id']) => void;
  ocrRunning: boolean;
};

export function ContextBar({ onPress, ocrRunning }: ContextBarProps) {
  const { tokens } = useTheme();

  const items: ContextBarItem[] = [
    { id: 'crop', label: 'Crop', icon: 'crop-outline' },
    { id: 'rotate', label: 'Rotate', icon: 'reload-outline' },
    { id: 'retake', label: 'Retake', icon: 'camera-outline' },
    { id: 'ocr', label: 'OCR', icon: 'text-outline', active: ocrRunning },
    { id: 'academic', label: 'Academic', icon: 'school-outline' },
  ];

  return (
    <View style={[styles.row, { backgroundColor: tokens.surface, borderTopColor: tokens.edge }]}>
      {items.map((item) => (
        <Pressable key={item.id} style={styles.item} onPress={() => onPress(item.id)}>
          <Ionicons name={item.icon} size={21} color={item.active ? tokens.accent : tokens.ink} />
          <Text style={[styles.label, { color: item.active ? tokens.accent : tokens.ink }]}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  item: {
    flex: 1,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  label: {
    fontSize: 12,
    fontFamily: typeScale.label.fontFamily,
    fontWeight: '600',
  },
});
