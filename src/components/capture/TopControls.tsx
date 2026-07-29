import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import type { FlashMode } from 'expo-camera';
import { radii, spacing } from '../../theme';
import { useCaptureChrome } from '../../theme/captureChrome';
import { Pill } from '../shared/Pill';

const FLASH_ICON: Record<FlashMode, keyof typeof Ionicons.glyphMap> = {
  auto: 'flash-outline',
  on: 'flash',
  off: 'flash-off-outline',
  screen: 'flash',
};

const FLASH_LABEL: Record<FlashMode, string> = {
  auto: 'Flash auto',
  on: 'Flash on',
  off: 'Flash off',
  screen: 'Screen flash',
};

type TopControlsProps = {
  flashMode: FlashMode;
  onCycleFlash: () => void;
  onSettingsPress: () => void;
};

export function TopControls({ flashMode, onCycleFlash, onSettingsPress }: TopControlsProps) {
  const chrome = useCaptureChrome();

  return (
    <View style={styles.row}>
      <Pressable onPress={onCycleFlash} hitSlop={8}>
        <Pill
          backgroundColor={chrome.pillBg}
          borderColor={chrome.pillBorder}
          textColor={chrome.text}
          icon={<Ionicons name={FLASH_ICON[flashMode]} size={16} color={chrome.text} />}
        >
          {FLASH_LABEL[flashMode]}
        </Pill>
      </Pressable>

      <Pressable
        onPress={onSettingsPress}
        hitSlop={8}
        style={[styles.settingsButton, { backgroundColor: chrome.pillBg, borderColor: chrome.pillBorder }]}
      >
        <Ionicons name="settings-outline" size={20} color={chrome.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
