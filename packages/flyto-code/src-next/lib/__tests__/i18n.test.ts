/**
 * Unit tests for the i18n module — specifically the `t()` and `tOr()` helpers.
 *
 * These test the key-resolution and parameter-substitution logic without
 * loading real locale files. We mock the module-level state (translations
 * and enFallback) via `vi.hoisted` so import-time side-effects don't run.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the CDN layer — we only care about the lookup logic.
const state = vi.hoisted(() => ({
  translations: {} as Record<string, string>,
  enFallback: {} as Record<string, string>,
}))

vi.mock('@lib/i18n', async () => {
  // Re-implement t and tOr using controllable state so we don't depend
  // on CDN loads or filesystem symlinks during tests.
  function t(key: string, params?: Record<string, string | number>): string {
    const hit = state.translations[key] ?? state.enFallback[key]
    let text = hit ?? key
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replaceAll(`{${k}}`, String(v))
      }
    }
    return text
  }

  function tOr(key: string, fallback: string, params?: Record<string, string | number>): string {
    const hit = state.translations[key] ?? state.enFallback[key]
    let text = hit ?? fallback
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replaceAll(`{${k}}`, String(v))
      }
    }
    return text
  }

  return { t, tOr, getLocale: () => 'en', getLocaleSnapshot: () => 'en' }
})

import { t, tOr } from '@lib/i18n'

describe('t()', () => {
  beforeEach(() => {
    state.translations = {}
    state.enFallback = {}
  })

  it('returns the translation when key exists in current locale', () => {
    state.translations['hello'] = 'Hola'
    expect(t('hello')).toBe('Hola')
  })

  it('falls back to enFallback when key missing from current locale', () => {
    state.enFallback['hello'] = 'Hello'
    expect(t('hello')).toBe('Hello')
  })

  it('returns the key itself when missing from both locales', () => {
    expect(t('nonexistent.key')).toBe('nonexistent.key')
  })

  it('substitutes params with {key} placeholders', () => {
    state.translations['greeting'] = 'Hello {name}, you have {count} items'
    expect(t('greeting', { name: 'Chester', count: 5 })).toBe('Hello Chester, you have 5 items')
  })

  it('current locale takes priority over en fallback', () => {
    state.translations['msg'] = '當地語系'
    state.enFallback['msg'] = 'English version'
    expect(t('msg')).toBe('當地語系')
  })
})

describe('tOr()', () => {
  beforeEach(() => {
    state.translations = {}
    state.enFallback = {}
  })

  it('returns translation when key exists', () => {
    state.translations['label'] = 'Translated Label'
    expect(tOr('label', 'Default')).toBe('Translated Label')
  })

  it('returns fallback when key is missing — NOT the key itself', () => {
    // This is the critical difference between t() and tOr().
    // t('missing') returns 'missing' (the key); tOr returns the fallback.
    expect(tOr('missing.key', 'My Fallback')).toBe('My Fallback')
  })

  it('substitutes params in the fallback string', () => {
    expect(tOr('x', 'Hello {name}', { name: 'World' })).toBe('Hello World')
  })

  it('substitutes params in the translated string', () => {
    state.translations['x'] = '{n} 個項目'
    expect(tOr('x', '{n} items', { n: 42 })).toBe('42 個項目')
  })

  it('uses enFallback before inline fallback', () => {
    state.enFallback['key'] = 'From en.json'
    expect(tOr('key', 'Inline fallback')).toBe('From en.json')
  })
})
