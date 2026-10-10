import { DOCX_BODY_PAD } from './docxService';

// §18 W22: what passes between the app and the page that shows a DOCX (components/reader/
// DocxView). The page is HTML made from a file someone else wrote, shown in a locked-down WebView
// under a CSP that lets none of the document's own scripts run. The app injects one script, the
// constant below, and afterwards only calls the functions it defines:
//   find / findGo            mark the matches of a query in the page and go to one of them
//   setNight                 the other palette, by the body's class (no reload)
//   setInsets                room for the Reader's bars around the text
//   scrollToFraction         the saved position
// and the script reports a tap, a tapped link, the scroll position and what Find found.
//
// Two rules keep that safe:
// - nothing of the document or of what the student typed ever becomes part of a script: a call is
//   a fixed function name and its arguments as JSON (callScript), escaped so they can't end the
//   script or the string they are in;
// - whatever comes back is untrusted: parseDocxMessage accepts only the exact shapes below and
//   drops the rest. A link's address is still checked by links.safeLinkUrl and shown to the
//   student before anything opens it.
//
// §12 D11 marked the matches in the HTML in the app and reloaded the page for every query
// (docxFind.ts, retired): the page flickered and lost its place on each letter typed.

export const DOCX_FIND_MAX = 2000;
// How often the page says where it is scrolled to, at most.
const SCROLL_REPORT_MS = 100;

// ES5, for old system WebViews. No `${...}` but the constants above: the document's content and
// the query never reach this text.
export const DOCX_BRIDGE_SCRIPT = `(function () {
  if (window.__pdfscan) return;
  var MAX = ${DOCX_FIND_MAX};
  var pad = { top: 0, bottom: 0 };
  var marks = [];
  var current = -1;
  var partial = false;
  function post(message) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(message));
  }
  function low(text) {
    var lower = text.toLowerCase();
    if (lower.length === text.length) return lower;
    return text.replace(/[\\s\\S]/g, function (c) { var one = c.toLowerCase(); return one.length === 1 ? one : c; });
  }
  function maxScroll() {
    return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  }
  function clear() {
    var parents = [];
    for (var i = 0; i < marks.length; i++) {
      var mark = marks[i];
      var parent = mark.parentNode;
      if (!parent) continue;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      if (parents.indexOf(parent) < 0) parents.push(parent);
    }
    for (var k = 0; k < parents.length; k++) parents[k].normalize();
    marks = [];
    current = -1;
    partial = false;
  }
  function show(index) {
    if (current >= 0 && marks[current]) marks[current].className = 'pdfscan-find';
    current = index;
    var mark = marks[index];
    if (!mark) return;
    mark.className = 'pdfscan-find pdfscan-current';
    var table = mark.closest ? mark.closest('table') : null;
    if (table) {
      var inTable = table.getBoundingClientRect();
      var cell = mark.getBoundingClientRect();
      if (cell.left < inTable.left || cell.right > inTable.right) table.scrollLeft += cell.left - inTable.left - 24;
    }
    var box = mark.getBoundingClientRect();
    var band = window.innerHeight - pad.top - pad.bottom;
    if (box.top < pad.top || box.bottom > window.innerHeight - pad.bottom) {
      window.scrollTo(0, Math.max(0, window.pageYOffset + box.top - pad.top - band * 0.3));
    }
  }
  function report(seq) {
    post({ t: 'find', seq: seq, count: marks.length, index: current, partial: partial });
  }
  function find(query, seq) {
    clear();
    var needle = low(String(query).replace(/^\\s+|\\s+$/g, ''));
    if (needle) {
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
      var nodes = [];
      var node;
      while ((node = walker.nextNode())) nodes.push(node);
      for (var i = 0; i < nodes.length; i++) {
        var text = low(nodes[i].nodeValue || '');
        var at = text.indexOf(needle);
        if (at < 0) continue;
        if (marks.length >= MAX) { partial = true; break; }
        var spots = [];
        while (at >= 0) { spots.push(at); at = text.indexOf(needle, at + needle.length); }
        if (spots.length > MAX - marks.length) { spots.length = MAX - marks.length; partial = true; }
        var made = [];
        for (var k = spots.length - 1; k >= 0; k--) {
          var range = document.createRange();
          range.setStart(nodes[i], spots[k]);
          range.setEnd(nodes[i], spots[k] + needle.length);
          var mark = document.createElement('mark');
          mark.className = 'pdfscan-find';
          range.surroundContents(mark);
          made.unshift(mark);
        }
        for (k = 0; k < made.length; k++) marks.push(made[k]);
      }
      var first = 0;
      for (var m = 0; m < marks.length; m++) {
        if (marks[m].getBoundingClientRect().bottom > pad.top) { first = m; break; }
      }
      if (marks.length) show(first);
    }
    report(seq);
  }
  function findGo(index, seq) {
    if (marks.length) show(Math.max(0, Math.min(marks.length - 1, index | 0)));
    report(seq);
  }
  function setNight(on) {
    document.body.className = on ? 'night' : '';
  }
  function setInsets(top, bottom, left, right) {
    pad = { top: top, bottom: bottom };
    var style = document.body.style;
    style.paddingTop = (${DOCX_BODY_PAD.top} + top) + 'px';
    style.paddingBottom = (${DOCX_BODY_PAD.bottom} + bottom) + 'px';
    style.paddingLeft = (${DOCX_BODY_PAD.side} + left) + 'px';
    style.paddingRight = (${DOCX_BODY_PAD.side} + right) + 'px';
  }
  function scrollToFraction(fraction) {
    window.scrollTo(0, Math.round(maxScroll() * fraction));
  }
  window.__pdfscan = { find: find, findGo: findGo, setNight: setNight, setInsets: setInsets, scrollToFraction: scrollToFraction };

  document.addEventListener('click', function (e) {
    var target = e.target;
    var link = target && target.closest ? target.closest('a') : null;
    if (link) {
      e.preventDefault();
      var href = link.getAttribute('href') || '';
      if (href.charAt(0) === '#') {
        var id = href.slice(1);
        try { id = decodeURIComponent(id); } catch (err) {}
        var to = document.getElementById(id) || document.getElementsByName(id)[0];
        if (to) window.scrollTo(0, Math.max(0, window.pageYOffset + to.getBoundingClientRect().top - pad.top - 8));
      } else if (href) {
        post({ t: 'link', href: href.slice(0, 2048) });
      }
      return;
    }
    var selected = window.getSelection ? String(window.getSelection()) : '';
    if (selected.length > 0) return;
    post({ t: 'tap' });
  }, true);

  var waiting = false;
  window.addEventListener('scroll', function () {
    if (waiting) return;
    waiting = true;
    setTimeout(function () {
      waiting = false;
      post({ t: 'scroll', y: Math.round(window.pageYOffset), max: Math.round(maxScroll()) });
    }, ${SCROLL_REPORT_MS});
  }, true);

  post({ t: 'ready' });
})(); true;`;

export type DocxCall = 'find' | 'findGo' | 'setNight' | 'setInsets' | 'scrollToFraction';
const CALLS: readonly DocxCall[] = ['find', 'findGo', 'setNight', 'setInsets', 'scrollToFraction'];
type ScriptArg = string | number | boolean;

// JSON that is safe inside a script: `<` and `>` can't close a script element or open a comment,
// and U+2028 / U+2029 (line ends to JavaScript, plain characters to JSON) can't break a string.
export function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

// The script for one call of the bridge: a name from the list above, and plain values.
export function callScript(name: DocxCall, args: readonly ScriptArg[]): string {
  if (!CALLS.includes(name)) throw new Error(`docxBridge: no such call: ${String(name)}`);
  const clean = args.map((arg) => (typeof arg === 'number' ? (Number.isFinite(arg) ? arg : 0) : typeof arg === 'boolean' ? arg : String(arg)));
  return `(function(){var b=window.__pdfscan;if(b)b.${name}.apply(null,${scriptJson(clean)});})();true;`;
}

export type DocxMessage =
  | { type: 'ready' }
  | { type: 'tap' }
  | { type: 'scroll'; y: number; max: number }
  | { type: 'find'; seq: number; count: number; index: number; partial: boolean }
  | { type: 'link'; href: string };

const MESSAGE_MAX_CHARS = 4096;
const KEYS: Record<string, readonly string[]> = {
  ready: ['t'],
  tap: ['t'],
  scroll: ['t', 'y', 'max'],
  find: ['t', 'seq', 'count', 'index', 'partial'],
  link: ['t', 'href'],
};

function count(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max;
}

// A message from the page, or null for anything that isn't exactly one of ours: not a string, too
// long, not JSON, an unknown kind, a missing or an extra field, a number out of range.
export function parseDocxMessage(data: unknown): DocxMessage | null {
  if (typeof data !== 'string' || data.length === 0 || data.length > MESSAGE_MAX_CHARS) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(data);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const m = raw as Record<string, unknown>;
  const kind = typeof m.t === 'string' && Object.prototype.hasOwnProperty.call(KEYS, m.t) ? m.t : null;
  if (!kind) return null;
  const keys = Object.keys(m);
  if (keys.length !== KEYS[kind].length || !keys.every((key) => KEYS[kind].includes(key))) return null;
  switch (kind) {
    case 'ready':
      return { type: 'ready' };
    case 'tap':
      return { type: 'tap' };
    case 'scroll':
      return count(m.y, 1e9) && count(m.max, 1e9) ? { type: 'scroll', y: m.y, max: m.max } : null;
    case 'find': {
      if (!count(m.seq, 1e9) || !count(m.count, DOCX_FIND_MAX) || typeof m.partial !== 'boolean') return null;
      const index = m.index;
      if (typeof index !== 'number' || !Number.isInteger(index) || index < -1 || index >= Math.max(1, m.count)) return null;
      return { type: 'find', seq: m.seq, count: m.count, index: m.count === 0 ? -1 : index, partial: m.partial };
    }
    case 'link':
      return typeof m.href === 'string' && m.href.length > 0 && m.href.length <= 2048 ? { type: 'link', href: m.href } : null;
    default:
      return null;
  }
}
