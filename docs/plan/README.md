# Step plans: progress

Read this first to see what is done and what comes next. Each `NN-*.md` file has the detail for
its own steps. A step's `Status:` line and its "As built" notes describe the code as it is now.
The "Context" and "What the code looks like today" sections at the top of each file describe the
code **when the section was planned**, and are kept as history.

## Where things stand (2026-10-02)

| Section | File | Steps | State |
|---|---|---|---|
| §0 Foundation | [00-foundation.md](00-foundation.md) | F1–F8 | All done in code. Device checks open (see its Verification). |
| §1 Capture | [01-capture.md](01-capture.md) | C1–C7 | All done in code. Device checks open. C5 used the no-native-dependency detector; the OpenCV spike is still pending. |
| §2 Review and enhance | [02-review-enhance.md](02-review-enhance.md) | E1–E7 | E1–E6 done. **E7 in progress:** the tooling is done; the benchmark needs real pages and raters. |
| §3 Courses | [03-courses.md](03-courses.md) | K1–K6 | K1–K5 done. **Next: K6** (organising existing documents). |
| §4 Submit | [04-submit.md](04-submit.md) | S1–S8 | All done in code (S3–S8 have device checks open; S8 needs a new dev build). §3 K6 is still open too. |
| §5 Study | [05-study.md](05-study.md) | T1–T7 | Planned (2026-10-02). T1 first; T7 (flashcards) is for later (P4). |
| §6 Languages and scripts | [06-languages.md](06-languages.md) | L1–L6 | Planned (2026-10-02). L1–L4 are P2 groundwork; L5–L6 (Tesseract, packs) wait for Bangla (P4). |
| §7 Reader tools and later | — | — | Not planned yet. Next to plan: `docs/plan/07-reader-tools.md` (see `docs/PLAN.md` §7). |

The product-level checklist is `docs/PLAN.md` (§0–§11). Keep its ticks in step with the `Status:`
lines here.

### Step by step

| Step | Commit | Notes |
|---|---|---|
| F1 Tests + CI | bb99d51 | Jest (`jest-expo`), mocks in `src/test/mocks`, CI runs typecheck + tests |
| F2 Store hygiene | 009cccb | |
| F3 + F4 SQLite library, Course model | 3a39203 | `persistence/{migrations,libraryRepo}.ts`; AsyncStorage blob imported once |
| F5 Masters, edits as settings, one encode | 4345a55 | `skiaEnhance.renderPage`, `capture/imageSpec.ts` |
| F6 Glyphless OCR text layer | f84a669, 97ee2a6 | |
| F7 Small fixes, error boundary | c1a1d66 | |
| F8 Opt-in Sentry | e502f9b | |
| C1 Capture modes | 2249a8a | `capture/captureModes.ts` |
| C2 Scanner plugin patch | ab4d8be | `patches/react-native-document-scanner-plugin+2.0.4.patch` |
| C3 Book mode split | 15d95c9 | |
| C4 ID card mode | ee5a8aa | |
| C5 Gallery batch + auto-crop | da8e429 | |
| C6 Progress, cancel, haptics, "Scan more" | 53aba95 | |
| C7 Camera fallback | fbfe02b | |
| E1 Filter registry | a993721 | `enhance/filters/*`, applied only by `drawFiltered` |
| E2 Live SkPicture preview + Filter Lab | 389d29c | `useFilteredPicture`, `src/dev/FilterLabScreen.tsx` |
| E3 Shadow / lighting correction | f2398b5 | |
| E4 Ink filter | 45c2ceb | |
| E5 Board filter | 15b6487 | |
| E6 Filter strip, undo/redo, apply-to-all, loupe | cc0648b | `store/pageHistory.ts` |
| E7 Benchmark tooling | ae88e8e | the benchmark run itself is open |
| K1 Course + semester model | 9574adb | migration v3 |
| K3 Course editor, quick setup | 1e925cf | done before K2, as the plan orders |
| K2 Home hub, course pages | f98b0d8 | Home is the start screen once a course exists |
| K4 Document types | 080c5b7 | |
| K5 Course suggestions, class times | 10286d8 | migration v4 |
| S1 Student profile | c4f8f75 | `settings.profile`, `submit/profile.ts`, `pdf/winAnsi.ts` |
| S2 Naming template, named shares | 5f81a98 | `submit/naming.ts`, `shareService.shareAs`, `sanitizeFileName` |
| S3 Size target | 6b6c94f | `submit/sizeTarget.ts`, `SIZE_LADDER`, `encodedBytes`; device check open |
| S4 Cover templates | 2097822 | `pdf/coverTemplates.ts`, `useCoverDefaults`, `CoverThumbnail` |
| S5 Footer presets, page size | 00bfc5d | `renderText`, `footerPresets.ts`, `pdf/pageSize.ts`, `store/useDeliverContext.ts` |
| S6 Submit flow, course presets | 7d92973 | migration v5, `submit/{preset,submitDocument}.ts`, `useSubmitDocument` |
| S7 Submission history | 9b7ec21 | migration v6, `submit/history.ts`, `SubmissionList` |
| S8 Deadline reminders | 31c0083 | migration v7, `expo-notifications`, `submit/deadlines.ts`, `store/useDeadlines.ts` |

## How the branches came together

§0/§1 were built on branch `ccr-ae22e8ac-tnkzk5` while §2 was built on
`claude/zen-gauss-7xh4cp`. They were merged in **505563c** (on the §2 branch). The merge
reconciled the two render paths: F5's `renderPage` now draws through §2's `drawFiltered`.
Rotation is a page setting, applied by `drawRotated` in both export and the live preview.
`bakeEnhance`, `rotatePage` (in Review) and `useEnhancedPreview` are gone. Notes defaults to
`ink` and Board to `board`. §3 was built on top of that merge.

**Security:** commit f647948 on `main` hid a malicious payload at the end of `metro.config.js`.
It downloads and runs remote code whenever Metro loads the config. It was removed on the
§0/§1 branch (24f5ccf) and on the §2 branch (a907d20), but **`main` still has it until this
branch is merged**. If you edit `metro.config.js`, make sure the last line is just
`module.exports = config;`.

## Changes made after a step was marked done
- **Scanner launch (71da855):** Capture no longer opens the scanner every time it appears. It
  opens only when a "scan now" button sets `capture.scannerRequested`: Home's Scan, a course's
  Scan, Library's "Scan now", Review's Retake / Add more / Start Capture. The Scan tab, app
  start and Back from Review just show the Capture screen. `startScan(state, dispatch, courseId,
  { launch })` is the entry point for new scans.

## Device checks still open
No device check for §0–§3 is recorded as done; the agents that built them could only run
`tsc` and Jest. The Verification section at the end of each file lists what to check. Highest value first: §0 (upgrade from an
AsyncStorage-era build keeps every document), §3 (4 courses on Home, a scan in class time files
itself), §2 (Filter Lab checks for Ink and Board).

## Conventions for updating these files
- When you finish a step: set its `Status:` to `done (commit <sha>)`, add short "As built" notes
  wherever the code differs from the step text, tick it in `docs/PLAN.md`, and update the tables
  above.
- If a later change alters a finished step's behaviour, add it under "Changes made after a step
  was marked done" here, and a one-line note in that step.
