// aiFix.ts — AI-generated fix proposal for a single alert.
//
// Backend: POST /api/v1/code/alerts/{id}/generate-fix → 202 with proposal.
//
// The verify loop runs asynchronously after the engine returns the
// initial proposal — `verify_status: 'pending'` is the expected
// initial state. Consumers should re-poll or subscribe to SSE for the
// terminal status, not block on this call.

import { request } from '../client'

export interface FixProposal {
  alert_id: string
  diff: string
  summary: string
  confidence: number
  generated_at: string
  model: string
  verify_status: 'pending' | 'verified' | 'rejected'
  verify_details?: string
}

export function generateFixForAlert(alertId: string) {
  return request<FixProposal>('POST', `/api/v1/code/alerts/${alertId}/generate-fix`)
}
