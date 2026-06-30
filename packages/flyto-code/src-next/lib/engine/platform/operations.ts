// Operations / operator-plane engine client. Types mirror the engine
// handlers VERBATIM (verified against api/handlers_*.go, not transcribed):
//   - GET /api/v1/code/orgs/{id}/integrations/health  → handlers_integration_health.go
//   - GET /api/v1/system/wiring-health                → handlers_system_audit.go
//   - GET /api/v1/events/scope                        → handlers_system_events.go
//   - GET /api/v1/code/orgs/{id}/credentials/per-repo-test → handlers_credential_diagnostic.go
//
// Scan-freshness + SLA-budget reuse existing clients (getOrgHealthSummary,
// the ctem sla-budget client) — not duplicated here.

import { request } from '../client'

// ── Integration health (GET /integrations/health) ───────────────────

export interface IntegrationStatus {
  provider: string           // "github" | "gitlab"
  mode: string               // "app" | "oauth" | "none"
  status: string             // "ok" | "expired" | "no_credential"
  message?: string
  reconnect_url?: string
}

export interface IntegrationHealth {
  integrations: IntegrationStatus[]
  any_expired: boolean
}

export function getIntegrationsHealth(orgId: string) {
  return request<IntegrationHealth>('GET', `/api/v1/code/orgs/${orgId}/integrations/health`)
}

// ── System wiring health (GET /system/wiring-health, public) ─────────

export interface WiringComponent {
  name: string
  status: string             // "ok" | "missing" | "disabled"
  details?: string
  critical: boolean
}

export interface WiringHealth {
  overall_ok: boolean
  components: WiringComponent[]
  note: string
}

export function getWiringHealth() {
  return request<WiringHealth>('GET', '/api/v1/system/wiring-health')
}

// ── Event scope (GET /events/scope) — am I a platform admin? ─────────

export interface EventScope {
  is_platform_admin: boolean
}

export function getEventScope() {
  return request<EventScope>('GET', '/api/v1/events/scope')
}

// ── Per-repo credential test (GET /credentials/per-repo-test) ────────

export interface RepoAccessTest {
  repo_id: string
  full_name: string
  visibility: string
  mode: string               // app | oauth | none
  status: string             // ok | forbidden | not_found | rate_limited | unknown
  http_status?: number
  github_error?: string
  hint?: string
}

export interface PerRepoAccess {
  org_id: string
  token_available: boolean
  mode: string
  tests: RepoAccessTest[]
}

export function testRepoCredentials(orgId: string) {
  return request<PerRepoAccess>('GET', `/api/v1/code/orgs/${orgId}/credentials/per-repo-test`)
}
