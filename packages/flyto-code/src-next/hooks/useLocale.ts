/**
 * useLocale — subscribes to locale changes and forces re-render.
 * Uses useSyncExternalStore for tear-free reads.
 *
 * The versioned snapshot ensures re-render fires even when the locale
 * string stays 'en' but translations just finished loading from CDN
 * (i18n.init() sets locale to 'en' → notifyLocaleChange bumps version
 * → snapshot changes from 'en:0' to 'en:1' → React re-renders).
 */
import { useSyncExternalStore } from 'react'
import {
  subscribeLocale, getLocaleSnapshot, getLocaleVersionedSnapshot, getAvailableLocales,
  type Locale,
} from '@lib/i18n'

export function useLocale(): Locale {
  // Subscribe using versioned snapshot so translation-ready triggers re-render,
  // but return only the locale string for downstream consumers.
  useSyncExternalStore(subscribeLocale, getLocaleVersionedSnapshot)
  return getLocaleSnapshot()
}

// useAvailableLocales — keyed on the manifest-loaded locale list, not
// on the current locale string. Necessary because useLocale's snapshot
// only changes when the user picks a different language, but the
// AVAILABLE list arrives later (i18n.init() fetches manifest async,
// then fires notifyLocaleChange to signal the list is ready).
//
// Without this hook, a settings dropdown that reads getAvailableLocales()
// at render freezes with whatever the list looked like at first paint —
// usually empty, so the picker shows only "en" forever.
//
// Snapshot is the array reference itself: i18n replaces the array each
// time the manifest reloads, so React's Object.is check fires re-render
// on every population.
export function useAvailableLocales() {
  return useSyncExternalStore(subscribeLocale, getAvailableLocales)
}
