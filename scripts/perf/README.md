# Measuring the three journeys (§19)

How to get the numbers for `docs/qa/performance.md` §19 from a real phone. Why these journeys, and
what happens with the numbers: `docs/plan/19-measure.md`. Everything here runs on your computer
against one phone over `adb`; results go to `perf-results/<date>/<commit>/`, which isn't committed.

**Before anything:** check the tree for the hidden payload (AGENTS.md, Security): no `api.js`, the
`start` script is `expo start`, and no config file has a very long line. These scripts run `adb`,
`maestro` and `flashlight`, never `npm start` or the tests.

## Tools (once)

- **adb**: with the Android SDK (`adb devices` lists the phone; USB debugging on).
- **Maestro** (drives the app): `brew tap mobile-dev-inc/tap && brew install maestro`. `maestro studio`
  shows the ids on screen.
- **Flashlight** (CPU per thread, FPS and RAM while a flow runs): see https://docs.flashlight.dev for the
  current install (an install script; read it before you run it).
- **Perfetto UI**: https://ui.perfetto.dev in a browser. A trace opened there stays in the browser.

## The build

A **release** build, so the numbers are the students' (a dev build runs everything slower). Made
**profileable**, so Perfetto's CPU and heap profilers and simpleperf can look inside it
(`plugins/withProfileable.js`; the build that goes to Play is made without the variable).

```sh
PDFSCAN_PROFILEABLE=1 npx expo prebuild --clean --platform android
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a && cd ..
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

- A 2 GB phone may run 32-bit Android: `adb shell getprop ro.product.cpu.abilist`. Without `arm64-v8a`
  in it, build with `-PreactNativeArchitectures=armeabi-v7a`.
- The release build is signed with the debug key unless you changed `signingConfigs` (`docs/build.md`
  §8), so it installs over a dev build of the same commit and keeps its data. If `adb install` says
  `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, the two are signed differently.
- Write the commit (`git rev-parse --short HEAD`) and the APK size with every row.

## Setup (once per phone)

1. **The library for J2:** install a **dev** build of the same commit, Me → Developer → Filter Lab →
   **Seed with word boxes**, wait for it to finish; then install the release build over it.
2. **The test files:**
   - `node scripts/perf/make-fixtures.mjs` writes `perf-fixtures/pdfscan-300p.pdf` (300 pages of text and
     images, an outline, contents links; the same file every time). A real textbook is fine too; write
     down which.
   - Take 20 photos of the same 20 sheets (handwritten notes, in ordinary room light) once, and keep them
     in `perf-fixtures/photos/`. Every J1 run uses these.
   - `scripts/perf/push-fixtures.sh` puts both on the phone.
3. **Import the PDF** in the app: Files → Import → Download → `pdfscan-300p.pdf`, and wait until its row
   stops showing indexing progress.
4. **The photo picker's taps for J1:** `mkdir -p .maestro/local && cp .maestro/pick-photos.example.yaml
   .maestro/local/pick-photos.yaml`, then open the picker by hand with `maestro studio` running and
   correct the ids for this phone.
5. Phone settings for every run: battery above 50 % and not charging hot, Wi-Fi on, the same brightness,
   no other app in the background. For the comparable cold-start rows also Developer options → "Remove
   animations" on (the splash intro then doesn't play).

## The runs

Each script prints the phone, its Android version and the commit, and where it saved the raw file.

| What | Command | Into performance.md §19 |
|---|---|---|
| Cold start, 10 times (throw away one run first: `cold-start.sh 1`) | `scripts/perf/cold-start.sh 10` | Fully drawn / TotalTime |
| J2, 10 times under Flashlight | `scripts/perf/run-journey.sh j2-find` | CPU, FPS, RAM |
| J2, one trace | `scripts/perf/trace.sh j2 40 -- maestro test .maestro/j2-find.yaml` | search answer, tap → first image |
| J3, 10 times, one trace | `run-journey.sh j3-big-pdf`, then `trace.sh j3 90 -- maestro test .maestro/j3-big-pdf.yaml` | open → first image, cold / warm |
| J1 timed, 10 times, one trace | `run-journey.sh j1-gallery-scan`, then `trace.sh j1 240 -- maestro test .maestro/j1-gallery-scan.yaml` | photos → first page / all 20, Save → Done |
| J1 by hand (the real scanner, Submit to WhatsApp), 5 times | `adb shell screenrecord /sdcard/j1.mp4` while you do it; `trace.sh j1-scanner 180` for one of them | scanner Save → Review, Submit sent |
| Files scroll | `scripts/perf/frames.sh files-scroll 10`, then fling Files top to bottom and back | jank %, p90 |
| J3 fling | `frames.sh j3-fling 10` while flinging the open PDF | jank % |
| Memory | `scripts/perf/meminfo.sh save20 180` during J1's save; `meminfo.sh reader 60` while flinging J3 | peak PSS |
| Storage per page | the **dev** build: `scripts/perf/storage.sh` after saving the 20-page scan | KB per page |
| Stress runs | by hand, `performance.md` §19 "Stress runs" | that table |

Compare two Flashlight results (before and after a change, or phone (a) against (b)):
`flashlight report perf-results/…/a/j2-find.json perf-results/…/b/j2-find.json`.

## Reading a trace

Open the `.perfetto-trace` in ui.perfetto.dev, find the app's process, search `pdfscan.`. The names and
what each one brackets are in `performance.md` §19 "Trace vocabulary". For a slow step, look between its
two marks at the app's main thread (input, `Choreographer#doFrame`), `mqt_js` (JavaScript),
`RenderThread`, the `pdf-native-*` threads and `HeapTaskDaemon` (garbage collection). In each finding,
write down the thread and the slice name.

## Privacy

A trace holds slice names, thread names, timings and memory, plus the system's own lines about the app
(starts, kills). The app's names never carry document text (`src/utils/trace.ts`), and the trace config
records only the system's log tags (`perfetto.pbtx`). Screen recordings and photos do show what was
scanned: use your own test sheets, never a student's work.
