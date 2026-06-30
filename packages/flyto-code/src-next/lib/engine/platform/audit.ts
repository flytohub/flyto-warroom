/**
 * Tenant audit trail + SHA-256 hash-chain verification.
 *
 * Mirrors the engine's core audit handler (handlers_misc.go):
 *   GET /api/v1/audit?workspace_id=…&limit=…&verify=true → handleListAudit
 *
 * Each entry chains to its predecessor via entryHash/prevHash; passing
 * verify=true makes the engine walk the FULL chain (audit.Verify) and
 * return a tamper-evidence summary alongside the limited slice. In this
 * product the org id IS the workspace id.
 *
 * Imported by DIRECT FILE PATH per the engine-client decoupling rule.
 */
import { request } from '../client'

/** store.AuditLog — one tamper-evident entry. */
export interface AuditLog {
  id: string
  workspaceId: string
  timestamp: string
  actorId: string
  action: string
  resourceType: string
  resourceId: string
  result: string
  entryHash: string
  prevHash: string
}

/** Present only when the request asked for verify=true. */
export interface AuditVerification {
  verified_entries: number
  total_entries: number
  chain_intact: boolean
  error: string
}

export interface AuditResponse {
  logs: AuditLog[]
  count: number
  verification?: AuditVerification
}

export function listAudit(
  workspaceId: string,
  opts: { limit?: number; verify?: boolean } = {},
) {
  const params = new URLSearchParams({ workspace_id: workspaceId })
  if (opts.limit != null) params.set('limit', String(opts.limit))
  if (opts.verify) params.set('verify', 'true')
  return request<AuditResponse>('GET', `/api/v1/audit?${params.toString()}`)
}
