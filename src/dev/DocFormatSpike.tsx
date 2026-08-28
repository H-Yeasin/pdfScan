// THROWAWAY — validates mammoth, SheetJS (xlsx), PapaParse, react-native-webview, and TextDecoder
// against real fixtures before the real DocxView/SheetView/TxtView are built on top of them (plan
// what-if-this-app-glistening-valley.md, Phase 2 native spike). Delete this file and revert
// App.tsx's swap once the checklist below is done. Not wired into ScreenName/AppNavigator.
import { useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
// @ts-expect-error - mammoth ships no types; the Node build's ambient module also doesn't cover
// this browser-bundle subpath. A local .d.ts shim is added when DocxView is built for real.
import mammoth from 'mammoth/mammoth.browser';

export function DocFormatSpike() {
  const [log, setLog] = useState<string[]>([]);
  const [html, setHtml] = useState<string | null>(null);

  const append = (line: string) => setLog((prev) => [line, ...prev].slice(0, 60));

  const pick = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (result.canceled || !result.assets[0]) return;
    await testUri(result.assets[0].uri, result.assets[0].name);
  };

  const testUri = async (uri: string, displayName: string) => {
    append(`testing: ${displayName} (${uri})`);
    const ext = (displayName.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase();
    const asset = { uri, name: displayName };

    try {
      if (ext === 'docx') {
        const arrayBuffer = await new File(asset.uri).arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        append(`mammoth.convertToHtml -> ${result.value.length} chars html, ${result.messages.length} messages`);
        setHtml(result.value);
      } else if (ext === 'xlsx' || ext === 'xls') {
        const arrayBuffer = await new File(asset.uri).arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        append(`XLSX.read -> sheets: ${workbook.SheetNames.join(', ')}`);
        const first = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<string[]>(first, { header: 1 });
        append(`sheet_to_json -> ${rows.length} rows, first row: ${JSON.stringify(rows[0])}`);
      } else if (ext === 'csv') {
        const text = await new File(asset.uri).text();
        const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
        append(`Papa.parse -> ${parsed.data.length} rows, ${parsed.errors.length} errors`);
        append(`first row: ${JSON.stringify(parsed.data[0])}`);
      } else if (ext === 'txt') {
        const hasTextDecoder = typeof TextDecoder !== 'undefined';
        append(`typeof TextDecoder === ${typeof TextDecoder}`);
        if (hasTextDecoder) {
          const bytes = await new File(asset.uri).bytes();
          const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
          append(`decoded ${text.length} chars, first 80: ${JSON.stringify(text.slice(0, 80))}`);
        }
      } else {
        append(`unhandled extension: .${ext}`);
      }
    } catch (e) {
      append(`FAILED: ${String(e)}`);
    }
  };

  const quickTests: [string, string][] = [
    ['sample.docx', 'file:///sdcard/Download/sample.docx'],
    ['sample.xlsx', 'file:///sdcard/Download/sample.xlsx'],
    ['sample.csv', 'file:///sdcard/Download/sample.csv'],
    ['sample.txt', 'file:///sdcard/Download/sample.txt'],
  ];

  return (
    <View style={styles.container}>
      <View style={styles.controls}>
        <Button title="Pick a file (.docx/.xlsx/.csv/.txt)" onPress={pick} />
      </View>
      <View style={styles.controls}>
        {quickTests.map(([name, uri]) => (
          <Button key={name} title={name} onPress={() => testUri(uri, name)} />
        ))}
      </View>

      {html ? (
        <WebView originWhitelist={['*']} source={{ html }} style={styles.webview} />
      ) : (
        <Text style={styles.hint}>Pick a .docx to also test the WebView render.</Text>
      )}

      <ScrollView style={styles.logBox}>
        {log.map((line, i) => (
          <Text key={i} style={styles.logLine}>
            {line}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingTop: 48 },
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 8, alignItems: 'center' },
  webview: { flex: 1 },
  hint: { padding: 16 },
  logBox: { maxHeight: 220, backgroundColor: '#111', padding: 8 },
  logLine: { color: '#0f0', fontSize: 11, fontFamily: 'monospace' },
});
