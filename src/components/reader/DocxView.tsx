import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { tokens as themes, useTheme } from '../../theme';
import { docxPageHtml, docxToHtml } from '../../services/documents/docxService';
import { findScrollScript, markDocxMatches } from '../../services/documents/docxFind';
import { PreviewTooLargeError } from '../../services/documents/sheetService';
import { useT } from '../../i18n/useT';

// The only URL the page may have: the inline HTML itself.
const BLANK = 'about:blank';
// Every query change rebuilds and reloads the page, so typing waits for a pause first.
const FIND_DEBOUNCE_MS = 250;

type DocxViewProps = {
  uri: string;
  night: boolean;
  findQuery: string;
  onMatchCount: (count: number) => void;
};

// §7 R5: a read-only DOCX preview. The HTML comes from a file someone else wrote, so the WebView
// is locked down: no file or network access, no bridge back to the app (no onMessage), and every
// navigation (a tapped link included) refused. The page's own CSP blocks everything but inline
// styles and data: images, so no script the document carries can run.
// §12 D11: Find. The matches are marked in the HTML here (services/documents/docxFind) and the
// page is reloaded with them; JavaScript is on only so the app can scroll to the first mark with
// its own fixed script once the page has loaded.
export function DocxView({ uri, night, findQuery, onMatchCount }: DocxViewProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const webRef = useRef<WebView>(null);
  const [body, setBody] = useState<string | null>(null);
  const [error, setError] = useState<'failed' | 'tooLarge' | null>(null);
  const [query, setQuery] = useState(findQuery);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(findQuery), FIND_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [findQuery]);

  const marked = useMemo(() => (body === null ? null : markDocxMatches(body, query)), [body, query]);
  const count = marked?.count ?? 0;

  useEffect(() => {
    onMatchCount(count);
  }, [count, onMatchCount]);

  // Night mode reads like the dark theme, whatever the app theme is.
  const colors = night ? themes.dark : tokens;
  // Built once per change: a new source object with the same HTML can still reload the page.
  const source = useMemo(
    () =>
      marked === null
        ? null
        : { html: docxPageHtml(marked.html, colors, { find: { fill: colors.accentSoft, current: colors.accent, onCurrent: colors.onAccent } }) },
    [marked, colors]
  );

  useEffect(() => {
    let cancelled = false;
    setBody(null);
    setError(null);
    docxToHtml(uri)
      .then((html) => {
        if (!cancelled) setBody(html);
      })
      .catch((e) => {
        if (cancelled) return;
        console.warn('DocxView: failed to load', uri, e);
        setError(e instanceof PreviewTooLargeError ? 'tooLarge' : 'failed');
      });
    return () => {
      cancelled = true;
    };
  }, [uri]);

  if (error || source === null) {
    return (
      <View style={[styles.empty, { backgroundColor: tokens.bg }]}>
        <Text style={{ color: tokens.muted }}>
          {error ? t(error === 'tooLarge' ? 'reader.tooLargeToPreview' : 'reader.openFailed') : t('reader.loading')}
        </Text>
      </View>
    );
  }

  return (
    <WebView
      ref={webRef}
      style={[styles.container, { backgroundColor: colors.bg }]}
      source={source}
      originWhitelist={[BLANK]}
      onShouldStartLoadWithRequest={(request) => request.url === BLANK}
      onLoadEnd={() => {
        if (count > 0) webRef.current?.injectJavaScript(findScrollScript(0));
      }}
      javaScriptEnabled
      domStorageEnabled={false}
      allowFileAccess={false}
      allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false}
      mixedContentMode="never"
      setSupportMultipleWindows={false}
      cacheEnabled={false}
      incognito
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
