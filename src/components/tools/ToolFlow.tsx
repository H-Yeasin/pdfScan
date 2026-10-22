import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '../../i18n/useT';
import { modifiedAt } from '../../services/library/documentSort';
import { IDLE, toolFlowReducer, type CompressLevel, type FlowState, type ToolResult } from '../../services/tools/toolFlow';
import { getTool, pickableDocs, pickProblem, type ToolDef, type ToolId } from '../../services/tools/toolRegistry';
import { useAppDispatch, useAppSelector, useAppStore } from '../../store/AppStateContext';
import { useImportFile } from '../../store/useImportFile';
import { spacing } from '../../theme';
import type { LibraryDocument } from '../../types/models';
import { useOpenDocument } from '../library/useDocumentListActions';
import { DocumentPickerModal } from '../reader/DocumentPickerModal';
import { Button, FilterChip, ListItem, ProgressBar, Sheet, Text } from '../ui';
import { ToolResultSheet } from './ToolResultSheet';
import { useToolRunners } from './useToolRunners';
import { hapticSuccess } from '../../services/feedback/haptics';

const COMPRESS_LEVELS: readonly CompressLevel[] = [1, 2, 3];

// §17 U8: the flow every tool in the Tools tab goes through (services/tools/toolFlow):
// 1. Pick: DocumentPickerModal, only the documents the tool can work on, with "Import a file";
// 2. Options, for the tools that have any (keep the originals; how small);
// 3. Run: through the tool's runner (useToolRunners), a progress sheet while our own work runs,
//    the Pro gate and the tool's own progress for a Pro task;
// 4. Result: ToolResultSheet, Open · Share · Done.
// One modal at a time: each step's sheet replaces the last. `open(id)` starts a tool; render
// `element` once.
export function useToolFlow() {
  const { t } = useT();
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const files = useAppSelector((s) => s.library.files);
  const [state, send] = useReducer(toolFlowReducer, IDLE);
  const importFile = useImportFile();
  const openDocument = useOpenDocument();

  const onResult = useCallback((result: ToolResult) => send({ type: 'showResult', result }), []);
  const { run, overlays } = useToolRunners(onResult);

  const open = useCallback(
    (id: ToolId) => {
      dispatch({ type: 'settings/USE_TOOL', id });
      send({ type: 'open', tool: id });
    },
    [dispatch]
  );

  // The run step starts the tool once; the step's own object is the key, so a re-render doesn't
  // start it twice.
  const running = useRef<FlowState | null>(null);
  // §17 U13: "3 of 5" under the run sheet's bar, for the tools that count.
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  useEffect(() => {
    if (state.step !== 'run' || running.current === state) return;
    running.current = state;
    setProgress(null);
    const tool = getTool(state.tool);
    const docs = state.docIds.map((id) => store.getState().library.files.find((d) => d.id === id)).filter((d): d is LibraryDocument => !!d);
    const onProgress = (done: number, total: number) => {
      if (running.current === state) setProgress({ done, total });
    };
    Promise.resolve()
      .then(() => run(tool, docs, state.options, onProgress))
      .then(
        (result) => {
          // §17 U13: a tool's result is a success buzz (haptics.ts); the hand-offs (null) aren't.
          if (result) hapticSuccess();
          send({ type: 'done', result });
        },
        (error: unknown) => {
          console.warn('ToolFlow: the tool failed', tool.id, error);
          send({ type: 'failed' });
        }
      );
  }, [state, run, store]);

  const pickTool = state.step === 'pick' ? getTool(state.tool) : null;
  // Newest first, as Files lists them by default.
  const pickable = useMemo(
    () => (pickTool ? pickableDocs(pickTool, files).sort((a, b) => modifiedAt(b) - modifiedAt(a)) : []),
    [pickTool, files]
  );

  const pick = useCallback((docs: LibraryDocument[]) => send({ type: 'picked', docIds: docs.map((d) => d.id) }), []);

  // An imported file is picked only if the tool can use it; it stays in Files either way.
  const importForPick = useCallback(async () => {
    if (!pickTool) return undefined;
    const doc = await importFile({ silent: true });
    if (!doc) return undefined;
    if (pickableDocs(pickTool, [doc]).length === 0) {
      dispatch({ type: 'ui/SHOW_SNACK', msg: t('tools.pick.cantUse', { name: doc.name }) });
      return undefined;
    }
    return doc;
  }, [pickTool, importFile, dispatch, t]);

  const close = useCallback(() => send({ type: 'cancel' }), []);

  const share = useCallback(
    async (doc: LibraryDocument) => {
      const { shareDocument } = require('../../services/sharing/shareService') as typeof import('../../services/sharing/shareService');
      try {
        await shareDocument(doc, store.getState().library.annotations.filter((a) => a.documentId === doc.id));
      } catch (error) {
        console.warn('ToolFlow: share failed', error);
        dispatch({ type: 'ui/SHOW_SNACK', msg: t('library.toolFailed') });
      }
    },
    [store, dispatch, t]
  );

  const resultDocs = useMemo(() => {
    if (state.step !== 'result') return null;
    const docs = state.result.docIds.map((id) => files.find((d) => d.id === id)).filter((d): d is LibraryDocument => !!d);
    return docs.length ? docs : null;
  }, [state, files]);

  const element = (
    <>
      {overlays}
      {pickTool ? <Picker tool={pickTool} docs={pickable} onPick={pick} onImport={importForPick} onClose={close} /> : null}
      <OptionsSheet state={state} send={send} />
      <RunSheet state={state} progress={progress} />
      <ToolResultSheet
        docs={resultDocs}
        message={state.step === 'result' ? state.result.message : undefined}
        onOpen={(doc) => {
          close();
          openDocument(doc);
        }}
        onShare={(doc) => void share(doc)}
        onClose={close}
      />
    </>
  );

  return { open, element };
}

function Picker({
  tool,
  docs,
  onPick,
  onImport,
  onClose,
}: {
  tool: ToolDef;
  docs: LibraryDocument[];
  onPick: (docs: LibraryDocument[]) => void;
  onImport: () => Promise<LibraryDocument | undefined>;
  onClose: () => void;
}) {
  const { t } = useT();
  const label = t(tool.labelKey);
  // A one-document tool picks on the tap; several get checkboxes and Continue.
  const single = tool.min === 1 && tool.max === 1;
  return (
    <DocumentPickerModal
      visible
      title={label}
      hint={t(tool.descKey)}
      docs={docs}
      onImport={onImport}
      onPick={single ? (doc) => onPick([doc]) : undefined}
      multi={
        single
          ? undefined
          : {
              min: tool.min,
              max: tool.max,
              confirmLabel: tool.options ? t('tools.pick.continue') : label,
              problem: (count) => {
                const problem = pickProblem(tool, count);
                return problem ? t(problem.key, { count: problem.count }) : null;
              },
              onConfirm: onPick,
            }
      }
      onClose={onClose}
    />
  );
}

function OptionsSheet({ state, send }: { state: FlowState; send: (event: Parameters<typeof toolFlowReducer>[1]) => void }) {
  const { t } = useT();
  const visible = state.step === 'options';
  const tool = visible ? getTool(state.tool) : null;
  const options = visible ? state.options : null;
  return (
    <Sheet
      visible={visible}
      onClose={() => send({ type: 'cancel' })}
      title={tool ? t(tool.labelKey) : undefined}
      testID="tool-options"
      footer={
        tool ? (
          <>
            <Button label={t('tools.options.back')} variant="ghost" onPress={() => send({ type: 'back' })} />
            <Button label={t(tool.labelKey)} onPress={() => send({ type: 'confirm' })} testID="tool-options-run" />
          </>
        ) : null
      }
    >
      {tool && options && (tool.id === 'merge' || tool.id === 'split') ? (
        <ListItem
          title={t('tools.options.keepOriginals')}
          subtitle={t(tool.id === 'merge' ? 'tools.options.keepOriginalsMerge' : 'tools.options.keepOriginalsSplit')}
          switchValue={options.keepOriginals}
          onValueChange={(keepOriginals) => send({ type: 'setOptions', options: { keepOriginals } })}
        />
      ) : null}
      {tool && options && tool.id === 'split' ? <Text color="muted">{t('tools.options.splitEvery')}</Text> : null}
      {tool && options && tool.id === 'compress' ? (
        <View style={styles.levels}>
          <Text color="muted">{t('tools.options.qualityHint')}</Text>
          <View style={styles.chips}>
            {COMPRESS_LEVELS.map((level) => (
              <FilterChip
                key={level}
                label={t(`tools.options.quality${level}`)}
                selected={options.quality === level}
                onPress={() => send({ type: 'setOptions', options: { quality: level } })}
              />
            ))}
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

// Our own work (merge, split, compress) runs to the end: the services have no way to stop half-way,
// so there is no Cancel, and Back waits too.
function RunSheet({ state, progress }: { state: FlowState; progress: { done: number; total: number } | null }) {
  const { t } = useT();
  const tool = state.step === 'run' ? getTool(state.tool) : null;
  const visible = !!tool && tool.kind === 'run';
  const counting = progress !== null && progress.total > 1;
  return (
    <Sheet visible={visible} onClose={() => undefined} title={tool ? t(tool.labelKey) : undefined} testID="tool-running">
      <View style={styles.running} accessibilityLiveRegion="polite">
        <Text>{counting ? `${t('tools.run.working')} ${t('ui.task.count', { done: progress.done, total: progress.total })}` : t('tools.run.working')}</Text>
        <ProgressBar value={counting ? progress.done / progress.total : undefined} accessibilityLabel={t('tools.run.working')} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  levels: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  running: { gap: spacing.md, paddingVertical: spacing.sm },
});
