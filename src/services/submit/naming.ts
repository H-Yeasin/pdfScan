import { getDocType } from '../courses/docTypes';
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
      return getDocType(ctx.docType).short;
    case 'n':
      return String(ctx.n);
    case 'date':
      return formatDate(ctx.date);
    case 'title':
      return (ctx.title ?? '').trim().slice(0, TITLE_MAX_LENGTH).trim();
  }
}

const isNameToken = (value: string): value is NameToken => (NAME_TOKENS as readonly string[]).includes(value);
const SEPARATOR = /[_-]/;

// Fills in a naming template. Unknown tokens (`{foo}`) are left as typed, so a typo shows up in
// the live example instead of vanishing. An empty token takes one neighbouring `_` or `-` with
// it (the one after it if there is one, otherwise the one before), so `{roll}_{name}` without a
// roll gives `Rahim`, not `_Rahim`. The result is a safe file name (sanitizeFileName), possibly ''.
export function renderTemplate(template: string, ctx: NamingContext): string {
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
      if (SEPARATOR.test(parts[i + 1]?.[0] ?? '')) dropNextSeparator = true;
      else if (SEPARATOR.test(out.slice(-1))) out = out.slice(0, -1);
      continue;
    }
    if (dropNextSeparator && SEPARATOR.test(part[0] ?? '')) part = part.slice(1);
    dropNextSeparator = false;
    out += part;
  }
  return sanitizeFileName(out.replace(/^[_-]+|[_-]+$/g, ''));
}

// The name Deliver suggests: the student's template, or the fallback while the default
// template would be missing the name and roll it is built around.
export function suggestName(template: string, ctx: NamingContext): string {
  const effective = template === DEFAULT_NAME_TEMPLATE && !isProfileComplete(ctx.profile) ? FALLBACK_NAME_TEMPLATE : template;
  return renderTemplate(effective, ctx);
}
