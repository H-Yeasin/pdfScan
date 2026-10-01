# Filter benchmark (§2 E7)

**Goal:** on 20 real student pages, raters who don't know which app made which image prefer our
output to CamScanner's free output on **at least 14 of the 20 pages**. This is the §2
"done when" in `docs/PLAN.md`.

The tools are in the repo:

- **Filter Lab** (dev build: Settings → Developer → Filter Lab) shows every filter on one image,
  with sliders for every tunable constant. It exports a labelled contact sheet and times the
  2400 px export.
- **`docs/qa/blind-compare.html`** runs the blind rating. Open it in Chrome or Edge on a laptop.
  It pairs our outputs with CamScanner's by file name, randomises left and right, records votes
  and exports a CSV. Images never leave the machine.

## 1. The page set (kept outside the repo)

The pages are students' real notes, so they may contain names and grades. **Never commit them,
and never upload them anywhere.** Get each student's OK before using their page.

Keep everything in one folder outside the repo, for example `~/pdfscan-benchmark/`:

```
pdfscan-benchmark/
  originals/    one camera photo per page (the input for both apps)
  ours/         our exported JPG for each page
  camscanner/   CamScanner's exported JPG for each page
  results/      blind-compare CSV exports, contact sheets, timing screenshots
```

Use the **same file name** for a page in all three folders (any image extension). The name is
`<group>-<nn>`:

| Group | File names | Pages | Our filter (C1 mode default) |
|---|---|---|---|
| Pencil on lined paper | `pencil-01` … `pencil-04` | 4 | Ink |
| Blue pen on grid paper | `bluepen-01` … `bluepen-04` | 4 | Ink |
| Printed handout with a lamp shadow | `handout-01` … `handout-03` | 3 | Auto |
| Curled notebook page | `curled-01` … `curled-03` | 3 | Ink |
| Whiteboard (at least one with window glare) | `whiteboard-01` … `whiteboard-03` | 3 | Board |
| Blackboard or greenboard | `blackboard-01` … `blackboard-03` | 3 | Board |
| **Total** | | **20** | |

Mix the pages: different students, pens, lighting and phones if possible. Don't choose pages that
are known to suit our filters.

## 2. Making the outputs

Both apps get **the same photo**, so the comparison is about cleanup, not about who took the
better picture.

1. Take one photo of each page with the phone's normal camera and save it in `originals/`.
2. **Ours** (dev or release build):
   - In Capture, use Import and pick the photo.
   - In Review, crop to the page edges and choose the filter from the table above. Until C1 ships,
     choose it by hand; afterwards use the mode's default. Don't touch the sliders.
   - In Deliver, choose JPG at the highest quality and save. Share it, or use the Android export
     folder, to get it onto the laptop, and save it in `ours/` under the page's name.
3. **CamScanner** (free version, its default auto-enhance):
   - Import the same photo and crop to the same page edges.
   - Keep the filter CamScanner picks by default.
   - Export JPG at its highest quality and copy it to `camscanner/`, renamed.
4. **Watermarks:** if CamScanner adds a watermark, crop that strip off **its** image, and crop an
   equal-height strip off **ours**. Otherwise the watermark gives the answer away.
5. Spot-check that every page exists in both folders. `blind-compare.html` lists any file that
   has no partner.

## 3. Rating

- At least **3 raters**, ideally students who didn't make the pages and don't know which app is
  ours.
- Each rater opens `blind-compare.html`, enters a name, picks the `ours/` and `camscanner/`
  folders, and rates every pair. Use ← / → for "left / right is better" and ↓ for no preference.
- The question on screen is: *"Which page is easier to read and looks cleaner?"* Don't explain
  further, and don't watch over their shoulder.
- Page order and left/right sides are random for each rater. Votes are stored in that browser, so
  use one laptop or merge the CSVs.
- When everyone is done, use **Export CSV** and save it to `results/`.

**Scoring:** a page counts as *ours* when more raters picked ours than picked CamScanner. "No
preference" votes count for neither. The tool shows the per-page table and the total. Copy them
into §6.

## 4. Tuning (between rounds)

If a group loses:

1. Open the losing pages in the Filter Lab.
2. Move only the sliders that address what raters disliked. For example:
   - paper not white → `Light: paper white`, or Ink `inkCeil`;
   - pencil too faint → Ink `inkGamma`;
   - rulings still visible → Ink `lineFrac` / `lineSatMax`;
   - glare left on a whiteboard → Board `glareLuma`;
   - blotchy shadows → `Light: smoothing`.
3. Export a contact sheet before and after the change into `results/`.
4. A new value must not make another group worse. Re-check one page from every group using the
   same filter.
5. Change the default in the code (file below), update the comment on that constant to say it was
   tuned in E7, and record it in §5.
6. Re-export `ours/` for the affected pages and run another rating round with **different raters**
   (people who have seen the old images are no longer blind).

## 5. Parameter values

These are the defaults in the code when the benchmark starts. Put tuned values in the "Tuned"
column, with the round and the reason.

| Filter | Constant | File | Default | Tuned | Why |
|---|---|---|---|---|---|
| Light correction (Auto, Color, Gray, Ink, Board) | `LIGHT_RADIUS` (ink-removal radius, px at 160 px) | `filters/lightCorrect.ts` | 3 | | |
| | `LIGHT_SIGMA` (smoothing, px at 160 px) | `filters/lightCorrect.ts` | 6 | | |
| | `PAPER_WHITE` | `filters/lightCorrectMath.ts` | 0.95 | | |
| | `DARK_PAGE_MEDIAN` (dark-page threshold) | `filters/lightCorrectMath.ts` | 0.35 | | |
| Auto / Color | `COLOR_MIN_SPAN` | `filters/filterMath.ts` | 0.25 | | |
| Color | `COLOR_SATURATION_BOOST` | `filters/filterMath.ts` | 0.25 | | |
| Gray | `LUMA_MIN_SPAN` | `filters/filterMath.ts` | 0.15 | | |
| Ink | `INK_CEIL` | `filters/inkMath.ts` | 0.3 | | |
| | `INK_GAMMA` | `filters/inkMath.ts` | 1.5 | | |
| | `LINE_FRAC` | `filters/inkMath.ts` | 0.4 | | |
| | `LINE_SAT_MAX` | `filters/inkMath.ts` | 0.35 | | |
| | `PAPER_KNEE_FRAC` / `INK_KNEE_FRAC` (no slider) | `filters/inkMath.ts` | 0.75 / 0.35 | | |
| Board | `WHITE_POINT` | `filters/boardMath.ts` | 0.9 | | |
| | `SAT_BOOST` | `filters/boardMath.ts` | 0.5 | | |
| | `MARKER_GAMMA` | `filters/boardMath.ts` | 1.3 | | |
| | `GLARE_LUMA` / `GLARE_CHROMA` | `filters/boardMath.ts` | 0.96 / 0.12 | | |
| | `CHALK_INK` / `DARK_FLOOR` (no slider) | `filters/boardMath.ts` | 0.15 / 0.12 | | |
| B&W (Sauvola) | `SAUVOLA_K` / `SAUVOLA_R` / `SAMPLE_RADIUS_RATIO` | `filters/sauvola.ts` | 0.2 / 0.5 / 0.006 | | |

All files are under `src/services/enhance/`.

## 6. Results

### Rating rounds

| Round | Date | Build (commit) | Raters | Ours preferred | Target met? |
|---|---|---|---|---|---|
| 1 | | | | / 20 | |

### Per page (latest round)

| Page | Ours | CamScanner | No pref. | Preferred | Notes |
|---|---|---|---|---|---|
| pencil-01 | | | | | |
| … | | | | | |

## 7. Export performance

The budget is **under 400 ms per page** to export a 2400 px page, on a mid-range Android phone.
Note the phone model.

1. Build a release variant, because dev-build JS is much slower and its numbers are only an upper
   bound: `npx expo run:android --variant release`. The Filter Lab is `__DEV__`-only, so for a
   release measurement temporarily remove the `__DEV__` guard in `SettingsScreen.tsx`, and don't
   commit that change.
2. In the Filter Lab, pick a full-resolution camera photo and tap **Time 2400 px export**. It
   times the real export path (`bakeEnhance`: decode, filter at full size, JPEG encode, write) for
   every filter, plus the one-off page analysis that runs at scan time.
3. Run it three times and record the median.

| Date | Phone | Build | Auto | Color | Gray | Ink | Board | B&W | Original | Analysis |
|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | |

Until F5 ships, scans are stored at 1200 px, so real exports today are about 4× fewer pixels than
this test.
