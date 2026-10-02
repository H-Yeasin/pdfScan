import { useSyncExternalStore } from 'react';
import { getLocale, getUiLanguage, subscribeUiLanguage, t } from './index';

// Re-renders the calling component when the UI language changes, and hands it t(). t() itself is
// a plain function (services can call it too); this hook only makes the screen follow a change.
export function useT() {
  useSyncExternalStore(subscribeUiLanguage, getUiLanguage, getUiLanguage);
  return { t, locale: getLocale() };
}
