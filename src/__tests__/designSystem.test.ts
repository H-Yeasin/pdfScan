import { readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join, relative, sep } from 'path';

// §17 U2: the ratchet. Screens move onto the UI kit (components/ui) one step at a time (U5-U11);
// until then they keep their own styles, but the count of hand-rolled ones may only go down. Per
// .tsx file outside components/ui, src/dev and theme, this counts the things the kit replaces and
// compares them with designSystem.baseline.json:
// - a count that goes up fails (use the kit, or a token);
// - a count that goes down fails too, until the baseline is lowered in the same change, so the
//   ratchet keeps what was won. The failure prints the numbers to put in.
// Run with DESIGN_BASELINE=update to rewrite the baseline from the source as it is (only after a
// change that lowered counts: check its diff has no number going up).

const SRC = join(__dirname, '..');
const BASELINE = join(__dirname, 'designSystem.baseline.json');
// Relative to src, with '/' separators.
const EXEMPT = ['components/ui/', 'dev/', 'theme/'];

export const METRICS = {
  // A size the type scale should give (Text's variant).
  fontSize: /\bfontSize:\s*\d/g,
  // A colour that should be a token. Quoted, so '#' in a URL fragment or a comment isn't one.
  hexColor: /['"`]#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})['"`]/g,
  // A radius that should be radii.* (borderTopLeftRadius and the rest too).
  borderRadius: /\bborder(?:\w*)Radius:\s*\d/g,
  // A weight on top of a family: Text's `weight` picks the Figtree family instead.
  fontWeight: /\bfontWeight:/g,
  // A system dialog: U3's Dialog.
  alert: /\bAlert\.alert\(/g,
  // A bare pressable: Touchable (ripple, press scale, slop).
  pressable: /<Pressable\b/g,
  // A hand-made sheet or dialog: U3's Sheet / Dialog.
  modal: /<Modal\b/g,
} as const;

export type Metric = keyof typeof METRICS;
export type Counts = Partial<Record<Metric, number>>;
type Baseline = Record<string, Counts>;

// Comments are prose (and often name the very things counted here).
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

// Only the metrics that occur, so the baseline lists what is left to move.
export function countSource(source: string): Counts {
  const code = stripComments(source);
  const counts: Counts = {};
  for (const metric of Object.keys(METRICS) as Metric[]) {
    const n = code.match(METRICS[metric])?.length ?? 0;
    if (n) counts[metric] = n;
  }
  return counts;
}

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' || name === 'test' ? [] : tsxFiles(path);
    return name.endsWith('.tsx') ? [path] : [];
  });
}

function scan(): Baseline {
  const out: Baseline = {};
  for (const file of tsxFiles(SRC).sort()) {
    const rel = relative(SRC, file).split(sep).join('/');
    if (EXEMPT.some((prefix) => rel.startsWith(prefix))) continue;
    const counts = countSource(readFileSync(file, 'utf8'));
    if (Object.keys(counts).length) out[rel] = counts;
  }
  return out;
}

export type Change = { file: string; metric: Metric; baseline: number; now: number };

export function compare(baseline: Baseline, current: Baseline): Change[] {
  const changes: Change[] = [];
  const files = new Set([...Object.keys(baseline), ...Object.keys(current)]);
  for (const file of [...files].sort()) {
    for (const metric of Object.keys(METRICS) as Metric[]) {
      const was = baseline[file]?.[metric] ?? 0;
      const now = current[file]?.[metric] ?? 0;
      if (was !== now) changes.push({ file, metric, baseline: was, now });
    }
  }
  return changes;
}

describe('design system ratchet', () => {
  it('counts what the kit replaces, ignoring comments', () => {
    const source = `
      // <Pressable in a comment, fontSize: 12
      const styles = StyleSheet.create({ a: { fontSize: 14, fontWeight: '600', borderRadius: 12, borderTopLeftRadius: 4, color: '#fff' } });
      const b = { borderRadius: radii.card, fontSize: typeScale.body.fontSize, color: tokens.ink, href: 'a#top' };
      <Pressable onPress={go} /><Modal visible /> Alert.alert(t('x'));
    `;
    expect(countSource(source)).toEqual({ fontSize: 1, hexColor: 1, borderRadius: 2, fontWeight: 1, alert: 1, pressable: 1, modal: 1 });
  });

  it('reports counts that went up or down', () => {
    expect(compare({ 'a.tsx': { fontSize: 2 } }, { 'a.tsx': { fontSize: 1, modal: 1 } })).toEqual([
      { file: 'a.tsx', metric: 'fontSize', baseline: 2, now: 1 },
      { file: 'a.tsx', metric: 'modal', baseline: 0, now: 1 },
    ]);
  });

  it('no file has more hand-rolled styles than the baseline, and lowered counts are recorded', () => {
    const current = scan();
    if (process.env.DESIGN_BASELINE === 'update') {
      writeFileSync(BASELINE, `${JSON.stringify(current, null, 2)}\n`);
    }
    const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline;
    const changes = compare(baseline, current);
    const up = changes.filter((c) => c.now > c.baseline);
    const down = changes.filter((c) => c.now < c.baseline);
    const lines = [
      ...up.map((c) => `UP   ${c.file} ${c.metric}: ${c.baseline} -> ${c.now} (use components/ui or a theme token)`),
      ...down.map((c) => `DOWN ${c.file} ${c.metric}: ${c.baseline} -> ${c.now} (lower it in designSystem.baseline.json)`),
    ];
    expect(lines).toEqual([]);
  });
});
