import { en } from '../../../i18n/en';
import { REMOTE_DEFAULTS, parseRemoteConfig } from '../../remote/remoteConfig';
import { deviceInfo, mailtoUrl, supportContacts, supportMessage, whatsappDisplay, whatsappUrl } from '../supportLinks';

const PHONE = { platform: 'Android', osVersion: '14', model: 'samsung SM-A155F' };

describe('support links', () => {
  it('writes the Bangladesh number the local way, others with +', () => {
    expect(whatsappDisplay('8801645724080')).toBe('01645724080');
    expect(whatsappDisplay('447700900123')).toBe('+447700900123');
  });

  it('prefills the app version and phone, and nothing else', () => {
    const message = supportMessage(PHONE, '1.0.0');
    expect(message).toBe('Hi! (PDF Scan 1.0.0 · Android 14 · samsung SM-A155F)\n\n');
    expect(supportMessage({ platform: 'iOS', osVersion: '19.0', model: '' }, '1.0.0')).toBe('Hi! (PDF Scan 1.0.0 · iOS 19.0)\n\n');
  });

  it('builds the wa.me and mailto links with the message encoded', () => {
    expect(whatsappUrl('8801645724080', 'Hi! (a · b)\n')).toBe('https://wa.me/8801645724080?text=Hi!%20(a%20%C2%B7%20b)%0A');
    expect(mailtoUrl('help@example.com', 'S & T', 'x y')).toBe('mailto:help@example.com?subject=S%20%26%20T&body=x%20y');
  });

  it('uses the Remote Config contact: WhatsApp always, email only when set', () => {
    const defaults = supportContacts(REMOTE_DEFAULTS, PHONE, '1.0.0');
    expect(defaults).toEqual([
      { kind: 'whatsapp', label: '01645724080', url: whatsappUrl('8801645724080', supportMessage(PHONE, '1.0.0')) },
    ]);
    const remote = parseRemoteConfig({ support_whatsapp: '8801700000000', support_email: 'help@example.com' });
    const contacts = supportContacts(remote, PHONE, '1.0.0');
    expect(contacts.map((c) => c.label)).toEqual(['01700000000', 'help@example.com']);
    expect(contacts[0].url.startsWith('https://wa.me/8801700000000?text=')).toBe(true);
    expect(contacts[1].url.startsWith('mailto:help@example.com?subject=PDF%20Scan%201.0.0')).toBe(true);
  });

  it('reads the device without failing', () => {
    expect(deviceInfo().platform).toBeTruthy();
  });
});

// Play Payments policy: the contact is for support only.
describe('support wording', () => {
  it('never ties the contact to Pro, payment or unlocking', () => {
    const help = JSON.stringify(en.settings.help);
    expect(help).not.toMatch(/pro\b|pay|buy|unlock|price|bkash|purchase/i);
  });
});
