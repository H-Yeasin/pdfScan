import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, Pressable, StyleSheet, View } from 'react-native';
import { radii, spacing } from '../../theme';
import { useCaptureChrome } from '../../theme/captureChrome';
import type { SessionPage } from '../../types/models';

const SIDE_BUTTON_SIZE = 48;
const SWITCH_TRACK_WIDTH = 104;
const SWITCH_TRACK_HEIGHT = 52;
const SWITCH_KNOB_SIZE = 44;
const SWITCH_KNOB_PADDING = (SWITCH_TRACK_HEIGHT - SWITCH_KNOB_SIZE) / 2;
const SWITCH_KNOB_TRAVEL = SWITCH_TRACK_WIDTH - SWITCH_KNOB_SIZE - SWITCH_KNOB_PADDING * 2;

type Side = 'left' | 'right';

type CaptureControlsProps = {
  onQuickCapturePress: () => void;
  onScanPress: () => void;
  onGalleryPress: () => void;
  onTrayPress: () => void;
  busy?: boolean;
  pageCount: number;
  lastPage?: SessionPage;
};

export function CaptureControls({
  onQuickCapturePress,
  onScanPress,
  onGalleryPress,
  onTrayPress,
  busy,
  pageCount,
  lastPage,
}: CaptureControlsProps) {
  const chrome = useCaptureChrome();
  const scale = useRef(new Animated.Value(1)).current;
  const knobProgress = useRef(new Animated.Value(0)).current;
  const [activeSide, setActiveSide] = useState<Side>('left');
  const trayEmpty = pageCount === 0;

  const animatePress = (toValue: number) => {
    Animated.spring(scale, { toValue, useNativeDriver: true, speed: 30, bounciness: 6 }).start();
  };

  useEffect(() => {
    if (!busy) setActiveSide('left');
  }, [busy]);

  useEffect(() => {
    Animated.spring(knobProgress, {
      toValue: activeSide === 'right' ? 1 : 0,
      useNativeDriver: true,
      speed: 18,
      bounciness: 6,
    }).start();
  }, [activeSide, knobProgress]);

  const knobTranslateX = knobProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, SWITCH_KNOB_TRAVEL],
  });

  const handleQuickCapture = () => {
    if (busy) return;
    setActiveSide('left');
    onQuickCapturePress();
  };

  const handleScan = () => {
    if (busy) return;
    setActiveSide('right');
    onScanPress();
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

      <Animated.View
        style={[
          styles.switchTrack,
          { borderColor: chrome.accent, backgroundColor: chrome.pillBg, transform: [{ scale }] },
        ]}
      >
        <Pressable
          style={styles.switchHalf}
          onPress={handleQuickCapture}
          onPressIn={() => animatePress(0.96)}
          onPressOut={() => animatePress(1)}
          disabled={busy}
          hitSlop={4}
        >
          <Ionicons
            name="camera-outline"
            size={18}
            color={chrome.text}
            style={activeSide === 'left' ? styles.hiddenIcon : undefined}
          />
        </Pressable>
        <Pressable
          style={styles.switchHalf}
          onPress={handleScan}
          onPressIn={() => animatePress(0.96)}
          onPressOut={() => animatePress(1)}
          disabled={busy}
          hitSlop={4}
        >
          <Ionicons
            name="scan-outline"
            size={18}
            color={chrome.text}
            style={activeSide === 'right' ? styles.hiddenIcon : undefined}
          />
        </Pressable>

        <Animated.View
          pointerEvents="none"
          style={[
            styles.switchKnob,
            { backgroundColor: chrome.accent, transform: [{ translateX: knobTranslateX }] },
          ]}
        >
          {busy ? (
            <ActivityIndicator color={chrome.accentInk} size="small" />
          ) : (
            <Ionicons
              name={activeSide === 'left' ? 'camera-outline' : 'scan-outline'}
              size={22}
              color={chrome.accentInk}
            />
          )}
        </Animated.View>
      </Animated.View>

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
  switchTrack: {
    width: SWITCH_TRACK_WIDTH,
    height: SWITCH_TRACK_HEIGHT,
    borderRadius: radii.full,
    borderWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  switchHalf: {
    width: SWITCH_TRACK_WIDTH / 2,
    height: SWITCH_TRACK_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hiddenIcon: {
    opacity: 0,
  },
  switchKnob: {
    position: 'absolute',
    left: SWITCH_KNOB_PADDING,
    width: SWITCH_KNOB_SIZE,
    height: SWITCH_KNOB_SIZE,
    borderRadius: radii.full,
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
