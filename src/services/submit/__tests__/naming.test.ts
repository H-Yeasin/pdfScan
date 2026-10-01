import { DEFAULT_NAME_TEMPLATE, renderTemplate, suggestName, type NamingContext } from '../naming';
import { EMPTY_PROFILE } from '../profile';

const ctx: NamingContext = {
  profile: { name: 'Rahim Uddin', roll: '2021331045', section: 'B', institution: 'SUST' },
  course: { name: 'Data Structures', code: 'CSE 101' },
  docType: 'assignment',
  n: 3,
  date: new Date(2026, 9, 2, 1, 30),
  title: '  Assignment on binary search trees and their balancing rules ',
};

describe('renderTemplate', () => {
  it('renders every token', () => {
    expect(renderTemplate('{name}|{first}|{roll}|{section}', ctx)).toBe('RahimUddinRahim2021331045B');
    expect(renderTemplate('{course} {type}{n} {date}', ctx)).toBe('CSE101 HW3 2026-10-02');
    expect(renderTemplate('{title}', ctx)).toBe('Assignment on binary search trees and th');
  });

  it('gives the example from the plan with the default template', () => {
    expect(renderTemplate(DEFAULT_NAME_TEMPLATE, { ...ctx, profile: { ...ctx.profile, name: 'Rahim' } })).toBe(
      '2021331045_Rahim_CSE101_HW3'
    );
  });

  it('uses the course name when there is no code', () => {
    expect(renderTemplate('{course}', { ...ctx, course: { name: 'Data Structures' } })).toBe('DataStructures');
    expect(renderTemplate('{course}', { ...ctx, course: { name: 'Physics', code: '  ' } })).toBe('Physics');
  });

  it('removes an empty token with one neighbouring separator', () => {
    const noRoll = { ...ctx, profile: { ...ctx.profile, name: 'Rahim', roll: '' } };
    expect(renderTemplate('{roll}_{name}', noRoll)).toBe('Rahim');
    expect(renderTemplate('{name}_{roll}', noRoll)).toBe('Rahim');
    expect(renderTemplate('{name}-{roll}-{type}', noRoll)).toBe('Rahim-HW');
    expect(renderTemplate('{course}_{type}{n}', { ...ctx, course: undefined })).toBe('HW3');
  });

  it("returns '' when every token is empty", () => {
    expect(renderTemplate('{roll}_{name}', { ...ctx, profile: EMPTY_PROFILE })).toBe('');
  });

  it('leaves unknown tokens as typed', () => {
    expect(renderTemplate('{roll}_{teacher}', ctx)).toBe('2021331045_{teacher}');
  });

  it('cleans characters a file name cannot have and caps the length', () => {
    expect(renderTemplate('{title}', { ...ctx, title: 'Lab: Ohm/Kirchhoff?' })).toBe('Lab Ohm-Kirchhoff');
    expect(renderTemplate('{date}_'.repeat(10), ctx)).toHaveLength(80);
  });
});

describe('suggestName', () => {
  it('falls back to course, type, number and date without a profile', () => {
    expect(suggestName(DEFAULT_NAME_TEMPLATE, { ...ctx, profile: EMPTY_PROFILE })).toBe('CSE101_HW3_2026-10-02');
    expect(suggestName(DEFAULT_NAME_TEMPLATE, { ...ctx, profile: { ...EMPTY_PROFILE, name: 'Rahim' } })).toBe(
      'CSE101_HW3_2026-10-02'
    );
  });

  it("keeps a custom template even without a profile", () => {
    expect(suggestName('{type}{n}_{title}', { ...ctx, profile: EMPTY_PROFILE, title: 'Trees' })).toBe('HW3_Trees');
  });
});
