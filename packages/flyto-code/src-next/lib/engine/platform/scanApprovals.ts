import { request } from '../client'

// scanApprovals.ts — operator consent gate for Active DAST.
// Without an approved row here, the DAST runner refuses to
// scan. This is the load-bearing safety boundary; the UI must
// surface it prominently so operators actually grant consent
// (no approval = no scan = no value).

export type ScanApprovalStatus = 'requested' | 'approved' | 'denied' | 'expired'
export type ScanType = 'active_dast' | 'authenticated_dast'
export type AssetKind = 'attack_surface' | 'repo'

export interface ScanApproval {
  id: string
  org_id: string
  asset_id: string
  asset_kind: AssetKind
  scan_type: ScanType
  status: ScanApprovalStatus
  requested_by?: string
  approved_by?: string
  approved_at?: string | null
  expires_at?: string | null
  denied_at?: string | null
  denied_reason?: string
  notes?: string
  created_at: string
  updated_at: string
}

export interface ListScanApprovalsResponse {
  org_id: string
  count: number
  items: ScanApproval[]
}

export function listScanApprovals(orgId: string, scanType?: ScanType): Promise<ListScanApprovalsResponse> {
  const qs = scanType ? `?scan_type=${scanType}` : ''
  return request('GET', `/api/v1/code/orgs/${orgId}/scan-approvals${qs}`)
}

export interface RequestScanApprovalReq {
  asset_id: string
  asset_kind?: AssetKind
  scan_type?: ScanType
  notes?: string
}

export function requestScanApproval(orgId: string, req: RequestScanApprovalReq): Promise<ScanApproval> {
  return request('POST', `/api/v1/code/orgs/${orgId}/scan-approvals/request`, req)
}

export interface ApproveScanReq {
  expires_in_hours?: number // default 168 (1 week); cap 90 days
  notes?: string
}

export function approveScan(orgId: string, approvalId: string, req: ApproveScanReq = {}): Promise<ScanApproval> {
  return request('POST', `/api/v1/code/orgs/${orgId}/scan-approvals/${approvalId}/approve`, req)
}

export function denyScan(orgId: string, approvalId: string, reason: string): Promise<ScanApproval> {
  return request('POST', `/api/v1/code/orgs/${orgId}/scan-approvals/${approvalId}/deny`, { reason })
}

// Helper — compute time-remaining label for the UI chip.
export function approvalTimeRemaining(approval: ScanApproval): string {
  if (approval.status !== 'approved' || !approval.expires_at) return ''
  const expires = new Date(approval.expires_at).getTime()
  const diff = expires - Date.now()
  if (diff <= 0) return 'expired'
  const hrs = Math.round(diff / 3_600_000)
  if (hrs < 24) return `${hrs}h left`
  return `${Math.round(hrs / 24)}d left`
}
