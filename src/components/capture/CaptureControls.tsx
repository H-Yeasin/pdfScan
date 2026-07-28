import { Ionicons } from '@expo/vector-icons';
import { useRef } from 'react';
import { Animated, Image, Pressable, StyleSheet, View } from 'react-native';
import { colors, radii, spacing } from '../../theme';
import type { CapturedPage } from '../../types/capture';

const SHUTTER_SIZE = 76;
const SHUTTER_INNER_SIZE = 60;
const SIDE_BUTTON_SIZE = 48;

type CaptureControlsProps = {
  onCapturePress: () => void;
  onGalleryPress?: () => void;
  onThumbnailPress?: () => void;
  disabled?: boolean;
  lastPage?: CapturedPage;
};

export function CaptureControls({
  onCapturePress,
  onGalleryPress,
  onThumbnailPress,
  disabled,
  lastPage,
}: CaptureControlsProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const animatePress = (toValue: number) => {
    Animated.spring(scale, { toValue, useNativeDriver: true, speed: 30, bounciness: 6 }).start();
  };

  return (
    <View style={styles.row}>
      <Pressable style={styles.sideButton} onPress={onGalleryPress} hitSlop={8}>
        <Ionicons name="image-outline" size={22} color={colors.textPrimary} />
      </Pressable>

      <Pressable
        onPress={onCapturePress}
        onPressIn={() => animatePress(0.9)}
        onPressOut={() => animatePress(1)}
        disabled={disabled}
        hitSlop={8}
      >
        <Animated.View style={[styles.shutterOuter, { transform: [{ scale }] }, disabled && styles.shutterDisabled]}>
          <View style={styles.shutterInner} />
        </Animated.View>
      </Pressable>

      <Pressable style={styles.thumbnail} onPress={onThumbnailPress} hitSlop={8}>
        {lastPage ? (
          <Image source={{ uri: lastPage.uri }} style={styles.thumbnailImage} resizeMode="cover" />
        ) : (
          <Ionicons name="document-outline" size={20} color={colors.textDim} />
        )}
        {lastPage ? <View style={styles.thumbnailBadge} /> : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl,
  },
  sideButton: {
    width: SIDE_BUTTON_SIZE,
    height: SIDE_BUTTON_SIZE,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceTranslucent,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  shutterOuter: {
    width: SHUTTER_SIZE,
    height: SHUTTER_SIZE,
    borderRadius: radii.full,
    borderWidth: 4,
    borderColor: colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterDisabled: {
    opacity: 0.5,
  },
  shutterInner: {
    width: SHUTTER_INNER_SIZE,
    height: SHUTTER_INNER_SIZE,
    borderRadius: radii.full,
    backgroundColor: colors.accent,
  },
  thumbnail: {
    width: SIDE_BUTTON_SIZE,
    height: SIDE_BUTTON_SIZE,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.thumbnailPlaceholder,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  thumbnailBadge: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: colors.background,
  },
});
