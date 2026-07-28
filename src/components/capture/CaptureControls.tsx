import { Ionicons } from '@expo/vector-icons';
import { useRef } from 'react';
import { Animated, Image, Pressable, StyleSheet, View } from 'react-native';
import { radii, spacing } from '../../theme';
import { useCaptureChrome } from '../../theme/captureChrome';
import type { SessionPage } from '../../types/models';

const SHUTTER_SIZE = 76;
const SHUTTER_INNER_SIZE = 60;
const SIDE_BUTTON_SIZE = 48;

type CaptureControlsProps = {
  onCapturePress: () => void;
  onGalleryPress: () => void;
  onTrayPress: () => void;
  disabled?: boolean;
  pageCount: number;
  lastPage?: SessionPage;
};

export function CaptureControls({
  onCapturePress,
  onGalleryPress,
  onTrayPress,
  disabled,
  pageCount,
  lastPage,
}: CaptureControlsProps) {
  const chrome = useCaptureChrome();
  const scale = useRef(new Animated.Value(1)).current;
  const trayEmpty = pageCount === 0;

  const animatePress = (toValue: number) => {
    Animated.spring(scale, { toValue, useNativeDriver: true, speed: 30, bounciness: 6 }).start();
  };

  return (
    <View style={styles.row}>
      <Pressable
        style={[styles.sideButton, { backgroundColor: chrome.pillBg, borderColor: chrome.pillBorder }]}
        onPress={onGalleryPress}
        hitSlop={8}
      >
        <Ionicons name="image-outline" size={22} color={chrome.text} />
      </Pressable>

      <Pressable
        onPress={onCapturePress}
        onPressIn={() => animatePress(0.9)}
        onPressOut={() => animatePress(1)}
        disabled={disabled}
        hitSlop={8}
      >
        <Animated.View
          style={[
            styles.shutterOuter,
            { borderColor: chrome.accent, transform: [{ scale }] },
            disabled && styles.shutterDisabled,
          ]}
        >
          <View style={[styles.shutterInner, { backgroundColor: chrome.accent }]} />
        </Animated.View>
      </Pressable>

      <Pressable
        style={[
          styles.thumbnail,
          { backgroundColor: chrome.pillBg, borderColor: chrome.pillBorder },
          trayEmpty && styles.trayDisabled,
        ]}
        onPress={onTrayPress}
        disabled={trayEmpty}
        hitSlop={8}
      >
        {lastPage ? (
          <Image source={{ uri: lastPage.uri }} style={styles.thumbnailImage} resizeMode="cover" />
        ) : (
          <Ionicons name="document-outline" size={20} color={chrome.textDim} />
        )}
        {pageCount > 0 && (
          <View style={[styles.badge, { backgroundColor: chrome.accent, borderColor: chrome.base }]}>
            <Animated.Text style={styles.badgeText}>{pageCount}</Animated.Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
  },
  sideButton: {
    width: SIDE_BUTTON_SIZE,
    height: SIDE_BUTTON_SIZE,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  shutterOuter: {
    width: SHUTTER_SIZE,
    height: SHUTTER_SIZE,
    borderRadius: radii.full,
    borderWidth: 4,
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
  },
  thumbnail: {
    width: SIDE_BUTTON_SIZE,
    height: SIDE_BUTTON_SIZE,
    borderRadius: radii.chip,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  trayDisabled: {
    opacity: 0.38,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
});
