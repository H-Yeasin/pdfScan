import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Line, Path } from 'react-native-svg';
import { ProBadge } from '../../pro/ProBadge';
import { useT } from '../../../i18n/useT';
import { MARK_TOOLS, TEXT_SIZES, type MarkPrefs, type MarkTool, type TextSize } from '../../../services/annotations/markMode';
import { HIGHLIGHT_COLORS, PEN_COLORS, PEN_WIDTHS } from '../../../services/annotations/palette';
import { radii, spacing, touchSlop, useTheme } from '../../../theme';

// §18 W15: Mark mode's two bars on the page surface: the header (undo, redo, the page, Done) and
// the palette (the tools, and the picked tool's colours and sizes). They only show and report; useMarkTool holds
// the tool.

// A constant rather than inline: `text: '…'` reads as UI text to the hard-coded strings test.
const TEXT_ICON = 'text-outline';
const TOOL_ICONS: Record<Exclude<MarkTool, 'underline' | 'strike'>, keyof typeof Ionicons.glyphMap> = {
  highlight: 'color-fill-outline',
  pen: 'brush-outline',
  note: 'chatbox-ellipses-outline',
  text: TEXT_ICON,
  eraser: 'backspace-outline',
  hand: 'hand-left-outline',
};

// Underline and strikethrough have no Ionicons glyph; these are Lucide's (ISC) paths on a 24 grid.
function LineToolIcon({ kind, color }: { kind: 'underline' | 'strike'; color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {kind === 'underline' ? (
        <>
          <Path d="M6 4v6a6 6 0 0 0 12 0V4" />
          <Line x1={4} y1={20} x2={20} y2={20} />
        </>
      ) : (
        <>
          <Path d="M16 4H9a3 3 0 0 0-2.83 4" />
          <Path d="M14 12a4 4 0 0 1 0 8H6" />
          <Line x1={4} y1={12} x2={20} y2={12} />
        </>
      )}
    </Svg>
  );
}

type MarkHeaderProps = {
  title: string;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onDone: () => void;
};

export function MarkHeader({ title, canUndo, canRedo, onUndo, onRedo, onDone }: MarkHeaderProps) {
  const { tokens: theme } = useTheme();
  const { t } = useT();
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.topWrap} pointerEvents="box-none">
      <View style={[styles.header, { backgroundColor: theme.surface, borderColor: theme.edge }]}>
        <Pressable hitSlop={touchSlop(44)} accessibilityRole="button" style={styles.iconButton} onPress={onUndo} disabled={!canUndo} accessibilityLabel={t('reader.mark.undo')} accessibilityState={{ disabled: !canUndo }}>
          <Ionicons name="arrow-undo" size={21} color={canUndo ? theme.ink : theme.muted} />
        </Pressable>
        <Pressable hitSlop={touchSlop(44)} accessibilityRole="button" style={styles.iconButton} onPress={onRedo} disabled={!canRedo} accessibilityLabel={t('reader.mark.redo')} accessibilityState={{ disabled: !canRedo }}>
          <Ionicons name="arrow-redo" size={21} color={canRedo ? theme.ink : theme.muted} />
        </Pressable>
        <Text style={[styles.title, { color: theme.ink }]} numberOfLines={1}>
          {title}
        </Text>
        <Pressable style={[styles.doneButton, { backgroundColor: theme.accent }]} onPress={onDone} accessibilityRole="button">
          <Text style={[styles.doneLabel, { color: theme.onAccent }]}>{t('reader.mark.done')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

type MarkToolbarProps = {
  tool: MarkTool;
  prefs: MarkPrefs;
  onPickTool: (tool: MarkTool) => void;
  onPrefs: (patch: Partial<MarkPrefs>) => void;
  // §12 D10: the Text tool shows the Pro badge until Pro is on.
  textPro: boolean;
  // The bar's height with the safe area under it: the surface keeps the last page clear of it.
  onHeight: (height: number) => void;
};

export function MarkToolbar({ tool, prefs, onPickTool, onPrefs, textPro, onHeight }: MarkToolbarProps) {
  const { tokens: theme } = useTheme();
  const { t } = useT();
  const colourName = (key: string) => t(`reader.mark.colours.${key as keyof typeof HIGHLIGHT_COLORS | keyof typeof PEN_COLORS}`);
  const swatch = (hex: string, selected: boolean, onPress: () => void, label: string) => (
    <Pressable
      key={label}
      onPress={onPress}
      hitSlop={touchSlop(30)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={[styles.swatch, { backgroundColor: hex, borderColor: selected ? theme.ink : theme.edge }]}
    />
  );
  const chip = (key: string, label: string, selected: boolean, onPress: () => void) => (
    <Pressable
      key={key}
      onPress={onPress}
      style={[styles.widthChip, { borderColor: selected ? theme.accent : theme.edge }]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text style={[styles.widthLabel, { color: theme.ink }]}>{label}</Text>
    </Pressable>
  );
  const penColours = Object.keys(PEN_COLORS) as (keyof typeof PEN_COLORS)[];
  const hint =
    tool === 'pen'
      ? t('reader.mark.penHint')
      : tool === 'text'
        ? t('reader.mark.textHint')
        : tool === 'note'
          ? t('reader.mark.noteHint')
          : tool === 'eraser'
            ? t('reader.mark.eraserHint')
            : tool === 'hand'
              ? t('reader.mark.handHint')
              : t('reader.mark.drawHint');

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.bottomWrap} pointerEvents="box-none" onLayout={(e: LayoutChangeEvent) => onHeight(e.nativeEvent.layout.height)}>
      <View style={[styles.palette, { backgroundColor: theme.surface, borderColor: theme.edge }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolRow}>
          {MARK_TOOLS.map((id) => {
            const on = tool === id;
            const color = on ? theme.accentInk : theme.ink;
            return (
              <Pressable key={id} style={[styles.tool, on && { backgroundColor: theme.accentSoft }]} onPress={() => onPickTool(id)} accessibilityRole="button" accessibilityState={{ selected: on }}>
                {id === 'underline' || id === 'strike' ? <LineToolIcon kind={id} color={color} /> : <Ionicons name={TOOL_ICONS[id]} size={20} color={color} />}
                <Text style={[styles.toolLabel, { color }]}>{t(`reader.mark.tools.${id}`)}</Text>
                {id === 'text' && textPro ? (
                  <View style={styles.toolBadge} pointerEvents="none">
                    <ProBadge />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.options}>
          {tool === 'highlight'
            ? (Object.keys(HIGHLIGHT_COLORS) as (keyof typeof HIGHLIGHT_COLORS)[]).map((key) =>
                swatch(HIGHLIGHT_COLORS[key], prefs.highlightColor === key, () => onPrefs({ highlightColor: key }), t('reader.mark.colourHighlighter', { colour: colourName(key) }))
              )
            : null}
          {tool === 'underline' || tool === 'strike'
            ? penColours.map((key) => swatch(PEN_COLORS[key], prefs.lineColor === key, () => onPrefs({ lineColor: key }), t('reader.mark.colourLine', { colour: colourName(key) })))
            : null}
          {tool === 'pen' ? (
            <>
              {penColours.map((key) => swatch(PEN_COLORS[key], prefs.penColor === key, () => onPrefs({ penColor: key }), t('reader.mark.colourPen', { colour: colourName(key) })))}
              {(Object.keys(PEN_WIDTHS) as (keyof typeof PEN_WIDTHS)[]).map((key) =>
                chip(key, key === 'thin' ? t('reader.mark.thin') : t('reader.mark.thick'), prefs.penWidth === key, () => onPrefs({ penWidth: key }))
              )}
            </>
          ) : null}
          {tool === 'text' ? (
            <>
              {penColours.map((key) => swatch(PEN_COLORS[key], prefs.textColor === key, () => onPrefs({ textColor: key }), t('reader.mark.colourText', { colour: colourName(key) })))}
              {(Object.keys(TEXT_SIZES) as TextSize[]).map((key) => chip(key, t(`reader.mark.textSizes.${key}`), prefs.textSize === key, () => onPrefs({ textSize: key })))}
            </>
          ) : null}
          <Text style={[styles.hint, { color: theme.muted }]} numberOfLines={2}>
            {hint}
          </Text>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  topWrap: { position: 'absolute', top: 0, left: 0, right: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginHorizontal: spacing.sm,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.xs,
    height: 52,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 4,
  },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '600' },
  doneButton: {
    height: 38,
    minWidth: 76,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneLabel: { fontSize: 15, fontWeight: '600' },
  bottomWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  palette: {
    marginHorizontal: spacing.sm,
    marginBottom: spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 4,
  },
  toolRow: { gap: spacing.xs, paddingHorizontal: spacing.sm },
  tool: {
    alignItems: 'center',
    gap: 3,
    minWidth: 56,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.card,
  },
  toolBadge: { position: 'absolute', top: -2, right: -4 },
  toolLabel: { fontSize: 11.5, fontWeight: '600' },
  options: { alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, minHeight: 36 },
  swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 2 },
  widthChip: {
    height: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  widthLabel: { fontSize: 13, fontWeight: '600' },
  hint: { fontSize: 12.5, maxWidth: 260 },
});
