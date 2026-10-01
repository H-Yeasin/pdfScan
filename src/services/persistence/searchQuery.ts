// Turns free-typed search input into an FTS5 MATCH expression: every whitespace-separated token
// becomes a quoted prefix term (`"tok"*`), with embedded double quotes doubled, so user input can
// never be parsed as FTS5 query syntax (AND/OR/NEAR, column filters, unbalanced quotes).
// Returns '' for blank input.
export function buildFtsMatchQuery(query: string): string {
  return query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => `"${token.replace(/"/g, '""')}"*`)
    .join(' ');
}

// Escapes LIKE's wildcards so "100%" or "a_b" match literally. Pair with `ESCAPE '\'`.
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
