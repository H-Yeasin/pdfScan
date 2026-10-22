import { en } from '../en';

// §17 U12: the catalog follows docs/copy-style.md. These are the rules a machine can check: UK
// spelling, sentence case on labels and titles, no symbols standing in for icons, no "OCR". The rest
// (plain verbs, one helper line per control) is for the person writing the string.

type Entry = [key: string, value: string];

function entries(node: Record<string, unknown>, prefix = ''): Entry[] {
  return Object.entries(node).flatMap(([name, value]): Entry[] => {
    const key = prefix + name;
    if (typeof value === 'string') return [[key, value]];
    if (value && typeof value === 'object') return entries(value as Record<string, unknown>, `${key}.`);
    return [];
  });
}

// Text that goes into documents (tDoc) follows the document's conventions, not the UI's: a cover
// says "Lab Report". The developer rows are never shown to students.
const EXEMPT_PREFIXES = ['document.', 'settings.developer.'];

const { meta: _meta, ...areas } = en;
const UI: Entry[] = entries(areas).filter(([key]) => !EXEMPT_PREFIXES.some((prefix) => key.startsWith(prefix)));

// US spellings with a UK form in the catalog's style. Whole words, any case.
const US_SPELLINGS = [
  'color', 'colors', 'colored', 'colorful', 'gray', 'grays',
  'organize', 'organized', 'organizing', 'organization', 'favorite', 'favorites',
  'center', 'centered', 'license', 'analyze', 'canceled', 'canceling', 'behavior', 'honor', 'catalog',
  'personalize', 'personalized', 'recognize', 'recognized', 'customize', 'customized', 'minimize',
  'optimize', 'optimized', 'summarize', 'realize', 'finalize', 'authorize', 'apologize',
];
const US_WORD = new RegExp(`\\b(${US_SPELLINGS.join('|')})\\b`, 'i');

// A label, title, button or action: any segment of its key says so (`reader.actions.share`,
// `pro.task.title.convert`, `settings.theme.label`), or the value is short and has no full stop
// (most buttons and rows are keyed by what they do: `review.startCapture`).
const LABEL_KEY = /(label|title|button|actions?)$/i;
const isLabel = ([key, value]: Entry) =>
  !/placeholder$/i.test(key) &&
  (key.split('.').some((segment) => LABEL_KEY.test(segment)) || (value.split(/\s+/).length <= 5 && !/[.!?]$/.test(value)));

// Capitalised words a label may still carry mid-sentence: names of things, not Title Case.
const PROPER_NOUNS = new Set([
  'PDF', 'PDFs', 'Scan', 'Pro', 'Word', 'Excel', 'Google', 'Play', 'Drive', 'Docs', 'WhatsApp', 'TalkBack',
  'CSV', 'TXT', 'DOCX', 'XLSX', 'JPG', 'MB', 'KB', 'GB', 'ID', 'B&W', 'SD', 'UTF-8', 'iPhone', 'iCloud',
  'English', 'Western', 'Latin', 'Bangla', 'Bengali', 'Hindi', 'Marathi', 'Nepali', 'Devanagari', 'Chinese', 'Japanese', 'Korean',
  // Screens, tabs and filters the copy names.
  'Me', 'Files', 'Home', 'Tools', 'Library', 'Unsorted', 'Starred', 'Review', 'Mark', 'Submit', 'Ad',
  // Cover designs (deliver.cover.templates).
  'University',
]);

function titleCaseWords(value: string): string[] {
  // Parameters and quoted names are filled in at run time; a sentence may start after . : · — or (.
  const text = value.replace(/\{\w+\}/g, 'x').replace(/(["'“‘])[^"'”’]*\1|“[^”]*”|‘[^’]*’/g, 'x');
  return text.split(/[.!?:·—–(\n]\s*/).flatMap((sentence) =>
    sentence
      .trim()
      .split(/\s+/)
      .slice(1)
      .map((word) => word.replace(/[,;)…?!]+$/, ''))
      .filter((word) => /^[A-Z][a-z]/.test(word) && !PROPER_NOUNS.has(word))
  );
}

describe('copy style (docs/copy-style.md)', () => {
  it('reads the whole catalog', () => {
    expect(UI.length).toBeGreaterThan(900);
  });

  it('finds Title Case and lets names and new sentences through', () => {
    expect(titleCaseWords('Start Capture')).toEqual(['Capture']);
    expect(titleCaseWords('Save & Share')).toEqual(['Share']);
    expect(titleCaseWords('Convert to PDF')).toEqual([]);
    expect(titleCaseWords('Saved · Open it')).toEqual([]);
    expect(titleCaseWords("Edit '{name}'")).toEqual([]);
    expect(titleCaseWords("Rename 'My Notes'")).toEqual([]);
  });

  it('uses UK spelling', () => {
    const us = UI.filter(([, value]) => US_WORD.test(value)).map(([key, value]) => `${key}: ${value}`);
    expect(us).toEqual([]);
  });

  it('writes labels, titles, buttons and actions in sentence case', () => {
    const titleCase = UI.filter(isLabel)
      .filter(([, value]) => titleCaseWords(value).length > 0)
      .map(([key, value]) => `${key}: ${value}`);
    expect(titleCase).toEqual([]);
  });

  it('leaves + and → to the icons', () => {
    const symbols = UI.filter(([, value]) => value.startsWith('+ ') || value.includes('→')).map(([key, value]) => `${key}: ${value}`);
    expect(symbols).toEqual([]);
  });

  // §17 U5 renamed the screens: the Library is Files, Settings is Me, Deliver is Save.
  it('names the screens by their tab names', () => {
    const old = UI.filter(([, value]) => /\b(Library|Settings|Deliver|Capture)\b/.test(value)).map(([key, value]) => `${key}: ${value}`);
    expect(old).toEqual([]);
  });

  it('never says OCR', () => {
    const ocr = UI.filter(([, value]) => /\bOCR\b/.test(value)).map(([key, value]) => `${key}: ${value}`);
    expect(ocr).toEqual([]);
  });
});
