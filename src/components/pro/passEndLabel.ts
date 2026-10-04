import { formatDate } from '../../i18n';

// "Sat 18:40": when a Pro pass ends (§10 M6). With the weekday, since a pass that is extended
// or started near midnight can end the next day. For the Pro screen and Settings' "Pro until …".
export function passEndLabel(expiresAt: number): string {
  return formatDate(expiresAt, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}
