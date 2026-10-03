import { Ionicons } from '@expo/vector-icons';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Image, Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withDecay } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Line, Path, Polyline, Rect } from 'react-native-svg';
import { TextPromptModal } from '../shared/TextPromptModal';
import { annotationAt, NOTE_ICON } from '../../services/annotations/hitTest';
import { isRectMark, markLine } from '../../services/annotations/marks';
import {
  clampView,
  columnLayout,
  contentToMaster,
  currentPage,
  isDrawingTool,
  markWindow,
  MARK_TOOLS,
  pageAtY,
  screenToContent,
  viewForPage,
  zoomAbout,
  type ColumnView,
  type MarkPrefs,
  type MarkTool,
} from '../../services/annotations/markMode';
import { annotationColor, HIGHLIGHT_COLORS, HIGHLIGHTER_THICKNESS, NOTE_COLOR, PEN_COLORS, PEN_WIDTHS } from '../../services/annotations/palette';
import { snapHighlight, type Point } from '../../services/annotations/snap';
import { canMarkPage } from '../../services/documents/formatCapabilities';
import { useAppDispatch, useAppSlices } from '../../store/AppStateContext';
import { radii, spacing, touchSlop, useTheme } from '../../theme';
import type { Annotation, LibraryDocument, LibraryPage } from '../../types/models';
import { createId } from '../../utils/id';
import { useT } from '../../i18n/useT';
import { useMarkPageImages } from './useMarkPageImages';

// The gap between pages, in screen points at zoom 1.
const GAP = 12;
const MAX_SCALE = 5;
// How far off a tap may land on a mark (eraser, note), in master pixels.
const TAP_SLOP = 24;
// The translucency a highlight shows with (the PDF uses its own, pdfAnnotations.HIGHLIGHT_OPACITY).
const HIGHLIGHT_ALPHA = 0.45;

type Change = { kind: 'added'; annotation: Annotation } | { kind: 'removed'; annotation: Annotation } | { kind: 'edited'; before: Annotation; after: Annotation };
type Stroke = { idx: number; points: Point[] };

const TOOL_ICONS: Record<Exclude<MarkTool, 'underline' | 'strike'>, keyof typeof Ionicons.glyphMap> = {
  highlight: 'color-fill-outline',
  pen: 'brush-outline',
  note: 'chatbox-ellipses-outline',
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

type MarkViewProps = {
  doc: LibraryDocument;
  // The library page being read when Mark was tapped.
  startIdx: number;
  // `lastIdx`: the page last marked (or, with nothing marked, the page on screen), for the Reader
  // to return to. `changed`: whether document.pdf needs its annotations rewritten.
  onClose: (result: { lastIdx: number; changed: boolean }) => void;
};

// §12 D3 Mark mode: the document's pages in one vertical column at screen width, to highlight,
// underline, strike, draw and add notes across pages without leaving the document. Only the page
// on screen and its neighbours hold an image (markWindow); the rest are empty boxes. One finger
// marks, two fingers scroll and zoom; the Hand tool scrolls with one finger. Each mark goes to the
// store at once; the Reader writes them into document.pdf when Mark mode closes.
export function MarkView({ doc, startIdx, onClose }: MarkViewProps) {
  const { tokens: theme } = useTheme();
  const { t } = useT();
  const dispatch = useAppDispatch();
  const state = useAppSlices('library', 'settings');
  const prefs = state.settings.reading.mark;
  const tool = prefs.tool;
  const setPrefs = (patch: Partial<MarkPrefs>) => dispatch({ type: 'settings/SET_READING', reading: { mark: { ...prefs, ...patch } } });

  const pageCount = doc.pages.length;
  const firstIdx = Math.min(Math.max(0, startIdx), pageCount - 1);
  const [viewport, setViewport] = useState<{ width: number; height: number } | null>(null);
  const layout = useMemo(() => (viewport ? columnLayout(doc.pages, viewport.width, GAP) : null), [doc.pages, viewport]);
  const [current, setCurrent] = useState(firstIdx);
  const pageWindow = useMemo(() => markWindow(current, pageCount), [current, pageCount]);
  const images = useMarkPageImages(doc, pageWindow);

  const byPage = useMemo(() => {
    const map = new Map<string, Annotation[]>();
    for (const a of state.library.annotations) {
      if (a.documentId !== doc.id) continue;
      map.set(a.pageId, [...(map.get(a.pageId) ?? []), a]);
    }
    return map;
  }, [state.library.annotations, doc.id]);

  // --- The column's zoom and position (screen = content * scale + t) ---
  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const pinchStart = useSharedValue(1);

  // Opens at the page being read.
  const positioned = useRef(false);
  useEffect(() => {
    if (!layout || !viewport || positioned.current) return;
    positioned.current = true;
    const v = viewForPage(layout, firstIdx, { scale: 1, tx: 0, ty: 0 }, viewport);
    tx.value = v.tx;
    ty.value = v.ty;
  }, [layout, viewport, firstIdx, tx, ty]);

  useAnimatedReaction(
    () => (layout && viewport ? currentPage(layout, { scale: scale.value, tx: tx.value, ty: ty.value }, viewport.height) : -1),
    (idx, prev) => {
      if (idx >= 0 && idx !== prev) runOnJS(setCurrent)(idx);
    },
    [layout, viewport]
  );

  // --- Marks, with undo and redo ---
  const undoStack = useRef<Change[]>([]);
  const redoStack = useRef<Change[]>([]);
  const [, setHistoryVersion] = useState(0);
  const changed = useRef(false);
  const lastMarked = useRef<number | null>(null);

  const apply = useCallback(
    (change: Change, direction: 'do' | 'undo') => {
      const forward = direction === 'do';
      if (change.kind === 'edited') {
        const to = forward ? change.after : change.before;
        dispatch({ type: 'library/UPDATE_ANNOTATION', id: to.id, patch: to });
      } else if ((change.kind === 'added') === forward) {
        dispatch({ type: 'library/ADD_ANNOTATION', annotation: change.annotation });
      } else {
        dispatch({ type: 'library/DELETE_ANNOTATIONS', ids: [change.annotation.id] });
      }
      changed.current = true;
    },
    [dispatch]
  );
  const record = (change: Change, idx: number) => {
    apply(change, 'do');
    undoStack.current.push(change);
    redoStack.current = [];
    lastMarked.current = idx;
    setHistoryVersion((v) => v + 1);
  };
  const step = (from: { current: Change[] }, to: { current: Change[] }, direction: 'do' | 'undo') => {
    const change = from.current.pop();
    if (!change) return;
    apply(change, direction);
    to.current.push(change);
    setHistoryVersion((v) => v + 1);
  };
  const add = (idx: number, partial: Pick<Annotation, 'kind' | 'color' | 'data' | 'text'>) => {
    const page = doc.pages[idx];
    if (!page) return;
    const now = Date.now();
    record({ kind: 'added', annotation: { id: createId('annot'), documentId: doc.id, pageId: page.id, createdAt: now, updatedAt: now, ...partial } }, idx);
  };
  const lineColor = (kind: MarkTool) => (kind === 'highlight' ? prefs.highlightColor : kind === 'pen' ? prefs.penColor : prefs.lineColor);

  // --- Touches (screen points → page and master pixels) ---
  const viewNow = (): ColumnView => ({ scale: scale.value, tx: tx.value, ty: ty.value });
  const locate = (x: number, y: number, onIdx?: number) => {
    if (!layout) return null;
    const content = screenToContent(viewNow(), x, y);
    const idx = onIdx ?? pageAtY(layout, content.y);
    const page = doc.pages[idx];
    if (!page) return null;
    return { idx, page, point: contentToMaster(layout, page, idx, content.x, content.y) };
  };
  const notReady = (page: LibraryPage) => {
    if (canMarkPage(page)) return false;
    dispatch({ type: 'ui/SHOW_SNACK', msg: t('reader.mark.pageNotReady') });
    return true;
  };

  const strokeRef = useRef<Stroke | null>(null);
  const [stroke, setStroke] = useState<Stroke | null>(null);
  const beginStroke = (x0: number, y0: number, x: number, y: number) => {
    const start = locate(x0, y0);
    if (!start || notReady(start.page)) return;
    const end = locate(x, y, start.idx);
    strokeRef.current = { idx: start.idx, points: [[start.point.x, start.point.y], ...(end ? [[end.point.x, end.point.y] as Point] : [])] };
    setStroke(strokeRef.current);
  };
  const extendStroke = (x: number, y: number) => {
    const s = strokeRef.current;
    const at = s && locate(x, y, s.idx);
    if (!s || !at) return;
    strokeRef.current = { idx: s.idx, points: [...s.points, [at.point.x, at.point.y]] };
    setStroke(strokeRef.current);
  };
  const endStroke = (x: number, y: number) => {
    extendStroke(x, y);
    const s = strokeRef.current;
    strokeRef.current = null;
    setStroke(null);
    if (!s || !isDrawingTool(tool)) return;
    if (tool === 'pen') {
      add(s.idx, { kind: 'ink', color: prefs.penColor, data: { strokes: [s.points], width: PEN_WIDTHS[prefs.penWidth] }, text: undefined });
      return;
    }
    const { rects, text } = snapHighlight(s.points, doc.pages[s.idx]?.ocr, HIGHLIGHTER_THICKNESS);
    if (rects.length) add(s.idx, { kind: tool, color: lineColor(tool), data: { rects }, text });
  };

  const [noteDraft, setNoteDraft] = useState<{ idx: number; at?: { x: number; y: number }; editing?: Annotation } | null>(null);
  const tapAt = (x: number, y: number) => {
    const at = locate(x, y);
    if (!at || notReady(at.page)) return;
    const hit = annotationAt(byPage.get(at.page.id) ?? [], at.point.x, at.point.y, TAP_SLOP);
    if (tool === 'eraser') {
      if (hit) record({ kind: 'removed', annotation: hit }, at.idx);
    } else if (tool === 'note') {
      setNoteDraft(hit?.kind === 'note' ? { idx: at.idx, editing: hit } : { idx: at.idx, at: at.point });
    } else if (tool === 'highlight' || tool === 'underline' || tool === 'strike') {
      // A tap marks the word under it; a tap beside the text does nothing (no free box).
      const { rects, text } = snapHighlight([[at.point.x, at.point.y]], at.page.ocr, HIGHLIGHTER_THICKNESS / 2);
      if (text) add(at.idx, { kind: tool, color: lineColor(tool), data: { rects }, text });
    }
  };

  // --- Gestures ---
  const clampNow = () => {
    'worklet';
    if (!layout || !viewport) return;
    const v = clampView(layout, { scale: scale.value, tx: tx.value, ty: ty.value }, viewport);
    scale.value = v.scale;
    tx.value = v.tx;
    ty.value = v.ty;
  };
  const stopFling = () => {
    'worklet';
    cancelAnimation(tx);
    cancelAnimation(ty);
  };
  const fling = (vx: number, vy: number) => {
    'worklet';
    if (!layout || !viewport) return;
    const minTx = Math.min(0, viewport.width - layout.width * scale.value);
    const minTy = Math.min(0, viewport.height - layout.total * scale.value);
    tx.value = withDecay({ velocity: vx, clamp: [minTx, 0] });
    ty.value = withDecay({ velocity: vy, clamp: [minTy, 0] });
  };
  const scroll = (dx: number, dy: number) => {
    'worklet';
    tx.value += dx;
    ty.value += dy;
    clampNow();
  };

  const hand = tool === 'hand';
  const pinch = Gesture.Pinch()
    .onStart(() => {
      stopFling();
      pinchStart.value = scale.value;
    })
    .onUpdate((e) => {
      const next = Math.min(MAX_SCALE, Math.max(1, pinchStart.value * e.scale));
      const v = zoomAbout({ scale: scale.value, tx: tx.value, ty: ty.value }, next, e.focalX, e.focalY);
      scale.value = v.scale;
      tx.value = v.tx;
      ty.value = v.ty;
      clampNow();
    });
  const twoFingerPan = Gesture.Pan()
    .minPointers(2)
    .onStart(stopFling)
    .onChange((e) => scroll(e.changeX, e.changeY))
    .onEnd((e) => fling(e.velocityX, e.velocityY));
  const drag = Gesture.Pan()
    .maxPointers(1)
    .onStart((e) => {
      stopFling();
      if (!hand) runOnJS(beginStroke)(e.x - e.translationX, e.y - e.translationY, e.x, e.y);
    })
    .onChange((e) => {
      if (hand) scroll(e.changeX, e.changeY);
      else runOnJS(extendStroke)(e.x, e.y);
    })
    .onEnd((e) => {
      if (hand) fling(e.velocityX, e.velocityY);
      else runOnJS(endStroke)(e.x, e.y);
    });
  const tap = Gesture.Tap().onEnd((e, success) => {
    if (success && !hand) runOnJS(tapAt)(e.x, e.y);
  });
  const gesture = Gesture.Race(Gesture.Simultaneous(pinch, twoFingerPan), Gesture.Exclusive(drag, tap));

  const layerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  // --- Leaving ---
  const close = useCallback(() => {
    onClose({ lastIdx: lastMarked.current ?? current, changed: changed.current });
  }, [onClose, current]);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [close]);

  const handleLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!viewport || viewport.width !== width || viewport.height !== height) setViewport({ width, height });
  };

  const swatch = (hex: string, selected: boolean, onPress: () => void, label: string) => (
    <Pressable
      key={label}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={[styles.swatch, { backgroundColor: hex, borderColor: selected ? theme.ink : theme.edge }]}
    />
  );
  const colourName = (key: string) => t(`reader.mark.colours.${key as keyof typeof HIGHLIGHT_COLORS | keyof typeof PEN_COLORS}`);
  const canUndo = undoStack.current.length > 0;
  const canRedo = redoStack.current.length > 0;
  const windowSet = new Set(pageWindow);

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.surface2 }]}>
      <GestureDetector gesture={gesture}>
        <View style={styles.viewport} onLayout={handleLayout} collapsable={false}>
          {layout ? (
            <Animated.View style={[styles.layer, { width: layout.width, height: layout.total }, layerStyle]}>
              {doc.pages.map((page, idx) => (
                <MarkPage
                  key={page.id}
                  page={page}
                  top={layout.tops[idx]}
                  width={layout.width}
                  height={layout.heights[idx]}
                  active={windowSet.has(idx)}
                  imageUri={page.fileUri ? (page.displayUri ?? page.fileUri) : images[page.id]}
                  annotations={windowSet.has(idx) ? byPage.get(page.id) : undefined}
                  stroke={stroke?.idx === idx ? stroke.points : undefined}
                  strokeTool={tool}
                  strokeColor={annotationColor(lineColor(tool))}
                  strokeWidth={tool === 'pen' ? PEN_WIDTHS[prefs.penWidth] : HIGHLIGHTER_THICKNESS}
                  paper={theme.surface}
                />
              ))}
            </Animated.View>
          ) : null}
        </View>
      </GestureDetector>

      <SafeAreaView edges={['top']} style={styles.topWrap} pointerEvents="box-none">
        <View style={[styles.header, { backgroundColor: theme.surface, borderColor: theme.edge }]}>
          <Pressable hitSlop={touchSlop(44)} accessibilityRole="button" style={styles.iconButton} onPress={() => step(undoStack, redoStack, 'undo')} disabled={!canUndo} accessibilityLabel={t('reader.mark.undo')}>
            <Ionicons name="arrow-undo" size={21} color={canUndo ? theme.ink : theme.muted} />
          </Pressable>
          <Pressable hitSlop={touchSlop(44)} accessibilityRole="button" style={styles.iconButton} onPress={() => step(redoStack, undoStack, 'do')} disabled={!canRedo} accessibilityLabel={t('reader.mark.redo')}>
            <Ionicons name="arrow-redo" size={21} color={canRedo ? theme.ink : theme.muted} />
          </Pressable>
          <Text style={[styles.title, { color: theme.ink }]}>{t('reader.mark.pageOf', { page: current + 1, total: pageCount })}</Text>
          <Pressable style={[styles.doneButton, { backgroundColor: theme.accent }]} onPress={close} accessibilityRole="button">
            <Text style={[styles.doneLabel, { color: theme.onAccent }]}>{t('reader.mark.done')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      <SafeAreaView edges={['bottom']} style={styles.bottomWrap} pointerEvents="box-none">
        <View style={[styles.palette, { backgroundColor: theme.surface, borderColor: theme.edge }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolRow}>
            {MARK_TOOLS.map((id) => {
              const on = tool === id;
              const color = on ? theme.accentInk : theme.ink;
              return (
                <Pressable
                  key={id}
                  style={[styles.tool, on && { backgroundColor: theme.accentSoft }]}
                  onPress={() => setPrefs({ tool: id })}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  {id === 'underline' || id === 'strike' ? <LineToolIcon kind={id} color={color} /> : <Ionicons name={TOOL_ICONS[id]} size={20} color={color} />}
                  <Text style={[styles.toolLabel, { color }]}>{t(`reader.mark.tools.${id}`)}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.options}>
            {tool === 'highlight'
              ? (Object.keys(HIGHLIGHT_COLORS) as (keyof typeof HIGHLIGHT_COLORS)[]).map((key) =>
                  swatch(HIGHLIGHT_COLORS[key], prefs.highlightColor === key, () => setPrefs({ highlightColor: key }), t('reader.mark.colourHighlighter', { colour: colourName(key) }))
                )
              : null}
            {tool === 'underline' || tool === 'strike'
              ? (Object.keys(PEN_COLORS) as (keyof typeof PEN_COLORS)[]).map((key) =>
                  swatch(PEN_COLORS[key], prefs.lineColor === key, () => setPrefs({ lineColor: key }), t('reader.mark.colourLine', { colour: colourName(key) }))
                )
              : null}
            {tool === 'pen' ? (
              <>
                {(Object.keys(PEN_COLORS) as (keyof typeof PEN_COLORS)[]).map((key) =>
                  swatch(PEN_COLORS[key], prefs.penColor === key, () => setPrefs({ penColor: key }), t('reader.mark.colourPen', { colour: colourName(key) }))
                )}
                {(Object.keys(PEN_WIDTHS) as (keyof typeof PEN_WIDTHS)[]).map((key) => (
                  <Pressable
                    key={key}
                    onPress={() => setPrefs({ penWidth: key })}
                    style={[styles.widthChip, { borderColor: prefs.penWidth === key ? theme.accent : theme.edge }]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: prefs.penWidth === key }}
                  >
                    <Text style={[styles.widthLabel, { color: theme.ink }]}>{key === 'thin' ? t('reader.mark.thin') : t('reader.mark.thick')}</Text>
                  </Pressable>
                ))}
              </>
            ) : null}
            <Text style={[styles.hint, { color: theme.muted }]} numberOfLines={2}>
              {tool === 'pen'
                ? t('reader.mark.penHint')
                : tool === 'note'
                  ? t('reader.mark.noteHint')
                  : tool === 'eraser'
                    ? t('reader.mark.eraserHint')
                    : tool === 'hand'
                      ? t('reader.mark.handHint')
                      : t('reader.mark.drawHint')}
            </Text>
          </ScrollView>
        </View>
      </SafeAreaView>

      <TextPromptModal
        visible={noteDraft !== null}
        title={noteDraft?.editing ? t('reader.mark.editNote') : t('reader.mark.addNote')}
        initialValue={noteDraft?.editing?.text ?? ''}
        placeholder={t('reader.mark.notePlaceholder')}
        submitLabel={t('reader.mark.save')}
        onCancel={() => setNoteDraft(null)}
        onSubmit={(text) => {
          if (noteDraft?.editing) {
            const before = noteDraft.editing;
            record({ kind: 'edited', before, after: { ...before, text, updatedAt: Date.now() } }, noteDraft.idx);
          } else if (noteDraft?.at) {
            add(noteDraft.idx, { kind: 'note', color: 'note', data: { x: noteDraft.at.x, y: noteDraft.at.y }, text });
          }
          setNoteDraft(null);
        }}
      />
    </View>
  );
}

type MarkPageProps = {
  page: LibraryPage;
  top: number;
  width: number;
  height: number;
  // In the window: draws its image and marks. Outside it, an empty sheet.
  active: boolean;
  imageUri: string | undefined;
  annotations: Annotation[] | undefined;
  stroke: Point[] | undefined;
  strokeTool: MarkTool;
  strokeColor: string;
  strokeWidth: number;
  paper: string;
};

// One page of the column, in master pixels through its SVG viewBox (like OCR boxes and marks).
const MarkPage = memo(function MarkPage({ page, top, width, height, active, imageUri, annotations, stroke, strokeTool, strokeColor, strokeWidth, paper }: MarkPageProps) {
  // An imported page renders as shown now, which includes any turn added since it was indexed
  // (page.rotation); its marks live in the space it was indexed in, so the image is turned back.
  const turn = page.fileUri ? 0 : (page.rotation ?? 0);
  const sideways = turn % 180 !== 0;
  const imageStyle = sideways
    ? { position: 'absolute' as const, width: height, height: width, left: (width - height) / 2, top: (height - width) / 2, transform: [{ rotate: `${-turn}deg` }] }
    : { position: 'absolute' as const, width, height, left: 0, top: 0, transform: turn ? [{ rotate: `${-turn}deg` }] : undefined };

  return (
    <View style={{ position: 'absolute', left: 0, top, width, height, backgroundColor: paper, overflow: 'hidden' }}>
      {active && imageUri ? <Image source={{ uri: imageUri }} style={imageStyle} resizeMode="stretch" /> : null}
      {active ? (
        <Svg style={StyleSheet.absoluteFill} viewBox={`0 0 ${page.width} ${page.height}`} pointerEvents="none">
          {(annotations ?? []).map((a) => {
            const d = a.data;
            const fill = annotationColor(a.color);
            if ('rects' in d && isRectMark(a.kind)) {
              const kind = a.kind;
              return d.rects.map((r, i) => {
                const box = kind === 'highlight' ? r : markLine(kind, r);
                return <Rect key={`${a.id}-${i}`} x={box.left} y={box.top} width={box.width} height={box.height} fill={fill} opacity={kind === 'highlight' ? HIGHLIGHT_ALPHA : 1} />;
              });
            }
            if ('strokes' in d) {
              return d.strokes.map((s, i) => (
                <Polyline
                  key={`${a.id}-${i}`}
                  points={s.map(([x, y]) => `${x},${y}`).join(' ')}
                  fill="none"
                  stroke={fill}
                  strokeWidth={d.width}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ));
            }
            if ('x' in d) {
              return (
                <Rect key={a.id} x={d.x - NOTE_ICON / 2} y={d.y - NOTE_ICON / 2} width={NOTE_ICON} height={NOTE_ICON} rx={8} fill={NOTE_COLOR} stroke={PEN_COLORS.black} strokeWidth={3} />
              );
            }
            return null;
          })}
          {stroke && stroke.length > 1 ? (
            <Polyline
              points={stroke.map(([x, y]) => `${x},${y}`).join(' ')}
              fill="none"
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={strokeTool === 'pen' ? 1 : HIGHLIGHT_ALPHA}
            />
          ) : null}
        </Svg>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  viewport: {
    flex: 1,
    overflow: 'hidden',
  },
  layer: {
    position: 'absolute',
    left: 0,
    top: 0,
    // The transform zooms about the top-left corner: screen = content * scale + translate.
    transformOrigin: [0, 0, 0],
  },
  topWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
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
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600',
  },
  doneButton: {
    height: 38,
    minWidth: 76,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  bottomWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  palette: {
    marginHorizontal: spacing.sm,
    marginBottom: spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  toolRow: {
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  tool: {
    alignItems: 'center',
    gap: 3,
    minWidth: 56,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.card,
  },
  toolLabel: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  options: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 36,
  },
  swatch: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
  },
  widthChip: {
    height: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  widthLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  hint: {
    fontSize: 12.5,
    maxWidth: 260,
  },
});
