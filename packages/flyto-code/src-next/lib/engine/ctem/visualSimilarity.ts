import { request } from '../client'

// visualSimilarity.ts — visual phishing detection. Operator
// uploads their canonical login page once; subsequent lookalike
// screenshots get a similarity score via perceptual hash.
// Backend: internal/imghash + handlers_visual_similarity.go.

export interface CanonicalLogin {
  image_id: string
  visual_hash: string
  uploaded_by: string
  uploaded_at: string
  kind?: BrandReferenceKind
}

export type BrandReferenceKind = 'canonical_login' | 'logo' | 'homepage'

// uploadCanonicalLogin posts an image file to the engine. The
// engine computes the perceptual hash + persists in CAS + on
// the org config. Returns the persisted reference.
//
// The fetcher is custom-rolled instead of going through request()
// because the wrapped client serialises JSON; we need multipart.
export async function uploadCanonicalLogin(orgId: string, file: File | Blob): Promise<CanonicalLogin> {
  const { BASE, authHeader } = await import('../client')
  const auth = await authHeader()
  if (!auth) throw new Error('Not authenticated')
  const form = new FormData()
  form.append('image', file)
  const url = `${BASE}/api/v1/code/orgs/${orgId}/canonical-login`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: auth },
    body: form,
  })
  if (!res.ok) throw new Error(`canonical-login upload failed: ${res.status} ${await res.text().catch(() => '')}`)
  return res.json()
}

export async function uploadBrandReference(
  orgId: string,
  file: File | Blob,
  kind: BrandReferenceKind,
): Promise<CanonicalLogin> {
  const { BASE, authHeader } = await import('../client')
  const auth = await authHeader()
  if (!auth) throw new Error('Not authenticated')
  const form = new FormData()
  form.append('image', file)
  form.append('kind', kind)
  const url = `${BASE}/api/v1/code/orgs/${orgId}/brand-references`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: auth },
    body: form,
  })
  if (!res.ok) throw new Error(`brand-reference upload failed: ${res.status} ${await res.text().catch(() => '')}`)
  return res.json()
}

export interface SimilarityMatch {
  asset_id: string
  value: string
  similarity: number   // 0-100
  visual_hash: string
  asset_type: string
}

export interface SimilarityResponse {
  org_id: string
  canonical: string | null
  matches: SimilarityMatch[]
  threshold: number
  hint?: string
}

export function getVisualSimilarity(orgId: string): Promise<SimilarityResponse> {
  return request('GET', `/api/v1/code/orgs/${orgId}/visual-similarity`)
}
