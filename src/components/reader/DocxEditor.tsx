import { MaterialCommunityIcons } from '@expo/vector-icons';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { commandScript, docxEditorHtml, parseEditorMessage, REQUEST_HTML_SCRIPT, type DocxCommand } from '../../services/edit/docxEdit';
import { useT } from '../../i18n/useT';
import type { TKey } from '../../i18n';
import { MIN_TOUCH, radii, spacing, useTheme } from '../../theme';

// The only URL the page may have: the inline HTML itself.
const BLANK = 'about:blank';
// How long Save waits for the page to hand its HTML over.
const HTML_TIMEOUT_MS = 10_000;

export type DocxEditorHandle = {
  // The edited body's HTML (pictures the load tagged come back as `data-img` only).
  getHtml: () => Promise<string>;
};

type DocxEditorProps = {
  // tagImages' HTML; read once per mount (the page owns the text from then on).
  html: string;
  onDirty: () => void;
};

type ToolState = { bold: boolean; italic: boolean; block: string; ul: boolean; ol: boolean };

const TOOLS: { command: DocxCommand; icon: ComponentProps<typeof MaterialCommunityIcons>['name']; label: TKey; active: (s: ToolState) => boolean }[] = [
  { command: 'bold', icon: 'format-bold', label: 'reader.editFile.docxBold', active: (s) => s.bold },
  { command: 'italic', icon: 'format-italic', label: 'reader.editFile.docxItalic', active: (s) => s.italic },
  { command: 'h1', icon: 'format-header-1', label: 'reader.editFile.docxHeading1', active: (s) => s.block === 'h1' },
  { command: 'h2', icon: 'format-header-2', label: 'reader.editFile.docxHeading2', active: (s) => s.block === 'h2' },
  { command: 'ul', icon: 'format-list-bulleted', label: 'reader.editFile.docxBullets', active: (s) => s.ul },
  { command: 'ol', icon: 'format-list-numbered', label: 'reader.editFile.docxNumbers', active: (s) => s.ol },
  { command: 'undo', icon: 'undo', label: 'reader.editFile.docxUndo', active: () => false },
];

// Not a secret worth more than this: it only has to be unguessable by the document's own HTML,
// which mammoth has already escaped.
function makeNonce(): string {
  let s = '';
  for (let i = 0; i < 24; i++) s += Math.floor(Math.random() * 36).toString(36);
  return s;
}

// §12 D9: the Word editor (inside FileEditor). A WebView of its own - DocxView stays locked and
// JavaScript-free - with a contenteditable body and a native toolbar for bold, italic, heading
// 1/2, bulleted and numbered lists and undo. JavaScript runs here only for the page's own inline
// script (services/edit/docxEdit's CSP and nonce); the WebView has no file or network access and
// refuses every navigation. Messages come back through postMessage and are validated.
export const DocxEditor = forwardRef<DocxEditorHandle, DocxEditorProps>(function DocxEditor({ html, onDirty }, ref) {
  const { tokens } = useTheme();
  const { t } = useT();
  const webRef = useRef<WebView>(null);
  const [state, setState] = useState<ToolState>({ bold: false, italic: false, block: '', ul: false, ol: false });
  const pending = useRef<{ resolve: (html: string) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> } | null>(null);
  const latestDirty = useRef(onDirty);
  latestDirty.current = onDirty;

  // The page is built once per document: rebuilding it (a theme change) would drop the edits.
  const nonce = useMemo(makeNonce, []);
  const [page] = useState(() => docxEditorHtml(html, tokens, nonce, t('reader.editFile.placeholder')));

  useImperativeHandle(
    ref,
    () => ({
      getHtml: () =>
        new Promise<string>((resolve, reject) => {
          pending.current?.reject(new Error('DocxEditor: superseded'));
          const timer = setTimeout(() => {
            pending.current = null;
            reject(new Error('DocxEditor: the page did not answer'));
          }, HTML_TIMEOUT_MS);
          pending.current = { resolve, reject, timer };
          webRef.current?.injectJavaScript(REQUEST_HTML_SCRIPT);
        }),
    }),
    []
  );

  useEffect(
    () => () => {
      if (pending.current) clearTimeout(pending.current.timer);
      pending.current = null;
    },
    []
  );

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    const message = parseEditorMessage(event.nativeEvent.data);
    if (!message) return;
    if (message.type === 'dirty') latestDirty.current();
    else if (message.type === 'state') setState(message);
    else if (message.type === 'html' && pending.current) {
      clearTimeout(pending.current.timer);
      pending.current.resolve(message.html);
      pending.current = null;
    }
  }, []);

  return (
    <View style={styles.root}>
      <View style={[styles.toolbar, { borderBottomColor: tokens.edge }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolRow} keyboardShouldPersistTaps="always">
          {TOOLS.map((tool) => {
            const active = tool.active(state);
            return (
              <Pressable
                key={tool.command}
                accessibilityRole="button"
                accessibilityLabel={t(tool.label)}
                accessibilityState={{ selected: active }}
                onPress={() => webRef.current?.injectJavaScript(commandScript(tool.command))}
                style={[styles.tool, active && { backgroundColor: tokens.accentSoft }]}
              >
                <MaterialCommunityIcons name={tool.icon} size={22} color={active ? tokens.accentInk : tokens.ink} />
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <WebView
        ref={webRef}
        style={[styles.root, { backgroundColor: tokens.bg }]}
        source={{ html: page }}
        originWhitelist={[BLANK]}
        onShouldStartLoadWithRequest={(request) => request.url === BLANK}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled={false}
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        mixedContentMode="never"
        setSupportMultipleWindows={false}
        cacheEnabled={false}
        incognito
        hideKeyboardAccessoryView
        keyboardDisplayRequiresUserAction={false}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  toolbar: { borderBottomWidth: StyleSheet.hairlineWidth },
  toolRow: { paddingHorizontal: spacing.sm, gap: spacing.xs },
  tool: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center', borderRadius: radii.chip },
});
