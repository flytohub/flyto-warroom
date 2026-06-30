/**
 * sourceCatalog — the data model behind the "Add external source" wizard.
 *
 * Two things live here, both pure data + pure helpers (no React) so the wizard,
 * the no-code mapping emitter, and the unit tests all share one source of truth:
 *
 *   1. CATEGORIES — the seven backend `source_system_type` values (the closed
 *      set in importmap.ValidSourceSystemTypes) presented as pickable cards.
 *   2. CERTIFIED_PRESETS — the vendor mappings the engine ships in its binary
 *      (internal/importmap/mappings/*.yaml). Picking one wires an integration to
 *      that certified mappingId — no field mapping needed.
 *
 * The custom path (no certified preset) authors an org-scoped mapping YAML that
 * the engine validates via the same strict loader (importmap.LoadCustom). The
 * YAML this file emits is therefore the real wire artifact, never a mock.
 */

import type { LucideIcon } from 'lucide-react'
import {
  Globe, Eye, Bug, Cloud, Fingerprint, Ticket, Boxes,
} from 'lucide-react'

/** A backend source_system_type. Mirrors importmap.ValidSourceSystemTypes. */
export type SourceSystemType =
  | 'external_posture'
  | 'dark_web'
  | 'vuln_mgmt'
  | 'cloud_posture'
  | 'identity'
  | 'ticketing'
  | 'asset_inventory'

export interface SourceCategory {
  id: SourceSystemType
  icon: LucideIcon
  /** Accent hex — drives the card glow + icon tint. */
  color: string
  labelKey: string
  label: string
  descKey: string
  desc: string
}

/** The seven categories, in the order the wizard shows them. */
export const CATEGORIES: SourceCategory[] = [
  {
    id: 'external_posture', icon: Globe, color: '#38bdf8',
    labelKey: 'integrations.cat.external', label: 'External Posture',
    descKey: 'integrations.cat.externalDesc',
    desc: 'Security ratings & external attack-surface signals (Bitsight-class).',
  },
  {
    id: 'dark_web', icon: Eye, color: '#f472b6',
    labelKey: 'integrations.cat.darkweb', label: 'Dark Web & Threat Intel',
    descKey: 'integrations.cat.darkwebDesc',
    desc: 'Leaked credentials, breach exposure, actor & malware intel.',
  },
  {
    id: 'vuln_mgmt', icon: Bug, color: '#fb923c',
    labelKey: 'integrations.cat.vuln', label: 'Vulnerability Management',
    descKey: 'integrations.cat.vulnDesc',
    desc: 'CVE / scan findings from an external VA scanner.',
  },
  {
    id: 'cloud_posture', icon: Cloud, color: '#a78bfa',
    labelKey: 'integrations.cat.cloud', label: 'Cloud Posture (CSPM)',
    descKey: 'integrations.cat.cloudDesc',
    desc: 'Cloud misconfiguration & asset inventory checks.',
  },
  {
    id: 'identity', icon: Fingerprint, color: '#34d399',
    labelKey: 'integrations.cat.identity', label: 'Identity',
    descKey: 'integrations.cat.identityDesc',
    desc: 'IdP posture & access risk (Okta, Entra ID, Workspace).',
  },
  {
    id: 'ticketing', icon: Ticket, color: '#fbbf24',
    labelKey: 'integrations.cat.ticketing', label: 'Ticketing',
    descKey: 'integrations.cat.ticketingDesc',
    desc: 'Incident / ticket systems for remediation correlation.',
  },
  {
    id: 'asset_inventory', icon: Boxes, color: '#60a5fa',
    labelKey: 'integrations.cat.asset', label: 'Asset Inventory',
    descKey: 'integrations.cat.assetDesc',
    desc: 'CMDB / inventory systems that enumerate your assets.',
  },
]

export function categoryFor(id: SourceSystemType): SourceCategory | undefined {
  return CATEGORIES.find((c) => c.id === id)
}

/** A certified vendor mapping shipped in the engine binary. */
export interface CertifiedPreset {
  /** Canonical provider id — must equal the mapping YAML's `provider`. */
  providerId: string
  /** "<provider>.v<version>" — the certified mappingId the integration binds. */
  mappingId: string
  category: SourceSystemType
  label: string
  /** One-line hint about what credential the operator needs. */
  credentialHint: string
}

/**
 * The six mappings the engine currently ships
 * (internal/importmap/mappings/*.yaml). Static on purpose: these ids are part
 * of the engine binary's contract, mirrored here the same way projectModules.ts
 * mirrors the catalog. A follow-up can make this dynamic via a catalog endpoint.
 */
export const CERTIFIED_PRESETS: CertifiedPreset[] = [
  { providerId: 'bitsight', mappingId: 'bitsight.v1', category: 'external_posture', label: 'Bitsight', credentialHint: 'Bitsight API token (read access to ratings).' },
  { providerId: 'cyble', mappingId: 'cyble.v1', category: 'dark_web', label: 'Cyble', credentialHint: 'Cyble Vision API key.' },
  { providerId: 'tenable', mappingId: 'tenable.v1', category: 'vuln_mgmt', label: 'Tenable', credentialHint: 'Tenable.io API key (accessKey;secretKey).' },
  { providerId: 'okta', mappingId: 'okta.v1', category: 'identity', label: 'Okta', credentialHint: 'Okta API token (read-only admin).' },
  { providerId: 'azuread', mappingId: 'azuread.v1', category: 'identity', label: 'Microsoft Entra ID', credentialHint: 'Entra app registration client secret.' },
  { providerId: 'google_workspace', mappingId: 'google_workspace.v1', category: 'identity', label: 'Google Workspace', credentialHint: 'Workspace service-account key (domain-wide delegation).' },
]

export function presetsForCategory(cat: SourceSystemType): CertifiedPreset[] {
  return CERTIFIED_PRESETS.filter((p) => p.category === cat)
}

// ── Custom-mapping authoring (no certified preset) ──────────────────────────

/** Kernel field-name prefix per category, e.g. external_posture → "external".
 *  Claims are keyed "<prefix>.<key>" to match the certified mappings' naming. */
const FIELD_PREFIX: Record<SourceSystemType, string> = {
  external_posture: 'external',
  dark_web: 'darkweb',
  vuln_mgmt: 'vuln',
  cloud_posture: 'cloud',
  identity: 'identity',
  ticketing: 'ticketing',
  asset_inventory: 'asset',
}

export function fieldPrefixForCategory(cat: SourceSystemType): string {
  return FIELD_PREFIX[cat]
}

/** Kernel canonical category per source type (the entity's `category`). */
const CANONICAL_CATEGORY: Record<SourceSystemType, string> = {
  external_posture: 'infrastructure',
  dark_web: 'exposure',
  vuln_mgmt: 'vulnerability',
  cloud_posture: 'cloud',
  identity: 'identity',
  ticketing: 'ticketing',
  asset_inventory: 'asset',
}

/** The kernel entity types offered for a category's canonical identity. */
export function entityTypesFor(cat: SourceSystemType): string[] {
  switch (cat) {
    case 'external_posture': return ['domain', 'host', 'ip', 'url']
    case 'dark_web': return ['domain', 'email', 'identity', 'host']
    case 'vuln_mgmt': return ['host', 'ip', 'domain', 'url']
    case 'cloud_posture': return ['cloud_resource', 'host', 'identity']
    case 'identity': return ['identity', 'email']
    case 'ticketing': return ['finding', 'host', 'domain']
    case 'asset_inventory': return ['host', 'ip', 'domain', 'cloud_resource']
    default: return ['host']
  }
}

/** Slugify a source name into the `custom:<org>:<name>` namespace segment.
 *  The engine forbids ':' inside <name>, so we strip it (and lower-kebab). */
export function slugifySourceName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'source'
}

export interface CustomMappingIds {
  /** "custom:<orgId>:<name>" — the mapping YAML's provider + the providerId. */
  providerId: string
  /** "custom:<orgId>:<name>.v1" — the mappingId. */
  mappingId: string
}

export function customMappingIds(orgId: string, sourceName: string): CustomMappingIds {
  const provider = `custom:${orgId}:${slugifySourceName(sourceName)}`
  return { providerId: provider, mappingId: `${provider}.v1` }
}

/** Canonical severity levels the engine's severity scale normalizes to. */
export const SEVERITY_LEVELS = ['critical', 'high', 'medium', 'low'] as const
export type SeverityLevel = (typeof SEVERITY_LEVELS)[number]

export interface CustomMappingSpec {
  orgId: string
  sourceName: string
  sourceSystemType: SourceSystemType
  /** Array match path, e.g. "$.findings[*]" or "$[*]". */
  recordsMatch: string
  entityType: string
  /** Per-kernel-field source path, RELATIVE to a record (e.g. "$.severity"). */
  map: {
    canonicalKey: string          // required
    title?: string
    severity?: string
    sourceScore?: string
    observedAt?: string
  }
  extraClaims?: CustomExtraClaim[]
  /** Raw-severity-value → canonical level map (for the severity claim). */
  severityValueMap?: Record<string, SeverityLevel>
}

export type CustomExtraValueKind = 'string' | 'bool' | 'scalar' | 'enum'

export interface CustomExtraClaim {
  /** Field suffix under the source prefix, e.g. "grade" → external.grade. */
  fieldKey: string
  /** Source path relative to one record, e.g. "$.grade". */
  sourcePath: string
  valueKind?: CustomExtraValueKind
}

export function slugifyKernelFieldKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/^\$\.?/, '')
    .replace(/\[\*\]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64)
}

function yamlStr(s: string): string {
  // Quote to survive ':' / '$' / '{' in JSON paths and the custom: namespace.
  return JSON.stringify(s)
}

/**
 * Emit the org-custom mapping YAML for a no-code spec. The output is the real
 * artifact POSTed to /fusion/mappings (and dry-run'd first) — it must satisfy
 * importmap.LoadCustom exactly, so this mirrors that schema:
 *   provider / version / source.kind / trust_tier / severity_scales / records[].
 */
export function buildCustomMappingYaml(spec: CustomMappingSpec): string {
  const { providerId } = customMappingIds(spec.orgId, spec.sourceName)
  const prefix = FIELD_PREFIX[spec.sourceSystemType]
  const category = CANONICAL_CATEGORY[spec.sourceSystemType]

  const lines: string[] = []
  lines.push(`provider: ${yamlStr(providerId)}`)
  lines.push('version: 1')
  lines.push('source:')
  lines.push(`  kind: ${spec.sourceSystemType}`)
  lines.push('  auth: api_key_byo')
  lines.push('trust_tier: org_custom')

  const sevMap = spec.severityValueMap ?? {}
  const sevKeys = Object.keys(sevMap)
  const hasSeverity = !!spec.map.severity && sevKeys.length > 0
  if (hasSeverity) {
    lines.push('severity_scales:')
    lines.push('  custom:')
    for (const raw of sevKeys) {
      lines.push(`    ${yamlStr(raw)}: ${sevMap[raw].toUpperCase()}`)
    }
  }

  lines.push('records:')
  lines.push(`  - match: ${yamlStr(spec.recordsMatch)}`)
  lines.push('    canonical:')
  lines.push(`      category: ${category}`)
  lines.push(`      type: ${spec.entityType}`)
  lines.push(`      key_from: ${yamlStr(spec.map.canonicalKey)}`)
  lines.push('    claims:')

  if (spec.map.title) {
    lines.push(`      - field: ${yamlStr(`${prefix}.title`)}`)
    lines.push(`        value: { from: ${yamlStr(spec.map.title)} }`)
    lines.push('        value_kind: string')
    lines.push('        confidence: 60')
    if (spec.map.observedAt) lines.push(`        observed_at: { from: ${yamlStr(spec.map.observedAt)} }`)
  }
  if (hasSeverity) {
    lines.push(`      - field: ${yamlStr(`${prefix}.severity`)}`)
    lines.push(`        value: { from: ${yamlStr(spec.map.severity!)}, via: "severity_scale.custom" }`)
    lines.push('        value_kind: severity')
    lines.push('        confidence: 60')
    if (spec.map.observedAt) lines.push(`        observed_at: { from: ${yamlStr(spec.map.observedAt)} }`)
  }
  if (spec.map.sourceScore) {
    lines.push(`      - field: ${yamlStr(`${prefix}.source_score`)}`)
    lines.push(`        value: { from: ${yamlStr(spec.map.sourceScore)} }`)
    lines.push('        value_kind: scalar')
    lines.push('        confidence: 60')
    if (spec.map.observedAt) lines.push(`        observed_at: { from: ${yamlStr(spec.map.observedAt)} }`)
  }

  const extraClaims = (spec.extraClaims ?? [])
    .map((c) => ({
      fieldKey: slugifyKernelFieldKey(c.fieldKey),
      sourcePath: c.sourcePath,
      valueKind: c.valueKind ?? 'string',
    }))
    .filter((c) => c.fieldKey && c.sourcePath)
  const seenExtraFields = new Set<string>()
  for (const c of extraClaims) {
    const field = `${prefix}.${c.fieldKey}`
    if (seenExtraFields.has(field)) continue
    seenExtraFields.add(field)
    lines.push(`      - field: ${yamlStr(field)}`)
    lines.push(`        value: { from: ${yamlStr(c.sourcePath)} }`)
    lines.push(`        value_kind: ${c.valueKind}`)
    lines.push('        confidence: 50')
    if (spec.map.observedAt) lines.push(`        observed_at: { from: ${yamlStr(spec.map.observedAt)} }`)
  }

  // The engine requires at least one claim. If the operator mapped only the
  // identity (key), still emit a presence claim so the mapping is valid and the
  // entity lands on its surface (honest: a "seen by <source>" signal).
  const claimCount = [spec.map.title, hasSeverity, spec.map.sourceScore].filter(Boolean).length + seenExtraFields.size
  if (claimCount === 0) {
    lines.push(`      - field: ${yamlStr(`${prefix}.observed`)}`)
    lines.push('        value: { const: "true" }')
    lines.push('        value_kind: bool')
    lines.push('        confidence: 50')
    if (spec.map.observedAt) lines.push(`        observed_at: { from: ${yamlStr(spec.map.observedAt)} }`)
  }

  return lines.join('\n') + '\n'
}

/**
 * Split a flat list of probe field paths into the record-array prefix and the
 * per-record relative fields. For `[$.findings[*].severity, $.findings[*].key]`
 * → { recordsMatch: "$.findings[*]", fields: ["$.severity", "$.key"] }.
 * Falls back to a top-level array ("$[*]") or whole-doc ("$") when there is no
 * "[*]" segment in the observed paths.
 */
export function deriveRecordShape(paths: string[]): {
  recordsMatch: string
  fields: { absolute: string; relative: string }[]
} {
  const withArray = paths.filter((p) => p.includes('[*]'))
  if (withArray.length === 0) {
    // No array — each leaf is a per-document field; treat the doc as one record.
    return {
      recordsMatch: '$',
      fields: paths.map((p) => ({ absolute: p, relative: p })),
    }
  }
  // Record prefix = up to and including the FIRST "[*]".
  const idx = withArray[0].indexOf('[*]')
  const prefix = withArray[0].slice(0, idx + 3) // includes "[*]"
  const fields = paths
    .filter((p) => p.startsWith(prefix) && p.length > prefix.length)
    .map((p) => {
      const rest = p.slice(prefix.length).replace(/^\./, '') // drop leading "."
      return { absolute: p, relative: rest ? `$.${rest}` : '$' }
    })
  return { recordsMatch: prefix, fields }
}
