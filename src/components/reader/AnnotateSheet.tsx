import { Ionicons } from '@expo/vector-icons';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Polyline, Rect } from 'react-native-svg';
import { TextPromptModal } from '../shared/TextPromptModal';
import { annotationAt, NOTE_ICON } from '../../services/annotations/hitTest';
import { annotationColor, HIGHLIGHT_COLORS, HIGHLIGHTER_THICKNESS, NOTE_COLOR, PEN_COLORS, PEN_WIDTHS } from '../../services/annotations/palette';
import { updatePdfAnnotations } from '../../services/annotations/pdfAnnotations';
import { snapHighlight, type Point } from '../../services/annotations/snap';
import { useAppDispatch, useAppSlices } from '../../store/AppStateContext';
import { radii, spacing, useTheme, touchSlop } from '../../theme';
import type { Annotation, LibraryDocument } from '../../types/models';
import { createId } from '../../utils/id';
import { PageCanvas, type MasterPoint } from './PageCanvas';
import { useT } from '../../i18n/useT';

type Tool = 'highlight' | 'pen' | 'note' | 'eraser';
type Undo = { kind: 'added'; annotation: Annotation } | { kind: 'removed'; annotation: Annotation } | { kind: 'edited'; before: Annotation };

const TAP_SLOP = 24;

// §5 T4 "Annotate": highlighter (snapped to words), pen, notes and an eraser on one page at a
// time, drawn over PageCanvas. Changes go to the store as they're made; Done writes them into
// document.pdf (annotations/pdfAnnotations.updatePdfAnnotations) and reports whether anything
// changed, so the Reader can reload.
export function AnnotateSheet({
  doc,
  startIdx,
  onClose,
}: {
  doc: LibraryDocument;
  startIdx: number;
  onClose: (changed: boolean) => void;
}) {
  const { tokens: theme } = useTheme();
  const { t } = useT();
  const dispatch = useAppDispatch();
  const state = useAppSlices('library');
  const [idx, setIdx] = useState(Math.min(Math.max(0, startIdx), doc.pages.length - 1));
  const [tool, setTool] = useState<Tool>('highlight');
  const [hlColor, setHlColor] = useState<keyof typeof HIGHLIGHT_COLORS>('yellow');
  const [penColor, setPenColor] = useState<keyof typeof PEN_COLORS>('black');
  const [penWidth, setPenWidth] = useState<keyof typeof PEN_WIDTHS>('thin');
  const [stroke, setStroke] = useState<Point[]>([]);
  const [noteDraft, setNoteDraft] = useState<{ at?: MasterPoint; editing?: Annotation } | null>(null);
  const [saving, setSaving] = useState(false);
  const undoStack = useRef<Undo[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const changed = useRef(false);

  const page = doc.pages[idx];
  const pageAnnotations = useMemo(
    () => state.library.annotations.filter((a) => a.documentId === doc.id && a.pageId === page?.id),
    [state.library.annotations, doc.id, page?.id]
  );

  const push = (entry: Undo) => {
    undoStack.current.push(entry);
    changed.current = true;
    setUndoCount(undoStack.current.length);
  };
  const add = (partial: Pick<Annotation, 'kind' | 'color' | 'data' | 'text'>) => {
    if (!page) return;
    const now = Date.now();
    const annotation: Annotation = { id: createId('annot'), documentId: doc.id, pageId: page.id, createdAt: now, updatedAt: now, ...partial };
    dispatch({ type: 'library/ADD_ANNOTATION', annotation });
    push({ kind: 'added', annotation });
  };
  const undo = () => {
    const last = undoStack.current.pop();
    setUndoCount(undoStack.current.length);
    if (!last) return;
    if (last.kind === 'added') dispatch({ type: 'library/DELETE_ANNOTATIONS', ids: [last.annotation.id] });
    else if (last.kind === 'removed') dispatch({ type: 'library/ADD_ANNOTATION', annotation: last.annotation });
    else dispatch({ type: 'library/UPDATE_ANNOTATION', id: last.before.id, patch: last.before });
  };

  const drawing = tool === 'highlight' || tool === 'pen';
  const onDragStart = (p: MasterPoint) => drawing && setStroke([[p.x, p.y]]);
  const onDragMove = (p: MasterPoint) => drawing && setStroke((s) => [...s, [p.x, p.y]]);
  const onDragEnd = (p: MasterPoint) => {
    if (!drawing) return;
    const points: Point[] = [...stroke, [p.x, p.y]];
    setStroke([]);
    if (tool === 'highlight') {
      const { rects, text } = snapHighlight(points, page?.ocr, HIGHLIGHTER_THICKNESS);
      if (rects.length) add({ kind: 'highlight', color: hlColor, data: { rects }, text });
    } else {
      add({ kind: 'ink', color: penColor, data: { strokes: [points], width: PEN_WIDTHS[penWidth] }, text: undefined });
    }
  };
  const onTap = (p: MasterPoint) => {
    const hit = annotationAt(pageAnnotations, p.x, p.y, TAP_SLOP);
    if (tool === 'eraser') {
      if (!hit) return;
      dispatch({ type: 'library/DELETE_ANNOTATIONS', ids: [hit.id] });
      push({ kind: 'removed', annotation: hit });
    } else if (tool === 'note') {
      setNoteDraft(hit?.kind === 'note' ? { editing: hit } : { at: p });
    }
  };

  const done = async () => {
    if (!changed.current) {
      onClose(false);
      return;
    }
    setSaving(true);
    try {
      const all = state.library.annotations.filter((a) => a.documentId === doc.id);
      const size = await updatePdfAnnotations(doc, all);
      if (size !== null && doc.format === 'PDF') dispatch({ type: 'library/UPDATE_FILE', id: doc.id, patch: { sizeBytes: size } });
    } catch (error) {
      console.warn('AnnotateSheet: writing annotations into the PDF failed', error);
      dispatch({ type: 'ui/SHOW_SNACK', msg: t('reader.annotate.saveFailed') });
    } finally {
      setSaving(false);
      onClose(true);
    }
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

  return (
    <Modal visible animationType="slide" onRequestClose={done}>
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]}>
          <View style={styles.header}>
            <Pressable hitSlop={touchSlop(44)} accessibilityRole="button" style={styles.iconButton} onPress={undo} disabled={undoCount === 0} accessibilityLabel={t('reader.annotate.undo')}>
              <Ionicons name="arrow-undo" size={21} color={undoCount ? theme.ink : theme.muted} />
            </Pressable>
            <Pressable hitSlop={touchSlop(44)} accessibilityRole="button" style={styles.iconButton} onPress={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0} accessibilityLabel={t('reader.annotate.previousPage')}>
              <Ionicons name="chevron-back" size={21} color={idx === 0 ? theme.muted : theme.ink} />
            </Pressable>
            <Text style={[styles.title, { color: theme.ink }]}>
              {t('reader.annotate.pageOf', { page: idx + 1, total: doc.pages.length })}
            </Text>
            <Pressable hitSlop={touchSlop(44)} accessibilityRole="button"
              style={styles.iconButton}
              onPress={() => setIdx((i) => Math.min(doc.pages.length - 1, i + 1))}
              disabled={idx === doc.pages.length - 1}
              accessibilityLabel={t('reader.annotate.nextPage')}
            >
              <Ionicons name="chevron-forward" size={21} color={idx === doc.pages.length - 1 ? theme.muted : theme.ink} />
            </Pressable>
            <Pressable style={[styles.doneButton, { backgroundColor: theme.accent }]} onPress={done} disabled={saving} accessibilityRole="button">
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.doneLabel}>{t('reader.annotate.done')}</Text>}
            </Pressable>
          </View>

          {page ? (
            <PageCanvas
              key={page.id}
              page={page}
              background={theme.surface2}
              onDragStart={onDragStart}
              onDragMove={onDragMove}
              onDragEnd={onDragEnd}
              onTap={onTap}
              renderOverlay={(fit) => (
                <View pointerEvents="none" style={{ position: 'absolute', left: fit.origin.x, top: fit.origin.y, width: fit.width, height: fit.height }}>
                  <Svg width="100%" height="100%" viewBox={`0 0 ${page.width} ${page.height}`}>
                    {pageAnnotations.map((a) => {
                      const d = a.data;
                      if ('rects' in d) {
                        return d.rects.map((r, i) => (
                          <Rect key={`${a.id}-${i}`} x={r.left} y={r.top} width={r.width} height={r.height} fill={annotationColor(a.color)} opacity={0.45} />
                        ));
                      }
                      if ('strokes' in d) {
                        return d.strokes.map((s, i) => (
                          <Polyline
                            key={`${a.id}-${i}`}
                            points={s.map(([x, y]) => `${x},${y}`).join(' ')}
                            fill="none"
                            stroke={annotationColor(a.color)}
                            strokeWidth={d.width}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        ));
                      }
                      return (
                        <Rect
                          key={a.id}
                          x={d.x - NOTE_ICON / 2}
                          y={d.y - NOTE_ICON / 2}
                          width={NOTE_ICON}
                          height={NOTE_ICON}
                          rx={8}
                          fill={NOTE_COLOR}
                          stroke={PEN_COLORS.black}
                          strokeWidth={3}
                        />
                      );
                    })}
                    {stroke.length > 1 ? (
                      <Polyline
                        points={stroke.map(([x, y]) => `${x},${y}`).join(' ')}
                        fill="none"
                        stroke={tool === 'highlight' ? HIGHLIGHT_COLORS[hlColor] : PEN_COLORS[penColor]}
                        strokeWidth={tool === 'highlight' ? HIGHLIGHTER_THICKNESS : PEN_WIDTHS[penWidth]}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity={tool === 'highlight' ? 0.45 : 1}
                      />
                    ) : null}
                  </Svg>
                </View>
              )}
            />
          ) : null}

          <View style={[styles.tools, { backgroundColor: theme.surface, borderTopColor: theme.edge }]}>
            <View style={styles.toolRow}>
              {(
                [
                  ['highlight', 'color-fill-outline'],
                  ['pen', 'pencil-outline'],
                  ['note', 'chatbox-ellipses-outline'],
                  ['eraser', 'backspace-outline'],
                ] as const
              ).map(([id, icon]) => (
                <Pressable
                  key={id}
                  style={[styles.tool, tool === id && { backgroundColor: theme.accentSoft }]}
                  onPress={() => setTool(id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: tool === id }}
                >
                  <Ionicons name={icon} size={20} color={tool === id ? theme.accentInk : theme.ink} />
                  <Text style={[styles.toolLabel, { color: tool === id ? theme.accentInk : theme.ink }]}>{t(`reader.annotate.tools.${id}`)}</Text>
                </Pressable>
              ))}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.options}>
              {tool === 'highlight'
                ? (Object.keys(HIGHLIGHT_COLORS) as (keyof typeof HIGHLIGHT_COLORS)[]).map((key) =>
                    swatch(HIGHLIGHT_COLORS[key], hlColor === key, () => setHlColor(key), t('reader.annotate.colourHighlighter', { colour: t(`reader.annotate.colours.${key}`) }))
                  )
                : null}
              {tool === 'pen' ? (
                <>
                  {(Object.keys(PEN_COLORS) as (keyof typeof PEN_COLORS)[]).map((key) =>
                    swatch(PEN_COLORS[key], penColor === key, () => setPenColor(key), t('reader.annotate.colourPen', { colour: t(`reader.annotate.colours.${key}`) }))
                  )}
                  {(Object.keys(PEN_WIDTHS) as (keyof typeof PEN_WIDTHS)[]).map((key) => (
                    <Pressable
                      key={key}
                      onPress={() => setPenWidth(key)}
                      style={[styles.widthChip, { borderColor: penWidth === key ? theme.accent : theme.edge }]}
                      accessibilityRole="button"
                    >
                      <Text style={{ color: theme.ink, fontSize: 13, fontWeight: '600' }}>{key === 'thin' ? t('reader.annotate.thin') : t('reader.annotate.thick')}</Text>
                    </Pressable>
                  ))}
                </>
              ) : null}
              {tool === 'note' ? <Text style={[styles.hint, { color: theme.muted }]}>{t('reader.annotate.noteHint')}</Text> : null}
              {tool === 'eraser' ? <Text style={[styles.hint, { color: theme.muted }]}>{t('reader.annotate.eraserHint')}</Text> : null}
              {drawing ? <Text style={[styles.hint, { color: theme.muted }]}>{t('reader.annotate.zoomHint')}</Text> : null}
            </ScrollView>
          </View>

          <TextPromptModal
            visible={noteDraft !== null}
            title={noteDraft?.editing ? t('reader.annotate.editNote') : t('reader.annotate.addNote')}
            initialValue={noteDraft?.editing?.text ?? ''}
            placeholder={t('reader.annotate.notePlaceholder')}
            submitLabel={t('reader.annotate.save')}
            onCancel={() => setNoteDraft(null)}
            onSubmit={(text) => {
              if (noteDraft?.editing) {
                const before = noteDraft.editing;
                dispatch({ type: 'library/UPDATE_ANNOTATION', id: before.id, patch: { text, updatedAt: Date.now() } });
                push({ kind: 'edited', before });
              } else if (noteDraft?.at) {
                add({ kind: 'note', color: 'note', data: { x: noteDraft.at.x, y: noteDraft.at.y }, text });
              }
              setNoteDraft(null);
            }}
          />
        </SafeAreaView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    height: 52,
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
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  tools: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  toolRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  tool: {
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.md,
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
    paddingHorizontal: spacing.lg,
    minHeight: 40,
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
  hint: {
    fontSize: 12.5,
  },
});
