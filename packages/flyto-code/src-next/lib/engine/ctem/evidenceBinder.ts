// evidenceBinder.ts — Compliance evidence binder for SOC2/ISO27001/etc.
//
// Backend: GET /api/v1/code/orgs/{id}/compliance/evidence?framework=…&format=…
//
// Two formats:
//   - JSON: parsed in-app (getEvidenceBinder) — used by the binder
//     preview / diff UI.
//   - Markdown: authenticated blob download (downloadEvidenceBinder).
//     The engine route is behind AuthMiddleware, so a plain <a href>
//     cannot carry the Bearer token.

import { request, requestBlob, type RequestOptions } from '../client'

export type ComplianceFramework =
  | 'nist'
  | 'pci'
  | 'iso27001'
  | 'soc2'
  | 'owasp'
  | 'gdpr'
  | 'hipaa'

export interface EvidenceItem {
  source: string
  description: string
  collected_at: string
  hash: string
}

export interface ControlEvidence {
  control_id: string
  control_name: string
  status: 'pass' | 'fail' | 'partial' | 'not_applicable'
  details: string
  evidence: EvidenceItem[]
}

export interface EvidenceBinder {
  OrgID: string
  OrgName: string
  Framework: string
  GeneratedAt: string
  Controls: ControlEvidence[]
  OverallScore: number
  EnvelopeHash: string
}

export function getEvidenceBinder(
  orgId: string,
  framework: ComplianceFramework,
) {
  return request<EvidenceBinder>(
    'GET',
    `/api/v1/code/orgs/${orgId}/compliance/evidence?framework=${framework}&format=json`,
  )
}

export function evidenceBinderDownloadUrl(
  orgId: string,
  framework: ComplianceFramework,
): string {
  return `/api/v1/code/orgs/${orgId}/compliance/evidence?framework=${framework}&format=md`
}

function filenameFor(orgId: string, framework: ComplianceFramework): string {
  return `${orgId}-${framework}-evidence.md`
}

export async function downloadEvidenceBinder(
  orgId: string,
  framework: ComplianceFramework,
  opts?: RequestOptions,
): Promise<void> {
  const blob = await requestBlob('GET', evidenceBinderDownloadUrl(orgId, framework), undefined, opts)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filenameFor(orgId, framework)
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
