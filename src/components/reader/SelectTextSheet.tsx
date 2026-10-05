import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { runOcr } from '../../services/ocr/ocrService';
import { resolveOcrScript } from '../../services/scripts/registry';
import { masterToLayer } from '../../services/study/canvasMath';
import { readingOrderTokens, selectBetween, selectionText, tokenAt, type TextToken } from '../../services/study/textSelection';
import { useAppDispatch, useAppSlices } from '../../store/AppStateContext';
import { radii, spacing, useTheme, touchSlop } from '../../theme';
import type { LibraryDocument } from '../../types/models';
import { PageCanvas } from './PageCanvas';
import { usePageImage } from '../shared/usePageImage';
import { wordRects } from '../../services/annotations/snap';
import { createId } from '../../utils/id';
import { useT } from '../../i18n/useT';

type SelectTextSheetProps = {
  visible: boolean;
  doc: LibraryDocument;
  pageIdx: number;
  // `marked`: the selection was highlighted or underlined, so document.pdf needs its annotations
  // rewritten (the Reader does it in the background).
  onClose: (marked: boolean) => void;
};

// §5 T3 "Select text": drag from one word to another to select everything between them in reading
// order; start a drag on either end to move that end; tap a word to select just it. Copy or Share
// the selection, or (§12 D3) highlight or underline it without entering Mark mode. A page without
// OCR text offers to run OCR again. An imported PDF's page is rendered on demand.
export function SelectTextSheet({ visible, doc, pageIdx, onClose }: SelectTextSheetProps) {
  const { tokens: theme } = useTheme();
  const { t } = useT();
  const dispatch = useAppDispatch();
  const state = useAppSlices('library', 'settings');
  const page = doc.pages[pageIdx];
  const tokens = useMemo(() => readingOrderTokens(page?.ocr), [page?.ocr]);
  const [anchor, setAnchor] = useState<TextToken | null>(null);
  const [focus, setFocus] = useState<TextToken | null>(null);
  const [rerunning, setRerunning] = useState(false);
  const marked = useRef(false);
  const close = () => onClose(marked.current);
  // An imported page has no master: its PDF page, rendered now (null while rendering).
  const needsRender = !!page && !page.fileUri;
  const rendered = usePageImage(doc, pageIdx, visible && needsRender);
  const image = needsRender ? (rendered ? { uri: rendered.uri, turn: page?.rotation ?? 0 } : null) : undefined;

  useEffect(() => {
    setAnchor(null);
    setFocus(null);
  }, [visible, pageIdx, tokens]);

  const selected = useMemo(() => (anchor && focus ? selectBetween(tokens, anchor, focus) : []), [tokens, anchor, focus]);
  const selectedOrders = useMemo(() => new Set(selected.map((t) => t.order)), [selected]);
  const text = selectionText(selected);

  const handleDragStart = (point: { x: number; y: number }) => {
    const token = tokenAt(tokens, point.x, point.y);
    if (!token) return;
    // Starting on an end of the current selection moves that end; anywhere else starts afresh.
    if (anchor && focus && token.order === anchor.order) {
      setAnchor(focus);
      setFocus(token);
    } else if (!(anchor && focus && token.order === focus.order)) {
      setAnchor(token);
      setFocus(token);
    }
  };
  const handleDragMove = (point: { x: number; y: number }) => {
    const token = tokenAt(tokens, point.x, point.y);
    if (token) setFocus(token);
  };
  const handleTap = (point: { x: number; y: number }) => {
    const token = tokenAt(tokens, point.x, point.y);
    setAnchor(token);
    setFocus(token);
  };

  // §12 D3: the selection as a mark, in the colour Mark mode last used for that kind.
  const markSelection = (kind: 'highlight' | 'underline') => {
    if (!page || selected.length === 0) return;
    const { rects, text: words } = wordRects(selected);
    const prefs = state.settings.reading.mark;
    const now = Date.now();
    dispatch({
      type: 'library/ADD_ANNOTATION',
      annotation: {
        id: createId('annot'),
        documentId: doc.id,
        pageId: page.id,
        kind,
        color: kind === 'highlight' ? prefs.highlightColor : prefs.lineColor,
        data: { rects },
        text: words,
        createdAt: now,
        updatedAt: now,
      },
    });
    marked.current = true;
    setAnchor(null);
    setFocus(null);
    dispatch({ type: 'ui/SHOW_SNACK', msg: kind === 'highlight' ? t('reader.select.highlighted') : t('reader.select.underlined') });
  };

  const copy = async () => {
    await Clipboard.setStringAsync(text);
    dispatch({ type: 'ui/SHOW_SNACK', msg: t('reader.select.copiedWords', { count: selected.length }) });
  };

  const rerunOcr = async () => {
    if (!page) return;
    setRerunning(true);
    try {
      // §6 L1: the document's course decides the script, like it did when the page was scanned.
      const course = state.library.courses.find((c) => c.id === doc.courseId);
      const ocr = await runOcr(page.fileUri, resolveOcrScript({ course, settings: state.settings }));
      const pages = doc.pages.map((p, i) => (i === pageIdx ? { ...p, ocr, ocrFailed: ocr === undefined || undefined } : p));
      dispatch({ type: 'library/UPDATE_FILE', id: doc.id, patch: { pages } });
      if (!ocr?.text.trim()) dispatch({ type: 'ui/SHOW_SNACK', msg: t('reader.select.stillNoText') });
    } finally {
      setRerunning(false);
    }
  };

  const noText = tokens.length === 0;

  return (
    <Modal statusBarTranslucent navigationBarTranslucent visible={visible} animationType="slide" onRequestClose={close}>
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]}>
          <View style={styles.header}>
            <Pressable hitSlop={touchSlop(44)} accessibilityRole="button" style={styles.iconButton} onPress={close} accessibilityLabel={t('common.close')}>
              <Ionicons name="close" size={22} color={theme.ink} />
            </Pressable>
            <Text style={[styles.title, { color: theme.ink }]}>{t('reader.select.title', { page: pageIdx + 1 })}</Text>
          </View>

          {page ? (
            <PageCanvas
              page={page}
              image={image}
              background={theme.surface2}
              onDragStart={handleDragStart}
              onDragMove={handleDragMove}
              onTap={handleTap}
              renderOverlay={(fit) =>
                tokens.map((token) => {
                  const r = masterToLayer(token.bounding, fit);
                  const on = selectedOrders.has(token.order);
                  return (
                    <View
                      key={token.order}
                      pointerEvents="none"
                      style={{
                        position: 'absolute',
                        ...r,
                        backgroundColor: theme.accent,
                        opacity: on ? 0.35 : 0.08,
                        borderRadius: 2,
                      }}
                    />
                  );
                })
              }
            />
          ) : null}

          <View style={[styles.bar, { backgroundColor: theme.surface, borderTopColor: theme.edge }]}>
            {noText ? (
              <View style={styles.noText}>
                <Text style={[styles.noTextLabel, { color: theme.ink }]}>{t('reader.select.noText')}</Text>
{/* An imported page's words come from R1's indexing (its own text layer or OCR then). */}
                {needsRender ? null : (
                <Pressable
                  style={[styles.button, { backgroundColor: theme.accent, opacity: rerunning ? 0.6 : 1 }]}
                  onPress={rerunOcr}
                  disabled={rerunning}
                  accessibilityRole="button"
                >
                  {rerunning ? <ActivityIndicator color={theme.onAccent} /> : <Text style={[styles.buttonLabel, { color: theme.onAccent }]}>{t('reader.select.runOcr')}</Text>}
                </Pressable>
                )}
              </View>
            ) : (
              <>
                <Text style={[styles.hint, { color: theme.muted }]} numberOfLines={2}>
                  {selected.length ? text : t('reader.select.hint')}
                </Text>
                <View style={styles.actions}>
                  <Pressable
                    style={styles.ghost}
                    onPress={() => {
                      setAnchor(tokens[0]);
                      setFocus(tokens[tokens.length - 1]);
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.ghostLabel, { color: theme.accentInk }]}>{t('reader.select.selectAll')}</Text>
                  </Pressable>
                  <Pressable style={styles.ghost} onPress={() => markSelection('highlight')} disabled={!text} accessibilityRole="button">
                    <Text style={[styles.ghostLabel, { color: text ? theme.accentInk : theme.muted }]}>{t('reader.select.highlight')}</Text>
                  </Pressable>
                  <Pressable style={styles.ghost} onPress={() => markSelection('underline')} disabled={!text} accessibilityRole="button">
                    <Text style={[styles.ghostLabel, { color: text ? theme.accentInk : theme.muted }]}>{t('reader.select.underline')}</Text>
                  </Pressable>
                  <Pressable style={styles.ghost} onPress={() => text && Share.share({ message: text })} disabled={!text} accessibilityRole="button">
                    <Text style={[styles.ghostLabel, { color: text ? theme.accentInk : theme.muted }]}>{t('reader.select.share')}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.button, { backgroundColor: theme.accent, opacity: text ? 1 : 0.5 }]}
                    onPress={copy}
                    disabled={!text}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.buttonLabel, { color: theme.onAccent }]}>{t('reader.select.copy')}</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
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
    fontSize: 16,
    fontWeight: '600',
  },
  bar: {
    padding: spacing.md,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  ghost: {
    height: 44,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  ghostLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  button: {
    height: 44,
    minWidth: 96,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  noText: {
    gap: spacing.sm,
  },
  noTextLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
});
