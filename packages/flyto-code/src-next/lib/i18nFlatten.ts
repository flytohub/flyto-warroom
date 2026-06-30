export type FlatTranslations = Record<string, string>

/**
 * Flatten flyto-i18n nested bundles back into dot keys.
 *
 * flyto-i18n stores parent keys that also have children as:
 *   { "parent": { "_self": "Parent label", "child": "Child label" } }
 *
 * Runtime consumers request the bare parent key, so `_self` must resolve to
 * that key rather than to a synthetic child key.
 */
export function flattenTranslations(obj: unknown, prefix = ''): FlatTranslations {
  const result: FlatTranslations = {}
  if (typeof obj !== 'object' || obj === null) return result

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (key === '_self' && typeof value === 'string' && prefix) {
      result[prefix] = value
      continue
    }

    const fullKey = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') {
      result[fullKey] = value
    } else if (typeof value === 'object' && value !== null) {
      Object.assign(result, flattenTranslations(value, fullKey))
    }
  }

  return result
}
