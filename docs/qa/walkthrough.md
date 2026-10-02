# Beta walkthrough (§9 O4 and O6)

The by-hand checks that close §9: a "first day" walkthrough in both themes, and the accessibility
checks a test can't do. Run on a **mid-range Android phone** with a **release build** of the current
commit, after a fresh install (Settings → Apps → PDF Scan → Storage → Clear data, or uninstall).
Note the phone, the Android version and the commit in the log at the bottom. Every issue goes in
the log with what you did, what happened and what you expected. Small fixes go straight in; anything
bigger becomes a new step in `docs/plan/`.

§9 is done when this runs with no issue left open (O6), and the TalkBack pass works without sighted
help (O4).

## 1. First day (light theme, then again in dark)

Set the phone to light mode (Settings → Display). Time steps 1–4 with a stopwatch: under 90 s.

1. Open the app. The splash shows, then **onboarding**, with no flash of another screen.
2. Page 1 → Next. Page 2: enter a name and roll number; check that the file-name preview updates.
3. Page 3: add two courses (e.g. "CSE 101 Programming", "PHY 101 Physics"). Start.
4. Home. The **Scan hint** points at Scan once. Tap Got it. Leave and come back: it doesn't return.
5. Scan 3 pages into CSE 101. Review shows "Swipe to try filters" once. Try two filters, crop one
   page with **Auto crop**, then Next → Save. A success haptic, then a snack with Undo.
6. Scan 2 pages into PHY 101 and save. A snack that arrives while the Undo snack is up waits its
   turn; it doesn't replace it.
7. Open the CSE 101 document → ⋮. The **Submit hint** shows under Submit once. Submit: a file with
   your roll number in its name is shared (send it to yourself).
8. Library → search a word from a scanned page. Results appear within about a quarter of a second
   of stopping typing. Filter by PHY 101 so nothing matches: **Search all courses** clears it.
9. Settings → Backup → Back up now. Save to a folder. A success snack.
10. Android back from every screen: it closes a sheet first, then leaves selection or search, then
    goes back, and leaves the app only from Home. On Capture with unsaved pages it asks first.
11. Each empty place says what to do: an empty course, the Starred tab, a course's deadlines, the
    exam pack, Review with no pages, and the Library before the first scan (clear data again).

Then set the phone to **dark** mode and repeat 4–9. Then set the app's own theme (Settings →
Appearance) to the opposite of the phone's: the status bar icons must stay readable on every
screen, and the camera screen's status bar stays light.

Also check:
- **Keyboard:** add a deadline, rename via a prompt, and edit a course. The field you type in is
  visible, Done closes the keyboard (or submits the prompt), and no button hides under it.
- **Loading:** clear data, seed 500 documents (O5's seed tool, in a dev build), cold-start: the
  Library shows grey placeholder rows, not "No documents yet", while it loads.
- **Tablet** (or a large emulator): Home, Library, Settings and the course page stay about 720 dp
  wide, centred. The camera, Review and the Reader use the whole screen.

## 2. TalkBack (O4)

Settings → Accessibility → TalkBack on. Close your eyes, or have someone hold the phone, for steps 1–5.

1. Home: every button says what it does ("Scan, button", "More actions", course cards as "CSE 101,
   Programming, 3 documents, last scan today").
2. Scan → Review: the thumbnails say "Page 2 of 3, selected". Use the TalkBack actions menu to
   **Move earlier**, then **Remove page**. Progress is announced ("Processing page 2 of 3").
3. Crop with **Auto crop** or **Use whole photo** (no corner dragging).
4. Save. The snack is read out.
5. Open the document → ⋮ → Submit. Sign a page using **Place in bottom right**.
6. With TalkBack still on, check that no icon button is read as just "button", and every chip and
   filter says whether it's selected.

## 3. Large text, contrast, motion (O4)

- Settings → Display → Font size **largest** and Display size **largest** (about 200 %), with the
  pseudo-locale on (Settings → Language → Pseudo, dev build). Visit every screen: nothing important
  is clipped or overlaps. The tab bar, chips and Reader bars stop growing at 1.4x by design.
- Settings → Accessibility → **Remove animations** on. Screen changes fade instead of sliding, and
  the progress ribbon in Review stands still.
- In both themes, check that accent buttons read clearly (dark text on teal in dark mode, white on
  teal in light mode).
- iOS (when available): VoiceOver on the same flow, and the largest accessibility text size (AX5).

## Log

| Date | Phone / Android | Commit | Theme | Step | Issue | Fixed in |
|---|---|---|---|---|---|---|
| | | | | | | |
