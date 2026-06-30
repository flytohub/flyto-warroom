import enBundle from '../../public/i18n/code/en.json'
import { vi } from 'vitest'

type Params = Record<string, string | number>
type TranslationNode = string | { [key: string]: TranslationNode }

declare global {
  // Shared by tests that mock @lib/i18n and still need production-like t().
  // eslint-disable-next-line no-var
  var __flytoTestT: ((key: string, params?: Params) => string) | undefined
}

function flatten(node: TranslationNode, prefix = '', out: Record<string, string> = {}) {
  if (typeof node === 'string') {
    out[prefix] = node
    return out
  }

  for (const [key, value] of Object.entries(node)) {
    flatten(value, prefix ? `${prefix}.${key}` : key, out)
  }
  return out
}

const translations = flatten(enBundle.translations as TranslationNode)
const codeTranslations = flatten((enBundle.translations as { code?: TranslationNode }).code ?? {})

globalThis.__flytoTestT = (key: string, params?: Params) => {
  let text = codeTranslations[key] ?? translations[key] ?? translations[`code.${key}`] ?? key
  if (params) {
    for (const [paramKey, value] of Object.entries(params)) {
      text = text.replaceAll(`{${paramKey}}`, String(value))
    }
  }
  return text
}

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Params) => globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (key: string, fallback: string, params?: Params) => {
    const text = globalThis.__flytoTestT?.(key, params)
    if (text && text !== key) return text

    let rendered = fallback
    if (params) {
      for (const [paramKey, value] of Object.entries(params)) {
        rendered = rendered.replaceAll(`{${paramKey}}`, String(value))
      }
    }
    return rendered
  },
  getLocale: () => 'en',
  getLocaleSnapshot: () => 'en',
  getLocaleVersionedSnapshot: () => 'en:test',
  subscribeLocale: () => () => {},
  notifyLocaleChange: () => {},
  setLocale: async () => {},
  getAvailableLocales: () => [{ code: 'en', name: 'English', native: 'English', region: 'US', completion: 100 }],
  getLocaleFlagUrl: () => '/flags/us.svg',
  i18nReady: Promise.resolve(),
}))
