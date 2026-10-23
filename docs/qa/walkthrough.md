# Beta walkthrough (§9 O4 and O6)

The by-hand checks that close §9: a "first day" walkthrough in both themes, and the accessibility
checks a test can't do. Run on a **mid-range Android phone** with a **release build** of the current
commit, after a fresh install (Settings → Apps → PDF Scan → Storage → Clear data, or uninstall).
Note the phone, the Android version and the commit in the log at the bottom. Every issue goes in
the log with what you did, what happened and what you expected. Small fixes go straight in; anything
bigger becomes a new step in `docs/plan/`.

§9 is done when this runs with no issue left open (O6), and the TalkBack pass works without sighted
help (O4). The steps follow the app as it is since §17 (2026-10-23): the tabs are **Home · Files ·
[Scan] · Tools · Me**, the centre Scan opens the scanner at once, and a scan goes Review → **Save** →
**Done**. For timings on a students' phone, and for first-time students doing these tasks, see §19
(`docs/qa/performance.md` §19, `docs/qa/usability-study.md`).

## 1. First day (light theme, then again in dark)

Set the phone to light mode (Settings → Display). Time steps 1–4 with a stopwatch: under 90 s.

1. Open the app. The splash's logo animation plays (skip it with a tap), then **onboarding**, with no
   flash of another screen.
2. Page 1 → Next. Page 2, "About you": enter a name and roll number; the student card and the
   file-name example fill in as you type.
3. Page 3: add two courses (e.g. "CSE 101 Programming", "PHY 101 Physics"). Start.
4. Home. The **Scan hint** ("Tap here to scan your first page") points at the centre Scan once. Tap
   Got it. Leave and come back: it doesn't return.
5. Tap the centre Scan and scan 3 pages. Review shows "Swipe to try filters" once. Try two filters,
   crop one page with **Auto crop**, then Next. On **Save**, pick CSE 101 and save. A success haptic,
   then the **Done** screen: "Saved to CSE 101".
6. Done → **Scan more**, scan 2 pages, save them into PHY 101. Done → **Done** goes back to the tab
   you started from.
7. Files → the CSE 101 document's ⋯ → **Submit**. The Submit hint ("Set it up once; next time it's one
   tap") shows once. Submit: a file with your roll number in its name is shared (send it to yourself).
8. Files → search (the magnifier) → a word from a scanned page. Results appear within about a quarter
   of a second of stopping typing. Add a filter for PHY 101 so nothing matches: **Clear filters**
   brings the results back.
9. Me → Backup → Back up now. Save to a folder. A success message.
10. Android Back from every screen: it closes a sheet first, then leaves selection or search, then
    goes back, and leaves the app only from Home. In Review with unsaved pages it asks first
    ("Discard 3 pages?").
11. Each empty place says what to do: an empty course, Files with the Starred filter and nothing
    starred, a course's deadlines, the exam pack, and Files and Home before the first scan (clear data
    again).

Then set the phone to **dark** mode and repeat 4–9. Then set the app's own theme (Me → Appearance) to
the opposite of the phone's: the status bar icons must stay readable on every screen, and the
scanner's status bar stays light.

Also check:
- **Keyboard:** add a deadline, rename a file (Files → ⋯ → Rename), and edit a course. The field you
  type in is visible, Done closes the keyboard (or saves the rename), and no button hides under it.
- **Loading:** clear data, seed 500 documents (Me → Developer → Filter Lab → Seed library, in a dev
  build), cold-start: Files shows grey placeholder rows, not its empty state, while it loads.
- **Tablet** (or a large emulator): Home, Files, Me and the course page stay about 720 dp wide,
  centred. The scanner, Review and the Reader use the whole screen.

## 2. TalkBack (O4)

Settings → Accessibility → TalkBack on. Close your eyes, or have someone hold the phone, for steps 1–5.

1. Home: every button says what it does ("Scan, button", "More actions", course cards as "CSE 101,
   Programming, 3 documents, last scan today"). The tab bar reads Home, Files, Scan, Tools, Me.
2. Scan → Review: the thumbnails say "Page 2 of 3, selected". Use the TalkBack actions menu to
   **Move earlier**, then **Remove page**. Progress is announced ("Processing page 2 of 3").
3. Crop with **Auto crop** or **Use whole photo** (no corner dragging).
4. Next → Save. The Done screen is read out ("Saved to …").
5. Files → the document's ⋯ → Submit. Then open it, More → Sign, and sign using **Place in bottom
   right**.
6. With TalkBack still on, check that no icon button is read as just "button", and every chip and
   filter says whether it's selected.

## 3. Large text, contrast, motion (O4)

- Settings → Display → Font size **largest** and Display size **largest** (about 200 %), with the
  pseudo-locale on (Me → Language → Pseudo, dev build). Visit every screen: nothing important is
  clipped or overlaps. The tab bar, chips and Reader bars stop growing at 1.4x by design.
- Settings → Accessibility → **Remove animations** on. Screen changes fade instead of sliding, the
  splash's logo stays still, and the progress ribbon in Review stands still.
- In both themes, check that accent buttons read clearly (dark text on the accent in dark mode, white
  on it in light mode).
- iOS (when available): VoiceOver on the same flow, and the largest accessibility text size (AX5).

## Log

| Date | Phone / Android | Commit | Theme | Step | Issue | Fixed in |
|---|---|---|---|---|---|---|
| | | | | | | |
