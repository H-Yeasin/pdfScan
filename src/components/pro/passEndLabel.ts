import { formatDate } from '../../i18n';

// "Sat 18:40": when a Pro day pass ends (§10 M6). With the weekday, since a pass often ends
// tomorrow. For the Pro screen and Settings' "Pro until …".
export function passEndLabel(expiresAt: number): string {
  return formatDate(expiresAt, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}
