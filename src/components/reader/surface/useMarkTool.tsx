import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { runOnUI, type SharedValue } from 'react-native-reanimated';
import { TextPromptModal } from '../../shared/TextPromptModal';
import { useT } from '../../../i18n/useT';
import { annotationAt } from '../../../services/annotations/hitTest';
import { changeAction, changedPageId, editChange, EMPTY_HISTORY, recordChange, redoChange, undoChange, type MarkChange, type MarkHistory } from '../../../services/annotations/markHistory';
import { isDrawingTool, moveBox, type MarkPrefs, type MarkTool } from '../../../services/annotations/markMode';
import { annotationColor, HIGHLIGHTER_THICKNESS, PEN_WIDTHS } from '../../../services/annotations/palette';
import { snapHighlight, type Point } from '../../../services/annotations/snap';
import { measureText } from '../../../services/pdf/visibleText';
import { textBoxOn, textCorner, textSizeOn } from '../../../services/reader/markPlacement';
import { overlayPalette } from '../../../services/reader/overlayPalette';
import { boxToSpace, mapPoint, spaceScale } from '../../../services/reader/pageSpace';
import { pageAtY, pageBox, screenToContent, type SurfaceView } from '../../../services/reader/surfaceGeometry';
import type { SurfacePage } from '../../../services/reader/surfacePages';
import { useAppDispatch } from '../../../store/AppStateContext';
import type { Annotation, LibraryDocument, LibraryPage, OcrBounding } from '../../../types/models';
import { createId } from '../../../utils/id';
import type { MarkDrag } from './useSurfaceGestures';
import type { SurfaceGeometry } from './useSurfaceView';

// How far off a tap may land on a mark (eraser, note, a box to move), in screen pixels.
const TAP_SLOP = 14;

// §12 D10: the Text tool is Pro (D1's gate, `pdfForms`). `unlocked`: Pro, or this document's
// session is on; `onUnlock` runs the gate and flips `unlocked` once it is through; `pro` shows
// the badge.
export type MarkTextTool = { unlocked: boolean; pro: boolean; onUnlock: () => void };

type Options = {
  // The Mark tool is on.
  active: boolean;
  doc: LibraryDocument | undefined;
  pages: readonly SurfacePage[];
  // The library pages behind `pages`, for the words a stroke snaps to.
  docPages: readonly LibraryPage[] | undefined;
  // The document's marks by library page (what the overlay draws).
  marks: ReadonlyMap<number, readonly Annotation[]>;
  prefs: MarkPrefs;
  geometry: RefObject<SurfaceGeometry | null>;
  // The view as React last heard it (exact at rest): what a tap is placed with.
  view: RefObject<SurfaceView>;
  textTool: MarkTextTool | undefined;
  // Night pages: what an ink colour is shown in (null by day), so the stroke being drawn looks
  // like the mark it becomes.
  nightInk: ((hex: string) => string) | null;
  // The provisional stroke (useSurfaceGestures writes it): cleared here once its mark is drawn.
  ink: SharedValue<number[]>;
  inkId: SharedValue<number>;
};

type Draft = { idx: number; at?: { x: number; y: number }; editing?: Annotation };
type Moving = { idx: number; annotation: Annotation; box: OcrBounding; from: Point };
type Located = { idx: number; page: SurfacePage; own: LibraryPage | undefined; point: { x: number; y: number }; slop: number };

// §18 W15 (A5, A6): Mark mode on the page surface. The tools work on the pages being read, at
// the zoom and place they are read at: a stroke arrives from the gesture as content points and
// becomes a row in the page's own space, a tap marks a word, opens a note or a text box, or
// erases, a drag moves a text box or a signature. Each change goes to the store at once and into
// the undo history (annotations/markHistory); nothing is written into document.pdf.
export function useMarkTool({ active, doc, pages, docPages, marks, prefs, geometry, view, textTool, nightInk, ink, inkId }: Options) {
  const { t } = useT();
  const dispatch = useAppDispatch();
  const unlocked = textTool?.unlocked ?? false;
  // A remembered Text tool waits for the gate; until then the highlighter is on.
  const tool: MarkTool = prefs.tool === 'text' && !unlocked ? 'highlight' : prefs.tool;
  const live = useRef({ doc, pages, docPages, marks, prefs, tool });
  live.current = { doc, pages, docPages, marks, prefs, tool };

  const setPrefs = useCallback(
    (patch: Partial<MarkPrefs>) => dispatch({ type: 'settings/SET_READING', reading: { mark: { ...live.current.prefs, ...patch } } }),
    [dispatch]
  );
  // Text was tapped while locked: picked once the gate lets it through.
  const wantText = useRef(false);
  useEffect(() => {
    if (!unlocked || !wantText.current) return;
    wantText.current = false;
    setPrefs({ tool: 'text' });
  }, [unlocked, setPrefs]);
  const onUnlock = textTool?.onUnlock;
  const pickTool = useCallback(
    (id: MarkTool) => {
      if (id === 'text' && !unlocked) {
        wantText.current = true;
        onUnlock?.();
        return;
      }
      setPrefs({ tool: id });
    },
    [unlocked, onUnlock, setPrefs]
  );

  // --- Marks, with undo and redo ---
  const [history, setHistory] = useState<MarkHistory>(EMPTY_HISTORY);
  const historyRef = useRef(history);
  historyRef.current = history;
  // The library page last marked, for whoever wants to know where the work was.
  const lastMarked = useRef<string | null>(null);
  // Leaving the tool ends what can be undone.
  useEffect(() => {
    if (!active) setHistory(EMPTY_HISTORY);
  }, [active]);

  const record = useCallback(
    (change: MarkChange) => {
      const next = recordChange(historyRef.current, change);
      historyRef.current = next;
      setHistory(next);
      lastMarked.current = changedPageId(change);
      dispatch(changeAction(change, 'do'));
    },
    [dispatch]
  );
  const undo = useCallback(() => {
    const step = undoChange(historyRef.current);
    if (!step) return;
    historyRef.current = step.history;
    setHistory(step.history);
    dispatch(step.action);
  }, [dispatch]);
  const redo = useCallback(() => {
    const step = redoChange(historyRef.current);
    if (!step) return;
    historyRef.current = step.history;
    setHistory(step.history);
    dispatch(step.action);
  }, [dispatch]);

  const add = useCallback(
    (idx: number, partial: Pick<Annotation, 'kind' | 'color' | 'data' | 'text'>) => {
      const { doc: owner, pages: all } = live.current;
      const page = all[idx];
      if (!owner || !page) return;
      const now = Date.now();
      record({ kind: 'added', annotation: { id: createId('annot'), documentId: owner.id, pageId: page.id, createdAt: now, updatedAt: now, ...partial } });
    },
    [record]
  );
  const lineColor = (kind: MarkTool, p: MarkPrefs) => (kind === 'highlight' ? p.highlightColor : kind === 'pen' ? p.penColor : p.lineColor);

  // --- Touches (the viewport → a page and a point of its own space) ---
  const locate = useCallback(
    (x: number, y: number, at: SurfaceView, onIdx?: number): Located | null => {
      const g = geometry.current;
      if (!g || !g.layout.tops.length) return null;
      const content = screenToContent(at, x, y);
      const idx = onIdx ?? pageAtY(g.layout, content.y);
      const page = live.current.pages[idx];
      if (!page || idx >= g.layout.tops.length) return null;
      const box = pageBox(g.layout, idx);
      return {
        idx,
        page,
        own: live.current.docPages?.[idx],
        point: mapPoint(boxToSpace(box, page.space), content.x, content.y),
        slop: TAP_SLOP / Math.max(1e-6, at.scale * spaceScale(box, page.space)),
      };
    },
    [geometry]
  );
  // A page that can't carry marks yet (an imported page not indexed): say so, once per touch.
  const notReady = useCallback(
    (page: SurfacePage) => {
      if (page.canMark) return false;
      dispatch({ type: 'ui/SHOW_SNACK', msg: t('reader.mark.pageNotReady') });
      return true;
    },
    [dispatch, t]
  );

  const clearInk = useCallback(
    (id: number) => {
      // After the frame that draws the new mark, and only if no other stroke has begun.
      requestAnimationFrame(() =>
        runOnUI(() => {
          'worklet';
          if (inkId.value === id) ink.value = [];
        })()
      );
    },
    [ink, inkId]
  );

  // A stroke the gesture let through: its points in content coordinates.
  const stroke = useCallback(
    (points: number[], id: number) => {
      const g = geometry.current;
      const { tool: now, prefs: p, pages: all, docPages: stored } = live.current;
      clearInk(id);
      if (!g || points.length < 4 || !isDrawingTool(now)) return;
      const idx = pageAtY(g.layout, points[1]);
      const page = all[idx];
      if (!page || idx >= g.layout.tops.length || notReady(page)) return;
      const toSpace = boxToSpace(pageBox(g.layout, idx), page.space);
      const own: Point[] = [];
      for (let i = 0; i + 1 < points.length; i += 2) {
        const at = mapPoint(toSpace, points[i], points[i + 1]);
        own.push([at.x, at.y]);
      }
      if (now === 'pen') {
        add(idx, { kind: 'ink', color: p.penColor, data: { strokes: [own], width: PEN_WIDTHS[p.penWidth] }, text: undefined });
        return;
      }
      const { rects, text } = snapHighlight(own, stored?.[idx]?.ocr, HIGHLIGHTER_THICKNESS);
      if (rects.length) add(idx, { kind: now, color: lineColor(now, p), data: { rects }, text });
    },
    [geometry, clearInk, notReady, add]
  );

  const [noteDraft, setNoteDraft] = useState<Draft | null>(null);
  const [textDraft, setTextDraft] = useState<Draft | null>(null);
  // A box's size: the text measured the way the PDF draws it (Helvetica, or shaped by Skia).
  const measure = useCallback((line: string, size: number) => measureText(line, size, false), []);

  const tap = useCallback(
    (x: number, y: number) => {
      const at = locate(x, y, view.current);
      const { tool: now, prefs: p, marks: byPage } = live.current;
      if (!at || now === 'hand' || notReady(at.page)) return;
      const hit = annotationAt(byPage.get(at.idx) ?? [], at.point.x, at.point.y, at.slop);
      if (now === 'eraser') {
        if (hit) record({ kind: 'removed', annotation: hit });
      } else if (now === 'note') {
        setNoteDraft(hit?.kind === 'note' ? { idx: at.idx, editing: hit } : { idx: at.idx, at: at.point });
      } else if (now === 'text') {
        setTextDraft(hit?.kind === 'text' ? { idx: at.idx, editing: hit } : { idx: at.idx, at: at.point });
      } else if (now === 'highlight' || now === 'underline' || now === 'strike') {
        // A tap marks the word under it; a tap beside the text does nothing (no free box).
        const { rects, text } = snapHighlight([[at.point.x, at.point.y]], at.own?.ocr, HIGHLIGHTER_THICKNESS / 2);
        if (text) add(at.idx, { kind: now, color: lineColor(now, p), data: { rects }, text });
      }
    },
    [locate, view, notReady, record, add]
  );

  // --- A box under the finger: a text box with the Text tool, a signature with any tap tool ---
  const movingRef = useRef<Moving | null>(null);
  const [moved, setMoved] = useState<{ id: string; box: OcrBounding } | null>(null);
  const drag = useCallback(
    (phase: MarkDrag, x: number, y: number, scale: number, tx: number, ty: number) => {
      const at: SurfaceView = { scale, tx, ty };
      if (phase === 'grab') {
        const start = locate(x, y, at);
        movingRef.current = null;
        if (!start || !start.page.canMark) return;
        const hit = annotationAt(live.current.marks.get(start.idx) ?? [], start.point.x, start.point.y, start.slop);
        const movable = hit && 'box' in hit.data && (hit.kind === 'signature' || (hit.kind === 'text' && live.current.tool === 'text'));
        if (!hit || !movable || !('box' in hit.data)) return;
        movingRef.current = { idx: start.idx, annotation: hit, box: hit.data.box, from: [start.point.x, start.point.y] };
        return;
      }
      const m = movingRef.current;
      if (!m || !('box' in m.annotation.data)) return;
      if (phase === 'cancel') {
        movingRef.current = null;
        setMoved(null);
        return;
      }
      const to = locate(x, y, at, m.idx);
      // Where the box is now: under the finger, or (a touch off the pages) where it last was.
      const box = to ? moveBox(to.page.space, m.annotation.data.box, to.point.x - m.from[0], to.point.y - m.from[1]) : m.box;
      if (phase === 'move') {
        movingRef.current = { ...m, box };
        setMoved({ id: m.annotation.id, box });
        return;
      }
      movingRef.current = null;
      const before = m.annotation.data.box;
      if (box.left !== before.left || box.top !== before.top) {
        record(editChange(m.annotation, { data: { ...m.annotation.data, box } }));
      }
      // The store's box is drawn by the same render that lets go of the dragged one.
      setMoved(null);
    },
    [locate, record]
  );

  const saveText = useCallback(
    (text: string) => {
      const draft = textDraft;
      setTextDraft(null);
      const page = draft ? live.current.pages[draft.idx] : undefined;
      if (!draft || !page) return;
      const before = draft.editing;
      if (before && 'size' in before.data) {
        const placed = textBoxOn(page.space, text, textCorner(before.data.box, before.data.turn), before.data.size, measure, before.data.turn ?? 0);
        record(editChange(before, { text, data: { ...before.data, box: placed.box } }));
      } else if (draft.at) {
        const size = textSizeOn(page.space, live.current.prefs.textSize);
        const placed = textBoxOn(page.space, text, draft.at, size, measure);
        add(draft.idx, { kind: 'text', color: live.current.prefs.textColor, data: { box: placed.box, size, ...(placed.turn ? { turn: placed.turn } : {}) }, text });
      }
    },
    [textDraft, measure, record, add]
  );
  const saveNote = useCallback(
    (text: string) => {
      const draft = noteDraft;
      setNoteDraft(null);
      if (draft?.editing) record(editChange(draft.editing, { text }));
      else if (draft?.at) add(draft.idx, { kind: 'note', color: 'note', data: { x: draft.at.x, y: draft.at.y }, text });
    },
    [noteDraft, record, add]
  );

  // The stroke being drawn looks like the mark it will be: the tool's colour, a pen solid and a
  // highlighter see-through, at the tool's width in the page's own unit.
  const inkStyle = useMemo(() => {
    const color = annotationColor(lineColor(tool, prefs));
    return {
      color: tool === 'pen' && nightInk ? nightInk(color) : color,
      opacity: tool === 'pen' ? 1 : overlayPalette(!!nightInk).highlightAlpha,
      width: tool === 'pen' ? PEN_WIDTHS[prefs.penWidth] : HIGHLIGHTER_THICKNESS,
    };
  }, [tool, prefs, nightInk]);

  const modals = active ? (
    <>
      <TextPromptModal
        visible={noteDraft !== null}
        title={noteDraft?.editing ? t('reader.mark.editNote') : t('reader.mark.addNote')}
        initialValue={noteDraft?.editing?.text ?? ''}
        placeholder={t('reader.mark.notePlaceholder')}
        submitLabel={t('reader.mark.save')}
        onCancel={() => setNoteDraft(null)}
        onSubmit={saveNote}
      />
      <TextPromptModal
        visible={textDraft !== null}
        title={textDraft?.editing ? t('reader.mark.editText') : t('reader.mark.addText')}
        initialValue={textDraft?.editing?.text ?? ''}
        placeholder={t('reader.mark.textPlaceholder')}
        submitLabel={t('reader.mark.save')}
        multiline
        onCancel={() => setTextDraft(null)}
        onSubmit={saveText}
      />
    </>
  ) : null;

  return {
    tool,
    setPrefs,
    pickTool,
    canUndo: history.undo.length > 0,
    canRedo: history.redo.length > 0,
    undo,
    redo,
    stroke,
    tap,
    drag,
    moved,
    inkStyle,
    modals,
    lastMarked,
  };
}
