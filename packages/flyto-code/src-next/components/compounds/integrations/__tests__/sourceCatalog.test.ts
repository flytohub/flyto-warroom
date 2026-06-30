import { describe, it, expect } from 'vitest'
import {
  buildCustomMappingYaml,
  deriveRecordShape,
  customMappingIds,
  slugifySourceName,
  presetsForCategory,
} from '../sourceCatalog'

describe('slugifySourceName', () => {
  it('lower-kebabs and strips colons (engine forbids ":" in the name segment)', () => {
    expect(slugifySourceName('Acme Risk: Feed v2')).toBe('acme_risk_feed_v2')
  })
  it('falls back to "source" when empty after stripping', () => {
    expect(slugifySourceName('!!!')).toBe('source')
  })
})

describe('customMappingIds', () => {
  it('namespaces provider to the org and derives <provider>.v1', () => {
    const ids = customMappingIds('org_123', 'Acme Feed')
    expect(ids.providerId).toBe('custom:org_123:acme_feed')
    expect(ids.mappingId).toBe('custom:org_123:acme_feed.v1')
  })
})

describe('presetsForCategory', () => {
  it('returns the certified mappings shipped for a category', () => {
    expect(presetsForCategory('external_posture').map((p) => p.providerId)).toEqual(['bitsight'])
    expect(presetsForCategory('identity').map((p) => p.providerId)).toEqual([
      'okta', 'azuread', 'google_workspace',
    ])
    expect(presetsForCategory('asset_inventory')).toEqual([])
  })
})

describe('deriveRecordShape', () => {
  it('splits a nested array into the record prefix + relative fields', () => {
    const r = deriveRecordShape([
      '$.findings[*].severity',
      '$.findings[*].evidence_key',
      '$.meta.generated_at', // outside the record — dropped
    ])
    expect(r.recordsMatch).toBe('$.findings[*]')
    expect(r.fields).toEqual([
      { absolute: '$.findings[*].severity', relative: '$.severity' },
      { absolute: '$.findings[*].evidence_key', relative: '$.evidence_key' },
    ])
  })
  it('handles a top-level array', () => {
    const r = deriveRecordShape(['$[*].host', '$[*].sev'])
    expect(r.recordsMatch).toBe('$[*]')
    expect(r.fields).toEqual([
      { absolute: '$[*].host', relative: '$.host' },
      { absolute: '$[*].sev', relative: '$.sev' },
    ])
  })
  it('treats a no-array document as one record', () => {
    const r = deriveRecordShape(['$.domain', '$.grade'])
    expect(r.recordsMatch).toBe('$')
    expect(r.fields).toEqual([
      { absolute: '$.domain', relative: '$.domain' },
      { absolute: '$.grade', relative: '$.grade' },
    ])
  })
})

describe('buildCustomMappingYaml', () => {
  const base = {
    orgId: 'org_x',
    sourceName: 'Acme Feed',
    sourceSystemType: 'external_posture' as const,
    recordsMatch: '$.findings[*]',
    entityType: 'domain',
  }

  it('emits a valid-shaped mapping with severity scale + claims', () => {
    const yaml = buildCustomMappingYaml({
      ...base,
      map: {
        canonicalKey: '$.domain',
        title: '$.title',
        severity: '$.sev',
        sourceScore: '$.score',
        observedAt: '$.seen',
      },
      extraClaims: [
        { fieldKey: 'Vendor Grade', sourcePath: '$.grade', valueKind: 'enum' },
        { fieldKey: 'rating percentile', sourcePath: '$.percentile', valueKind: 'scalar' },
      ],
      severityValueMap: { critical: 'critical', warn: 'medium' },
    })
    expect(yaml).toContain('provider: "custom:org_x:acme_feed"')
    expect(yaml).toContain('version: 1')
    expect(yaml).toContain('kind: external_posture')
    expect(yaml).toContain('trust_tier: org_custom')
    expect(yaml).toContain('severity_scales:')
    expect(yaml).toContain('"warn": MEDIUM')
    expect(yaml).toContain('field: "external.severity"')
    expect(yaml).toContain('via: "severity_scale.custom"')
    expect(yaml).toContain('value_kind: severity')
    expect(yaml).toContain('field: "external.vendor_grade"')
    expect(yaml).toContain('value: { from: "$.grade" }')
    expect(yaml).toContain('value_kind: enum')
    expect(yaml).toContain('field: "external.rating_percentile"')
    expect(yaml).toContain('value: { from: "$.percentile" }')
    expect(yaml).toContain('value_kind: scalar')
    expect(yaml).toContain('key_from: "$.domain"')
  })

  it('emits a presence claim when only the identity is mapped (engine needs ≥1 claim)', () => {
    const yaml = buildCustomMappingYaml({ ...base, map: { canonicalKey: '$.domain' } })
    expect(yaml).toContain('field: "external.observed"')
    expect(yaml).toContain('value_kind: bool')
    // no severity scale when no severity mapped
    expect(yaml).not.toContain('severity_scales:')
  })
})
