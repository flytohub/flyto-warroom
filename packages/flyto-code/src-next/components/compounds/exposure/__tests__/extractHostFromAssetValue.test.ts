import { describe, it, expect } from 'vitest'
import { extractHostFromAssetValue } from '../shared'

describe('extractHostFromAssetValue', () => {
  it('returns empty string for empty input', () => {
    expect(extractHostFromAssetValue('')).toBe('')
  })

  it('parses https URL form to lowercase hostname', () => {
    expect(extractHostFromAssetValue('https://Blog.Flyto2.com/path?x=1')).toBe('blog.flyto2.com')
  })

  it('parses http URL form to lowercase hostname', () => {
    expect(extractHostFromAssetValue('http://EXAMPLE.com')).toBe('example.com')
  })

  it('strips " — suffix" annotations (ssl_cert / waf / breach_exposure shape)', () => {
    expect(extractHostFromAssetValue('flyto2.com — TLS 1.3 cert ok')).toBe('flyto2.com')
    expect(extractHostFromAssetValue('flyto2.com — Cloudflare')).toBe('flyto2.com')
  })

  it('strips " - suffix" with ASCII dash', () => {
    expect(extractHostFromAssetValue('flyto2.com - some info')).toBe('flyto2.com')
  })

  it('strips "(extra)" parenthetical (port_scan shape)', () => {
    expect(extractHostFromAssetValue('flyto2.com (1.2.3.4) open ports')).toBe('flyto2.com')
  })

  it('cuts at the EARLIEST separator: "host (ip) — desc" → bare host', () => {
    // Regression: array-order iteration cut at " —" first and returned
    // "flyto2.com (104.21.93.111)". Must cut at the earlier " (".
    expect(extractHostFromAssetValue('flyto2.com (104.21.93.111) — 4 open ports')).toBe('flyto2.com')
  })

  it('handles "host — desc" (whois / waf / ssl_cert shape)', () => {
    expect(extractHostFromAssetValue('flyto2.com — registrar: 146, expires: 2026-12-18')).toBe('flyto2.com')
  })

  it('handles "host → ip" (dns / ip_intel arrow shape)', () => {
    expect(extractHostFromAssetValue('flyto2.com → 104.21.93.111')).toBe('flyto2.com')
  })

  it('strips trailing space-separated metadata', () => {
    expect(extractHostFromAssetValue('flyto2.com extra data here')).toBe('flyto2.com')
  })

  it('passes through bare hostname (dns_security / subdomain shape) and lowercases', () => {
    expect(extractHostFromAssetValue('Blog.Flyto2.com')).toBe('blog.flyto2.com')
  })

  it('trims surrounding whitespace', () => {
    expect(extractHostFromAssetValue('   flyto2.com   ')).toBe('flyto2.com')
  })

  it('falls back to raw lowercased value when URL parse fails', () => {
    // URL ctor rejects this — should not crash, just lowercase & trim.
    expect(extractHostFromAssetValue('https://not a valid url')).toBe('https://not')
  })
})
