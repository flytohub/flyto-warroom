import { describe, it, expect } from 'vitest'
import {
  isHostAllowed, expandTemplate, extractRequests, validateYamlInScope,
  scopeFromTargetUrl,
} from '../scope'

describe('isHostAllowed', () => {
  it('matches exact host', () => {
    expect(isHostAllowed('api.example.com', ['api.example.com'])).toBe(true)
    expect(isHostAllowed('api.example.com', ['example.com'])).toBe(false)
  })
  it('matches wildcard subdomain', () => {
    expect(isHostAllowed('api.example.com', ['*.example.com'])).toBe(true)
    expect(isHostAllowed('example.com', ['*.example.com'])).toBe(true)
    expect(isHostAllowed('evil.com', ['*.example.com'])).toBe(false)
  })
  it('is case-insensitive', () => {
    expect(isHostAllowed('API.EXAMPLE.COM', ['api.example.com'])).toBe(true)
  })
  it('rejects empty allowlist', () => {
    expect(isHostAllowed('api.example.com', [])).toBe(false)
  })
})

describe('expandTemplate', () => {
  it('substitutes known vars', () => {
    expect(expandTemplate('{{target_url}}/x', { target_url: 'https://a.com' }))
      .toBe('https://a.com/x')
  })
  it('leaves unknown vars in place', () => {
    expect(expandTemplate('{{a}}-{{b}}', { a: '1' })).toBe('1-{{b}}')
  })
  it('tolerates dotted names', () => {
    expect(expandTemplate('x {{ a.b }} y', { 'a.b': 'z' })).toBe('x z y')
  })
})

describe('extractRequests', () => {
  it('parses http.batch entries', () => {
    const yaml = `steps:
  - id: probe
    module: http.batch
    params:
      requests:
        - method: GET
          url: "https://a.com/x"
        - method: POST
          url: "https://a.com/y"
`
    const reqs = extractRequests(yaml)
    expect(reqs).toEqual([
      { url: 'https://a.com/x', method: 'GET', step: 'probe' },
      { url: 'https://a.com/y', method: 'POST', step: 'probe' },
    ])
  })
  it('parses direct http.request', () => {
    const yaml = `steps:
  - id: fetch
    module: http.request
    params:
      url: "https://a.com/path"
      method: PUT
`
    const reqs = extractRequests(yaml)
    expect(reqs).toHaveLength(1)
    expect(reqs[0]).toEqual({ url: 'https://a.com/path', method: 'PUT', step: 'fetch' })
  })
  it('defaults browser.goto to GET', () => {
    const yaml = `steps:
  - id: goto
    module: browser.goto
    params:
      url: "https://a.com"
`
    const reqs = extractRequests(yaml)
    expect(reqs).toEqual([{ url: 'https://a.com', method: 'GET', step: 'goto' }])
  })
})

describe('validateYamlInScope', () => {
  const yaml = `steps:
  - id: ok
    module: http.request
    params:
      url: "https://api.example.com/v1/me"
      method: GET
  - id: bad_host
    module: http.request
    params:
      url: "https://evil.com/ping"
      method: GET
  - id: template_only
    module: http.request
    params:
      url: "{{target_url}}/x"
      method: GET
`
  it('accepts URLs inside the allowlist', () => {
    const v = validateYamlInScope(yaml, { allowedHosts: ['api.example.com'] })
    const badHosts = v.map(x => x.step)
    expect(badHosts).toContain('bad_host')
    expect(badHosts).not.toContain('ok')
  })

  it('allows wildcard hosts', () => {
    const v = validateYamlInScope(yaml, { allowedHosts: ['*.example.com'] })
    expect(v.map(x => x.step)).not.toContain('ok')
  })

  it('lets unresolved templates through by default', () => {
    const v = validateYamlInScope(yaml, { allowedHosts: ['api.example.com'] })
    expect(v.find(x => x.step === 'template_only')).toBeUndefined()
  })

  it('rejects unresolved templates in strict mode', () => {
    const v = validateYamlInScope(yaml, {
      allowedHosts: ['api.example.com'], allowTemplateOnly: false,
    })
    expect(v.some(x => x.step === 'template_only')).toBe(true)
  })

  it('enforces path prefix restrictions', () => {
    const v = validateYamlInScope(yaml, {
      allowedHosts: ['api.example.com'],
      allowedPathPrefixes: ['/admin/'],
    })
    const reasons = v.map(x => x.reason).join('|')
    expect(reasons).toMatch(/path '\/v1\/me' not in allowed prefixes/)
  })

  it('enforces method restrictions', () => {
    const onlyPost = `steps:
  - id: puts
    module: http.request
    params:
      url: "https://api.example.com/x"
      method: PUT
`
    const v = validateYamlInScope(onlyPost, {
      allowedHosts: ['api.example.com'],
      allowedMethods: ['GET', 'POST'],
    })
    expect(v.some(x => x.reason.includes("method 'PUT' not allowed"))).toBe(true)
  })
})

describe('scopeFromTargetUrl', () => {
  it('locks to the target host', () => {
    const s = scopeFromTargetUrl('https://api.example.com/v1')
    expect(s.allowedHosts).toEqual(['api.example.com'])
  })
  it('accepts extra hosts', () => {
    const s = scopeFromTargetUrl('https://a.com', ['*.cdn.com'])
    expect(s.allowedHosts).toEqual(['a.com', '*.cdn.com'])
  })
  it('tolerates malformed target URLs', () => {
    const s = scopeFromTargetUrl('not-a-url')
    expect(s.allowedHosts).toEqual([])
  })
})
