// Cloud / CSPM engine client. Types mirror the engine handlers verbatim:
//   - GET  /cloud-posture        → handlers_cloud_posture.go `CloudPosture`
//   - GET  /cloud/connectors/status → handlers_cloud.go connector catalog
//   - POST /cloud/connections       → handlers_cloud.go (AWS AssumeRole connector)
// CSPM findings have their own client in ./security.ts (listCSPMFindings).
//
// All endpoints already exist on the engine (PR-4 AWS surface); this file is
// the missing frontend client so the Cloud pillar can consume them.

import { request } from '../client'
// CloudPosture (+ CloudPostureAccount / CloudPostureResource) is the
// canonical surface-posture rollup type and lives in ./posture.ts
// (owned by the ctem-fe lane). It used to be re-declared verbatim here,
// which let the two copies drift; re-export the single source instead.
import type { CloudPosture } from './posture'

export type { CloudPosture }
export { getCloudPosture } from './posture'

export interface CloudConnectorStatus {
  provider: string
  scanner_id: string
  onboarding_supported: boolean
  scanner_registered: boolean
  collector_status: string
  credential_kind: string
  reason?: string
}

export interface CloudConnectorStatusResponse {
  providers: CloudConnectorStatus[]
}

export function getCloudConnectorStatus(orgId: string) {
  return request<CloudConnectorStatusResponse>(
    'GET',
    `/api/v1/code/orgs/${orgId}/cloud/connectors/status`,
  )
}

// ── Cloud connector (POST /cloud/connections) ────────────────────────
// AWS only today (provider defaults to 'aws'; GCP/Azure are PR-4C). The
// external_id is the confused-deputy guard for cross-account AssumeRole
// and is sealed at rest by the engine's KMS-backed secret store.

export interface CloudConnectionInput {
  provider?: 'aws'
  /** The read-only role the connector assumes. */
  role_arn: string
  /** Confused-deputy guard — required for cross-account AssumeRole. */
  external_id: string
  /** Required: the connector issues regional EC2 calls (e.g. 'us-east-1'). */
  region: string
}

export interface CloudConnectionResult {
  id?: string
  provider: string
  status: string
}

export function connectCloudAccount(orgId: string, input: CloudConnectionInput) {
  return request<CloudConnectionResult>(
    'POST',
    `/api/v1/code/orgs/${orgId}/cloud/connections`,
    { provider: 'aws', ...input },
  )
}
