import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { tokens as themes, useTheme, type ThemeTokens } from '../../theme';
import { callScript, DOCX_BRIDGE_SCRIPT, parseDocxMessage, type DocxCall } from '../../services/documents/docxBridge';
import { docxPageHtml, docxToHtml } from '../../services/documents/docxService';
import { cachedDocxHtml } from '../../services/documents/parseCache';
import { PreviewTooLargeError } from '../../services/documents/sheetService';
import { safeLinkUrl } from '../../services/reader/links';
import { useT } from '../../i18n/useT';
import { useAskLink } from './useAskLink';
import type { ViewerProps } from './viewers/types';
import { useDebounced, useScrollDirection } from './viewers/useScrollDirection';

// The only URL the page may have: the inline HTML itself.
const BLANK = 'about:blank';
// Find waits for a pause in the typing; then the page marks the matches itself (no reload).
const FIND_DEBOUNCE_MS = 150;

function pageColors(tokens: ThemeTokens) {
  return { colors: tokens, find: { fill: tokens.accentSoft, current: tokens.accent, onCurrent: tokens.onAccent } };
}

// §7 R5: a read-only DOCX preview. The HTML comes from a file someone else wrote, so the WebView
// is locked down: no file or network access, and every navigation (a tapped link included)
// refused. The page's own CSP blocks everything but inline styles and data: images, so no script
// the document carries can run.
// §18 W22: the app talks to the page through services/documents/docxBridge: one constant script
// goes in (injectedJavaScript, which the CSP doesn't cover), and after that only calls of its
// functions with JSON arguments; what the page posts back is checked against a strict schema
// (parseDocxMessage) and anything else is dropped. So Find, night mode, the bars' insets and the
// saved position all work on the page as it is: nothing reloads it once it has loaded. A link is
// never followed: one inside the document scrolls there, one that leaves the app is shown to the
// student first (useAskLink), and only http, https, mailto and tel are ever offered.
export function DocxView({ uri, night, insets, onTap, find, onFindResult, initialPosition, onPosition, onScrollDirection }: ViewerProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const askLink = useAskLink();
  const webRef = useRef<WebView>(null);
  const [body, setBody] = useState<string | null>(null);
  const [error, setError] = useState<'failed' | 'tooLarge' | null>(null);
  // The bridge script has run in the page that is loaded now.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    cachedDocxHtml(uri, docxToHtml)
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

  // What the page is built with. Night and the insets change later through the bridge, so they
  // are read once here: a new `source` would load the page again.
  const first = useRef({ night, insets });
  const source = useMemo(
    () =>
      body === null
        ? null
        : {
            html: docxPageHtml(body, tokens, {
              pad: first.current.insets,
              find: pageColors(tokens).find,
              // Night mode reads like the dark theme, whatever the app theme is.
              night: { on: first.current.night, ...pageColors(themes.dark) },
            }),
          },
    [body, tokens]
  );
  useEffect(() => setReady(false), [source]);

  const call = useCallback((name: DocxCall, args: (string | number | boolean)[]) => {
    webRef.current?.injectJavaScript(callScript(name, args));
  }, []);

  useEffect(() => {
    if (ready) call('setNight', [night]);
  }, [ready, night, call]);
  useEffect(() => {
    if (ready) call('setInsets', [insets.top, insets.bottom, insets.left, insets.right]);
  }, [ready, insets.top, insets.bottom, insets.left, insets.right, call]);

  // The saved position, once: when the page is ready, after its insets are in place.
  const opening = useRef(initialPosition?.kind === 'docx' ? initialPosition.fraction : 0);
  const placed = useRef(false);
  useEffect(() => {
    if (!ready || placed.current) return;
    if (opening.current > 0) call('scrollToFraction', [opening.current]);
    placed.current = true;
  }, [ready, call]);

  // --- Find ---
  const query = useDebounced(find.query, FIND_DEBOUNCE_MS, (q) => !q.trim());
  // Each search has a number; an answer to an older one is ignored.
  const seq = useRef(0);
  const [found, setFound] = useState({ count: 0, index: -1, partial: false });
  const foundNow = useRef(found);
  foundNow.current = found;
  useEffect(() => {
    if (!ready) return;
    seq.current += 1;
    call('find', [query, seq.current]);
  }, [ready, query, call]);
  useEffect(() => {
    if (!ready || find.index < 0 || find.index === foundNow.current.index) return;
    call('findGo', [find.index, seq.current]);
  }, [ready, find.index, call]);
  useEffect(() => {
    onFindResult(found);
  }, [found, onFindResult]);

  const said = useScrollDirection(onScrollDirection);
  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const message = parseDocxMessage(event.nativeEvent.data);
      if (!message) return;
      switch (message.type) {
        case 'ready':
          setReady(true);
          break;
        case 'tap':
          onTap();
          break;
        case 'scroll':
          said(message.y, message.max);
          if (placed.current) onPosition({ kind: 'docx', fraction: message.max > 0 ? Math.min(1, message.y / message.max) : 0 });
          break;
        case 'find':
          if (message.seq !== seq.current) break;
          setFound((prev) =>
            prev.count === message.count && prev.index === message.index && prev.partial === message.partial
              ? prev
              : { count: message.count, index: message.index, partial: message.partial }
          );
          break;
        case 'link': {
          const url = safeLinkUrl(message.href);
          if (url) askLink(url);
          break;
        }
      }
    },
    [onTap, said, onPosition, askLink]
  );

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
      style={[styles.container, { backgroundColor: (night ? themes.dark : tokens).bg }]}
      source={source}
      originWhitelist={[BLANK]}
      onShouldStartLoadWithRequest={(request) => request.url === BLANK}
      injectedJavaScript={DOCX_BRIDGE_SCRIPT}
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
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
