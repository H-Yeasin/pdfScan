import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { runOcr } from '../../services/ocr/ocrService';
import { resolveOcrScript } from '../../services/scripts/registry';
import { masterToLayer } from '../../services/study/canvasMath';
import { readingOrderTokens, selectBetween, selectionText, tokenAt, type TextToken } from '../../services/study/textSelection';
import { useAppState } from '../../store/AppStateContext';
import { radii, spacing, useTheme } from '../../theme';
import type { LibraryDocument } from '../../types/models';
import { PageCanvas } from './PageCanvas';
import { useT } from '../../i18n/useT';

type SelectTextSheetProps = {
  visible: boolean;
  doc: LibraryDocument;
  pageIdx: number;
  onClose: () => void;
};

// §5 T3 "Select text": drag from one word to another to select everything between them in reading
// order; start a drag on either end to move that end; tap a word to select just it. Copy or Share
// the selection. A page without OCR text offers to run OCR again.
export function SelectTextSheet({ visible, doc, pageIdx, onClose }: SelectTextSheetProps) {
  const { tokens: theme } = useTheme();
  const { t } = useT();
  const { state, dispatch } = useAppState();
  const page = doc.pages[pageIdx];
  const tokens = useMemo(() => readingOrderTokens(page?.ocr), [page?.ocr]);
  const [anchor, setAnchor] = useState<TextToken | null>(null);
  const [focus, setFocus] = useState<TextToken | null>(null);
  const [rerunning, setRerunning] = useState(false);

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
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]}>
          <View style={styles.header}>
            <Pressable style={styles.iconButton} onPress={onClose} accessibilityLabel={t('common.close')}>
              <Ionicons name="close" size={22} color={theme.ink} />
            </Pressable>
            <Text style={[styles.title, { color: theme.ink }]}>{t('reader.select.title', { page: pageIdx + 1 })}</Text>
          </View>

          {page ? (
            <PageCanvas
              page={page}
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
                <Pressable
                  style={[styles.button, { backgroundColor: theme.accent, opacity: rerunning ? 0.6 : 1 }]}
                  onPress={rerunOcr}
                  disabled={rerunning}
                  accessibilityRole="button"
                >
                  {rerunning ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonLabel}>{t('reader.select.runOcr')}</Text>}
                </Pressable>
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
                  <Pressable style={styles.ghost} onPress={() => text && Share.share({ message: text })} disabled={!text} accessibilityRole="button">
                    <Text style={[styles.ghostLabel, { color: text ? theme.accentInk : theme.muted }]}>{t('reader.select.share')}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.button, { backgroundColor: theme.accent, opacity: text ? 1 : 0.5 }]}
                    onPress={copy}
                    disabled={!text}
                    accessibilityRole="button"
                  >
                    <Text style={styles.buttonLabel}>{t('reader.select.copy')}</Text>
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
    color: '#fff',
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
