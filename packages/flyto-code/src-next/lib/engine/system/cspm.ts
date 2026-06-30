import { request } from '../client'

// cspm.ts — CSPM (cloud posture) rule catalog read.
// Backend: api/handlers_cspm_rules.go (GET /api/v1/system/cspm/rules,
// requirePlatformAdmin, system:cspm:read).

export interface CSPMRule {
  id: string
  version: number
  title: string
  description?: string
  severity: string
  category?: string
  provider: string
  enabled: boolean
  remediation?: string
  created_at?: string
  updated_at?: string
}

export interface ListCSPMRulesResponse {
  count: number
  rules: CSPMRule[]
  note?: string
}

export function listCSPMRules(): Promise<ListCSPMRulesResponse> {
  return request('GET', '/api/v1/system/cspm/rules')
}
