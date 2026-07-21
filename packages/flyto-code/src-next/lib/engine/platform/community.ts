import { requestPublicCE } from '../client'

export type CEProductSurface = 'code' | 'container' | 'cloud' | 'runtime' | 'external'

export interface CEProductLoopSummary {
  asset_count: number
  finding_count: number
  attack_path_count: number
  evidence_count: number
  remediation_count: number
  validation_count: number
  impacted_assets: string[]
}

export interface CEProductLoopEvidence {
  id: string
  finding_id: string
  kind: string
  replayable: boolean
  artifacts: string[]
  signature: string
  redaction: string
  generated_by: string
}

export interface CEProductLoopOverlay {
  capability: string
  ce_behavior: string
  paid_overlay: string
}

export interface CEProductLoopResponse {
  schema: string
  product: string
  edition: 'community'
  data_mode: string
  provider_execution: string
  scope: {
    workspace_id: string
    org_id: string
    surfaces: CEProductSurface[]
    safe_mode: string
  }
  summary: CEProductLoopSummary
  evidence: CEProductLoopEvidence[]
  enterprise_overlay: CEProductLoopOverlay[]
  generated_at: string
}

export function getCEProductLoop(): Promise<CEProductLoopResponse> {
  return requestPublicCE<CEProductLoopResponse>('/api/v1/ce/product-loop')
}
