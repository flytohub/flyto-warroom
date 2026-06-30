import type { BuildReportInlineSection } from '@lib/engine/reports/vaReport'
import type { ResearchFootprintResponse } from '@lib/engine/code/footprintSurface'

function text(value: unknown, fallback = 'Not available'): string {
  if (value == null) return fallback
  const s = String(value).trim()
  return s && s !== 'undefined' && s !== 'null' && s !== 'NaN' ? s : fallback
}

function humanize(value: unknown): string {
  return text(value, 'unknown').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function citations(ids?: string[]): string {
  return (ids ?? []).filter(Boolean).join(', ')
}

function dateText(value?: string | null): string {
  if (!value) return 'Not available'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? text(value) : date.toISOString()
}

function table(
  title: string,
  columns: string[],
  rows: Array<Record<string, unknown>>,
): BuildReportInlineSection {
  return { title, type: 'table', columns, rows, max_rows: Math.max(rows.length, 1) }
}

export function researchFootprintReportFilename(data: ResearchFootprintResponse): string {
  const base = data.evidence_bundle?.export_name || `${data.subject.type}-${data.subject.value}-research-footprint`
  return base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'research-footprint'
}

export function buildResearchFootprintReportSections(data: ResearchFootprintResponse): BuildReportInlineSection[] {
  const citedClaims = (data.narrative?.claims ?? []).filter(claim => claim.citations.length > 0)
  const quality = data.evidence_quality
  return [
    {
      title: 'Research Summary',
      type: 'text',
      text_style: 'body',
      content: [
        text(data.summary.title, 'Research Footprint'),
        text(data.summary.description),
        `State: ${humanize(data.summary.state)}`,
        `Priority: ${data.summary.priority_score}`,
        `Confidence: ${data.summary.confidence_score ?? quality.weighted_confidence}`,
        text(data.summary.positioning),
      ].join('\n\n'),
    },
    table('AI Evidence-backed Narrative', ['Kind', 'Claim', 'Citations'], citedClaims.map(claim => ({
      Kind: humanize(claim.kind),
      Claim: text(claim.text),
      Citations: citations(claim.citations),
    }))),
    table('Evidence Quality', ['Metric', 'Value'], [
      { Metric: 'Reliability band', Value: humanize(quality.reliability_band) },
      { Metric: 'Weighted confidence', Value: quality.weighted_confidence },
      { Metric: 'Corroborating relations', Value: quality.corroboration_count },
      { Metric: 'Conflicting relations', Value: quality.conflict_count },
      { Metric: 'Stale sources', Value: quality.stale_source_count },
      { Metric: 'Top sources', Value: citations(quality.top_source_ids) },
    ]),
    table('Verification Summary', ['Metric', 'Value'], [
      { Metric: 'Verification level', Value: humanize(data.verification_summary?.level) },
      { Metric: 'Status', Value: humanize(data.verification_summary?.status) },
      { Metric: 'Pentest observations', Value: data.verification_summary?.pentest_observation_count ?? 0 },
      { Metric: 'Pentest findings', Value: data.verification_summary?.pentest_finding_count ?? 0 },
      { Metric: 'Linked validation tasks', Value: citations(data.verification_summary?.linked_validation_task_ids) },
      { Metric: 'Last empirical validation', Value: dateText(data.verification_summary?.last_empirical_validation_at) },
    ]),
    table('Audit Integrity', ['Metric', 'Value'], [
      { Metric: 'Bundle SHA-256', Value: text(data.audit_integrity?.bundle_sha256) },
      { Metric: 'Hash recipe', Value: text(data.audit_integrity?.hash_recipe) },
      { Metric: 'Citation count', Value: data.audit_integrity?.citation_count ?? 0 },
      { Metric: 'Resolved citation count', Value: data.audit_integrity?.resolved_citation_count ?? 0 },
      { Metric: 'Unresolved citation count', Value: data.audit_integrity?.unresolved_citation_count ?? 0 },
      { Metric: 'Uncited claim count', Value: data.audit_integrity?.uncited_claim_count ?? 0 },
      { Metric: 'Redaction applied', Value: data.audit_integrity?.redaction_applied ? 'Yes' : 'No' },
      { Metric: 'Integrity warnings', Value: (data.audit_integrity?.integrity_warnings ?? []).join('; ') || 'None' },
    ]),
    table('Citation Index', ['ID', 'Kind', 'Source', 'Severity', 'Confidence', 'Raw Ref', 'Related IDs'], (data.citation_index ?? []).map(item => ({
      ID: text(item.id),
      Kind: humanize(item.kind),
      Source: text(item.source_name || item.source_type, 'Not available'),
      Severity: humanize(item.severity),
      Confidence: item.confidence ?? 'Not available',
      'Raw Ref': text(item.raw_ref),
      'Related IDs': citations(item.related_ids),
    }))),
    table('Source Ledger', ['Source', 'Reliability', 'Observations', 'Max Severity', 'Citations'], data.source_ledger.map(source => ({
      Source: `${humanize(source.source_type)} / ${text(source.source_name, 'unknown')}`,
      Reliability: source.source_reliability,
      Observations: source.observation_count,
      'Max Severity': humanize(source.max_severity),
      Citations: citations(source.observation_ids),
    }))),
    table('Evidence Timeline', ['Time', 'Kind', 'Title', 'Detail', 'Citations'], data.evidence_timeline.map(item => ({
      Time: text(item.timestamp),
      Kind: humanize(item.kind),
      Title: text(item.title),
      Detail: text(item.detail),
      Citations: citations(item.citations),
    }))),
    table('Relations / Corroboration', ['Relation', 'From', 'To', 'Confidence', 'Citation'], data.relations.map(rel => ({
      Relation: humanize(rel.relation_kind),
      From: text(rel.from_observation_id),
      To: text(rel.to_observation_id),
      Confidence: rel.confidence,
      Citation: rel.id,
    }))),
    table('Path Graph / Route Nodes', ['Order', 'Type', 'Value', 'Citations'], data.route_nodes.map(node => ({
      Order: node.node_order,
      Type: humanize(node.node_type),
      Value: text(node.value || node.label),
      Citations: citations(node.citations),
    }))),
    table('Missing Evidence', ['Status', 'Title', 'Verifier', 'Action', 'Citation'], data.missing_evidence.map(gap => ({
      Status: humanize(gap.status),
      Title: text(gap.title),
      Verifier: humanize(gap.verifier),
      Action: text(gap.recommended_action),
      Citation: gap.id,
    }))),
    table('Validation Tasks', ['Status', 'Verifier', 'Result', 'Notes', 'Citations'], data.validation_tasks.map(task => ({
      Status: humanize(task.status),
      Verifier: humanize(task.verifier),
      Result: text(task.result, ''),
      Notes: text(task.notes, ''),
      Citations: citations([task.id, ...(task.evidence_ids ?? [])]),
    }))),
    table('Decision Log', ['Time', 'Kind', 'State', 'Title', 'Detail', 'Citations'], data.decision_log.map(entry => ({
      Time: text(entry.timestamp),
      Kind: humanize(entry.kind),
      State: humanize(entry.state),
      Title: text(entry.title),
      Detail: text(entry.detail || entry.result || entry.notes),
      Citations: citations(entry.citations),
    }))),
  ]
}
