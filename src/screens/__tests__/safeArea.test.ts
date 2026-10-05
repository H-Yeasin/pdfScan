import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

// §14 Q4: React Native 0.86 on Android is always edge-to-edge, so nothing pads the bottom of a
// screen or a modal for free: whatever forgets the inset puts its last button under the 3-button
// navigation bar. This scans the source (like i18n/__tests__/hardcodedStrings.test.ts) so a new
// screen or modal can't skip it.

const SRC = join(__dirname, '../..');
const SCREENS = join(SRC, 'screens');

// Screens whose SafeAreaView pads only the top, because something at the bottom of the screen pads
// itself. Each names the component that must still be rendered, so an entry goes stale loudly.
const BOTTOM_PADDED_BY: Record<string, { renders: string; why: string }> = {
  'HomeScreen.tsx': { renders: '<TabBar', why: 'TabBar is the last thing on screen and pads by the inset.' },
  'LibraryScreen.tsx': { renders: '<SelectionBar', why: 'SelectionBar (a BottomBar) or TabBar is last.' },
  'ReviewScreen.tsx': { renders: '<ContextBar', why: 'ContextBar is a BottomBar.' },
  'DeliverScreen.tsx': { renders: '<StickyActions', why: 'StickyActions is a BottomBar.' },
  'CaptureScreen.tsx': {
    renders: '<CaptureControls',
    why: 'The camera preview is full-bleed; the top-only SafeAreaView is an overlay for the header.',
  },
};

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' || name === 'test' ? [] : tsxFiles(path);
    return name.endsWith('.tsx') ? [path] : [];
  });
}

// Every opening tag of `tag` with its attributes (up to the first '>' that isn't inside {...}).
function openingTags(source: string, tag: string): string[] {
  const tags: string[] = [];
  const start = new RegExp(`<${tag}\\b`, 'g');
  for (const match of source.matchAll(start)) {
    let depth = 0;
    let i = match.index + match[0].length;
    for (; i < source.length; i++) {
      const c = source[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0 && source[i - 1] !== '=') break;
    }
    tags.push(source.slice(match.index, i + 1));
  }
  return tags;
}

describe('safe area guard', () => {
  const screens = readdirSync(SCREENS).filter((name) => name.endsWith('.tsx'));

  it('pads the bottom of every screen', () => {
    const offenders: string[] = [];
    for (const name of screens) {
      const source = readFileSync(join(SCREENS, name), 'utf8');
      // A BottomBar, or the inset applied by hand (CourseScreen's list and floating Scan button).
      const padsItself = /<BottomBar\b|useBottomInset\(|insets\.bottom\b/.test(source);
      for (const tag of openingTags(source, 'SafeAreaView')) {
        // No `edges` means all four edges.
        const edges = /edges=\{([^}]*)\}/.exec(tag)?.[1];
        if (edges === undefined || edges.includes("'bottom'")) continue;
        if (padsItself || BOTTOM_PADDED_BY[name]) continue;
        offenders.push(`${name}: ${tag.replace(/\s+/g, ' ')}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps the allowlist current', () => {
    const stale = Object.entries(BOTTOM_PADDED_BY)
      .filter(([name, { renders }]) => {
        const path = join(SCREENS, name);
        return !screens.includes(name) || !readFileSync(path, 'utf8').includes(renders);
      })
      .map(([name]) => name);
    expect(stale).toEqual([]);
  });

  it('makes every modal edge-to-edge like the app', () => {
    const offenders: string[] = [];
    for (const path of tsxFiles(SRC)) {
      const source = readFileSync(path, 'utf8');
      for (const tag of openingTags(source, 'Modal')) {
        // navigationBarTranslucent only works with statusBarTranslucent (React Native warns otherwise).
        if (/\bnavigationBarTranslucent\b/.test(tag) && /\bstatusBarTranslucent\b/.test(tag)) continue;
        offenders.push(`${relative(SRC, path)}: ${tag.replace(/\s+/g, ' ')}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('finds the modals it guards', () => {
    // A broken scan would pass the test above with nothing checked.
    const count = tsxFiles(SRC).reduce((n, path) => n + openingTags(readFileSync(path, 'utf8'), 'Modal').length, 0);
    expect(count).toBeGreaterThan(20);
  });
});
