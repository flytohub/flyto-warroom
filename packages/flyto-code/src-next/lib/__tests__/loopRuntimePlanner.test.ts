import { describe, it, expect } from 'vitest'
// @ts-expect-error - .mjs script has no type declarations
import {
  buildLoopDevAuthToken,
  planRecipe,
  SAFE_API_METHODS,
  SAFE_MODULES,
  SHELL_ALLOWLIST,
} from '../../../scripts/audit-loop-runtime.mjs'

describe('platform loop runtime planner safety', () => {
  it('plans a well-formed browser recipe and maps its runtime assertions', () => {
    const plan = planRecipe({
      id: 'ok',
      surface: 'darkweb',
      steps: [
        { module: 'browser.goto', url: '{{baseUrl}}/x' },
        { module: 'browser.extract', selector: 'main' },
      ],
      assertions: [{ assert: 'route_renders_without_error', step: 1 }],
    })
    expect(plan.errors).toHaveLength(0)
    expect(plan.runtimeMappings).toEqual([{ assert: 'route_renders_without_error', step: 1, module: 'browser.goto' }])
  })

  it('rejects a module outside the whitelist', () => {
    const plan = planRecipe({
      id: 'evil',
      steps: [{ module: 'database.query', sql: 'DROP TABLE users' }],
      assertions: [],
    })
    expect(plan.errors.some((e: string) => e.includes('not in the safe whitelist'))).toBe(true)
  })

  it('rejects shell.run commands that are not on the repo-safe allowlist', () => {
    const plan = planRecipe({
      id: 'shelly',
      steps: [{ module: 'shell.run', command: 'rm -rf /' }],
      assertions: [{ assert: 'command_succeeds', step: 1 }],
    })
    expect(plan.errors.some((e: string) => e.includes('not in the repo-safe allowlist'))).toBe(true)
  })

  it('rejects api.request steps without an explicit safe method', () => {
    const plan = planRecipe({
      id: 'api-no-method',
      steps: [{ module: 'api.request', url: '{{engineUrl}}/api/v1/code/orgs/{{orgId}}/pentests' }],
      assertions: [{ assert: 'http_status', step: 1, status: 200 }],
    })
    expect(plan.errors.some((e: string) => e.includes('safe method allowlist'))).toBe(true)
  })

  it('rejects api.request steps that target external absolute URLs', () => {
    const plan = planRecipe({
      id: 'api-external',
      steps: [{ module: 'api.request', method: 'GET', url: 'https://example.com/api/v1/leak' }],
      assertions: [{ assert: 'http_status', step: 1, status: 200 }],
    })
    expect(plan.errors.some((e: string) => e.includes('must start with {{engineUrl}}/api/'))).toBe(true)
  })

  it('requires POST api.request steps to carry an explicit body', () => {
    const plan = planRecipe({
      id: 'api-post-no-body',
      steps: [{ module: 'api.request', method: 'POST', url: '{{engineUrl}}/api/v1/code/orgs/{{orgId}}/mcp/policy/simulate' }],
      assertions: [{ assert: 'http_status', step: 1, status: 200 }],
    })
    expect(plan.errors.some((e: string) => e.includes('POST api.request requires an explicit body'))).toBe(true)
  })

  it('accepts explicit safe API methods on trusted loop templates', () => {
    for (const method of SAFE_API_METHODS) {
      const isPost = method === 'POST'
      const plan = planRecipe({
        id: `api-${method}`,
        steps: [{
          module: 'api.request',
          method,
          url: isPost
            ? '{{engineUrl}}/api/v1/code/orgs/{{orgId}}/mcp/policy/simulate'
            : '{{engineUrl}}/api/v1/code/orgs/{{orgId}}/pentests',
          ...(isPost ? { body: '{"defaultMode":"enforce"}' } : {}),
        }],
        assertions: [{ assert: 'http_status', step: 1, status: 200 }],
      })
      expect(plan.errors).toHaveLength(0)
    }
  })

  it('requires browser.goto to use the trusted baseUrl template', () => {
    const plan = planRecipe({
      id: 'browser-external',
      steps: [{ module: 'browser.goto', url: 'https://example.com/projects/x' }],
      assertions: [{ assert: 'route_renders_without_error', step: 1 }],
    })
    expect(plan.errors.some((e: string) => e.includes('browser.goto url'))).toBe(true)
  })

  it('requires browser interaction steps to name concrete selectors or conditions', () => {
    const plan = planRecipe({
      id: 'browser-empty',
      steps: [
        { module: 'browser.extract' },
        { module: 'browser.wait' },
      ],
      assertions: [
        { assert: 'route_renders_without_error', step: 1 },
        { assert: 'route_renders_without_error', step: 2 },
      ],
    })
    expect(plan.errors.some((e: string) => e.includes('browser.extract requires a non-empty selector'))).toBe(true)
    expect(plan.errors.some((e: string) => e.includes('browser.wait requires a non-empty condition'))).toBe(true)
  })

  it('accepts the repo-safe shell commands', () => {
    for (const command of SHELL_ALLOWLIST) {
      const plan = planRecipe({
        id: 'safe-shell',
        steps: [{ module: 'shell.run', command }],
        assertions: [{ assert: 'command_succeeds', step: 1 }],
      })
      expect(plan.errors).toHaveLength(0)
    }
  })

  it('builds a local dev-auth token for authenticated loop API smoke without using secrets', () => {
    const token = buildLoopDevAuthToken('audit-uid', 'dev@flyto2.com')
    const parts = token.split('.')
    expect(parts).toHaveLength(3)
    expect(parts[2]).toBe('')
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'))
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    expect(header).toMatchObject({ alg: 'none', typ: 'JWT' })
    expect(payload).toMatchObject({ sub: 'audit-uid', email: 'dev@flyto2.com' })
  })

  it('fails a runtime assertion that points at the wrong module', () => {
    const plan = planRecipe({
      id: 'mismatch',
      steps: [{ module: 'browser.goto', url: '{{baseUrl}}/x' }],
      // command_succeeds must map to shell.run, not a browser step
      assertions: [{ assert: 'command_succeeds', step: 1 }],
    })
    expect(plan.errors.some((e: string) => e.includes('cannot satisfy this runtime assertion'))).toBe(true)
  })

  it('fails a runtime assertion whose step index is out of range', () => {
    const plan = planRecipe({
      id: 'oob',
      steps: [{ module: 'browser.goto', url: '{{baseUrl}}/x' }],
      assertions: [{ assert: 'route_renders_without_error', step: 9 }],
    })
    expect(plan.errors.some((e: string) => e.includes('out of range'))).toBe(true)
  })

  it('exposes shell.run and api.request as the only auto-executable surface', () => {
    // Whitelist allows browser interaction, but execution is reserved for the
    // two non-browser modules; browser steps are deferred to flyto-core.
    expect(SAFE_MODULES.has('browser.goto')).toBe(true)
    expect(SAFE_MODULES.has('shell.run')).toBe(true)
    expect(SAFE_MODULES.has('api.request')).toBe(true)
    expect(SAFE_MODULES.has('file.write')).toBe(false)
    expect(SAFE_API_METHODS.has('GET')).toBe(true)
    expect(SAFE_API_METHODS.has('POST')).toBe(true)
    expect(SAFE_API_METHODS.has('DELETE')).toBe(false)
  })
})
