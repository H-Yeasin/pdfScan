import { tDoc } from '../../i18n';
import { sanitizeFileName } from '../../utils/sanitize';
import type { Course, DocType, StudentProfile } from '../../types/models';
import { isProfileComplete } from './profile';

// Gives `2021331045_Rahim_CSE101_HW3`: what most teachers ask an upload to be called.
export const DEFAULT_NAME_TEMPLATE = '{roll}_{name}_{course}_{type}{n}';
// Used instead of the default while the profile has no name or roll, so a fresh install still
// gets a useful name (`CSE101_HW3_2026-10-02`) rather than one built around two gaps.
export const FALLBACK_NAME_TEMPLATE = '{course}_{type}{n}_{date}';

export const NAME_TOKENS = ['name', 'first', 'roll', 'section', 'course', 'type', 'n', 'date', 'title'] as const;
export type NameToken = (typeof NAME_TOKENS)[number];

const TITLE_MAX_LENGTH = 40;

export type NamingContext = {
  profile: StudentProfile;
  // Undefined = Unsorted: `{course}` is then empty.
  course?: Pick<Course, 'name' | 'code'>;
  docType: DocType;
  // The next number for this course and type (docTypes.nextTypeNumber).
  n: number;
  date: Date;
  // The first OCR line, if any.
  title?: string;
};

const noSpaces = (value: string) => value.replace(/\s+/g, '');

// Local date, not toISOString: a scan at 1 am in Dhaka is dated today, not yesterday (UTC).
function formatDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function tokenValue(token: NameToken, ctx: NamingContext): string {
  switch (token) {
    case 'name':
      return noSpaces(ctx.profile.name);
    case 'first':
      return ctx.profile.name.trim().split(/\s+/)[0] ?? '';
    case 'roll':
      return noSpaces(ctx.profile.roll);
    case 'section':
      return noSpaces(ctx.profile.section);
    case 'course':
      return noSpaces(ctx.course?.code?.trim() || ctx.course?.name || '');
    case 'type':
      // In the document language (§6 L4): the file name is part of what the teacher gets.
      return tDoc(`document.docTypeShort.${ctx.docType}`);
    case 'n':
      return String(ctx.n);
    case 'date':
      return formatDate(ctx.date);
    case 'title':
      return (ctx.title ?? '').trim().slice(0, TITLE_MAX_LENGTH).trim();
  }
}

const isNameToken = (value: string): value is NameToken => (NAME_TOKENS as readonly string[]).includes(value);

// How an empty token takes a neighbouring separator with it: `lead` matches one at the start of
// the literal after the token, `trail` one at the end of the text before it.
type SeparatorRule = { lead: RegExp; trail: RegExp; edges: RegExp };

const FILE_SEPARATORS: SeparatorRule = { lead: /^[_-]/, trail: /[_-]$/, edges: /^[_-]+|[_-]+$/g };
// Footers read `{name} · {roll} · {X}/{Y}`: a separator there is a mark with optional spaces.
// `/` counts too, but `{X}` and `{Y}` are filled in later (pdfService.fillPageNumbers), so a
// `{X}/{Y}` is never touched here.
const TEXT_SEPARATORS: SeparatorRule = {
  lead: /^\s*[_\-·|,/]\s*/,
  trail: /\s*[_\-·|,/]\s*$/,
  edges: /^\s*[_\-·|,/]\s*|\s*[_\-·|,/]\s*$/g,
};

function fillTokens(template: string, ctx: NamingContext, rule: SeparatorRule): string {
  const parts = template.split(/(\{[a-z]+\})/);
  let out = '';
  // Set when an empty token has to take the separator that starts the next literal.
  let dropNextSeparator = false;
  for (let i = 0; i < parts.length; i++) {
    let part = parts[i];
    const token = /^\{([a-z]+)\}$/.exec(part)?.[1];
    if (token !== undefined && isNameToken(token)) {
      const value = tokenValue(token, ctx);
      if (value) {
        out += value;
        dropNextSeparator = false;
        continue;
      }
      if (rule.lead.test(parts[i + 1] ?? '')) dropNextSeparator = true;
      else out = out.replace(rule.trail, '');
      continue;
    }
    if (dropNextSeparator) part = part.replace(rule.lead, '');
    dropNextSeparator = false;
    out += part;
  }
  return out.replace(rule.edges, '');
}

// Fills in a naming template. Unknown tokens (`{foo}`) are left as typed, so a typo shows up in
// the live example instead of vanishing. An empty token takes one neighbouring `_` or `-` with
// it (the one after it if there is one, otherwise the one before), so `{roll}_{name}` without a
// roll gives `Rahim`, not `_Rahim`. The result is a safe file name (sanitizeFileName), possibly ''.
export function renderTemplate(template: string, ctx: NamingContext): string {
  return sanitizeFileName(fillTokens(template, ctx, FILE_SEPARATORS));
}

// The same tokens in header and footer text, which is drawn rather than used as a file name: no
// file-name cleaning, and an empty token also takes a `·`, `|`, `,` or `/` separator with it, so
// `{name} · {roll} · {X}/{Y}` without a roll reads `Rahim · {X}/{Y}`. Uppercase `{X}` and `{Y}`
// are not tokens here; the PDF builder fills them in per page.
export function renderText(template: string, ctx: NamingContext): string {
  return fillTokens(template, ctx, TEXT_SEPARATORS).replace(/\s+/g, ' ').trim();
}

// The first non-empty line of OCR text: `{title}`.
export function firstLine(text: string | undefined): string | undefined {
  return text?.split('\n').map((line) => line.trim()).find((line) => line.length > 0);
}

// The name Deliver suggests: the student's template, or the fallback while the default
// template would be missing the name and roll it is built around.
export function suggestName(template: string, ctx: NamingContext): string {
  const effective = template === DEFAULT_NAME_TEMPLATE && !isProfileComplete(ctx.profile) ? FALLBACK_NAME_TEMPLATE : template;
  return renderTemplate(effective, ctx);
}
