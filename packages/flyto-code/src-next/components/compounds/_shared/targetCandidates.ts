/**
 * Shared pentest/red-team target-candidate logic — the SINGLE source of
 * truth used by the Pentest workspace (PentestView) and the Red Team
 * war room (RedTeamView).
 *
 * Why this exists: a red-team campaign can only run against a
 * `pentest_projects` row, but Footprint/attack-surface discovers raw
 * hosts that are NOT projects yet. The Pentest page surfaced those
 * "candidates" (and promoted them on pick); the Red Team page didn't,
 * so the same subdomain showed up in one surface and was invisible in
 * the other. Extracting the candidate build + promote here means both
 * surfaces draw from one universe and can never drift again.
 */

import {
  createExternalTarget,
  type PentestProject, type AttackSurfaceAsset, type PentestSuggestedTarget,
} from '@lib/engine'

/** A discovered host that COULD be attacked but isn't a project yet. */
export type PentestCandidate = {
  key: string
  value: string
  source: string
  tier: string
  reason: string
  suggested?: PentestSuggestedTarget
}

/** Minimal project handle the campaign launch path needs. */
export type CampaignProjectRef = Pick<PentestProject, 'id' | 'target_url' | 'config' | 'environment'>

const PENTEST_TARGET_ASSET_TYPES = new Set([
  'domain',
  'subdomain',
  'host',
  'url',
  'api',
  'api_endpoint',
  'rest_api',
  'graphql',
])

/** Merge Footprint suggested-targets + attack-surface assets into a
 *  deduplicated candidate list (one row per host). */
export function buildPentestCandidates(
  suggestedTargets: PentestSuggestedTarget[],
  attackSurfaceAssets: AttackSurfaceAsset[],
): PentestCandidate[] {
  const seen = new Set<string>()
  const out: PentestCandidate[] = []

  const push = (candidate: PentestCandidate) => {
    const host = extractTargetHost(candidate.value)
    if (!host || seen.has(host)) return
    seen.add(host)
    out.push({ ...candidate, key: `${candidate.source}:${host}`, value: host })
  }

  suggestedTargets.forEach(target => {
    push({
      key: target.entity_id,
      value: target.value,
      source: target.source || 'Footprint',
      tier: target.tier || 'candidate',
      reason: target.rationale || `${target.type || 'entity'} · score ${Math.round(target.relationship_score ?? 0)}`,
      suggested: target,
    })
  })

  attackSurfaceAssets.forEach(asset => {
    if (!isPentestTargetAsset(asset)) return
    const host = extractTargetHost(asset.value)
    if (!host) return
    const reasonParts = [
      asset.asset_type,
      asset.asset_tier,
      asset.status && asset.status !== 'active' ? asset.status : null,
    ].filter(Boolean)
    push({
      key: asset.id,
      value: host,
      source: 'Attack Surface',
      tier: asset.asset_tier || 'candidate',
      reason: reasonParts.join(' · ') || 'discovered host',
    })
  })

  return out
}

export function isPentestTargetAsset(asset: AttackSurfaceAsset): boolean {
  const type = String(asset.asset_type || '').toLowerCase()
  if (PENTEST_TARGET_ASSET_TYPES.has(type)) return true
  return !!extractTargetHost(asset.value) && !['technology', 'handle', 'organization', 'vendor'].includes(type)
}

export function extractTargetHost(value: string | null | undefined): string | null {
  if (!value) return null
  const raw = value
    .split(' — ')[0]
    .replace(/^\*\./, '')
    .trim()
  if (!raw || /\s/.test(raw)) return null

  try {
    const parsed = new URL(raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`)
    const host = parsed.hostname.replace(/^\*\./, '').toLowerCase()
    return host.includes('.') ? host : null
  } catch {
    const host = raw.replace(/^https?:\/\//, '').split('/')[0].split(':')[0].toLowerCase()
    return host.includes('.') ? host : null
  }
}

export function normaliseTargetURL(value: string): string {
  if (value.startsWith('http://') || value.startsWith('https://')) return value
  return `https://${value}`
}

export function inferCandidateProjectType(candidate: PentestCandidate): PentestProject['project_type'] {
  const v = candidate.value.toLowerCase()
  if (candidate.suggested?.tier === 'lookalike') return 'attack_surface'
  if (candidate.source.toLowerCase().includes('attack')) return 'attack_surface'
  if (v.includes('api.') || v.includes('/api/')) return 'rest_api'
  return 'attack_surface'
}

export function isPentestProject(input: PentestProject | PentestCandidate): input is PentestProject {
  return 'target_url' in input && 'org_id' in input
}

/** Promote a discovered candidate through the unified target onboarding API.
 *  The backend may reuse a parent/existing project; active scans still pass
 *  through the active authorization gate before running. */
export async function ensurePentestProject(orgId: string, candidate: PentestCandidate): Promise<CampaignProjectRef> {
  const targetUrl = normaliseTargetURL(candidate.value)
  const result = await createExternalTarget(orgId, {
    name: candidate.value,
    display_name: candidate.value,
    target: targetUrl,
    target_url: targetUrl,
    relationship: 'owned',
    assessment_intent: 'active_authorized_testing',
    project_type: inferCandidateProjectType(candidate),
    environment: 'production',
    role: 'primary',
  })

  if (!result.project) {
    const action = result.target.required_action ? ` (${result.target.required_action})` : ''
    throw new Error(`${result.message || 'Target was stored as passive footprint evidence'}${action}`)
  }

  return result.project
}
