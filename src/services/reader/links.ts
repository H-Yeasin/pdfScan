import type { PdfLink } from '../pdf/pdfNative';
import { pageAtY, pageBox, screenToContent, type ColumnLayout, type ColumnView } from './surfaceGeometry';

// §18 W11: a PDF's links under a tap. Pure: which page a touch is on, which link is under it, and
// what that link may do. A link inside the file jumps; one that leaves the app is only ever
// offered (the Reader shows the address and asks), and only for the schemes below.

// How far outside a link's box a tap still counts, in screen pixels: links are often one line of
// small text.
export const LINK_SLOP = 8;

// A touch on screen → the page under it and the point on that page, as fractions of the page
// shown (0–1 from its top-left; a little outside for a touch just off its edge). The page is the
// one whose box holds the point, or the nearest one above it.
export function tapOnPage(layout: ColumnLayout, view: ColumnView, x: number, y: number): { index: number; fx: number; fy: number; width: number } | null {
  if (!layout.tops.length) return null;
  const at = screenToContent(view, x, y);
  const index = pageAtY(layout, at.y);
  const box = pageBox(layout, index);
  if (box.width <= 0 || box.height <= 0) return null;
  // `width`: the page's width on screen, to turn a slop in screen pixels into page units.
  return { index, fx: (at.x - box.x) / box.width, fy: (at.y - box.y) / box.height, width: box.width * view.scale };
}

function distance(link: PdfLink, x: number, y: number): number {
  const dx = Math.max(link.left - x, 0, x - (link.left + link.width));
  const dy = Math.max(link.top - y, 0, y - (link.top + link.height));
  return Math.hypot(dx, dy);
}

// The link at a point (the links' own units: shown points). A link under the point wins; else the
// nearest within `slop`. Of two that are as near (one inside another), the smaller.
export function linkAt(links: readonly PdfLink[], x: number, y: number, slop = 0): PdfLink | null {
  let best: PdfLink | null = null;
  let bestDistance = Infinity;
  for (const link of links) {
    if (link.width <= 0 || link.height <= 0) continue;
    const d = distance(link, x, y);
    if (d > slop) continue;
    if (d < bestDistance || (d === bestDistance && best && link.width * link.height < best.width * best.height)) {
      best = link;
      bestDistance = d;
    }
  }
  return best;
}

// What may be handed to another app. Everything else a PDF can carry (file:, content:, intent:,
// javascript:, an app's own scheme) is not opened.
const ALLOWED_SCHEMES = ['http', 'https', 'mailto', 'tel'];
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;

// The address to offer for a link's `uri`, or null when it must not be opened. Control characters
// and spaces are not part of an address (and can hide one); "www.…" without a scheme is the web.
export function safeLinkUrl(uri: string | undefined): string | null {
  // eslint-disable-next-line no-control-regex
  const url = (uri ?? '').replace(/[\u0000- \u007f]/g, '');
  if (!url) return null;
  const scheme = SCHEME.exec(url);
  if (!scheme) return /^www\.[^/]+\.[^/]+/i.test(url) ? `https://${url}` : null;
  if (!ALLOWED_SCHEMES.includes(scheme[1].toLowerCase())) return null;
  // A scheme alone goes nowhere.
  return url.length > scheme[0].length ? url : null;
}

export type LinkTarget = { kind: 'page'; page: number } | { kind: 'url'; url: string };

// A link with a page of this file jumps there (0-based), whatever else it carries. null: it
// points nowhere the Reader will go, so the tap is an ordinary one.
export function linkTarget(link: PdfLink, pageCount: number): LinkTarget | null {
  if (link.page !== undefined && Number.isInteger(link.page) && link.page >= 0 && link.page < pageCount) return { kind: 'page', page: link.page };
  const url = safeLinkUrl(link.uri);
  return url ? { kind: 'url', url } : null;
}

// The address as the prompt shows it: whole, so nothing is hidden, but not a wall of text.
const SHOWN_URL_MAX = 240;
export function shownUrl(url: string): string {
  return url.length > SHOWN_URL_MAX ? `${url.slice(0, SHOWN_URL_MAX)}…` : url;
}
