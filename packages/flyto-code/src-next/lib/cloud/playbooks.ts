/**
 * Canonical pentest playbook library — sourced verbatim from
 * flyto-core/workflows/pentests/. These YAMLs ship with the engine, are
 * field-tested there, and use the canonical module IDs (http.batch /
 * browser.* / llm.agent / test.assert_status / output.display) along with
 * the edges DAG that flyto-core expects.
 *
 * Covers OWASP Top 10 + LLM + business-logic.
 *
 * We do NOT hand-write YAMLs here. The flyto-code build pipeline uses
 * Vite's `?raw` to ingest them at build time — a nightly script re-copies
 * them if flyto-core updates. This keeps the campaign grounded in the
 * same playbooks the engine runs server-side.
 */

import accessControl      from './playbooks/access_control.yaml?raw'
import authSession        from './playbooks/auth_session.yaml?raw'
import businessLogic      from './playbooks/business_logic.yaml?raw'
import clientSide         from './playbooks/client_side.yaml?raw'
import codeInjection      from './playbooks/code_injection.yaml?raw'
import deserialization    from './playbooks/deserialization.yaml?raw'
import fileMisconfig      from './playbooks/file_misconfig.yaml?raw'
import hardening          from './playbooks/hardening.yaml?raw'
import llmInjection       from './playbooks/llm_injection.yaml?raw'
import secretsCrypto      from './playbooks/secrets_crypto.yaml?raw'
import sqlInjection       from './playbooks/sql_injection.yaml?raw'
import ssrf               from './playbooks/ssrf.yaml?raw'

export type Severity = 'critical' | 'high' | 'moderate'

export type Surface =
  | 'recon' | 'headers' | 'auth'
  | 'injection' | 'traversal' | 'idor'
  | 'ssrf' | 'cors' | 'jwt' | 'browser'
  | 'llm' | 'business' | 'client' | 'files' | 'secrets'

export interface SeedPlaybook {
  id: string
  name: string
  surface: Surface
  kind: 'recon' | 'active'
  severity: Severity
  /** OWASP category codes, e.g. ['A01:2021']. */
  owasp: string[]
  description: string
  /** Params the YAML expects beyond target_url. The campaign orchestrator
   *  skips a playbook when required inputs are missing, rather than firing
   *  YAML that'll error out on a {{placeholder}}. */
  requires: string[]
  yaml: string
}

export const SEED_PLAYBOOKS: SeedPlaybook[] = [
  {
    id: 'hardening',
    name: 'Hardening',
    surface: 'headers',
    kind: 'recon',
    severity: 'moderate',
    owasp: ['A05:2021'],
    description: 'Security headers, CORS, GraphQL hardening, TLS config — baseline defensive posture.',
    requires: ['target_url'],
    yaml: hardening,
  },
  {
    id: 'file_misconfig',
    name: 'Files & Misconfiguration',
    surface: 'files',
    kind: 'active',
    severity: 'high',
    owasp: ['A05:2021'],
    description: 'LFI, unrestricted upload, directory listing, path control, verbose errors.',
    requires: ['target_url'],
    yaml: fileMisconfig,
  },
  {
    id: 'auth_session',
    name: 'Auth & Session',
    surface: 'auth',
    kind: 'active',
    severity: 'critical',
    owasp: ['A07:2021'],
    description: 'Brute force, missing auth, cookie integrity, session fixation.',
    requires: ['target_url', 'login_url'],
    yaml: authSession,
  },
  {
    id: 'access_control',
    name: 'Access Control (BOLA/IDOR)',
    surface: 'idor',
    kind: 'active',
    severity: 'critical',
    owasp: ['A01:2021'],
    description: 'Cross-tenant leakage, authorization bypass, IDOR exposure, privilege escalation.',
    requires: ['target_url', 'auth_token'],
    yaml: accessControl,
  },
  {
    id: 'sql_injection',
    name: 'SQL / NoSQL Injection',
    surface: 'injection',
    kind: 'active',
    severity: 'critical',
    owasp: ['A03:2021'],
    description: 'Classic, time-based, boolean-based, error-based SQL + MongoDB/NoSQL injection.',
    requires: ['target_url'],
    yaml: sqlInjection,
  },
  {
    id: 'code_injection',
    name: 'Code & Command Injection',
    surface: 'injection',
    kind: 'active',
    severity: 'critical',
    owasp: ['A03:2021'],
    description: 'Remote code execution, OS command injection, unsafe eval.',
    requires: ['target_url'],
    yaml: codeInjection,
  },
  {
    id: 'client_side',
    name: 'Client-Side Attacks',
    surface: 'client',
    kind: 'active',
    severity: 'high',
    owasp: ['A03:2021', 'A07:2021'],
    description: 'XSS (reflected/stored/DOM), CSRF, open redirects, cache poisoning.',
    requires: ['target_url'],
    yaml: clientSide,
  },
  {
    id: 'ssrf',
    name: 'SSRF',
    surface: 'ssrf',
    kind: 'active',
    severity: 'high',
    owasp: ['A10:2021'],
    description: 'Cloud metadata, internal IP, DNS rebinding probes through URL-accepting params.',
    requires: ['target_url'],
    yaml: ssrf,
  },
  {
    id: 'deserialization',
    name: 'Deserialization & SSTI',
    surface: 'injection',
    kind: 'active',
    severity: 'critical',
    owasp: ['A08:2021'],
    description: 'Unsafe deserialization + server-side template injection.',
    requires: ['target_url'],
    yaml: deserialization,
  },
  {
    id: 'secrets_crypto',
    name: 'Secrets & Cryptography',
    surface: 'secrets',
    kind: 'active',
    severity: 'critical',
    owasp: ['A02:2021'],
    description: 'Hardcoded creds, weak encryption, JWT validation bypass, sensitive exposure.',
    requires: ['target_url'],
    yaml: secretsCrypto,
  },
  {
    id: 'business_logic',
    name: 'Business Logic',
    surface: 'business',
    kind: 'active',
    severity: 'high',
    owasp: ['A04:2021'],
    description: 'AI-driven logic testing — input validation + workflow abuse beyond static scanners.',
    requires: ['target_url'],
    yaml: businessLogic,
  },
  {
    id: 'llm_injection',
    name: 'LLM / Prompt Injection',
    surface: 'llm',
    kind: 'active',
    severity: 'high',
    owasp: ['LLM01:2025'],
    description: 'Prompt injection, jailbreak, system-context leakage against AI endpoints.',
    requires: ['target_url', 'ai_endpoint'],
    yaml: llmInjection,
  },
]

/** Return the playbooks whose required inputs are all present in `provided`.
 *  Used by the campaign orchestrator so we don't fire YAMLs that refer to
 *  variables we never populated (e.g. auth_token on an unauthenticated
 *  target would leave `{{auth_token}}` literal in the request). */
export function runnablePlaybooks(provided: Record<string, unknown>): SeedPlaybook[] {
  const have = new Set(Object.keys(provided).filter(k => provided[k] !== undefined && provided[k] !== ''))
  // target_url is always injected by the campaign; seed it so playbooks
  // that only depend on target_url pass the gate.
  have.add('target_url')
  return SEED_PLAYBOOKS.filter(p => p.requires.every(r => have.has(r)))
}

/** Playbooks grouped in sensible campaign order:
 *    1. Hardening / files — passive recon, always safe
 *    2. Auth surface — map then probe
 *    3. Injection family (sql → code → client-side → deserial)
 *    4. Privilege (access control, ssrf)
 *    5. Secrets + business logic + LLM — harder to reach, later rounds
 */
export const CAMPAIGN_ORDER: string[] = [
  'hardening',
  'file_misconfig',
  'auth_session',
  'sql_injection',
  'code_injection',
  'client_side',
  'ssrf',
  'access_control',
  'deserialization',
  'secrets_crypto',
  'business_logic',
  'llm_injection',
]

export function orderedPlaybooks(): SeedPlaybook[] {
  const byId = new Map(SEED_PLAYBOOKS.map(p => [p.id, p]))
  return CAMPAIGN_ORDER.map(id => byId.get(id)).filter(Boolean) as SeedPlaybook[]
}

export function initialPlaybook(): SeedPlaybook {
  return orderedPlaybooks()[0]
}

export function playbookById(id: string): SeedPlaybook | undefined {
  return SEED_PLAYBOOKS.find(p => p.id === id)
}

export function reconPlaybooks(): SeedPlaybook[] {
  return SEED_PLAYBOOKS.filter(p => p.kind === 'recon')
}

export function activePlaybooks(): SeedPlaybook[] {
  return SEED_PLAYBOOKS.filter(p => p.kind === 'active')
}
