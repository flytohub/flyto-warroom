import { request } from '../client'

// sso.ts — SAML 2.0 SSO admin config.
// Backend: api/handlers_saml_sso.go (requirePlatformAdmin + system:sso:read/write).
// Stores ONLY public IdP metadata + the public signing cert (PEM). The upsert
// rejects a PEM that parses as a private key — there is no secret column.
//
//   GET  /api/v1/system/sso/saml?org=<id> — list configs (or one org)
//   POST /api/v1/system/sso/saml          — upsert one org's config

export interface SAMLConfig {
  org_id: string
  enabled: boolean
  idp_entity_id: string
  idp_sso_url: string
  idp_certificate: string
  sp_entity_id: string
  sp_acs_url: string
  attribute_mapping: Record<string, string>
  created_at?: string
  updated_at?: string
}

export interface ListSAMLConfigsResponse {
  configs: SAMLConfig[]
  count: number
  note?: string
}

export function listSAMLConfigs(org?: string): Promise<ListSAMLConfigsResponse> {
  const suffix = org ? `?org=${encodeURIComponent(org)}` : ''
  return request('GET', `/api/v1/system/sso/saml${suffix}`)
}

export interface UpsertSAMLConfigReq {
  org_id: string
  enabled?: boolean
  idp_entity_id: string
  idp_sso_url: string
  idp_certificate: string
  sp_entity_id: string
  sp_acs_url: string
  attribute_mapping?: Record<string, string>
}

export function upsertSAMLConfig(req: UpsertSAMLConfigReq): Promise<unknown> {
  return request('POST', '/api/v1/system/sso/saml', req)
}
