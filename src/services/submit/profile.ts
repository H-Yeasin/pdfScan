import type { StudentProfile } from '../../types/models';

export const EMPTY_PROFILE: StudentProfile = { name: '', roll: '', section: '', institution: '' };

// Name and roll are what the default naming template (§4 S2) and the cover pages need; section
// and institution are nice to have. S6 asks for the profile once when this is false.
export function isProfileComplete(profile: StudentProfile): boolean {
  return profile.name.trim() !== '' && profile.roll.trim() !== '';
}

// Settings saved before S1 have no profile, and a hand-edited or partly written blob may have
// non-string fields; anything that isn't a string becomes ''.
export function normalizeProfile(raw: unknown): StudentProfile {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const field = (key: keyof StudentProfile) => (typeof source[key] === 'string' ? (source[key] as string) : '');
  return { name: field('name'), roll: field('roll'), section: field('section'), institution: field('institution') };
}

// §17 U10: Me's avatar. The first letters of the first and last words ("Rahim Uddin" → "RU"), or
// of the one word; '' with no name. Array.from, so a letter outside the BMP isn't split in two.
export function profileInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  const first = (word: string) => Array.from(word)[0] ?? '';
  const letters = words.length === 1 ? first(words[0]) : first(words[0]) + first(words[words.length - 1]);
  return letters.toLocaleUpperCase();
}
