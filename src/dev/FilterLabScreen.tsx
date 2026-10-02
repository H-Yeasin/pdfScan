import { t as translate } from '../i18n';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { FontStyle, ImageFormat, Skia } from '@shopify/react-native-skia';
import type { SkImage, SkPicture } from '@shopify/react-native-skia';
import { AdjustSlider } from '../components/review/AdjustSlider';
import { FilteredPreview } from '../components/review/FilteredPreview';
import { FilterOptionsPanel } from '../components/review/FilterOptionsPanel';
import { useRouter } from '../navigation/router';
import { drawFiltered } from '../services/enhance/filters/drawFiltered';
import { FILTERS, resolveFilterParams } from '../services/enhance/filters/registry';
import type { FilterParam, FilterParamOverrides, FilterSpec } from '../services/enhance/filters/registry';
import { analyzeImage, analyzeImageUri } from '../services/enhance/filters/stats';
import { renderPage } from '../services/enhance/skiaEnhance';
import { MASTER_PRESET } from '../services/capture/imageSpec';
import { loadPreviewImage } from '../services/enhance/previewImageCache';
import { shareFileUri } from '../services/sharing/shareService';
import { useAppDispatch } from '../store/AppStateContext';
import { fontFamily, radii, spacing, typeScale, useTheme } from '../theme';
import type { EnhanceMode, FilterOptions, ImageStats } from '../types/models';
import { seedLibrary, SEED_DOCUMENTS } from './seedLibrary';

// Dev-only (reachable from Settings when __DEV__): every filter side by side on one image, with a
// slider per tunable constant (FilterSpec.params). E3-E5 tune their parameters here before
// changing a default in registry.ts, and E7 exports contact sheets from it for the benchmark.
// Overrides live only in this screen's state; the app never sees them.

const LAB_IMAGE_SIZE = 1000; // long side of the decoded image the grid and contact sheet use
const SHEET_COLUMNS = 3;
const SHEET_CELL_WIDTH = 600;
const SHEET_LABEL_HEIGHT = 64;
const SHEET_GAP = 16;

type LabImage = { uri: string; image: SkImage; stats: ImageStats; width: number; height: number };
type Timing = { label: string; ms: number };

// F5's master size (MASTER_MAX_DIM). The §2 budget is under 400 ms per exported page at this size, on a
// mid-range phone, in a release-like build (dev builds run JS much slower).
const TIMING_MASTER_SIZE = 2400;

// Times the real export path (renderPage: decode, drawFiltered at master size, JPEG encode, write)
// once per filter on a 2400 px copy of the picked image, plus the one-off page analysis that
// ingest does. Every file it writes is deleted again.
async function timeExports(uri: string, filterOptions: FilterOptions): Promise<Timing[]> {
  const master = await loadPreviewImage(uri, TIMING_MASTER_SIZE);
  const masterFile = new File(Paths.cache, `filter-lab-master-${Date.now()}.jpg`);
  masterFile.write(master.encodeToBytes(ImageFormat.JPEG, 95));
  const timings: Timing[] = [{ label: `Master ${master.width()}×${master.height()}`, ms: 0 }];
  try {
    let t0 = performance.now();
    const stats = await analyzeImageUri(masterFile.uri);
    timings.push({ label: 'Analysis (once per page, at ingest)', ms: performance.now() - t0 });
    for (const spec of FILTERS) {
      t0 = performance.now();
      const baked = await renderPage(masterFile.uri, { enhance: spec.id, stats, filterOptions }, MASTER_PRESET);
      timings.push({ label: `Export · ${translate(spec.labelKey)}`, ms: performance.now() - t0 });
      const out = new File(baked.uri);
      if (out.exists) out.delete();
    }
  } finally {
    if (masterFile.exists) masterFile.delete();
  }
  return timings;
}
type OverridesByFilter = Partial<Record<EnhanceMode, FilterParamOverrides>>;

function recordFilter(
  lab: LabImage,
  spec: FilterSpec,
  overrides: FilterParamOverrides | undefined,
  filterOptions: FilterOptions
): SkPicture {
  const recorder = Skia.PictureRecorder();
  const rect = Skia.XYWHRect(0, 0, lab.width, lab.height);
  drawFiltered(recorder.beginRecording(rect), lab.image, { enhance: spec.id, stats: lab.stats, filterOptions }, rect, overrides);
  return recorder.finishRecordingAsPicture();
}

function formatParams(spec: FilterSpec, overrides: FilterParamOverrides | undefined) {
  const params = resolveFilterParams(spec, overrides);
  return spec.params.map((p) => `${p.key}=${params[p.key].toFixed(3)}`).join('  ');
}

// The sliders are AdjustSlider's -1..1 range mapped linearly onto each param's [min, max].
const toSlider = (param: FilterParam, value: number) => ((value - param.min) / (param.max - param.min)) * 2 - 1;
const fromSlider = (param: FilterParam, v: number) => param.min + ((v + 1) / 2) * (param.max - param.min);

// One labelled JPEG of every filter, written under Paths.document/filter-lab/ (not the cache, so
// the E7 benchmark sheets survive) and handed to the share sheet.
async function exportContactSheet(lab: LabImage, overrides: OverridesByFilter, filterOptions: FilterOptions): Promise<string> {
  const cellHeight = Math.round((SHEET_CELL_WIDTH * lab.height) / lab.width);
  const rows = Math.ceil(FILTERS.length / SHEET_COLUMNS);
  const width = SHEET_COLUMNS * SHEET_CELL_WIDTH + (SHEET_COLUMNS + 1) * SHEET_GAP;
  const height = rows * (cellHeight + SHEET_LABEL_HEIGHT) + (rows + 1) * SHEET_GAP;
  const surface = Skia.Surface.MakeOffscreen(width, height);
  if (!surface) throw new Error('Skia failed to create the contact-sheet surface');
  const canvas = surface.getCanvas();
  canvas.drawColor(Skia.Color('#ffffff'));

  const textPaint = Skia.Paint();
  textPaint.setColor(Skia.Color('#1a1a1a'));
  textPaint.setAntiAlias(true);
  const system = Skia.FontMgr.System();
  const titleFont = Skia.Font(system.matchFamilyStyle('', FontStyle.Bold), 26);
  const metaFont = Skia.Font(system.matchFamilyStyle('', FontStyle.Normal), 18);

  FILTERS.forEach((spec, i) => {
    const x = SHEET_GAP + (i % SHEET_COLUMNS) * (SHEET_CELL_WIDTH + SHEET_GAP);
    const y = SHEET_GAP + Math.floor(i / SHEET_COLUMNS) * (cellHeight + SHEET_LABEL_HEIGHT + SHEET_GAP);
    const page = { enhance: spec.id, stats: lab.stats, filterOptions };
    drawFiltered(canvas, lab.image, page, Skia.XYWHRect(x, y, SHEET_CELL_WIDTH, cellHeight), overrides[spec.id]);
    canvas.drawText(spec.available ? translate(spec.labelKey) : `${translate(spec.labelKey)} (WIP)`, x, y + cellHeight + 30, textPaint, titleFont);
    canvas.drawText(formatParams(spec, overrides[spec.id]), x, y + cellHeight + 56, textPaint, metaFont);
  });

  surface.flush();
  const bytes = surface.makeImageSnapshot().encodeToBytes(ImageFormat.JPEG, 92);
  const dir = new Directory(Paths.document, 'filter-lab');
  if (!dir.exists) dir.create();
  const dest = new File(dir, `contact-${Date.now()}.jpg`);
  dest.write(bytes);
  return dest.uri;
}

export function FilterLabScreen() {
  const { tokens } = useTheme();
  const { go } = useRouter();
  const dispatch = useAppDispatch();
  const [lab, setLab] = useState<LabImage | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [timing, setTiming] = useState(false);
  // §9 O5: the dev menu's "Seed library" for the performance budget (docs/qa/performance.md).
  const [seeded, setSeeded] = useState<number | null>(null);
  const handleSeed = useCallback(async () => {
    setSeeded(0);
    try {
      await seedLibrary(dispatch, setSeeded);
      dispatch({ type: 'ui/SHOW_SNACK', msg: `Seeded ${SEED_DOCUMENTS} documents` });
    } catch (e) {
      console.warn('seedLibrary failed', e);
      dispatch({ type: 'ui/SHOW_SNACK', msg: 'Seeding failed' });
    } finally {
      setSeeded(null);
    }
  }, [dispatch]);
  const [timings, setTimings] = useState<Timing[] | null>(null);
  const [selected, setSelected] = useState<EnhanceMode>('auto');
  const [overrides, setOverrides] = useState<OverridesByFilter>({});
  // Shared by every cell (Ink and Board read them), like a page's FilterOptions.
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({});

  const handlePick = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (result.canceled || result.assets.length === 0) return;
    setLoading(true);
    try {
      const image = await loadPreviewImage(result.assets[0].uri, LAB_IMAGE_SIZE);
      setLab({ uri: result.assets[0].uri, image, stats: analyzeImage(image), width: image.width(), height: image.height() });
      setTimings(null);
    } catch (error) {
      dispatch({ type: 'ui/SHOW_SNACK', msg: `Couldn't open image: ${String(error)}` });
    } finally {
      setLoading(false);
    }
  }, [dispatch]);

  const pictures = useMemo(
    () => (lab ? FILTERS.map((spec) => ({ spec, picture: recordFilter(lab, spec, overrides[spec.id], filterOptions) })) : []),
    [lab, overrides, filterOptions]
  );

  const selectedSpec = FILTERS.find((spec) => spec.id === selected) ?? FILTERS[0];
  const selectedValues = resolveFilterParams(selectedSpec, overrides[selected]);

  const setParam = (key: string, value: number) =>
    setOverrides((prev) => ({ ...prev, [selected]: { ...prev[selected], [key]: value } }));

  const handleExport = useCallback(async () => {
    if (!lab) return;
    setExporting(true);
    try {
      const uri = await exportContactSheet(lab, overrides, filterOptions);
      await shareFileUri(uri, 'image/jpeg', 'Filter Lab contact sheet');
    } catch (error) {
      dispatch({ type: 'ui/SHOW_SNACK', msg: `Export failed: ${String(error)}` });
    } finally {
      setExporting(false);
    }
  }, [lab, overrides, filterOptions, dispatch]);

  const handleTime = useCallback(async () => {
    if (!lab) return;
    setTiming(true);
    try {
      setTimings(await timeExports(lab.uri, filterOptions));
    } catch (error) {
      dispatch({ type: 'ui/SHOW_SNACK', msg: `Timing failed: ${String(error)}` });
    } finally {
      setTiming(false);
    }
  }, [lab, filterOptions, dispatch]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tokens.bg }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={() => go('settings', 'back')}>
          <Ionicons name="chevron-back" size={20} color={tokens.ink} />
        </Pressable>
        <Text style={[styles.title, { color: tokens.ink }]}>Filter Lab</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.actions}>
          <Pressable
            style={[styles.button, { backgroundColor: tokens.surface2, borderColor: tokens.edge }]}
            onPress={handleSeed}
            disabled={seeded !== null}
          >
            <Ionicons name="library-outline" size={16} color={tokens.ink} />
            <Text style={[styles.buttonLabel, { color: tokens.ink }]}>
              {seeded === null ? `Seed library (${SEED_DOCUMENTS} docs)` : `Seeding ${seeded}/${SEED_DOCUMENTS}…`}
            </Text>
          </Pressable>
          <Pressable style={[styles.button, { backgroundColor: tokens.accent }]} onPress={handlePick}>
            <Ionicons name="image-outline" size={16} color={tokens.surface} />
            <Text style={[styles.buttonLabel, { color: tokens.surface }]}>{lab ? 'Change image' : 'Pick image'}</Text>
          </Pressable>
          {lab && (
            <Pressable
              style={[styles.button, { backgroundColor: tokens.surface2, borderColor: tokens.edge }]}
              onPress={handleExport}
              disabled={exporting}
            >
              {exporting ? (
                <ActivityIndicator size="small" color={tokens.ink} />
              ) : (
                <Ionicons name="grid-outline" size={16} color={tokens.ink} />
              )}
              <Text style={[styles.buttonLabel, { color: tokens.ink }]}>Export contact sheet</Text>
            </Pressable>
          )}
          {lab && (
            <Pressable
              style={[styles.button, { backgroundColor: tokens.surface2, borderColor: tokens.edge }]}
              onPress={handleTime}
              disabled={timing}
            >
              {timing ? (
                <ActivityIndicator size="small" color={tokens.ink} />
              ) : (
                <Ionicons name="stopwatch-outline" size={16} color={tokens.ink} />
              )}
              <Text style={[styles.buttonLabel, { color: tokens.ink }]}>Time 2400 px export</Text>
            </Pressable>
          )}
        </View>

        {timings && (
          <View style={[styles.params, { backgroundColor: tokens.surface2, borderColor: tokens.edge }]}>
            <Text style={[styles.paramsTitle, { color: tokens.ink }]}>Export timing (budget: 400 ms per page)</Text>
            {timings.map((t) => (
              <View key={t.label} style={styles.timingRow}>
                <Text style={{ color: tokens.ink, flex: 1 }}>{t.label}</Text>
                {t.ms > 0 && (
                  <Text style={{ color: t.ms > 400 && t.label.startsWith('Export') ? tokens.danger : tokens.ink, fontWeight: '600' }}>
                    {Math.round(t.ms)} ms
                  </Text>
                )}
              </View>
            ))}
            {__DEV__ && (
              <Text style={{ color: tokens.muted, fontSize: 12 }}>
                Dev build: JS is unoptimized, so treat these as upper bounds. The budget is for a release build.
              </Text>
            )}
          </View>
        )}

        {loading && <ActivityIndicator color={tokens.accent} />}

        {lab && (
          <View style={styles.grid}>
            {pictures.map(({ spec, picture }) => {
              const active = spec.id === selected;
              return (
                <Pressable
                  key={spec.id}
                  onPress={() => setSelected(spec.id)}
                  style={[
                    styles.cell,
                    { borderColor: active ? tokens.accent : tokens.edge, backgroundColor: tokens.surface2 },
                  ]}
                >
                  <View style={{ aspectRatio: lab.width / lab.height }}>
                    <FilteredPreview picture={picture} contentWidth={lab.width} contentHeight={lab.height} />
                  </View>
                  <Text style={[styles.cellLabel, { color: active ? tokens.accent : tokens.ink }]}>
                    {spec.available ? translate(spec.labelKey) : `${translate(spec.labelKey)} (WIP)`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {lab && (
          <View style={[styles.params, { backgroundColor: tokens.surface2, borderColor: tokens.edge }]}>
            <Text style={[styles.paramsTitle, { color: tokens.ink }]}>{translate(selectedSpec.labelKey)} parameters</Text>
            <FilterOptionsPanel
              mode={selectedSpec.id}
              value={filterOptions}
              onChange={(next) => setFilterOptions((prev) => ({ ...prev, ...next }))}
            />
            {selectedSpec.params.length === 0 && (
              <Text style={{ color: tokens.muted }}>This filter has no tunable parameters yet.</Text>
            )}
            {selectedSpec.params.map((param) => (
              <AdjustSlider
                key={param.key}
                label={`${param.label}: ${selectedValues[param.key].toFixed(3)} (default ${param.default})`}
                value={toSlider(param, selectedValues[param.key])}
                onChange={(v) => setParam(param.key, fromSlider(param, v))}
                onCommit={(v) => setParam(param.key, fromSlider(param, v))}
              />
            ))}
            {selectedSpec.params.length > 0 && (
              <Pressable
                style={styles.reset}
                onPress={() => setOverrides((prev) => ({ ...prev, [selected]: undefined }))}
                hitSlop={6}
              >
                <Ionicons name="refresh-outline" size={13} color={tokens.muted} />
                <Text style={{ color: tokens.muted, fontSize: 12, fontWeight: '600' }}>Reset to defaults</Text>
              </Pressable>
            )}
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
    fontFamily: fontFamily.heading,
    fontSize: typeScale.title.fontSize + 4,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
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
    borderColor: 'transparent',
  },
  buttonLabel: {
    fontSize: typeScale.label.fontSize,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  cell: {
    width: '48%',
    borderRadius: radii.card,
    borderWidth: 2,
    overflow: 'hidden',
  },
  cellLabel: {
    fontSize: 13,
    fontWeight: '600',
    padding: spacing.xs,
    textAlign: 'center',
  },
  params: {
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    gap: spacing.xs,
  },
  paramsTitle: {
    fontFamily: fontFamily.heading,
    fontSize: 16,
    marginBottom: spacing.xs,
  },
  timingRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  reset: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 4,
  },
});
