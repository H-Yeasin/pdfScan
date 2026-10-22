import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTheme, type IoniconName } from '../../theme';

const W = 64;
const H = 76;
const FOLD = 18;

// §17 U11: one of onboarding's three steps (Scan, File, Submit) as a small picture instead of a bare
// icon: the brand's folded-corner page with the step's icon on it and a marigold spark. Plain SVG in
// theme colours, so it follows dark mode. A stand-in until U4's illustrations exist; it is only
// drawn (the label under it names the step).
export function StepArt({ icon }: { icon: IoniconName }) {
  const { tokens } = useTheme();
  // The page's outline with the top-right corner cut, then the fold that covers the cut.
  const page = `M8 2 H${W - FOLD} L${W - 2} ${FOLD} V${H - 8} Q${W - 2} ${H - 2} ${W - 8} ${H - 2} H8 Q2 ${H - 2} 2 ${H - 8} V8 Q2 2 8 2 Z`;
  const fold = `M${W - FOLD} 2 V${FOLD - 4} Q${W - FOLD} ${FOLD} ${W - FOLD + 4} ${FOLD} H${W - 2} Z`;
  return (
    <View style={styles.box} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <Path d={page} fill={tokens.accentSoft} stroke={tokens.accent} strokeWidth={2} strokeLinejoin="round" />
        <Path d={fold} fill={tokens.accent} />
        <Circle cx={10} cy={H - 12} r={4} fill={tokens.highlight} />
      </Svg>
      <Ionicons name={icon} size={28} color={tokens.accentInk} style={styles.icon} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: W,
    height: H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    position: 'absolute',
    top: (H - 28) / 2 + 2,
  },
});
