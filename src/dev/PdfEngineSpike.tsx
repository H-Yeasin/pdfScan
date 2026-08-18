// THROWAWAY — validates react-native-pdf-jsi against real fixtures before the real reader is
// built on top of it. Delete this file and revert App.tsx's swap once the spike checklist in
// the plan (dapper-wondering-moth.md §2) is done. Not wired into ScreenName/AppNavigator.
import { useRef, useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import Pdf, { searchTextDirect } from 'react-native-pdf-jsi';

const PDF_ID = 'spike-doc';

export function PdfEngineSpike() {
  const [uri, setUri] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const pdfRef = useRef<Pdf>(null);

  const append = (line: string) => setLog((prev) => [line, ...prev].slice(0, 40));

  const pick = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf' });
    if (result.canceled || !result.assets[0]) return;
    append(`picked: ${result.assets[0].uri}`);
    setUri(result.assets[0].uri);
  };

  const runSearch = async () => {
    try {
      const results = await searchTextDirect(PDF_ID, 'the', 1, 20);
      append(`searchTextDirect -> ${results.length} matches: ${JSON.stringify(results.slice(0, 3))}`);
    } catch (e) {
      append(`searchTextDirect threw: ${String(e)}`);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.controls}>
        <Button title="Pick a PDF" onPress={pick} />
        <TextInput
          style={styles.input}
          placeholder="password (optional)"
          value={password}
          onChangeText={setPassword}
        />
        <Button title="Reload w/ password" onPress={() => setUri((u) => (u ? `${u}` : u))} />
        <Button title="setPage(3)" onPress={() => pdfRef.current?.setPage(3)} />
        <Button title="searchTextDirect('the')" onPress={runSearch} />
      </View>

      {uri ? (
        <Pdf
          ref={pdfRef}
          pdfId={PDF_ID}
          source={{ uri }}
          password={password || undefined}
          style={styles.pdf}
          onLoadComplete={(numberOfPages, path, size, tableContents) => {
            append(
              `onLoadComplete: pages=${numberOfPages} size=${JSON.stringify(size)} outline=${
                tableContents ? tableContents.length : 'none'
              }`
            );
          }}
          onPageChanged={(page, numberOfPages) => append(`onPageChanged: ${page}/${numberOfPages}`)}
          onPageSingleTap={(page, x, y) => append(`onPageSingleTap: page=${page} x=${x} y=${y}`)}
          onError={(error) => append(`onError: ${JSON.stringify(error)}`)}
          onPressLink={(url) => append(`onPressLink: ${url}`)}
        />
      ) : (
        <Text style={styles.hint}>Pick a PDF above to test rendering.</Text>
      )}

      <ScrollView style={styles.logBox}>
        {log.map((line, i) => (
          <Text key={i} style={styles.logLine}>
            {line}
          </Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 8, alignItems: 'center' },
  input: { borderWidth: 1, borderColor: '#ccc', paddingHorizontal: 8, height: 36, minWidth: 120 },
  pdf: { flex: 1 },
  hint: { padding: 16 },
  logBox: { maxHeight: 160, backgroundColor: '#111', padding: 8 },
  logLine: { color: '#0f0', fontSize: 11, fontFamily: 'monospace' },
});
