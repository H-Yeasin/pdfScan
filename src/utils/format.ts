import { formatBytes as formatBytesI18n, formatDate, t } from '../i18n';

// In the UI language (§6 L4); i18n/index.ts holds the actual formatting.
export function formatBytes(bytes: number): string {
  return formatBytesI18n(bytes);
}

export function formatRelativeDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) return t('common.today');

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return t('common.yesterday');

  return formatDate(date, { month: 'short', day: 'numeric' });
}

// "3 Oct": a short date for lists where the year is obvious.
export function formatShortDate(timestamp: number): string {
  return formatDate(timestamp, { day: 'numeric', month: 'short' });
}
