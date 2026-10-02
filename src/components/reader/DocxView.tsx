import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { tokens as themes, useTheme } from '../../theme';
import { docxPageHtml, docxToHtml } from '../../services/documents/docxService';
import { PreviewTooLargeError } from '../../services/documents/sheetService';
import { useT } from '../../i18n/useT';

// The only URL the page may have: the inline HTML itself.
const BLANK = 'about:blank';

type DocxViewProps = {
  uri: string;
  night: boolean;
};

// §7 R5: a read-only DOCX preview. The HTML comes from a file someone else wrote, so the WebView
// is locked down: JavaScript off, no file or network access, and every navigation (a tapped link
// included) refused. The page's own CSP blocks everything but inline styles and data: images.
export function DocxView({ uri, night }: DocxViewProps) {
  const { tokens } = useTheme();
  const { t } = useT();
  const [body, setBody] = useState<string | null>(null);
  const [error, setError] = useState<'failed' | 'tooLarge' | null>(null);

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

  if (error || body === null) {
    return (
      <View style={[styles.empty, { backgroundColor: tokens.bg }]}>
        <Text style={{ color: tokens.muted }}>
          {error ? t(error === 'tooLarge' ? 'reader.tooLargeToPreview' : 'reader.openFailed') : t('reader.loading')}
        </Text>
      </View>
    );
  }

  // Night mode reads like the dark theme, whatever the app theme is.
  const colors = night ? themes.dark : tokens;
  return (
    <WebView
      style={[styles.container, { backgroundColor: colors.bg }]}
      source={{ html: docxPageHtml(body, colors) }}
      originWhitelist={[BLANK]}
      onShouldStartLoadWithRequest={(request) => request.url === BLANK}
      javaScriptEnabled={false}
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
