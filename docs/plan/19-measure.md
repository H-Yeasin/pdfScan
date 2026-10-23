# §19 Measure on the students' phones: step-by-step plan

## How to use this file
- Implement **one step per session** ("Do X2 from docs/plan/19-measure.md with these results").
- Read `AGENTS.md`, `docs/plan/README.md`, and only the step you are working on.
- When a step is done, update its `Status:` line, add "As built" notes, and update `docs/plan/README.md`
  and `docs/PLAN.md` §19.
- Step prefix **X** (experiment). The other letters are taken (F C E K S T L R B O M H Q V D G U W, and
  the phases P0–P4).
- §19 runs alongside the device checks of §14–§18 (same phones, same builds) and comes before §11. It
  doesn't replace those checks; it gives them instruments and numbers.

## Context
**Planned 2026-10-23.** The owner asked to "improve performance and UX", then for the deeper version
of that: measure the three journeys that are the product, on the phone a Bangladeshi student actually
owns, and keep only the changes that device numbers and real students show are better. On 2026-10-23
every table in `docs/qa/performance.md` and the log in `docs/qa/walkthrough.md` was still empty, about
39 device checks were open, and several steps had never run on a phone (§16 G6, G7; §17 U7–U11; §18
W15, W16, W19–W22). §16–§18 were planned from reading the code; §19 is the evidence.

Not wanted: generic React Native advice, optimisations without a measured before/after, new features,
a survey of every file.

## The journeys (only these)
- **J1 First scan to the teacher.** Cold start → Scan 5 handwritten pages → Review (crop one, change a
  filter) → Save → Submit to WhatsApp, the file named with the roll number. Timed half: 20 photos
  through Home → Import photos (`.maestro/j1-gallery-scan.yaml`); the scanner half by hand, 5 times, on
  a screen recording.
- **J2 Find it again.** Cold start with the 500-document seed with word boxes → Files → search a word
  from a page → open it (`.maestro/j2-find.yaml`).
- **J3 Read a big PDF.** Open the 300-page imported PDF → fling → Find a word → highlight → Share, the
  export carrying the mark (`.maestro/j3-big-pdf.yaml`).

**Phones:** (a) a 2–3 GB entry Android phone, the kind most students carry; (b) the ~4 GB phone of
`docs/qa/performance.md`. **Builds:** release, profileable (`scripts/perf/README.md`), one named commit
per row. Record the phone, its Android version and the commit with every number.

## Steps

### X1 Instruments
**Status:** done in code (2026-10-23, 5749d1a and the commit after it); device check open. Needs a new
build (`modules/pdf-native` gained functions; a profileable build needs `PDFSCAN_PROFILEABLE=1` at
prebuild).

As built:
- `src/utils/trace.ts`: `traceMark(name)`, `traceBegin(name)` → end function, `traced(name, job)`,
  `reportFullyDrawn()`. They reach `android.os.Trace` through `modules/pdf-native` (`traceBegin`,
  `traceEnd`, `traceMark`, `reportFullyDrawn`, Android only; missing in older builds, iOS and Jest, and
  then every call does nothing). Names come from the trace vocabulary in `docs/qa/performance.md` §19
  and never carry document text. Test: `src/utils/__tests__/trace.test.ts`.
- The marks: boot (`boot.firstScreen` in AppNavigator, `boot.usable` + `reportFullyDrawn()` when the
  splash intro is gone, `boot.loadLibrary`), every navigation (`router.tsx`: `nav.<screen>`,
  `tab.<tab>`, `nav.back`), the scan (`ingestBatch.ts`: `scan.batch`, `scan.page`, `scan.firstPage`,
  `scan.readPage`), the save (`saveScan.ts`: `save`, `save.render`, `save.ocr`, `save.pdf`,
  `save.files`), the Reader (`pdf.open` in `pdfNative.openDocument`, `reader.render` and
  `reader.firstImage` in `useRenderQueue`), Files search (`files.search`).
- `plugins/withProfileable.js`: `<profileable android:shell="true"/>` only when prebuilt with
  `PDFSCAN_PROFILEABLE=1`.
- `testID`s the flows need: `files-search` (header action, `HeaderAction.testID`),
  `files-search-input`, `reader-pages`, `reader-find`, `reader-find-input`, `reader-find-next`,
  `reader-more`, `reader-tool-<id>`, `select-<item>`, `crop-auto`, `crop-confirm`, `filter-<id>`.
- `.maestro/`: the three flows and `pick-photos.example.yaml` (each phone's picker taps go in
  `.maestro/local/`, not committed).
- `scripts/perf/`: `README.md` (tools, build, setup, the runs), `perfetto.pbtx` + `trace.sh`,
  `cold-start.sh`, `frames.sh`, `meminfo.sh`, `storage.sh`, `run-journey.sh` (Flashlight),
  `make-fixtures.mjs` (the 300-page PDF), `push-fixtures.sh`. Results go to `perf-results/` (not
  committed); the numbers go into `docs/qa/performance.md` by hand.
- `docs/qa/walkthrough.md` brought up to the current shell (Files, Me, Save → Done, no Capture screen).

Checked off the phone: typecheck and Jest; the Kotlin compiles (`:pdf-native:compileDebugKotlin`); the
Perfetto config records on an Android 16 emulator; the scripts parse under macOS's bash 3.2; the
fixture has 300 pages, 30 outline entries, 30 contents links and the Find words where they should be.
Not yet run: the Maestro flows and Flashlight (not installed on the build machine), and anything on a
real phone.

Device check: on phone (a), with a profileable release build of one commit: `cold-start.sh 1` logs
"Fully drawn"; a `trace.sh` of J2 shows `pdfscan.nav.library`, `pdfscan.files.search`,
`pdfscan.nav.reader` and `pdfscan.reader.firstImage` in ui.perfetto.dev; the three flows pass (J1 with
the phone's own `local/pick-photos.yaml`); `meminfo.sh`, `frames.sh` and `storage.sh` (dev build) each
write their file.

### X2 Baselines and the ranked problem list
**Status:** open. Needs X1's device check, then the runs below; the owner runs them and hands the
`perf-results/` files to the session.

1. On (a) and (b): the cold start (10 runs), J1–J3 under Flashlight (10 runs each) with one trace each,
   J1 through the real scanner by hand (5 times, recorded), the stress runs, storage per page, the APK
   size. Fill the §19 tables in `docs/qa/performance.md`.
2. From the data, a ranked list under "X2: what the numbers say" below. Each item: journey and step;
   the measured cost (ms, jank %, MB, or the failure); the trace evidence (thread and slice); the likely
   cause (`file:line`); the expected gain. Rank by the seconds the student feels × how often the step
   happens. **Failures rank above slowness:** a lost scan, storage full, an out-of-memory kill, an ANR.

### X3 Fix the top three
**Status:** open, after X2.

One fix at a time. After each, the same flow, the same run count, the same phone and build settings.
Keep a change only if its median moves outside the before-IQR (the rule in performance.md §19). Each
kept fix gets a guard that fails on its own, like `src/__tests__/bootImports.test.ts`, and its rows in
performance.md.

### X4 The usability study
**Status:** the kit is done in code (`docs/qa/usability-study.md`, 2026-10-23); the rounds are open
(the owner runs them).

Five students per round, think-aloud, J1–J3 in English or Bangla, on their own phones. One variant to
test: scanning before onboarding's name, roll number and course questions. After a round: a findings
table (problem, how many of 5 hit it, severity), the fixes, then the next five.

## X2: what the numbers say
*(Filled in by X2.)*

## Verification (§19 is done when)
On phone (a): every budget in `docs/qa/performance.md`, plus "tap feedback under 100 ms" and "an
unsaved scan survives the app being killed", is met or has a written reason; 4 of 5 first-time
students finish J1 unaided in under 90 s; the Play Console pre-launch report of an internal-testing
upload shows no crashes or ANRs.
