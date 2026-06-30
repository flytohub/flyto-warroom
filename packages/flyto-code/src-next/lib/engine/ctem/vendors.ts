// vendors.ts — Third-party vendor risk assessment client.
//
// Backend: handlers_vendor.go. The scoring blends an external score
// pulled from the org's attack-surface (60%) with a questionnaire
// score (40%). Returns nil for either when missing, so the UI must
// treat each score as optional.
//
// Routes:
//   GET    /api/v1/code/orgs/{id}/vendors
//   POST   /api/v1/code/orgs/{id}/vendors
//   PATCH  /api/v1/code/vendors/{id}
//   DELETE /api/v1/code/vendors/{id}
//   POST   /api/v1/code/vendors/{id}/assess
//   GET    /api/v1/code/orgs/{id}/vendor-risk-summary

import { request } from '../client'

export type VendorCategory = 'cdn' | 'hosting' | 'analytics' | 'payment' | 'saas' | 'other'
export type VendorCriticality = 'critical' | 'high' | 'medium' | 'low'
export type VendorStatus = 'pending' | 'in_progress' | 'completed' | 'expired'
export type VendorRiskLevel = 'critical' | 'high' | 'medium' | 'low' | 'unknown'

export interface VendorAssessment {
  id: string
  org_id: string
  vendor_name: string
  vendor_domain: string
  category: VendorCategory
  criticality: VendorCriticality
  status: VendorStatus
  questionnaire: string   // JSON template
  responses: string       // JSON {questionId: answer}
  external_score: number | null
  questionnaire_score: number | null
  combined_score: number | null
  risk_level: VendorRiskLevel
  assessor: string
  notes: string
  last_assessed_at: string | null
  created_at?: string
  updated_at?: string
}

export interface VendorTopRisk {
  id: string
  vendor_name: string
  risk_level: VendorRiskLevel
  combined_score?: number | null
  criticality: VendorCriticality
}

export interface VendorRiskSummary {
  total_vendors: number
  assessed: number
  pending: number
  by_risk: Record<VendorRiskLevel, number>
  by_category: Record<string, number>
  avg_score: number
  top_risks: VendorTopRisk[] | null
}

export interface CreateVendorReq {
  vendor_name: string
  vendor_domain?: string
  category?: VendorCategory
  criticality?: VendorCriticality
  notes?: string
}

export interface UpdateVendorReq {
  vendor_name?: string
  vendor_domain?: string
  category?: VendorCategory
  criticality?: VendorCriticality
  status?: VendorStatus
  responses?: string
  notes?: string
  assessor?: string
}

export function listVendors(orgId: string) {
  return request<VendorAssessment[]>('GET', `/api/v1/code/orgs/${orgId}/vendors`)
}

export function createVendor(orgId: string, req: CreateVendorReq) {
  return request<VendorAssessment>('POST', `/api/v1/code/orgs/${orgId}/vendors`, req)
}

export function updateVendor(vendorId: string, req: UpdateVendorReq) {
  return request<VendorAssessment>('PATCH', `/api/v1/code/vendors/${vendorId}`, req)
}

export function deleteVendor(vendorId: string) {
  return request<{ status: string }>('DELETE', `/api/v1/code/vendors/${vendorId}`)
}

export function assessVendor(vendorId: string) {
  return request<VendorAssessment>('POST', `/api/v1/code/vendors/${vendorId}/assess`)
}

export function getVendorRiskSummary(orgId: string) {
  return request<VendorRiskSummary>('GET', `/api/v1/code/orgs/${orgId}/vendor-risk-summary`)
}

// Default questionnaire structure — mirrors defaultVendorQuestionnaire
// in handlers_vendor.go. Used only to render the form; the engine
// owns the canonical template.
export interface QuestionnaireQuestion {
  id: string
  text: string
  type: 'yes_no'
  weight: number
}

export interface QuestionnaireSection {
  title: string
  questions: QuestionnaireQuestion[]
}

export interface VendorQuestionnaire {
  sections: QuestionnaireSection[]
}

export function parseQuestionnaire(raw: string): VendorQuestionnaire | null {
  try {
    return JSON.parse(raw) as VendorQuestionnaire
  } catch {
    return null
  }
}

export function parseResponses(raw: string): Record<string, string> {
  try {
    return JSON.parse(raw) as Record<string, string>
  } catch {
    return {}
  }
}
