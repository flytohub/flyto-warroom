/**
 * footprint/shared.ts — pure-data constants + helpers used by every
 * Footprint sub-view. Extracted from FootprintGraphView.tsx 2026-05-23
 * to drop the monolithic file size (was 3500 lines).
 *
 * No JSX, no React hooks — safe to import from any sub-file without
 * pulling render dependencies. All UI strings flow through tOr() so
 * locale switching reaches inside the panels.
 */

import { tOr } from '@lib/i18n'
import { actionability, type ActionabilityTier, type FootprintEntity } from '@lib/engine/code/footprintGraph'

// ─────────────────────────────────────────────────────────────────
// Reason codes — relationship / surface / signal / negative
// ─────────────────────────────────────────────────────────────────

/** Reason-code → dimension bucket so the side panel can split codes
 *  into "Why related" vs "Validation signals" — mirrors the backend
 *  rule pack's relationship/attack_surface/validation_signal split
 *  per code. Add new codes here as the backend rule pack grows. */
export const REASON_CODE_DIMENSION: Record<string, 'rel' | 'surface' | 'signal' | 'negative'> = {
  // Relationship
  primary_domain_subdomain: 'rel',
  seed_links_to_entity: 'rel',
  entity_links_back_to_seed: 'rel',
  entity_mentions_seed_domain: 'rel',
  email_domain_matches_seed: 'rel',
  canonical_metadata_match: 'rel',
  same_org_name: 'rel',
  name_high_similarity: 'rel',
  subdomain_of_seed: 'rel',
  product_name_mention: 'rel',
  news_co_mention: 'rel',
  keyword_match: 'rel',
  fuzzy_brand_similarity: 'rel',
  alias_co_mention: 'rel',
  // Attack surface
  external_login_portal: 'surface',
  web_app_reachable: 'surface',
  public_api_endpoint: 'surface',
  github_public_repo: 'surface',
  internal_hostname_pattern: 'surface',
  news_only_mention: 'surface',
  // Validation signal
  dmarc_none: 'signal',
  spf_softfail: 'signal',
  email_format_derivable: 'signal',
  breach_email_domain_hit: 'signal',
  weak_security_headers: 'signal',
  server_banner_version_leak: 'signal',
  robots_admin_paths: 'signal',
  github_secret_like_pattern: 'signal',
  internal_url_in_public_repo: 'signal',
  dev_or_staging_subdomain: 'signal',
  stale_frontend_180d: 'signal',
  vendor_recent_advisory: 'signal',
  lookalike_resolves: 'signal',
  // Negative
  different_industry: 'negative',
  different_country: 'negative',
  whois_ownership_conflict: 'negative',
  name_collision_common_word: 'negative',
}

/** Operator-friendly short label per reason code. Falls back to the
 *  raw code when not present so new codes still render. Locale layer
 *  in reasonCodeLabel() takes precedence over this English dictionary. */
export const REASON_CODE_LABEL: Record<string, string> = {
  primary_domain_subdomain: 'Belongs to primary domain',
  seed_links_to_entity: 'Seed website links to this entity',
  entity_links_back_to_seed: 'Entity links back to seed',
  entity_mentions_seed_domain: 'Mentions primary domain',
  email_domain_matches_seed: 'Email domain matches seed',
  canonical_metadata_match: 'Authoritative metadata names the seed',
  same_org_name: 'Owner / publisher matches verified alias',
  name_high_similarity: 'Name closely resembles brand',
  subdomain_of_seed: 'Subdomain of seed apex',
  product_name_mention: 'Verified product name mentioned',
  news_co_mention: 'Paired with verified alias in news mention',
  keyword_match: 'Keyword overlap (weak)',
  fuzzy_brand_similarity: 'Approximate brand similarity',
  alias_co_mention: 'Candidate alias co-mentioned with verified alias',
  external_login_portal: 'External login portal pattern',
  web_app_reachable: 'Web application reachable',
  public_api_endpoint: 'Public API endpoint',
  github_public_repo: 'Public repository',
  internal_hostname_pattern: 'Admin / staging / internal hostname',
  news_only_mention: 'News-only surface',
  dmarc_none: 'DMARC missing or p=none',
  spf_softfail: 'SPF softfail / missing',
  email_format_derivable: 'Email format derivable',
  breach_email_domain_hit: 'Email domain in breach evidence',
  weak_security_headers: 'Weak security headers',
  server_banner_version_leak: 'Server banner reveals version',
  robots_admin_paths: 'robots.txt / sitemap exposes admin paths',
  github_secret_like_pattern: 'Repo contains secret-shape token',
  internal_url_in_public_repo: 'Internal hostname in public repo',
  dev_or_staging_subdomain: 'Dev / staging subdomain',
  stale_frontend_180d: 'Web app stale (180+ days)',
  vendor_recent_advisory: 'Vendor has recent advisory',
  lookalike_resolves: 'Lookalike domain resolves',
  different_industry: 'Different industry',
  different_country: 'Different country',
  whois_ownership_conflict: 'WHOIS ownership conflict',
  name_collision_common_word: 'Common-word brand collision',
}

export function reasonCodeLabel(code: string): string {
  // i18n first; fall back to the embedded English dictionary;
  // finally a humanised slug. Three-layer fallback means new
  // locales without the key still render meaningfully.
  return tOr(`footprint.reason.${code}`, REASON_CODE_LABEL[code] ?? code.replace(/_/g, ' '))
}

export function bucketReasonCodes(codes: string[]) {
  const rel: string[] = []
  const surface: string[] = []
  const signal: string[] = []
  const negative: string[] = []
  for (const c of codes) {
    const bucket = REASON_CODE_DIMENSION[c] ?? 'rel'
    if (bucket === 'rel') rel.push(c)
    else if (bucket === 'surface') surface.push(c)
    else if (bucket === 'signal') signal.push(c)
    else negative.push(c)
  }
  return { rel, surface, signal, negative }
}

/** Walk parent_entity_id back to seed (depth 0) for the discovery
 *  chain visualisation. Returns ordered list seed → … → entity. */
export function discoveryChain(entity: FootprintEntity, byId: Map<string, FootprintEntity>): FootprintEntity[] {
  const chain: FootprintEntity[] = []
  let cur: FootprintEntity | undefined = entity
  const seen = new Set<string>()
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    chain.unshift(cur)
    if (!cur.parent_entity_id) break
    cur = byId.get(cur.parent_entity_id)
  }
  return chain
}

// ─────────────────────────────────────────────────────────────────
// Tier badge + actionability palette
// ─────────────────────────────────────────────────────────────────

export type TierFilter = 'all' | 'red_team_actionable' | 'needs_more_evidence' | 'informational' | 'rejected' | 'confirmed' | 'candidate' | 'weak'

export const TIER_BADGE: Record<string, { label: string; color: 'primary' | 'warning' | 'default'; accent: string }> = {
  confirmed: { label: 'owned asset', color: 'primary', accent: '#7c3aed' },
  candidate: { label: 'candidate asset', color: 'warning', accent: '#f59e0b' },
  weak:      { label: 'weak',      color: 'default', accent: '#94a3b8' },
  rejected:  { label: 'rejected',  color: 'default', accent: '#475569' },
  unknown:   { label: '—',         color: 'default', accent: '#94a3b8' },
}

/** User-facing 4-way verdict from the classifier. Bigger visual
 *  weight than promotion tier because this is what operators
 *  actually act on. Labels resolved at render time via tOr. */
export interface ActionabilityVisual {
  bg: string
  fg: string
  ring: string
}
export const ACTIONABILITY_VISUAL: Record<ActionabilityTier | 'none', ActionabilityVisual> = {
  red_team_actionable: { bg: '#dc2626', fg: '#fff',     ring: '#dc2626' },
  needs_more_evidence: { bg: '#f59e0b', fg: '#1f2937', ring: '#f59e0b' },
  informational:       { bg: '#3b82f6', fg: '#fff',     ring: '#3b82f6' },
  rejected:            { bg: '#94a3b8', fg: '#fff',     ring: '#94a3b8' },
  none:                { bg: '#e2e8f0', fg: '#475569', ring: '#94a3b8' },
}

/** Default English labels — fall back when locale key missing. */
export const ACTIONABILITY_LABEL_FALLBACK: Record<ActionabilityTier | 'none', string> = {
  red_team_actionable: 'Red-team actionable',
  needs_more_evidence: 'Needs more evidence',
  informational:       'Informational',
  rejected:            'Rejected',
  none:                '—',
}
export function tierLabel(tier: ActionabilityTier | 'none'): string {
  return tOr(`footprint.tier.${tier}`, ACTIONABILITY_LABEL_FALLBACK[tier])
}

/** Compatibility shim — old callers reading ACTIONABILITY_BADGE[k].label
 *  keep working; .label is computed at access time via tierLabel(). */
export const ACTIONABILITY_BADGE: Record<ActionabilityTier | 'none', ActionabilityVisual & { label: string }> = new Proxy(
  ACTIONABILITY_VISUAL,
  {
    get(target, prop: string) {
      const v = target[prop as ActionabilityTier | 'none']
      if (!v) return undefined
      return { ...v, label: tierLabel(prop as ActionabilityTier | 'none') }
    },
  },
) as Record<ActionabilityTier | 'none', ActionabilityVisual & { label: string }>

export function actionabilityKey(e: FootprintEntity): ActionabilityTier | 'none' {
  const cls = actionability(e)
  return cls?.tier ?? 'none'
}

// ─────────────────────────────────────────────────────────────────
// Misc
// ─────────────────────────────────────────────────────────────────

/** Maximum expansion rounds the worker pipeline will perform per
 *  Footprint run. Surface in RunProgressCard + RunDialog hint text. */
export const MAX_ROUNDS = 3
