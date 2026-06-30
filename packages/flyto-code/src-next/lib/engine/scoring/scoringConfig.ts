// scoringConfig.ts — Per-org scoring weight configuration.
// Backend: handlers_scoring_config.go + internal/scoring/config.go.
//
//   GET  /api/v1/code/orgs/{id}/scoring-config
//   PUT  /api/v1/code/orgs/{id}/scoring-config
//   POST /api/v1/code/orgs/{id}/scoring-config/reset

import { request } from '../client'

export type ScoringConfigSource = 'default' | 'custom' | 'auto'

export interface ScoringConfig {
  category_weights: Record<string, number>
  confidence_multipliers: Record<string, number>
  risk_factors: Record<string, number>
  source: ScoringConfigSource
  score_runs: number
}

export function getScoringConfig(orgId: string) {
  return request<ScoringConfig>('GET', `/api/v1/code/orgs/${orgId}/scoring-config`)
}

export function updateScoringConfig(orgId: string, cfg: ScoringConfig) {
  return request<ScoringConfig>('PUT', `/api/v1/code/orgs/${orgId}/scoring-config`, cfg)
}

export function resetScoringConfig(orgId: string) {
  return request<ScoringConfig>('POST', `/api/v1/code/orgs/${orgId}/scoring-config/reset`)
}

// Hardcoded defaults — mirrors scoring.DefaultConfig() in Go. Used
// when offline / 404 so the editor still renders a baseline the
// operator can adjust before saving.
export const DEFAULT_CATEGORY_WEIGHTS: Record<string, number> = {
  'code-security':  0.35,
  'attack-surface': 0.30,
  'diligence':      0.20,
  'code-quality':   0.10,
}

export const DEFAULT_CONFIDENCE_MULTIPLIERS: Record<string, number> = {
  L0: 0.3,
  L1: 0.7,
  L2: 1.0,
}

export const DEFAULT_RISK_FACTORS: Record<string, number> = {
  epss_no_data_default: 0.3,
  reach_unknown:        0.5,
  reach_unreachable:    0.1,
  impact_default:       0.6,
}
