import { describe, it, expect } from 'vitest'
import {
  SEED_PLAYBOOKS, CAMPAIGN_ORDER, orderedPlaybooks,
  runnablePlaybooks, playbookById, initialPlaybook,
} from '../playbooks'

describe('seed playbook registry', () => {
  it('ships the 12 canonical flyto-core pentests', () => {
    expect(SEED_PLAYBOOKS.length).toBe(12)
    const ids = SEED_PLAYBOOKS.map(p => p.id).sort()
    expect(ids).toEqual([
      'access_control', 'auth_session', 'business_logic', 'client_side',
      'code_injection', 'deserialization', 'file_misconfig', 'hardening',
      'llm_injection', 'secrets_crypto', 'sql_injection', 'ssrf',
    ])
  })

  it('every playbook carries a non-empty YAML body with steps/edges', () => {
    for (const p of SEED_PLAYBOOKS) {
      expect(p.yaml, `playbook ${p.id} has empty yaml`).toBeTruthy()
      expect(p.yaml).toMatch(/^id:\s*\S+/m)
      expect(p.yaml).toMatch(/^steps:/m)
      expect(p.yaml).toMatch(/^edges:/m)
      // Canonical schema uses `module:`, not `module_id:`.
      expect(p.yaml).toMatch(/^\s+module:\s+/m)
    }
  })

  it('every playbook has an OWASP code and declared requires', () => {
    for (const p of SEED_PLAYBOOKS) {
      expect(p.owasp.length, `${p.id} missing owasp`).toBeGreaterThan(0)
      expect(p.requires).toContain('target_url')
    }
  })

  it('campaign order references real playbook ids and the list matches', () => {
    expect(new Set(CAMPAIGN_ORDER)).toEqual(new Set(SEED_PLAYBOOKS.map(p => p.id)))
    expect(orderedPlaybooks().length).toBe(CAMPAIGN_ORDER.length)
    expect(orderedPlaybooks()[0].id).toBe('hardening')
  })

  it('initialPlaybook is the first recon-safe entry', () => {
    const p = initialPlaybook()
    expect(p.id).toBe('hardening')
    expect(p.kind).toBe('recon')
  })

  it('runnablePlaybooks filters out YAMLs whose required inputs are missing', () => {
    // target_url alone — only playbooks that require only target_url pass.
    const withOnlyUrl = runnablePlaybooks({ target_url: 'https://x' })
    const ids = withOnlyUrl.map(p => p.id).sort()
    // Must include the url-only entries, must NOT include auth-required.
    expect(ids).toContain('hardening')
    expect(ids).toContain('sql_injection')
    expect(ids).toContain('ssrf')
    expect(ids).not.toContain('access_control')   // needs auth_token
    expect(ids).not.toContain('auth_session')     // needs login_url
    expect(ids).not.toContain('llm_injection')    // needs ai_endpoint
  })

  it('runnablePlaybooks unlocks auth-required once token is provided', () => {
    const ids = runnablePlaybooks({
      auth_token: 'Bearer abc',
    }).map(p => p.id)
    expect(ids).toContain('access_control')
  })

  it('playbookById round-trips every id', () => {
    for (const p of SEED_PLAYBOOKS) {
      expect(playbookById(p.id)).toBe(p)
    }
    expect(playbookById('does-not-exist')).toBeUndefined()
  })
})
