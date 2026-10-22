import { renamedTo } from '../rename';

// §18 W23 / §17 U7: the name a rename gives, or null for nothing to do.
describe('rename.renamedTo', () => {
  it('cleans the name like a file name', () => {
    expect(renamedTo('Scan', '  HW 3: answers/part 1 ')).toBe('HW 3 answers-part 1');
  });

  it('refuses an empty name', () => {
    expect(renamedTo('Scan', '')).toBeNull();
    expect(renamedTo('Scan', '   ')).toBeNull();
  });

  it('does nothing for the same name', () => {
    expect(renamedTo('Lab 2', 'Lab 2')).toBeNull();
    expect(renamedTo('Lab 2', ' Lab 2 ')).toBeNull();
  });
});
