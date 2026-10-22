# Copy style

How PDF Scan's words sound (§17 U12). Every UI string is in `src/i18n/en.ts`; this page is the rule
for writing one. `src/i18n/__tests__/copyStyle.test.ts` checks the parts a machine can check.

**Write like a friendly person who knows the app, not like the code.**

## Spelling and case
- **UK spelling:** colour, grey, organise, favourite, centre, licence (noun), personalised, cancelled.
- **Sentence case** for buttons, titles, labels and menu items: "Start scanning", "Page layout",
  "Sort unsorted". Capitals only for the first word and for names: PDF, Word, Excel, Pro,
  Google Play, WhatsApp, TalkBack, and the app's own places (Home, Files, Tools, Me).
- **Name screens by their tab:** Files (never "Library"), Me (never "Settings"), Save (never
  "Deliver").

## Words
- **Plain verbs:** "Make text searchable", not "Run OCR"; "Lock answers", not "Flatten";
  "Making the PDF…", not "Building PDF…".
- **No file-format jargon** unless the student chose the format: "Some characters may look wrong",
  not "This file isn't in UTF-8". "Convert to Word" is fine: they asked for Word.
- **Never "OCR".** Say "text", "find text", "searchable".
- **Highlights and notes,** not "annotations".

## Symbols and numbers
- **No symbols standing in for icons:** no leading `+ `, no `→`. The icon carries them.
  ("Add deadline" with a plus icon, not "+ Add deadline".)
- **Numbers with units:** "2 MB", "Under 1 MB", "1 hour". Use "Under {size}", not "≤ {size}".
- "·" joins short facts in one line ("Saved · Physics"); a sentence after it starts with a
  capital.

## Errors and helper lines
- **An error says what happened and what to do next:** "Couldn't save. Your pages are still here."
  "No ad is available right now. Try again in a moment."
- **At most one helper line per control,** and only when it adds something the control doesn't
  show. "2 pages per sheet" needs no "(2 Pages per Sheet - Side-by-Side)" under it.
- Cut footnotes that explain how the app works inside ("1 MB here is 1,000,000 bytes…").
- TalkBack hints (`…Hint` keys read by `accessibilityHint`) are not helper lines; keep them short.

## Not covered by these rules
- Text that goes into documents (`document.*`, through `tDoc()`) follows the document's own
  conventions: a cover still says "Lab Report".
- The developer rows (`settings.developer.*`) are never shown to students.

## Examples

| Before | After |
|---|---|
| OCR finished · text is searchable | Text found. You can search this now. |
| Naming template | Your own pattern |
| Flatten | Lock answers |
| Convert/Edit | Convert or edit |
| Eco-Save (2 Pages per Sheet - Side-by-Side) | 2 pages per sheet |
| Will be ≤ {size} | Under {size} |
| Not actually encrypted | This PDF isn't locked |
| Compressed · done | Compressed |
| Start Capture | Start scanning |
| Saved as a PDF in your Library | Saved as a PDF in Files |
