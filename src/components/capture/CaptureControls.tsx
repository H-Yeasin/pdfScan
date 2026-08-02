import { Ionicons } from '@expo/vector-icons';
import { useRef } from 'react';
import { ActivityIndicator, Animated, Image, Pressable, StyleSheet, View } from 'react-native';
import { radii, spacing } from '../../theme';
import { useCaptureChrome } from '../../theme/captureChrome';
import type { SessionPage } from '../../types/models';

const SIDE_BUTTON_SIZE = 48;
const SCAN_BUTTON_SIZE = 76;

type CaptureControlsProps = {
  onScanPress: () => void;
  onGalleryPress: () => void;
  onTrayPress: () => void;
  busy?: boolean;
  pageCount: number;
  lastPage?: SessionPage;
};

export function CaptureControls({
  onScanPress,
  onGalleryPress,
  onTrayPress,
  busy,
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
        onPress={onScanPress}
        onPressIn={() => animatePress(0.94)}
        onPressOut={() => animatePress(1)}
        disabled={busy}
        hitSlop={8}
      >
        <Animated.View
          style={[
            styles.scanButton,
            {
              borderColor: chrome.accent,
              backgroundColor: busy ? chrome.accent : chrome.pillBg,
              transform: [{ scale }],
            },
          ]}
        >
          {busy ? (
            <ActivityIndicator color={chrome.accentInk} size="small" />
          ) : (
            <Ionicons name="scan-outline" size={30} color={chrome.accent} />
          )}
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
  scanButton: {
    width: SCAN_BUTTON_SIZE,
    height: SCAN_BUTTON_SIZE,
    borderRadius: radii.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
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
