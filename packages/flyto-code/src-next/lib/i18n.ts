/**
 * i18n — CDN-based dynamic locale loading from flyto-i18n.
 *
 * Zero hardcoded locale lists. Everything comes from manifest.json.
 * Adding a new language = add JSON to flyto-i18n, push. No code changes.
 *
 * CDN: dist/{SCOPE}/{locale}.json
 */

import { flattenTranslations } from './i18nFlatten'

declare const __BUILD_TIMESTAMP__: string;

export type Locale = string

type Translations = Record<string, string>

// --- CDN config ---
const I18N_VERSION = 'main'
const CDN_ENDPOINTS = [
  // Same-origin first. The deploy workflow bakes
  // flyto-i18n/dist/code/* into public/i18n/code/ at build time, so this
  // is always present in the served bundle. Zero CORS, zero rate limit,
  // zero network dependency — and crucially, no "flash of raw keys" on
  // login when GitHub raw is slow or rate-limited.
  //
  // Was DEV-only before 2026-05-17. Audit traced sign-in pages rendering
  // bare `auth.signIn` keys back to: i18nReady gate releases as soon as
  // init() finishes even when CDN fetch returned empty, leaving
  // translations={} and enFallback={}. Same-origin can't fail this way.
  '/i18n',
  // CDN fallback for locales not bundled into the build (e.g. a fresh
  // translation added between deploys). jsdelivr first — it doesn't
  // rate-limit unauthenticated traffic like raw.githubusercontent does.
  `https://cdn.jsdelivr.net/gh/flytohub/flyto-i18n@${I18N_VERSION}/dist`,
  `https://raw.githubusercontent.com/flytohub/flyto-i18n/${I18N_VERSION}/dist`,
]
const SCOPE = 'code'
const PREFIX_TO_STRIP = 'code.'
const STORAGE_KEY = 'flyto-code:locale'
// App version gates cache — new deploy = automatic cache refresh (no stale translations)
const APP_VERSION = import.meta.env.VITE_APP_VERSION || __BUILD_TIMESTAMP__ || 'dev'
const CACHE_PREFIX = `flyto-i18n-code-${APP_VERSION}-`
const CACHE_TTL = import.meta.env.DEV ? 0 : 24 * 60 * 60 * 1000 // 24h (was 7d — shorter TTL for faster hotfix propagation)

// --- State ---
let currentLocale: Locale = 'en'
let translations: Translations = {}
let enFallback: Translations = {}
// Monotonic counter bumped on every notifyLocaleChange. Used by
// getLocaleSnapshot to force useSyncExternalStore re-render even when
// the locale string stays 'en' but translations just finished loading.
let localeVersion = 0

// Available locales — populated from manifest, no hardcoding
let availableLocales: Array<{ code: string; name: string; native: string; region: string; completion: number }> = []

// --- Flag helpers (use region from manifest → SVG from CDN or local /flags/) ---
const FLAG_BASE = import.meta.env.DEV
  ? '/flags'
  : 'https://raw.githubusercontent.com/flytohub/flyto-i18n/main/dist/flags'

/** Get flag SVG URL for a locale code. Uses region from manifest. */
export function getLocaleFlagUrl(locale: string): string {
  const info = availableLocales.find(l => l.code === locale)
  const region = info?.region?.toLowerCase()
  if (region) return `${FLAG_BASE}/${region}.svg`
  // Fallback: try extracting region from locale code (e.g., zh-TW → tw)
  const parts = locale.split('-')
  if (parts.length > 1) return `${FLAG_BASE}/${parts[1].toLowerCase()}.svg`
  return `${FLAG_BASE}/us.svg`
}

type LocaleListener = () => void
const localeListeners = new Set<LocaleListener>()

// --- Strip scope prefix from keys ---
function stripPrefix(obj: Translations): Translations {
  if (!PREFIX_TO_STRIP) return obj
  const result: Translations = {}
  for (const [key, value] of Object.entries(obj)) {
    result[key.startsWith(PREFIX_TO_STRIP) ? key.slice(PREFIX_TO_STRIP.length) : key] = value
  }
  return result
}

// --- CDN fetch ---
async function cdnFetch<T>(path: string): Promise<T | null> {
  for (const base of CDN_ENDPOINTS) {
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 5000)
      const res = await fetch(`${base}/${SCOPE}${path}`, {
        signal: ctrl.signal,
        cache: 'no-cache',
      })
      clearTimeout(timer)
      if (res.ok) return (await res.json()) as T
    } catch { /* CDN endpoint unavailable — try next */ }
  }
  return null
}

// --- Cache ---
function getCache(key: string): Translations | null {
  if (CACHE_TTL <= 0) return null // dev mode — always fetch fresh
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key)
    if (!raw) return null
    const { data, ts } = JSON.parse(raw)
    if (Date.now() - ts > CACHE_TTL) {
      localStorage.removeItem(CACHE_PREFIX + key)
      return null
    }
    return data
  } catch { return null /* corrupted cache entry */ }
}

function setCache(key: string, data: Translations): void {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, ts: Date.now() }))
  } catch { /* storage full or private mode */ }
}

// --- Load translations ---
async function loadLocale(locale: string): Promise<Translations> {
  const cached = getCache(locale)
  if (cached) return cached

  const data = await cdnFetch<Record<string, unknown>>(`/${locale}.json`)
  if (data?.translations) {
    const flat = flattenTranslations(data.translations)
    const stripped = stripPrefix(flat)
    setCache(locale, stripped)
    return stripped
  }
  return {}
}

// --- Detect locale from browser, matched against available locales ---
function detectLocale(): Locale {
  if (typeof navigator === 'undefined') return 'en'

  const known = new Set(availableLocales.map((l) => l.code))
  const candidates = [...(navigator.languages ?? []), navigator.language]

  for (const lang of candidates) {
    // Exact match (e.g., "zh-TW", "ja", "ko")
    if (known.has(lang)) return lang

    // Chinese variants — handle all browser formats:
    // zh-TW, zh-Hant, zh-Hant-TW, zh-Hant-HK, zh-CN, zh-Hans, zh-Hans-CN, zh
    if (lang.startsWith('zh')) {
      const isTraditional = lang.includes('Hant') || lang.includes('TW') || lang.includes('HK') || lang.includes('MO')
      const isSimplified = lang.includes('Hans') || lang.includes('CN') || lang.includes('SG')
      if (isTraditional && known.has('zh-TW')) return 'zh-TW'
      if (isSimplified && known.has('zh-CN')) return 'zh-CN'
      // Bare "zh" — default to zh-TW for Taiwan users
      if (known.has('zh-TW')) return 'zh-TW'
      if (known.has('zh-CN')) return 'zh-CN'
    }

    // Portuguese
    if (lang.startsWith('pt') && known.has('pt-BR')) return 'pt-BR'

    // Prefix match (en-US → en, fr-CA → fr, ja-JP → ja)
    const prefix = lang.split('-')[0]
    const match = availableLocales.find((l) => l.code === prefix || l.code.startsWith(prefix + '-'))
    if (match) return match.code
  }

  // Last resort: manifest hasn't loaded yet — best-effort from navigator.language alone.
  // Chinese needs special handling (zh-Hant-TW, zh-Hans-CN, etc.); everything else
  // just needs prefix matching against common locale codes.
  for (const lang of candidates) {
    if (lang.startsWith('zh')) {
      const isSimplified = lang.includes('Hans') || lang.includes('CN') || lang.includes('SG')
      return isSimplified ? 'zh-CN' : 'zh-TW'
    }
    if (lang.startsWith('pt')) return 'pt-BR'
    // For all other languages, the prefix IS the locale code (ja, ko, fr, de, ...)
    const prefix = lang.split('-')[0]
    if (prefix && prefix !== 'en') return prefix
  }

  return 'en'
}

// --- Core API ---
/** Subscribe to locale changes. Returns an unsubscribe function. Used by useLocale to drive React re-renders. */
export function subscribeLocale(cb: LocaleListener): () => void {
  localeListeners.add(cb)
  return () => { localeListeners.delete(cb) }
}

/** Manually fire all locale listeners. Called after setLocale; rarely needed externally. */
export function notifyLocaleChange(): void {
  localeVersion++
  localeListeners.forEach((cb) => cb())
}

/** Synchronous read of the current locale. Same as getLocale; both kept for ergonomic call sites. */
export function getLocaleSnapshot(): Locale { return currentLocale }
/** Versioned snapshot for useSyncExternalStore — changes whenever translations
 *  reload, even if locale string stays 'en'. Forces re-render in useLocale. */
export function getLocaleVersionedSnapshot(): string { return `${currentLocale}:${localeVersion}` }
/** Synchronous read of the current locale. */
export function getLocale(): Locale { return currentLocale }

/** Switch locale: load CDN bundle, persist to localStorage, fire listeners. Awaited so callers can await UI re-render. */
export async function setLocale(locale: Locale): Promise<void> {
  const loaded = await loadLocale(locale)
  if (Object.keys(loaded).length > 0) {
    translations = loaded
    currentLocale = locale
    try { localStorage.setItem(STORAGE_KEY, locale) } catch { /* private mode */ }
  } else if (locale !== 'en') {
    // Locale not available on CDN — fall back to en, don't persist bad locale
    translations = enFallback
    currentLocale = 'en'
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* private mode */ }
  }
  notifyLocaleChange()
}

// Missing-key observability: log each unresolved key once per process so a
// typo shows up in dev without spamming the console. Production keeps the
// silent fallback to avoid noisy logs for the long tail of locales.
const reportedMissingKeys = new Set<string>()
const reportedStaleKeys = new Set<string>()

/**
 * Translate `key` against the active locale. Falls back to en bundle, then
 * to the key itself (so a missing key is visible on screen, not blank).
 * Dev console logs each missing key once for typo detection.
 * Also warns when a key exists only in the en fallback bundle but not in
 * the active CDN translations — this signals a stale bundled baseline.
 */
export function t(key: string, params?: Record<string, string | number>): string {
  // Use || (not ??) so empty strings in incomplete locales fall through to en
  const hit = translations[key] || enFallback[key]
  if (hit === undefined && import.meta.env?.DEV && !reportedMissingKeys.has(key)) {
    reportedMissingKeys.add(key)
    console.warn(`[i18n] missing key: ${key} (locale=${currentLocale})`)
  }
  if (import.meta.env?.DEV && !translations[key] && enFallback[key] && !reportedStaleKeys.has(key)) {
    reportedStaleKeys.add(key)
    console.warn(`[i18n] untranslated key (falling back to en): ${key}`)
  }
  let text = hit || key
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, String(v))
    }
  }
  return text
}

/**
 * Translate `key`, returning `fallback` (not the key) when missing from
 * both the active locale AND en. Use this instead of `t(key) || fallback`:
 * `t` returns the key on miss, which is truthy, so `|| fallback` would
 * never fire while the on-screen string is useless. Adopted for new call
 * sites that prefer an inline English default to creating an en.json entry.
 */
export function tOr(key: string, fallback: string, params?: Record<string, string | number>): string {
  // Use || so empty strings ("") in incomplete locales fall through to en, then fallback
  const hit = translations[key] || enFallback[key]
  let text = hit || fallback
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, String(v))
    }
  }
  return text
}

/** Available locales — populated from manifest. No hardcoding. */
export function getAvailableLocales() {
  return availableLocales
}

// --- Init ---
let initResolve: () => void
/** Resolves when translations for the user's locale are loaded and ready. */
export const i18nReady: Promise<void> = new Promise(r => { initResolve = r })

async function init(): Promise<void> {
  // 1. Load manifest — this is the ONLY source of truth for available locales
  const manifest = await cdnFetch<{
    locales: Record<string, { name: string; native: string; region?: string; completion: number }>
  }>('/manifest.json')

  if (manifest?.locales) {
    availableLocales = Object.entries(manifest.locales)
      .map(([code, info]) => ({
        code,
        name: info.name,
        native: info.native,
        region: info.region ?? code.split('-')[1]?.toUpperCase() ?? code.toUpperCase(),
        completion: info.completion ?? 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  } else {
    // Absolute minimum fallback if CDN is down — only en
    availableLocales = [{ code: 'en', name: 'English', native: 'English', region: 'US', completion: 100 }]
  }

  // 2. Load English as fallback
  enFallback = await loadLocale('en')

  // 3. Determine starting locale (saved > browser detection > en)
  let saved: string | null = null
  try { saved = localStorage.getItem(STORAGE_KEY) } catch { /* private mode */ }
  const locale = saved ?? detectLocale()

  if (locale === 'en') {
    translations = enFallback
    currentLocale = 'en'
    notifyLocaleChange()
  } else {
    await setLocale(locale)
  }

  initResolve()
}

init()
