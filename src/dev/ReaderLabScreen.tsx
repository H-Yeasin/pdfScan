import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { useRouter } from '../navigation/router';
import {
  decodeImage,
  getPageText,
  pdfNativeVersion,
  renderPage,
  type PdfColorMatrix,
  type PdfLink,
  type PdfMatrix,
  type PdfOutlineItem,
} from '../services/pdf/pdfNative';
import { acquirePdfSession, type PdfSession } from '../services/pdf/pdfSession';
import { fontFamily, radii, spacing, typeScale, useTheme } from '../theme';

// Dev-only (Settings → Developer when __DEV__), §18 W7: pdf-native version 2 on a real phone,
// before the page surface is built on it. It answers the step's device checks: how long a page and
// a 4× tile take, whether pdfium draws annotations the old renderPage doesn't, whether a password
// PDF opens, whether sizes and tiles are right on a turned page, what links and outline come back,
// and whether the orientation unlock works while app.json says "portrait". The numbers go in
// docs/qa/performance.md.
//
// The tile matrix and the night matrix here are stand-ins: W9 owns the real ones
// (services/reader/renderPlan.ts, darkMatrix.ts).

const LAB_DIR = 'reader-lab';
const PAGE_WIDTH = 1080; // px: a page fitted to a typical phone's width
const TILE = 1080; // px: one square tile
const TILE_ZOOM = 4;
const RUNS = 3;
const OPEN_BUDGET_MS = 150;
const QUALITY = 0.85;

// Inverts the colours, to see that a colour matrix is applied at all.
const INVERT: PdfColorMatrix = [-1, 0, 0, 0, 255, 0, -1, 0, 0, 255, 0, 0, -1, 0, 255, 0, 0, 0, 1, 0];

type Row = { label: string; value: string; bad?: boolean };
type Shot = { label: string; uri: string; width: number; height: number };

let fileCount = 0;
// A new name each time: the Image component caches by uri.
function labOut(name: string): string {
  fileCount += 1;
  return new File(Paths.cache, LAB_DIR, `${name}-${fileCount}.jpg`).uri;
}

function ms(value: number): string {
  return `${Math.round(value)} ms`;
}

async function timed<T>(run: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const t0 = performance.now();
  const value = await run();
  return { ms: performance.now() - t0, value };
}

// The middle TILE × TILE px of the page as it would be at `zoom` × fit-to-width.
function tileMatrix(pointsW: number, pointsH: number, zoom: number): PdfMatrix {
  const scale = (zoom * PAGE_WIDTH) / pointsW;
  return [scale, 0, 0, scale, -(pointsW * scale - TILE) / 2, -(pointsH * scale - TILE) / 2];
}

function describe(error: unknown): string {
  const e = error as { name?: string; code?: string; message?: string } | null;
  return [e?.name, e?.code, e?.message].filter(Boolean).join(' · ') || String(error);
}

function flatten(items: PdfOutlineItem[], depth = 0): { title: string; page?: number; depth: number }[] {
  return items.flatMap((item) => [{ title: item.title, page: item.page, depth }, ...flatten(item.children, depth + 1)]);
}

function imageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => Image.getSize(uri, (width, height) => resolve({ width, height }), reject));
}

export function ReaderLabScreen() {
  const { tokens } = useTheme();
  const { back } = useRouter();
  const [file, setFile] = useState<{ uri: string; name: string } | null>(null);
  const [password, setPassword] = useState('');
  const [pageText, setPageText] = useState('1');
  const [session, setSession] = useState<PdfSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [shots, setShots] = useState<Shot[]>([]);
  const [links, setLinks] = useState<PdfLink[] | null>(null);
  const [outline, setOutline] = useState<PdfOutlineItem[] | null>(null);
  const held = useRef<PdfSession | null>(null);
  const turned = useRef(false);

  const add = useCallback((...more: Row[]) => setRows((current) => [...current, ...more]), []);

  const release = useCallback(() => {
    held.current?.release();
    held.current = null;
    setSession(null);
  }, []);

  useEffect(
    () => () => {
      held.current?.release();
      const dir = new Directory(Paths.cache, LAB_DIR);
      if (dir.exists) dir.delete();
      // Leave the app as app.json has it.
      if (!turned.current) return;
      const orientation = require('expo-screen-orientation') as typeof import('expo-screen-orientation');
      orientation.lockAsync(orientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
    },
    []
  );

  // One job at a time; whatever it throws becomes a row (the error's class and code are the answer
  // to the password checks).
  const job = useCallback(
    async (label: string, run: () => Promise<void>) => {
      setBusy(true);
      try {
        await run();
      } catch (error) {
        add({ label, value: describe(error), bad: true });
      } finally {
        setBusy(false);
      }
    },
    [add]
  );

  const pageIndex = Math.max(0, Math.min((session?.pageCount ?? 1) - 1, (parseInt(pageText, 10) || 1) - 1));

  const handlePick = () =>
    job('Pick', async () => {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
      if (result.canceled) return;
      release();
      setFile({ uri: result.assets[0].uri, name: result.assets[0].name });
      setRows([]);
      setShots([]);
      setLinks(null);
      setOutline(null);
    });

  const handleOpen = () =>
    job('Open', async () => {
      if (!file) return;
      // Released first, so this is a real native open and not a second reference.
      release();
      const opened = await timed(() => acquirePdfSession(file.uri, password || undefined));
      held.current = opened.value;
      setSession(opened.value);
      const first = opened.value.pages[0];
      add(
        { label: `Open · ${opened.value.pageCount} pages`, value: ms(opened.ms), bad: opened.ms > OPEN_BUDGET_MS },
        { label: 'Page 1 size (shown points)', value: first ? `${first.width.toFixed(2)} × ${first.height.toFixed(2)}` : 'none' },
        { label: 'Outline', value: opened.value.hasOutline ? 'yes' : 'no' }
      );
    });

  const handleTime = () =>
    job('Time', async () => {
      if (!session || !file) return;
      const size = session.pages[pageIndex];
      const height = Math.round((PAGE_WIDTH * size.height) / size.width);
      add({ label: `Page ${pageIndex + 1} · ${size.width.toFixed(2)} × ${size.height.toFixed(2)} pt`, value: '' });
      const taken: Shot[] = [];
      for (let run = 1; run <= RUNS; run += 1) {
        const page = await timed(() =>
          session.renderPage(pageIndex, { width: PAGE_WIDTH, height, annotations: true, quality: QUALITY, out: labOut('page') })
        );
        add({ label: `Page at ${PAGE_WIDTH} × ${height} px, run ${run}`, value: ms(page.ms) });
        if (run === RUNS) taken.push({ label: 'Page', ...page.value });
      }
      for (let run = 1; run <= RUNS; run += 1) {
        const tile = await timed(() =>
          session.renderPage(pageIndex, {
            width: TILE,
            height: TILE,
            matrix: tileMatrix(size.width, size.height, TILE_ZOOM),
            annotations: true,
            quality: QUALITY,
            out: labOut('tile'),
          })
        );
        add({ label: `${TILE_ZOOM}× tile, ${TILE} px, run ${run}`, value: ms(tile.ms) });
        if (run === RUNS) taken.push({ label: `${TILE_ZOOM}× tile (page centre)`, ...tile.value });
      }
      const text = await timed(() => session.pageText(pageIndex));
      add({ label: `Session text · ${text.value.words.length} words`, value: ms(text.ms) });
      // Version 1 on the same page, for comparison: both reopen the file. They fail on a password
      // PDF, which is expected.
      try {
        const old = await timed(() => renderPage(file.uri, pageIndex, { maxDim: Math.max(PAGE_WIDTH, height), quality: QUALITY }));
        add({ label: 'Old renderPage (reopens the file)', value: ms(old.ms) });
        new File(old.value.uri).delete();
        const oldText = await timed(() => getPageText(file.uri, pageIndex));
        add({ label: 'Old getPageText (reopens the file)', value: ms(oldText.ms) });
      } catch (error) {
        add({ label: 'Old renderPage / getPageText', value: describe(error) });
      }
      setShots(taken);
    });

  const handleAnnotations = () =>
    job('Annotations', async () => {
      if (!session || !file) return;
      const size = session.pages[pageIndex];
      const width = PAGE_WIDTH / 2;
      const height = Math.round((width * size.height) / size.width);
      const base = { width, height, quality: QUALITY };
      const on = await session.renderPage(pageIndex, { ...base, annotations: true, out: labOut('annot-on') });
      const off = await session.renderPage(pageIndex, { ...base, annotations: false, out: labOut('annot-off') });
      const night = await session.renderPage(pageIndex, { ...base, annotations: true, colorMatrix: INVERT, out: labOut('night') });
      const taken: Shot[] = [
        { label: 'pdfium, annotations on', ...on },
        { label: 'pdfium, annotations off', ...off },
        { label: 'pdfium, colour matrix (inverted)', ...night },
      ];
      try {
        taken.push({ label: 'Old renderPage', ...(await renderPage(file.uri, pageIndex, { maxDim: Math.max(width, height), quality: QUALITY })) });
      } catch (error) {
        add({ label: 'Old renderPage', value: describe(error) });
      }
      setShots(taken);
    });

  const handleLinks = () =>
    job('Links', async () => {
      if (!session) return;
      const found = await timed(() => session.pageLinks(pageIndex));
      const contents = await timed(() => session.outline());
      add(
        { label: `Links on page ${pageIndex + 1} · ${found.value.length}`, value: ms(found.ms) },
        { label: `Outline · ${flatten(contents.value).length} entries`, value: ms(contents.ms) }
      );
      setLinks(found.value);
      setOutline(contents.value);
    });

  const handleImage = () =>
    job('Decode', async () => {
      const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
      if (result.canceled) return;
      const uri = result.assets[0].uri;
      const source = await imageSize(uri);
      const height = Math.round((PAGE_WIDTH * source.height) / source.width);
      const whole = await timed(() => decodeImage(uri, { width: PAGE_WIDTH, height, quality: QUALITY, out: labOut('decode') }));
      // The middle quarter of the source's width, as a square tile.
      const side = Math.min(source.width, source.height) / TILE_ZOOM;
      const region = { x: (source.width - side) / 2, y: (source.height - side) / 2, width: side, height: side };
      const tile = await timed(() => decodeImage(uri, { width: TILE, height: TILE, region, quality: QUALITY, out: labOut('decode-tile') }));
      add(
        { label: `Image ${source.width} × ${source.height} → ${PAGE_WIDTH} × ${height} px`, value: ms(whole.ms) },
        { label: `Image region ${Math.round(side)} px → ${TILE} px tile`, value: ms(tile.ms) }
      );
      setShots([
        { label: 'decodeImage, whole', ...whole.value },
        { label: 'decodeImage, region', ...tile.value },
      ]);
    });

  const handleOrientation = (unlock: boolean) =>
    job('Orientation', async () => {
      // Required here, not imported: a build without the module can still open the lab.
      const orientation = require('expo-screen-orientation') as typeof import('expo-screen-orientation');
      turned.current = true;
      if (unlock) await orientation.unlockAsync();
      else await orientation.lockAsync(orientation.OrientationLock.PORTRAIT_UP);
      const lock = await orientation.getOrientationLockAsync();
      add({
        label: unlock ? 'Rotation unlocked: turn the phone' : 'Rotation locked to portrait',
        value: `lock ${orientation.OrientationLock[lock]}`,
      });
    });

  const version = pdfNativeVersion();
  const button = (label: string, icon: keyof typeof Ionicons.glyphMap, onPress: () => void, enabled = true) => (
    <Pressable
      style={[styles.button, { backgroundColor: tokens.surface2, borderColor: tokens.edge, opacity: enabled && !busy ? 1 : 0.4 }]}
      onPress={onPress}
      disabled={!enabled || busy}
    >
      <Ionicons name={icon} size={16} color={tokens.ink} />
      <Text style={[styles.buttonLabel, { color: tokens.ink }]}>{label}</Text>
    </Pressable>
  );
  const input = [styles.input, { color: tokens.ink, borderColor: tokens.edge, backgroundColor: tokens.surface2 }];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tokens.bg }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={back}>
          <Ionicons name="chevron-back" size={20} color={tokens.ink} />
        </Pressable>
        <Text style={[styles.title, { color: tokens.ink }]}>Reader Lab</Text>
        {busy && <ActivityIndicator color={tokens.accent} />}
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={{ color: version >= 2 ? tokens.muted : tokens.danger }}>
          {version >= 2
            ? `pdf-native version ${version}`
            : `pdf-native version ${version}: this build has no sessions. Make a new dev build.`}
        </Text>
        <Text style={{ color: tokens.ink }} numberOfLines={1}>
          {file ? file.name : 'No PDF picked'}
        </Text>

        <View style={styles.actions}>
          <TextInput
            style={[input, styles.grow]}
            value={password}
            onChangeText={setPassword}
            placeholder="Password (if any)"
            placeholderTextColor={tokens.muted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={[input, styles.pageInput]}
            value={pageText}
            onChangeText={setPageText}
            placeholder="Page"
            placeholderTextColor={tokens.muted}
            keyboardType="number-pad"
          />
        </View>

        <View style={styles.actions}>
          {button(file ? 'Change PDF' : 'Pick PDF', 'document-outline', handlePick)}
          {button('Open', 'lock-open-outline', handleOpen, !!file)}
          {button('Time page + tile', 'stopwatch-outline', handleTime, !!session)}
          {button('Annotations on / off', 'color-wand-outline', handleAnnotations, !!session)}
          {button('Links + outline', 'link-outline', handleLinks, !!session)}
          {button('Decode an image', 'image-outline', handleImage)}
          {button('Unlock rotation', 'phone-landscape-outline', () => handleOrientation(true))}
          {button('Lock portrait', 'phone-portrait-outline', () => handleOrientation(false))}
          {button('Clear', 'trash-outline', () => setRows([]), rows.length > 0)}
        </View>

        {rows.length > 0 && (
          <View style={[styles.card, { backgroundColor: tokens.surface2, borderColor: tokens.edge }]}>
            {__DEV__ && (
              <Text style={{ color: tokens.muted, fontSize: 12 }}>
                Native time plus the bridge. Record a release-like build's numbers in docs/qa/performance.md.
              </Text>
            )}
            {rows.map((row, index) => (
              <View key={index} style={styles.row}>
                <Text style={[styles.grow, { color: tokens.ink }]}>{row.label}</Text>
                <Text style={[styles.rowValue, { color: row.bad ? tokens.danger : tokens.ink }]}>{row.value}</Text>
              </View>
            ))}
          </View>
        )}

        {shots.length > 0 && (
          <View style={styles.shots}>
            {shots.map((shot) => (
              <View key={shot.uri} style={[styles.shot, { borderColor: tokens.edge, backgroundColor: tokens.surface2 }]}>
                <Image source={{ uri: shot.uri }} style={{ width: '100%', aspectRatio: shot.width / shot.height }} resizeMode="contain" />
                <Text style={[styles.shotLabel, { color: tokens.ink }]}>
                  {shot.label} · {shot.width} × {shot.height}
                </Text>
              </View>
            ))}
          </View>
        )}

        {links && (
          <View style={[styles.card, { backgroundColor: tokens.surface2, borderColor: tokens.edge }]}>
            <Text style={[styles.cardTitle, { color: tokens.ink }]}>Links on page {pageIndex + 1}</Text>
            {links.length === 0 && <Text style={{ color: tokens.muted }}>None</Text>}
            {links.slice(0, 40).map((link, index) => (
              <Text key={index} style={{ color: tokens.ink, fontSize: 12 }}>
                {Math.round(link.left)}, {Math.round(link.top)} · {Math.round(link.width)} × {Math.round(link.height)} →{' '}
                {link.uri ?? `page ${(link.page ?? 0) + 1}`}
              </Text>
            ))}
          </View>
        )}

        {outline && (
          <View style={[styles.card, { backgroundColor: tokens.surface2, borderColor: tokens.edge }]}>
            <Text style={[styles.cardTitle, { color: tokens.ink }]}>Outline</Text>
            {outline.length === 0 && <Text style={{ color: tokens.muted }}>None</Text>}
            {flatten(outline)
              .slice(0, 60)
              .map((item, index) => (
                <Text key={index} style={{ color: tokens.ink, fontSize: 12, paddingLeft: item.depth * spacing.md }}>
                  {item.title || '(no title)'} · {item.page === undefined ? 'no page' : `page ${item.page + 1}`}
                </Text>
              ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontFamily: fontFamily.heading,
    fontSize: typeScale.title.fontSize + 4,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    height: 40,
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  buttonLabel: {
    fontSize: typeScale.label.fontSize,
    fontWeight: '600',
  },
  input: {
    height: 44,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
  },
  grow: {
    flex: 1,
  },
  pageInput: {
    width: 80,
  },
  card: {
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardTitle: {
    fontFamily: fontFamily.heading,
    fontSize: 16,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  rowValue: {
    fontWeight: '600',
    maxWidth: '55%',
    textAlign: 'right',
  },
  shots: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  shot: {
    width: '48%',
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  shotLabel: {
    fontSize: 12,
    fontWeight: '600',
    padding: spacing.xs,
    textAlign: 'center',
  },
});
