import { Platform } from 'react-native';
import { t } from '../../i18n';
import { APP_VERSION } from '../../config/appInfo';
import type { RemoteConfig } from '../remote/remoteConfig';

// §10 M7: Settings → Help & feedback. A support contact only: questions, problems and ideas.
// Play's Payments policy forbids sending users to pay outside Google Play, so nothing here (or
// anywhere) may say the contact sells or unlocks Pro.
//
// The prefilled message carries what helps answer a question - the app version and the phone -
// and nothing personal: no name, roll, institution, course or document.

export type DeviceInfo = { platform: string; osVersion: string; model: string };

// What React Native knows without another native module. Android reports brand and model; iOS
// doesn't, so its model is left out.
export function deviceInfo(): DeviceInfo {
  const constants = Platform.constants as { Brand?: string; Model?: string; Release?: string; osVersion?: string };
  const model = [constants.Brand, constants.Model].filter(Boolean).join(' ');
  const osVersion = constants.Release ?? constants.osVersion ?? String(Platform.Version);
  return { platform: Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : Platform.OS, osVersion, model };
}

// "PDF Scan 1.0.0 · Android 14 · samsung SM-A155F", the line the message starts with.
export function supportContext(info: DeviceInfo, version: string = APP_VERSION): string {
  return [t('settings.help.appVersion', { version }), `${info.platform} ${info.osVersion}`.trim(), info.model].filter(Boolean).join(' · ');
}

export function supportMessage(info: DeviceInfo, version: string = APP_VERSION): string {
  return t('settings.help.prefill', { context: supportContext(info, version) });
}

// 8801645724080 → 01645724080: a Bangladesh number as people write it there; any other country
// as +<digits>.
export function whatsappDisplay(digits: string): string {
  return digits.startsWith('880') ? `0${digits.slice(3)}` : `+${digits}`;
}

export function whatsappUrl(digits: string, message: string): string {
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function mailtoUrl(email: string, subject: string, body: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export type SupportContact = { kind: 'whatsapp' | 'email'; label: string; url: string };

// The contacts to show, from Remote Config: WhatsApp always (Remote Config never accepts an empty
// number), email only when one is set.
export function supportContacts(remote: Pick<RemoteConfig, 'supportWhatsapp' | 'supportEmail'>, info: DeviceInfo, version: string = APP_VERSION): SupportContact[] {
  const message = supportMessage(info, version);
  const contacts: SupportContact[] = [
    { kind: 'whatsapp', label: whatsappDisplay(remote.supportWhatsapp), url: whatsappUrl(remote.supportWhatsapp, message) },
  ];
  if (remote.supportEmail) {
    contacts.push({ kind: 'email', label: remote.supportEmail, url: mailtoUrl(remote.supportEmail, t('settings.help.emailSubject', { version }), message) });
  }
  return contacts;
}
