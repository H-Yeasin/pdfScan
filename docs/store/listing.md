# Google Play store listing (§11 L3)

A draft for the owner to paste into Play Console ▸ Grow ▸ Store presence ▸ Main store listing. It
follows [`docs/copy-style.md`](../copy-style.md) (UK spelling, plain words, no "OCR") and the rules in
[`docs/policy/play-console.md`](../policy/play-console.md):
- Say "no ads while you work", **never** "no ads".
- Nothing sends anyone to pay outside Google Play.
- WhatsApp appears only as a support contact.

Play's metadata policy also rules out some things: no "best", "#1", "top" or "free" in the title or
icon, no prices or promotions, no lists of other apps' names, no quotes from users, and no emoji
runs.

Check the limits again after editing: `python3 -c "print(len('…'))"`.

## Title (30 characters at most)

**PDF Scan: Student Scanner** (25)

The other options:
- "PDF Scan – Scan Notes to PDF" (28)
- "PDF Scan: Notes & Assignments" (29)

## Short description (80 characters at most)

**Scan notes and assignments to PDF. Works offline; your files stay on your phone.** (80)

The other option: "Scan assignments to PDF, sized for Google Classroom. Offline and private." (73)

## Full description (4,000 characters at most)

```
Scan your assignment, lab report or class notes, turn it into a clean PDF and hand it in. PDF Scan is made for students: it works offline, needs no account, and your documents never leave your phone unless you share them.

SCAN ASSIGNMENTS TO PDF
• Google's document scanner finds the page edges and straightens them for you
• Modes for notes, printed documents, whiteboards, books (one photo, two pages) and ID cards
• Filters that make handwriting and pencil sharp, and remove shadows
• Import photos from your gallery: they're cropped automatically too

READY TO SUBMIT
• Compress a PDF to the size your teacher or Google Classroom asks for: under 1 MB, 2 MB or your own limit
• Add a cover page with your name, roll number, course and date
• Headers, footers and page numbers
• File names your way: course, title, date, roll number
• Submission history and deadline reminders for each course

ORGANISED BY COURSE
• Keep each course's scans, PDFs and files together
• Scans made during a class go into that course on their own
• Search the text inside your scans and PDFs
• Star, rename, merge, split and compress in Files

READ AND STUDY
• A fast reader for PDFs, scans, Word, Excel, CSV and text files
• Highlight, underline, draw and add notes on any page
• Sign a PDF with your own signature
• Find any word, copy text from a scan, jump between pages and sections
• Night mode for reading in the dark

CONVERT AND EDIT (PRO)
• Word, Excel, CSV and text files to PDF
• Scans and PDFs to Word
• Fix a typo in a Word, Excel, CSV or text file (always saved as a copy)
• Fill in PDF forms
Pro tasks are unlocked by watching one short video ad, or get Pro for an hour with one ad.

PRIVATE BY DESIGN
• No account, no sign-up
• Text recognition runs on your phone, not in the cloud
• Back up everything to one file and restore it on a new phone
• Optional app lock with your fingerprint or screen lock (Pro)
• Crash reports and usage counts are off unless you turn them on

No ads while you work: a small banner appears only on the Home and Files screens, never while you scan, read or save.

Questions or ideas? Find us in the app under Me → Help & feedback.
```

Before pasting:
1. Count it (about 2,150 characters, well under 4,000).
2. Read each line against the build you're publishing. Every feature named here must work in that
   build: Play removes listings that promise what the app doesn't do.

## Category and tags
- **App category:** Productivity. Education is the alternative; pick it if most competitors in
  the "assignment scanner" searches are listed there.
- **Tags** (Store settings ▸ Tags, up to 5): Document scanner, PDF, Productivity, Education,
  Office.
- **Contact:** the developer email (required), the website from L3, and no phone number (WhatsApp
  stays inside the app as a support contact).

## Search words to cover (§11)
They're worked into the description above, without stuffing:
- "scan assignment to PDF"
- "notes scanner"
- "compress PDF for Google Classroom"
- "document scanner offline"
- "PDF for students"
- "cover page"
- "sign PDF"

## Graphics

| Asset | Size | Source |
|---|---|---|
| App icon | 512 × 512 PNG, 32-bit, no alpha needed | `assets/store/playstore-icon.png` (made by `scripts/make-icons.mjs`) |
| Feature graphic | 1024 × 500 PNG or JPG, no alpha | To make: the tile from `assets/brand/pdfscan-tile.svg` on the left, "Scan. Submit. Study." in Caprasimo on the right, on the logo's forest green (`theme/brand.ts` `BRAND`). Keep text out of the outer 10% (Play crops it in some places). |
| Phone screenshots | 4–8, 16:9 or 9:16, 1080 × 1920 or larger | The shot list below |
| Tablet screenshots | Optional | Skip for the first release |

### Screenshot shot list
Take them on a dev build with Me → Developer → Filter Lab → "Seed library" (`src/dev/seedLibrary.ts`) for
realistic content, then turn off the performance overlay and any developer rows. Use the light
theme and a clean status bar: in Developer options ▸ System UI demo mode, show a full battery,
12:00 and no notifications. Add one short caption above each shot (sentence case, 4–6 words) in
the same green as the feature graphic.

1. **"Scan your assignment in seconds"**: the scanner finding a page's edges, or Review with a
   cropped page.
2. **"Handwriting, sharp and clear"**: a before/after split of a handwritten page with the Notes
   filter (§11: "handwriting before and after").
3. **"Ready to submit, at the right size"**: the Save screen with Size "Under 1 MB" and a course.
4. **"Add a cover page"**: the cover preview with a name, roll number and course.
5. **"Every course in one place"**: Home with tinted course cards and Due soon.
6. **"Highlight, note and sign"**: the Reader with highlights and a signature.
7. **"Find any word in your scans"**: Files search with a match inside a scan.
8. **"Offline. No account. Private."**: Me → Privacy & security, or a simple card with the three
   claims.

None of them may show a real student's name, roll number or school: fill Me → profile with a made-up one first.
