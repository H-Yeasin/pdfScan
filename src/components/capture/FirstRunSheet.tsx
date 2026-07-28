import { BlurView } from 'expo-blur';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fontFamily, radii, spacing, typeScale } from '../../theme';
import { useCaptureChrome } from '../../theme/captureChrome';

type FirstRunSheetProps = {
  onAllow: () => void;
  onImportInstead: () => void;
};

export function FirstRunSheet({ onAllow, onImportInstead }: FirstRunSheetProps) {
  const chrome = useCaptureChrome();

  return (
    <View style={StyleSheet.absoluteFill}>
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: chrome.scrim }]} />
      <View style={styles.sheetWrap}>
        <View style={[styles.sheet, { backgroundColor: chrome.base }]}>
          <Text style={[styles.headline, { color: chrome.text }]}>Scan anything.</Text>
          <Text style={[styles.body, { color: chrome.textDim }]}>
            Free OCR, no watermark, no sign-up. We ask for the camera because that is the whole app.
          </Text>
          <Pressable style={[styles.primary, { backgroundColor: chrome.accent }]} onPress={onAllow}>
            <Text style={styles.primaryLabel}>Allow camera</Text>
          </Pressable>
          <Pressable style={styles.ghost} onPress={onImportInstead} hitSlop={8}>
            <Text style={[styles.ghostLabel, { color: chrome.accentInk }]}>Import from gallery instead</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.xl,
  },
  sheet: {
    borderRadius: radii.card * 2,
    padding: spacing.xl,
  },
  headline: {
    fontFamily: fontFamily.heading,
    fontSize: typeScale.display.fontSize,
    marginBottom: spacing.sm,
  },
  body: {
    fontSize: 15,
    lineHeight: 21,
    marginBottom: spacing.lg,
  },
  primary: {
    height: 50,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  ghost: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
});
