// Calendar days as 'YYYY-MM-DD' in the phone's local time zone. Semester start/end dates are days,
// not instants: a semester that starts on 2026-09-01 starts then wherever the student is, so these
// are never converted through UTC (toISOString would shift them by a day near midnight).
export function toLocalDateString(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isLocalDateString(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
