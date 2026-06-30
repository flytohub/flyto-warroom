/**
 * threatIntel.ts — typed client for the Darkweb & Threat Intel
 * endpoints (engine commit b8b7893).
 *
 * Five surfaces:
 *   - listThreatActors     — MITRE ATT&CK Groups catalog
 *   - listMalwareFamilies  — MITRE ATT&CK Software catalog
 *   - listRansomware       — ransomware.live mirror
 *   - listIoCs             — org-scoped IoC aggregator
 *   - getSensorMap         — country→count rollup
 *   - listSensorObservations — global Sensor Intelligence ledger
 */

import { request } from '../client'

// ── Shared ───────────────────────────────────────────────────────

export type ThreatIntelSource = 'mitre_attack' | 'ransomware.live' | 'curated'

// ── Threat Actors ────────────────────────────────────────────────

export interface ThreatActor {
  id: string
  external_id: string
  name: string
  aliases: string            // JSON array — legacy, prefer aliases_list
  description: string
  country: string
  region: string
  motivation: string
  sectors: string            // JSON array — legacy, prefer sectors_list
  target_countries: string   // JSON array — legacy, prefer target_countries_list
  techniques: string         // JSON array of ATT&CK technique IDs — legacy, prefer techniques_list
  malware_used: string       // JSON array of malware external_ids — legacy, prefer malware_used_list
  source: ThreatIntelSource
  source_url: string
  first_seen_at?: string | null
  last_seen_at?: string | null
  updated_at: string

  // ── Audit m2: server-projected typed siblings + counts ────────
  //
  // Backend now ships the JSON-array columns as both raw strings
  // (above — back-compat) AND pre-parsed `*_list` slices + computed
  // `*_count` ints. New code MUST read these instead of calling
  // `parseJsonArray()` on the raw strings — server is the single
  // source of truth, and the parser is one round-trip per row
  // cheaper at render time.
  //
  // Optional only because pre-migration cached rows or older
  // engine builds won't carry them; new builds always emit them
  // (the slice is `[]` not `null` on empty). Once every consumer
  // migrates the legacy raw strings can be dropped — that's a
  // separate sweep with its own back-compat audit.
  //
  // Codex boundary 2026-05-24: `parseJsonArray()` callers in
  // ThreatActorsView still in place. Wait until staging confirms
  // the new fields actually land before deleting the local parser.
  aliases_list?: string[]
  sectors_list?: string[]
  target_countries_list?: string[]
  techniques_list?: string[]
  malware_used_list?: string[]
  aliases_count?: number
  sectors_count?: number
  target_countries_count?: number
  techniques_count?: number
  malware_used_count?: number
}

export interface ThreatActorFilter {
  q?: string
  country?: string
  region?: string
  source?: string
  limit?: number
  offset?: number
}

export function listThreatActors(orgId: string, filter: ThreatActorFilter = {}) {
  const qs = buildQS(filter)
  return request<{
    actors: ThreatActor[]; count: number; total: number; limit: number; offset: number
  }>('GET', `/api/v1/code/orgs/${orgId}/threat-intel/actors${qs}`)
}

// ── Malware Families ─────────────────────────────────────────────

export interface MalwareFamily {
  id: string
  external_id: string
  name: string
  aliases: string            // JSON array — legacy, prefer aliases_list
  description: string
  family_type: 'malware' | 'tool' | ''
  platforms: string          // JSON array — legacy, prefer platforms_list
  capabilities: string       // JSON array — legacy, prefer capabilities_list
  actors_used: string        // JSON array — legacy, prefer actors_used_list
  techniques: string         // JSON array — legacy, prefer techniques_list
  source: ThreatIntelSource
  source_url: string
  first_seen_at?: string | null
  last_seen_at?: string | null
  updated_at: string

  // ── Audit m1: server-projected typed siblings + counts ────────
  //
  // Mirror of the ThreatActor change above (see that interface for
  // the back-compat contract + Codex boundary note). Same rules:
  //   - `*_list` is `[]` not `null` on empty
  //   - `*_count` is pre-computed by the backend
  //   - parseJsonArray callers in MalwareFamiliesView stay in
  //     place until staging confirms the new fields land
  aliases_list?: string[]
  platforms_list?: string[]
  capabilities_list?: string[]
  actors_used_list?: string[]
  techniques_list?: string[]
  aliases_count?: number
  platforms_count?: number
  capabilities_count?: number
  actors_used_count?: number
  techniques_count?: number
}

export interface MalwareFamilyFilter {
  q?: string
  family_type?: 'malware' | 'tool'
  platform?: string          // windows / linux / macos / android / ios
  source?: string
  limit?: number
  offset?: number
}

export function listMalwareFamilies(orgId: string, filter: MalwareFamilyFilter = {}) {
  const qs = buildQS(filter)
  return request<{
    families: MalwareFamily[]; count: number; total: number; limit: number; offset: number
  }>('GET', `/api/v1/code/orgs/${orgId}/threat-intel/malware${qs}`)
}

// ── Ransomware Incidents ─────────────────────────────────────────

export interface RansomwareIncident {
  id: string
  external_id: string
  victim_name: string
  victim_domain: string
  victim_country: string
  victim_sector: string
  group_name: string
  leak_url: string
  published_at?: string | null
  discovered_at: string
  description: string
  source: ThreatIntelSource
  raw_payload?: string
}

export interface RansomwareFilter {
  q?: string
  group?: string
  country?: string
  sector?: string
  limit?: number
  offset?: number
}

export function listRansomware(orgId: string, filter: RansomwareFilter = {}) {
  const qs = buildQS(filter)
  return request<{
    incidents: RansomwareIncident[]; count: number; total: number; limit: number; offset: number
  }>('GET', `/api/v1/code/orgs/${orgId}/threat-intel/ransomware${qs}`)
}

// ── IoC Lookup ───────────────────────────────────────────────────

export interface IoCRow {
  ioc: string
  kind: string              // c2 | url | ip | phishing | credential | stealer | breach
  source?: string
  confidence?: number
  first_seen_at?: string | null
  last_seen_at?: string | null
  tags?: string
  metadata?: string         // JSON string
}

export interface IoCFilter {
  q?: string
  kind?: string
  source?: string
  limit?: number
  offset?: number
}

export function listIoCs(orgId: string, filter: IoCFilter & { scope?: 'org' | 'global' | 'both' } = {}) {
  const qs = buildQS(filter as Record<string, unknown>)
  return request<{
    iocs: IoCRow[]
    count: number
    stats: Record<string, number>
    global_stats: Record<string, number>
    scope: 'org' | 'global' | 'both'
    limit: number
    offset: number
    // Honest empty-state (engine convergence 2026-06-10): "" = results present,
    // "no_attack_surface" = org never ran domain discovery, "no_iocs" = surface
    // exists but no IoC-class assets matched.
    empty_reason?: '' | 'no_attack_surface' | 'no_iocs'
  }>('GET', `/api/v1/code/orgs/${orgId}/threat-intel/iocs${qs}`)
}

// ── Feed Status ──────────────────────────────────────────────────

export interface FeedStatus {
  source: string
  last_run_at?: string | null
  last_ok_at?: string | null
  last_error?: string
  rows_ingested: number
  total_rows: number
}

export function listFeedStatus(orgId: string) {
  return request<{ feeds: FeedStatus[]; count: number }>(
    'GET', `/api/v1/code/orgs/${orgId}/threat-intel/feed-status`,
  )
}

// ── Sensor Map ───────────────────────────────────────────────────

export function getSensorMap(orgId: string) {
  return request<{
    by_country: Record<string, number>
    org_by_country?: Record<string, number>
    global_by_country?: Record<string, number>
    scope?: 'org' | 'global' | 'both'
    // Unknown/invalid country codes are bucketed under "ZZ" (render as
    // "Unknown origin", never plotted). empty_reason mirrors listIoCs.
    empty_reason?: '' | 'no_attack_surface' | 'no_iocs'
  }>(
    'GET', `/api/v1/code/orgs/${orgId}/threat-intel/sensor-map`,
  )
}

export interface ThreatSensorObservation {
  id: string
  source: string
  indicator: string
  indicator_kind: 'ip' | 'domain' | 'url' | string
  threat_category: string
  country_code?: string
  asn?: number
  as_name?: string
  protocol?: string
  port?: number
  observed_count: number
  confidence: number
  first_seen_at?: string
  last_seen_at?: string
  raw_payload?: string
}

export interface ThreatSensorStats {
  total: number
  by_country: Record<string, number>
  by_category: Record<string, number>
  by_kind: Record<string, number>
  by_source: Record<string, number>
}

export interface ThreatSensorObservationFilter {
  q?: string
  kind?: 'ip' | 'domain' | 'url'
  category?: string
  country?: string
  asn?: number
  source?: string
  limit?: number
  offset?: number
}

export function listSensorObservations(orgId: string, filter: ThreatSensorObservationFilter = {}) {
  const qs = buildQS(filter)
  return request<{
    observations: ThreatSensorObservation[]
    count: number
    stats: ThreatSensorStats
    empty_reason?: '' | 'no_attack_surface' | 'no_iocs'
    limit: number
    offset: number
  }>(
    'GET', `/api/v1/code/orgs/${orgId}/threat-intel/sensor-observations${qs}`,
  )
}

// ── Helpers ──────────────────────────────────────────────────────

// Accept any structured object — typed filter interfaces don't
// satisfy Record<string, unknown> without an index signature.
function buildQS(obj: Record<string, unknown> | object): string {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (v === undefined || v === null || v === '') continue
    params.set(k, String(v))
  }
  const s = params.toString()
  return s ? `?${s}` : ''
}

/** Helper for the JSON-array string columns (aliases, sectors,
 *  platforms, techniques). Returns [] on any parse failure so
 *  rendering never crashes on a malformed row.
 *
 *  TODO(backend-truth, m1/m2): the engine stores these as JSON
 *  strings and ships them raw — the frontend then has to JSON.parse
 *  every row for display + .length counts. Schema should return
 *  typed arrays (`aliases: string[]`, `techniques: string[]`) plus
 *  pre-computed counts (`technique_count`) so the parser becomes
 *  dead code. See FRONTEND_LOGIC_AUDIT_2026_05_24.md#m1 */
export function parseJsonArray(s?: string): string[] {
  if (!s) return []
  try {
    const v = JSON.parse(s)
    return Array.isArray(v) ? v.filter(x => typeof x === 'string') : []
  } catch { return [] }
}
