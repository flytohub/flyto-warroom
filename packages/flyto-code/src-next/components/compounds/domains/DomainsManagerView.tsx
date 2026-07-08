/**
 * DomainsManagerView - manager-mode domain findings workbench.
 *
 * Manager mode should read like an operations console: clear view switching,
 * filter rail, dense rows, and backend-provided evidence. It intentionally
 * avoids front-end score math and does not surface 100/100 scores.
 */
import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Drawer from '@mui/material/Drawer'
import InputAdornment from '@mui/material/InputAdornment'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { alpha, useTheme } from '@mui/material/styles'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'

import { severityColor } from '@compounds/_shared'
import { type Severity } from '@lib/tokens/severity'
import { qk } from '@lib/queryKeys'
import { colors } from '@/styles/designTokens'
import { getDomainPostureKernel, type DomainKernelAsset } from '@lib/engine/code/footprintSurface'
import {
  listFindingFacets,
  listFindings,
  parseJSONArray,
  type Finding,
  type FindingsFilter,
  type ThreatActivityLabel,
} from '@lib/engine/code/findings'

type ManagerTab = 'findings' | 'domains' | 'watchlist'
type FindingColumnId =
  | 'rowId'
  | 'riskVector'
  | 'identifier'
  | 'tags'
  | 'domain'
  | 'firstSeen'
  | 'lastSeen'
  | 'grade'
  | 'impacts'
  | 'impactEndDate'
  | 'remainingLifetime'
  | 'noImpactEndDate'
  | 'confidence'
  | 'severity'
  | 'assetImportance'
  | 'lifecycle'
  | 'source'
  | 'details'
type SeverityFilter = 'all' | 'critical' | 'high' | 'medium' | 'low'
type GradeFilter = 'all' | 'good' | 'fair' | 'neutral' | 'warn' | 'bad'
type AssetImportanceFilter = 'all' | 'critical' | 'high' | 'medium' | 'low'
type NullableBoolFilter = 'all' | 'yes' | 'no'
type ResponsiveCssValue = string | { xs?: string; sm?: string; md?: string; lg?: string; xl?: string }

interface DomainsManagerViewProps {
  findingsTitle?: string
}

interface FindingRow {
  id: string
  rowId: string
  riskVector: string
  identifier: string
  tags: string
  domain: string
  firstSeen: string
  lastSeen: string
  grade: string
  impacts: boolean | null
  confidence: number
  severity: Severity
  impactEndDate: string
  remainingLifetime: string
  noImpactEndDate: string
  assetImportance: string
  lifecycle: string
  lifecycleState: string
  source: string
  webAppTest: string
  country: string
  stateFamilyKey: string
  stateVersionCount: number | null
  details: string
}

interface DomainRow {
  id: string
  domain: string
  type: string
  grade: string
  findings: number
  confidence: number
  sources: string
  lastScanned: string
  tier: string
}

const FINDING_ORDER: Severity[] = ['critical', 'high', 'medium', 'low']
const GRADE_ORDER: GradeFilter[] = ['good', 'fair', 'neutral', 'warn', 'bad']
const ASSET_IMPORTANCE_ORDER: AssetImportanceFilter[] = ['critical', 'high', 'medium', 'low']
const THREAT_ACTIVITY_OPTIONS = ['accelerating', 'steady', 'declining'] as const
const LOW_CONFIDENCE = 80
const MANAGER_ACCENT = colors.brandDeep
const MANAGER_ACCENT_LIGHT = colors.brand
const FLEX_HIDE_UNTIL_MD = { xs: 'none', md: 'flex' } as const
const FLEX_HIDE_UNTIL_XL = { xs: 'none', xl: 'flex' } as const
const ROWS_PER_PAGE = 100
const FINDINGS_LIMIT = 500

const FILTER_SET_FIELDS = [
  'Risk Vector',
  'First Seen',
  'Last Seen',
  'Web App Sec Tests',
  'Grade',
  'Impacts Risk Vector Grade',
  'Impact End Date',
  'Remaining Lifetime',
  'Threat Insights',
  'Threat Groups',
  'Threat Activity Score',
  'No Impact End Date',
  'Finding Severity',
  'Tag',
  'Assets',
  'Asset Importance',
  'Vulnerability',
]

interface FindingColumnDef {
  id: FindingColumnId
  label: string
  description: string
  defaultVisible: boolean
  locked?: boolean
  track: ResponsiveCssValue
  render: (row: FindingRow) => React.ReactNode
  exportValue: (row: FindingRow) => string | number | boolean | null
}

function findingSeverity(s?: string): Severity {
  const v = (s ?? '').toLowerCase()
  if (v === 'critical') return 'critical'
  if (v === 'high') return 'high'
  if (v === 'medium') return 'medium'
  if (v === 'low') return 'low'
  return ''
}

function confidencePercent(v?: number): number {
  if (typeof v !== 'number' || Number.isNaN(v)) return 0
  const normalized = v <= 1 ? v * 100 : v
  return Math.max(0, Math.min(100, Math.round(normalized)))
}

function assetName(asset: DomainKernelAsset): string {
  return asset.display_name || asset.canonical_value
}

function formatDate(value?: string | null): string {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value.slice(0, 10)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${day}/${month}/${d.getFullYear()}`
}

function gradeLabel(grade?: string): string {
  const v = (grade ?? '').toUpperCase()
  if (v === 'UNCONFIRMED' || v === 'LOW_CONFIDENCE' || v === 'INSUFFICIENT_EVIDENCE') return 'Review'
  if (v === 'GOOD' || v.startsWith('A')) return 'Good'
  if (v === 'FAIR' || v.startsWith('B')) return 'Fair'
  if (v === 'NEUTRAL') return 'Neutral'
  if (v === 'WATCH' || v === 'WARN' || v.startsWith('C')) return 'Warn'
  if (v === 'POOR' || v === 'BAD' || v.startsWith('D') || v.startsWith('F')) return 'Bad'
  return '-'
}

function gradeTone(grade?: string): string {
  const v = (grade ?? '').toUpperCase()
  if (v === 'UNCONFIRMED' || v === 'LOW_CONFIDENCE' || v === 'INSUFFICIENT_EVIDENCE') return colors.semantic.warning
  if (v === 'GOOD' || v.startsWith('A')) return colors.semantic.success
  if (v === 'FAIR' || v === 'NEUTRAL' || v === 'WATCH' || v === 'WARN' || v.startsWith('B') || v.startsWith('C')) return colors.semantic.warning
  if (v === 'POOR' || v === 'BAD' || v.startsWith('D') || v.startsWith('F')) return colors.semantic.danger
  return colors.semantic.neutral
}

function severityLabel(severity: Severity): string {
  if (severity === 'critical') return 'Critical'
  if (severity === 'high') return 'High'
  if (severity === 'medium') return 'Medium'
  if (severity === 'low') return 'Low'
  return 'Info'
}

function includesSearch(text: string, search: string): boolean {
  return text.toLowerCase().includes(search.trim().toLowerCase())
}

function humanizeFindingText(value?: string | null): string {
  const text = (value ?? '').trim()
  if (!text) return '-'
  return text
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
}

function optionalText(value: string): string | undefined {
  const text = value.trim()
  return text || undefined
}

function optionalNumber(value: string): number | undefined {
  const text = value.trim()
  if (!text) return undefined
  const n = Number(text)
  return Number.isFinite(n) ? n : undefined
}

function findingRiskVectorLabel(finding: Finding): string {
  return humanizeFindingText(finding.category || 'Domain exposure')
}

function findingIdentifierFromExternal(finding: Finding): string {
  return finding.domain || finding.description || finding.external_id || finding.fingerprint || finding.id
}

function findingTagsFromExternal(finding: Finding): string {
  const tags = parseJSONArray(finding.tags)
  return tags.length > 0 ? tags.join(', ') : '-'
}

function findingDetailsFromExternal(finding: Finding): string {
  return finding.details_text || finding.description || '-'
}

function lifecycleLabel(finding: Finding): string {
  return finding.lifecycle_summary?.status_label || (finding.resolved_at ? 'Historical resolved' : 'Current')
}

function lifecycleState(finding: Finding): string {
  return finding.lifecycle_summary?.observation_state || (finding.resolved_at ? 'historical' : 'current')
}

function findingLastSeen(finding: Finding): string | null | undefined {
  return finding.lifecycle_summary?.last_seen_at || finding.last_seen_at || finding.first_seen_at
}

function findingFirstSeen(finding: Finding): string | null | undefined {
  return finding.lifecycle_summary?.first_seen_at || finding.first_seen_at
}

function findingConfidence(finding: Finding): number {
  return confidencePercent(finding.source_quality?.confidence)
}

function findingRowFromExternal(finding: Finding): FindingRow {
  const remaining = finding.remaining_lifetime_days
  return {
    id: finding.id,
    rowId: finding.external_id || finding.fingerprint || finding.id,
    riskVector: findingRiskVectorLabel(finding),
    identifier: findingIdentifierFromExternal(finding),
    tags: findingTagsFromExternal(finding),
    domain: finding.domain || '-',
    firstSeen: formatDate(findingFirstSeen(finding)),
    lastSeen: formatDate(findingLastSeen(finding)),
    grade: finding.grade || '',
    impacts: typeof finding.affects_rating === 'boolean' ? finding.affects_rating : null,
    confidence: findingConfidence(finding),
    severity: findingSeverity(finding.severity),
    impactEndDate: formatDate(finding.impact_end_date),
    remainingLifetime: remaining == null ? '-' : `${remaining} days`,
    noImpactEndDate: formatDate(finding.no_impact_end_date),
    assetImportance: finding.asset_importance ? humanizeFindingText(finding.asset_importance) : '-',
    lifecycle: lifecycleLabel(finding),
    lifecycleState: lifecycleState(finding),
    source: finding.source || '-',
    webAppTest: finding.web_app_test ? humanizeFindingText(finding.web_app_test) : '-',
    country: finding.country || '-',
    stateFamilyKey: finding.state_family_key || finding.lifecycle_summary?.state_family_key || '',
    stateVersionCount: finding.state_version_count ?? finding.lifecycle_summary?.state_version_count ?? null,
    details: findingDetailsFromExternal(finding),
  }
}

function csvCell(value: string | number | boolean | null | undefined): string {
  const text = value == null ? '' : String(value)
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number | boolean | null | undefined>>) {
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

const FINDING_COLUMNS: FindingColumnDef[] = [
  {
    id: 'rowId',
    label: 'Rolled Up ID',
    description: 'Immutable source identifier for this exact finding state/version.',
    defaultVisible: true,
    track: { xs: 'minmax(178px, 0.78fr)', md: 'minmax(178px, 0.78fr)' },
    render: (row) => <Cell>{row.rowId}</Cell>,
    exportValue: (row) => row.rowId,
  },
  {
    id: 'riskVector',
    label: 'Risk Vector',
    description: "Name of the finding's risk vector.",
    defaultVisible: true,
    locked: true,
    track: { xs: 'minmax(160px, 0.78fr)', md: 'minmax(160px, 0.85fr)', xl: 'minmax(168px, 0.85fr)' },
    render: (row) => <Cell strong>{row.riskVector}</Cell>,
    exportValue: (row) => row.riskVector,
  },
  {
    id: 'identifier',
    label: 'Finding Identifier',
    description: 'Host, domain, page, application, or evidence identifier for the finding.',
    defaultVisible: true,
    locked: true,
    track: { xs: 'minmax(220px, 1.15fr)', md: 'minmax(220px, 1.12fr)', xl: 'minmax(240px, 1.18fr)' },
    render: (row) => <Cell>{row.identifier}</Cell>,
    exportValue: (row) => row.identifier,
  },
  {
    id: 'tags',
    label: 'Tags',
    description: 'Infrastructure tags or source labels associated with this asset.',
    defaultVisible: false,
    track: { xs: 'minmax(220px, 0.7fr)', md: 'minmax(220px, 0.8fr)' },
    render: (row) => <Cell>{row.tags}</Cell>,
    exportValue: (row) => row.tags,
  },
  {
    id: 'domain',
    label: 'Domain',
    description: 'Domain or host tied to the finding.',
    defaultVisible: false,
    track: { xs: 'minmax(200px, 0.9fr)', md: 'minmax(200px, 0.9fr)', xl: 'minmax(210px, 0.92fr)' },
    render: (row) => <Cell>{row.domain}</Cell>,
    exportValue: (row) => row.domain,
  },
  {
    id: 'firstSeen',
    label: 'First Seen',
    description: 'Date the finding was initially observed.',
    defaultVisible: true,
    track: { xs: 'minmax(112px, 0.58fr)', md: 'minmax(112px, 0.58fr)' },
    render: (row) => <Cell>{row.firstSeen}</Cell>,
    exportValue: (row) => row.firstSeen,
  },
  {
    id: 'lastSeen',
    label: 'Last Seen',
    description: 'Date the finding was most recently observed.',
    defaultVisible: true,
    track: { xs: 'minmax(112px, 0.58fr)', md: 'minmax(112px, 0.58fr)' },
    render: (row) => <Cell>{row.lastSeen}</Cell>,
    exportValue: (row) => row.lastSeen,
  },
  {
    id: 'grade',
    label: 'Grade',
    description: 'Backend-provided grade for this immutable finding state/version.',
    defaultVisible: true,
    track: { xs: 'minmax(96px, 0.52fr)', md: 'minmax(96px, 0.5fr)' },
    render: (row) => <GradeCell grade={row.grade} />,
    exportValue: (row) => gradeLabel(row.grade),
  },
  {
    id: 'impacts',
    label: 'Impacts RV Grade',
    description: 'Whether the API marks this finding as included in risk-vector grade impact.',
    defaultVisible: false,
    track: { xs: 'minmax(148px, 0.68fr)', md: 'minmax(148px, 0.7fr)' },
    render: (row) => <Cell>{row.impacts == null ? '-' : row.impacts ? 'Yes' : 'No'}</Cell>,
    exportValue: (row) => (row.impacts == null ? '' : row.impacts ? 'Yes' : 'No'),
  },
  {
    id: 'impactEndDate',
    label: 'Impact End Date',
    description: 'UTC date when this finding stops impacting the risk-vector grade.',
    defaultVisible: true,
    track: { xs: 'minmax(138px, 0.68fr)', md: 'minmax(138px, 0.68fr)' },
    render: (row) => <Cell>{row.impactEndDate}</Cell>,
    exportValue: (row) => row.impactEndDate,
  },
  {
    id: 'remainingLifetime',
    label: 'Remaining Lifetime',
    description: 'Projected remaining impact lifetime from the source.',
    defaultVisible: true,
    track: { xs: 'minmax(154px, 0.72fr)', md: 'minmax(154px, 0.72fr)' },
    render: (row) => <Cell>{row.remainingLifetime}</Cell>,
    exportValue: (row) => row.remainingLifetime,
  },
  {
    id: 'noImpactEndDate',
    label: 'No Impact End Date',
    description: 'UTC date when an exclusion/no-impact period ends.',
    defaultVisible: false,
    track: { xs: 'minmax(154px, 0.72fr)', md: 'minmax(154px, 0.72fr)' },
    render: (row) => <Cell>{row.noImpactEndDate}</Cell>,
    exportValue: (row) => row.noImpactEndDate,
  },
  {
    id: 'confidence',
    label: 'Confidence',
    description: 'Confidence percentage from the current domain asset evidence.',
    defaultVisible: false,
    track: { xs: 'minmax(118px, 0.56fr)', md: 'minmax(118px, 0.52fr)' },
    render: (row) => <Cell>{row.confidence}%</Cell>,
    exportValue: (row) => `${row.confidence}%`,
  },
  {
    id: 'severity',
    label: 'Severity',
    description: 'Finding severity reported by the evidence source.',
    defaultVisible: true,
    track: { xs: 'minmax(112px, 0.66fr)', md: 'minmax(112px, 0.52fr)' },
    render: (row) => <SeverityChip severity={row.severity} />,
    exportValue: (row) => severityLabel(row.severity),
  },
  {
    id: 'assetImportance',
    label: 'Asset Importance',
    description: 'Highest source-provided asset importance associated with this finding.',
    defaultVisible: false,
    track: { xs: 'minmax(148px, 0.68fr)', md: 'minmax(148px, 0.68fr)' },
    render: (row) => <Cell>{row.assetImportance}</Cell>,
    exportValue: (row) => row.assetImportance,
  },
  {
    id: 'lifecycle',
    label: 'Lifecycle',
    description: 'Current lifecycle status derived from append-only finding events.',
    defaultVisible: true,
    track: { xs: 'minmax(150px, 0.78fr)', md: 'minmax(150px, 0.78fr)' },
    render: (row) => <LifecycleChip row={row} />,
    exportValue: (row) => row.lifecycle,
  },
  {
    id: 'source',
    label: 'Source',
    description: 'Authoritative finding source.',
    defaultVisible: false,
    track: { xs: 'minmax(112px, 0.52fr)', md: 'minmax(112px, 0.52fr)' },
    render: (row) => <Cell>{row.source}</Cell>,
    exportValue: (row) => row.source,
  },
  {
    id: 'details',
    label: 'Details',
    description: 'Backend detail text when the finding includes one.',
    defaultVisible: false,
    track: { xs: 'minmax(260px, 1fr)', md: 'minmax(260px, 1.2fr)' },
    render: (row) => <Cell>{row.details}</Cell>,
    exportValue: (row) => row.details,
  },
]

const DEFAULT_FINDING_COLUMN_IDS = FINDING_COLUMNS
  .filter((column) => column.defaultVisible || column.locked)
  .map((column) => column.id)

function columnTrackAt(track: ResponsiveCssValue, breakpoint: 'xs' | 'md' | 'xl'): string {
  if (typeof track === 'string') return track
  return track[breakpoint] || track.md || track.xs || 'minmax(120px, 1fr)'
}

function findingGridColumns(columns: FindingColumnDef[]): ResponsiveCssValue {
  return {
    xs: ['42px', ...columns.map((column) => columnTrackAt(column.track, 'xs'))].join(' '),
    md: ['44px', ...columns.map((column) => columnTrackAt(column.track, 'md'))].join(' '),
    xl: ['44px', ...columns.map((column) => columnTrackAt(column.track, 'xl'))].join(' '),
  }
}

export function DomainsManagerView({ findingsTitle = 'Domain Findings' }: DomainsManagerViewProps = {}) {
  const { orgId } = useParams<{ orgId: string }>()
  const queryClient = useQueryClient()
  const theme = useTheme()
  const [activeTab, setActiveTab] = useState<ManagerTab>('findings')
  const [search, setSearch] = useState('')
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all')
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>('all')
  const [assetImportanceFilter, setAssetImportanceFilter] = useState<AssetImportanceFilter>('all')
  const [affectsRatingFilter, setAffectsRatingFilter] = useState<NullableBoolFilter>('all')
  const [threatInsightsFilter, setThreatInsightsFilter] = useState<NullableBoolFilter>('all')
  const [riskVectorFilter, setRiskVectorFilter] = useState('')
  const [webAppTestFilter, setWebAppTestFilter] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [assetsFilter, setAssetsFilter] = useState('')
  const [vulnerabilityFilter, setVulnerabilityFilter] = useState('')
  const [threatGroupFilter, setThreatGroupFilter] = useState('')
  const [threatActivityFilter, setThreatActivityFilter] = useState<ThreatActivityLabel>('')
  const [firstSeenFrom, setFirstSeenFrom] = useState('')
  const [firstSeenTo, setFirstSeenTo] = useState('')
  const [lastSeenFrom, setLastSeenFrom] = useState('')
  const [lastSeenTo, setLastSeenTo] = useState('')
  const [impactEndDateFrom, setImpactEndDateFrom] = useState('')
  const [impactEndDateTo, setImpactEndDateTo] = useState('')
  const [noImpactEndDateFrom, setNoImpactEndDateFrom] = useState('')
  const [noImpactEndDateTo, setNoImpactEndDateTo] = useState('')
  const [remainingLifetimeMax, setRemainingLifetimeMax] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filterSearch, setFilterSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(0)
  const [columnsOpen, setColumnsOpen] = useState(false)
  const [columnSearch, setColumnSearch] = useState('')
  const [selectedFinding, setSelectedFinding] = useState<FindingRow | null>(null)
  const [visibleFindingColumnIds, setVisibleFindingColumnIds] = useState<Set<FindingColumnId>>(
    () => new Set(DEFAULT_FINDING_COLUMN_IDS),
  )
  const [draftFindingColumnIds, setDraftFindingColumnIds] = useState<Set<FindingColumnId>>(
    () => new Set(DEFAULT_FINDING_COLUMN_IDS),
  )

  const postureQ = useQuery({
    queryKey: qk.domains.managerPostureKernel(orgId),
    queryFn: () => getDomainPostureKernel(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const findingsFilter = useMemo<FindingsFilter>(() => ({
    include_resolved: true,
    limit: FINDINGS_LIMIT,
    offset: 0,
    q: activeTab === 'findings' ? optionalText(search) : undefined,
    category: optionalText(riskVectorFilter),
    severity: severityFilter === 'all' ? undefined : severityFilter,
    grade: gradeFilter === 'all' ? undefined : gradeFilter,
    asset_importance: assetImportanceFilter === 'all' ? undefined : assetImportanceFilter,
    affects_rating: affectsRatingFilter === 'all' ? undefined : affectsRatingFilter === 'yes',
    has_threat_insights: threatInsightsFilter === 'all' ? undefined : threatInsightsFilter === 'yes',
    threat_group: optionalText(threatGroupFilter),
    threat_activity_label: threatActivityFilter || undefined,
    tag: optionalText(tagFilter),
    web_app_test: optionalText(webAppTestFilter),
    first_seen_from: optionalText(firstSeenFrom),
    first_seen_to: optionalText(firstSeenTo),
    last_seen_from: optionalText(lastSeenFrom),
    last_seen_to: optionalText(lastSeenTo),
    impact_end_date_from: optionalText(impactEndDateFrom),
    impact_end_date_to: optionalText(impactEndDateTo),
    no_impact_end_date_from: optionalText(noImpactEndDateFrom),
    no_impact_end_date_to: optionalText(noImpactEndDateTo),
    remaining_lifetime_max: optionalNumber(remainingLifetimeMax),
    assets: optionalText(assetsFilter),
    vulnerability: optionalText(vulnerabilityFilter),
  }), [
    activeTab,
    affectsRatingFilter,
    assetImportanceFilter,
    assetsFilter,
    firstSeenFrom,
    firstSeenTo,
    gradeFilter,
    impactEndDateFrom,
    impactEndDateTo,
    lastSeenFrom,
    lastSeenTo,
    noImpactEndDateFrom,
    noImpactEndDateTo,
    remainingLifetimeMax,
    riskVectorFilter,
    search,
    severityFilter,
    tagFilter,
    threatActivityFilter,
    threatGroupFilter,
    threatInsightsFilter,
    vulnerabilityFilter,
    webAppTestFilter,
  ])

  const findingsQ = useQuery({
    queryKey: qk.exposure.findingsList(orgId, { ...findingsFilter }),
    queryFn: () => listFindings(orgId!, findingsFilter),
    enabled: !!orgId,
    staleTime: 0,
    refetchOnMount: 'always',
  })

  const facetsQ = useQuery({
    queryKey: qk.exposure.findingsFacets(orgId, true),
    queryFn: () => listFindingFacets(orgId!, true),
    enabled: !!orgId,
    staleTime: 0,
    refetchOnMount: 'always',
  })

  useEffect(() => {
    if (!orgId || !postureQ.isSuccess) return
    void queryClient.invalidateQueries({ queryKey: qk.exposure.findingsListAll(orgId) })
    void queryClient.invalidateQueries({ queryKey: qk.exposure.findingsFacets(orgId, true) })
  }, [orgId, postureQ.dataUpdatedAt, postureQ.isSuccess, queryClient])

  const assets: DomainKernelAsset[] = useMemo(() => postureQ.data?.assets ?? [], [postureQ.data])
  const sourceFindings = useMemo<Finding[]>(() => findingsQ.data?.findings ?? [], [findingsQ.data])
  const lifecycleFindingRows: FindingRow[] = useMemo(
    () => sourceFindings.map(findingRowFromExternal),
    [sourceFindings],
  )
  const findingRows = lifecycleFindingRows

  const domainRows: DomainRow[] = useMemo(() => {
    return assets.map((asset) => ({
      id: asset.resource_id,
      domain: assetName(asset),
      type: asset.type || '-',
      grade: asset.display_grade || asset.grade || '',
      findings: asset.finding_count ?? 0,
      confidence: confidencePercent(asset.confidence),
      sources: asset.sources?.join(', ') || '-',
      lastScanned: formatDate(asset.last_scanned),
      tier: asset.current_tier || '-',
    }))
  }, [assets])

  const watchRows = useMemo(
    () => domainRows.filter((row) => row.confidence < LOW_CONFIDENCE || row.findings === 0),
    [domainRows],
  )

  const visibleFindingColumns = useMemo(
    () => FINDING_COLUMNS.filter((column) => visibleFindingColumnIds.has(column.id)),
    [visibleFindingColumnIds],
  )

  const filteredFindingRows = findingRows

  const filteredDomainRows = useMemo(() => {
    const rows = activeTab === 'watchlist' ? watchRows : domainRows
    if (!search.trim()) return rows
    return rows.filter((row) =>
      includesSearch(`${row.domain} ${row.type} ${row.grade} ${row.sources} ${row.tier}`, search),
    )
  }, [activeTab, domainRows, search, watchRows])

  const severityCounts = useMemo(() => {
    const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, '': 0 }
    for (const row of findingRows) counts[row.severity] += 1
    return counts
  }, [findingRows])

  const shownCount = activeTab === 'findings' ? filteredFindingRows.length : filteredDomainRows.length
  const pageCount = Math.max(1, Math.ceil(shownCount / ROWS_PER_PAGE))
  const pageIndex = Math.min(page, pageCount - 1)
  const pageStart = pageIndex * ROWS_PER_PAGE
  const pagedFindingRows = filteredFindingRows.slice(pageStart, pageStart + ROWS_PER_PAGE)
  const pagedDomainRows = filteredDomainRows.slice(pageStart, pageStart + ROWS_PER_PAGE)
  const pageRows = activeTab === 'findings' ? pagedFindingRows : pagedDomainRows
  const pageIds = pageRows.map((row) => row.id)
  const selectedOnPage = pageIds.filter((id) => selectedIds.has(id)).length
  const allPageSelected = pageIds.length > 0 && selectedOnPage === pageIds.length
  const somePageSelected = selectedOnPage > 0 && !allPageSelected
  const categoryCounts = useMemo(
    () => facetsQ.data?.counts_by_category ?? {},
    [facetsQ.data?.counts_by_category],
  )
  const riskVectorOptions = useMemo(
    () => Object.keys(categoryCounts).sort((a, b) => a.localeCompare(b)),
    [categoryCounts],
  )
  const activeFilterCount = [
    !!search.trim() && activeTab === 'findings',
    !!riskVectorFilter,
    severityFilter !== 'all',
    gradeFilter !== 'all',
    assetImportanceFilter !== 'all',
    affectsRatingFilter !== 'all',
    threatInsightsFilter !== 'all',
    !!webAppTestFilter.trim(),
    !!tagFilter.trim(),
    !!assetsFilter.trim(),
    !!vulnerabilityFilter.trim(),
    !!threatGroupFilter.trim(),
    !!threatActivityFilter,
    !!firstSeenFrom,
    !!firstSeenTo,
    !!lastSeenFrom,
    !!lastSeenTo,
    !!impactEndDateFrom,
    !!impactEndDateTo,
    !!noImpactEndDateFrom,
    !!noImpactEndDateTo,
    !!remainingLifetimeMax.trim(),
  ].filter(Boolean).length
  const filtersActive = activeFilterCount > 0
  const toolbarCountLabel =
    activeTab === 'findings'
      ? `${shownCount} Findings`
      : activeTab === 'domains'
        ? `${shownCount} Domains`
        : `${shownCount} Watchlist`
  const pageTitle =
    activeTab === 'findings'
      ? findingsTitle
      : activeTab === 'domains'
        ? 'Domain Inventory'
        : 'Domain Watchlist'
  const historyCapSuffix = (findingsQ.data?.findings?.length ?? 0) >= FINDINGS_LIMIT ? '+' : ''
  const pageSubtitle = `${findingRows.length}${historyCapSuffix} backend findings across ${domainRows.length} domains / ${watchRows.length} watchlist`

  const tabs: Array<{ id: ManagerTab; label: string; count: number }> = [
    { id: 'findings', label: 'Findings', count: findingRows.length },
    { id: 'domains', label: 'Domains', count: domainRows.length },
    { id: 'watchlist', label: 'Watchlist', count: watchRows.length },
  ]

  const border = alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.16 : 0.12)
  const headerBg = theme.palette.mode === 'dark' ? colors.brandDarkest : theme.palette.common.white
  const accentWash = `linear-gradient(90deg, ${alpha(MANAGER_ACCENT, theme.palette.mode === 'dark' ? 0.18 : 0.075)} 0%, transparent 62%)`

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function togglePageRows() {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      const remove = pageIds.every((id) => next.has(id))
      for (const id of pageIds) {
        if (remove) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }

  function resetFilters() {
    setSearch('')
    setSeverityFilter('all')
    setGradeFilter('all')
    setAssetImportanceFilter('all')
    setAffectsRatingFilter('all')
    setThreatInsightsFilter('all')
    setRiskVectorFilter('')
    setWebAppTestFilter('')
    setTagFilter('')
    setAssetsFilter('')
    setVulnerabilityFilter('')
    setThreatGroupFilter('')
    setThreatActivityFilter('')
    setFirstSeenFrom('')
    setFirstSeenTo('')
    setLastSeenFrom('')
    setLastSeenTo('')
    setImpactEndDateFrom('')
    setImpactEndDateTo('')
    setNoImpactEndDateFrom('')
    setNoImpactEndDateTo('')
    setRemainingLifetimeMax('')
    setPage(0)
  }

  function setTextFilter(setter: (value: string) => void, value: string) {
    setter(value)
    setPage(0)
  }

  function saveFilterSet() {
    if (!orgId) return
    const snapshot = {
      search,
      severityFilter,
      gradeFilter,
      assetImportanceFilter,
      affectsRatingFilter,
      threatInsightsFilter,
      riskVectorFilter,
      webAppTestFilter,
      tagFilter,
      assetsFilter,
      vulnerabilityFilter,
      threatGroupFilter,
      threatActivityFilter,
      firstSeenFrom,
      firstSeenTo,
      lastSeenFrom,
      lastSeenTo,
      impactEndDateFrom,
      impactEndDateTo,
      noImpactEndDateFrom,
      noImpactEndDateTo,
      remainingLifetimeMax,
    }
    window.localStorage.setItem(`domains-manager-filter-set:${orgId}`, JSON.stringify(snapshot))
  }

  function openColumnDialog() {
    setDraftFindingColumnIds(new Set(visibleFindingColumnIds))
    setColumnSearch('')
    setColumnsOpen(true)
  }

  function toggleDraftColumn(id: FindingColumnId) {
    const column = FINDING_COLUMNS.find((item) => item.id === id)
    if (column?.locked) return
    setDraftFindingColumnIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAllDraftColumns() {
    setDraftFindingColumnIds((prev) => {
      const optionalColumns = FINDING_COLUMNS.filter((column) => !column.locked)
      const allOptionalSelected = optionalColumns.every((column) => prev.has(column.id))
      const next = new Set(prev)
      for (const column of optionalColumns) {
        if (allOptionalSelected) next.delete(column.id)
        else next.add(column.id)
      }
      for (const column of FINDING_COLUMNS) {
        if (column.locked) next.add(column.id)
      }
      return next
    })
  }

  function resetColumns() {
    setDraftFindingColumnIds(new Set(DEFAULT_FINDING_COLUMN_IDS))
  }

  function applyColumns() {
    const next = new Set(draftFindingColumnIds)
    for (const column of FINDING_COLUMNS) {
      if (column.locked) next.add(column.id)
    }
    setVisibleFindingColumnIds(next)
    setColumnsOpen(false)
  }

  function exportCurrentView() {
    if (activeTab === 'findings') {
      downloadCsv(
        'domain-findings.csv',
        visibleFindingColumns.map((column) => column.label),
        filteredFindingRows.map((row) => visibleFindingColumns.map((column) => column.exportValue(row))),
      )
      return
    }

    downloadCsv(
      activeTab === 'watchlist' ? 'domain-watchlist.csv' : 'domain-inventory.csv',
      ['Domain', 'Type', 'Grade', 'Findings', 'Confidence', 'Sources', 'Last Scan', 'Tier'],
      filteredDomainRows.map((row) => [
        row.domain,
        row.type,
        gradeLabel(row.grade),
        row.findings,
        `${row.confidence}%`,
        row.sources,
        row.lastScanned,
        row.tier,
      ]),
    )
  }

  const visibleFilterFields = filterSearch.trim()
    ? FILTER_SET_FIELDS.filter((field) => includesSearch(field, filterSearch))
    : FILTER_SET_FIELDS
  const filterFieldVisible = (field: string) => visibleFilterFields.includes(field)

  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.default',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          minHeight: { xs: 86, md: 76 },
          flexShrink: 0,
          px: { xs: 2, md: 3 },
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          flexWrap: { xs: 'wrap', xl: 'nowrap' },
          borderBottom: `1px solid ${border}`,
          bgcolor: 'background.paper',
          backgroundImage: accentWash,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography component="h1" sx={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2 }} noWrap>
            {pageTitle}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }} noWrap>
            {pageSubtitle}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0, flexWrap: 'wrap' }}>
          <ToolbarIconButton primary label="Export CSV" icon={<Download size={18} />} onClick={exportCurrentView} />
          {selectedIds.size > 0 && (
            <ActionButton label={`Clear ${selectedIds.size} selected`} onClick={() => setSelectedIds(new Set())} />
          )}
        </Box>
      </Box>

      <Box
        sx={{
          minHeight: 58,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          rowGap: 1,
          px: { xs: 1.5, md: 2 },
          py: 1,
          flexWrap: 'wrap',
          borderBottom: `1px solid ${border}`,
          bgcolor: 'background.paper',
        }}
      >
        <Box
          component="button"
          type="button"
          disabled={activeTab !== 'findings'}
          aria-label={activeTab === 'findings' ? 'Open filters' : toolbarCountLabel}
          onClick={activeTab === 'findings' ? () => setFiltersOpen(true) : undefined}
          sx={{
            minWidth: 132,
            height: 36,
            px: 0.5,
            border: 0,
            borderRadius: 1,
            bgcolor: filtersActive && activeTab === 'findings' ? alpha(MANAGER_ACCENT, 0.1) : 'transparent',
            color: 'text.primary',
            font: 'inherit',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.75,
            cursor: activeTab === 'findings' ? 'pointer' : 'default',
            '&:hover': activeTab === 'findings'
              ? {
                  bgcolor: alpha(MANAGER_ACCENT, 0.1),
                }
              : undefined,
            '&:focus-visible': {
              outline: `2px solid ${alpha(MANAGER_ACCENT, 0.52)}`,
              outlineOffset: 2,
            },
            '&:disabled': {
              color: 'text.primary',
            },
          }}
        >
          <Filter size={20} color={MANAGER_ACCENT} />
          <Typography sx={{ fontSize: 17, fontWeight: 750 }} noWrap>
            {toolbarCountLabel}
          </Typography>
          {activeTab === 'findings' && filtersActive && (
            <Chip
              size="small"
              label={activeFilterCount}
              sx={{
                height: 20,
                borderRadius: 0.75,
                fontWeight: 850,
                bgcolor: alpha(MANAGER_ACCENT, 0.16),
                color: MANAGER_ACCENT,
              }}
            />
          )}
        </Box>

        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'nowrap' }}>
          {tabs.map((tab) => {
            const selected = activeTab === tab.id
            return (
              <Box
                key={tab.id}
                component="button"
                type="button"
                onClick={() => {
                  setActiveTab(tab.id)
                  setPage(0)
                  setSelectedFinding(null)
                }}
                sx={{
                  height: 36,
                  px: 1.5,
                  borderRadius: 1,
                  border: `1px solid ${selected ? MANAGER_ACCENT : alpha(MANAGER_ACCENT, 0.35)}`,
                  bgcolor: selected ? alpha(MANAGER_ACCENT, 0.12) : 'transparent',
                  color: selected ? MANAGER_ACCENT : 'text.secondary',
                  font: 'inherit',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.75,
                }}
              >
                <span>{tab.label}</span>
                <Chip
                  size="small"
                  label={tab.count}
                  sx={{
                    height: 20,
                    borderRadius: 0.75,
                    fontWeight: 800,
                    bgcolor: selected ? alpha(MANAGER_ACCENT, 0.18) : alpha(theme.palette.text.primary, 0.08),
                  }}
                />
              </Box>
            )
          })}
        </Box>

        {activeTab === 'findings' && (
          <ToolbarIconButton
            label="Customize columns"
            icon={<SlidersHorizontal size={19} />}
            onClick={openColumnDialog}
          />
        )}

        {filtersActive && (
          <ToolbarIconButton
            label="Reset filters"
            icon={<RotateCcw size={17} />}
            onClick={resetFilters}
          />
        )}

        <Box sx={{ flex: 1, display: { xs: 'none', lg: 'block' } }} />

        <TextField
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setPage(0)
          }}
          placeholder="Search..."
          size="small"
          sx={{
            width: { xs: 190, sm: 220, md: 280 },
            maxWidth: '100%',
            '& .MuiOutlinedInput-root': {
              height: 36,
              borderRadius: 1,
              bgcolor: alpha(theme.palette.background.paper, 0.95),
              '&.Mui-focused fieldset': {
                borderColor: MANAGER_ACCENT,
                boxShadow: `0 0 0 3px ${alpha(MANAGER_ACCENT, 0.12)}`,
              },
            },
          }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <Search size={20} />
              </InputAdornment>
            ),
          }}
        />
      </Box>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', overscrollBehavior: 'contain', scrollbarGutter: 'stable' }}>
            {activeTab === 'findings' ? (
              <FindingsTable
                rows={pagedFindingRows}
                columns={visibleFindingColumns}
                border={border}
                headerBg={headerBg}
                selectedIds={selectedIds}
                allPageSelected={allPageSelected}
                somePageSelected={somePageSelected}
                onTogglePage={togglePageRows}
                onToggleRow={toggleRow}
                selectedFindingId={selectedFinding?.id}
                onOpenRow={setSelectedFinding}
              />
            ) : (
              <DomainsTable
                rows={pagedDomainRows}
                border={border}
                headerBg={headerBg}
                selectedIds={selectedIds}
                allPageSelected={allPageSelected}
                somePageSelected={somePageSelected}
                onTogglePage={togglePageRows}
                onToggleRow={toggleRow}
              />
            )}
          </Box>

          <Box
            sx={{
              minHeight: 54,
              flexShrink: 0,
              px: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 2,
              borderTop: `1px solid ${border}`,
              bgcolor: 'background.paper',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography color="text.secondary">Rows Per Page</Typography>
              <Chip size="small" label={ROWS_PER_PAGE} variant="outlined" sx={{ borderRadius: 1, fontWeight: 800 }} />
              <Typography color="text.secondary">
                {shownCount === 0 ? '0' : `${pageStart + 1} - ${Math.min(pageStart + ROWS_PER_PAGE, shownCount)}`} of {shownCount}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ToolbarIconButton
                label="Previous page"
                disabled={pageIndex === 0}
                icon={<ChevronLeft size={18} />}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              />
              <Chip size="small" label={pageIndex + 1} variant="outlined" sx={{ minWidth: 62, borderRadius: 1, fontWeight: 800 }} />
              <ToolbarIconButton
                label="Next page"
                disabled={pageIndex >= pageCount - 1}
                icon={<ChevronRight size={18} />}
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              />
            </Box>
          </Box>
        </Box>
      </Box>

      <Drawer
        anchor="right"
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        PaperProps={{
          sx: {
            width: { xs: '100%', sm: 430 },
            maxWidth: '100%',
            bgcolor: 'background.paper',
          },
        }}
      >
        <Box sx={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <Box
            sx={{
              minHeight: 68,
              px: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
              borderBottom: `1px solid ${border}`,
              backgroundImage: accentWash,
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 20, fontWeight: 850 }}>Filter Sets</Typography>
              <Typography variant="body2" color="text.secondary">
                {activeFilterCount} active
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <ToolbarIconButton label="Save filter set" icon={<Download size={17} />} onClick={saveFilterSet} />
              <ToolbarIconButton label="Close filters" icon={<X size={18} />} onClick={() => setFiltersOpen(false)} />
            </Box>
          </Box>

          <Box sx={{ p: 2, borderBottom: `1px solid ${border}` }}>
            <TextField
              value={filterSearch}
              onChange={(event) => setFilterSearch(event.target.value)}
              placeholder="Search filter options..."
              size="small"
              fullWidth
              sx={{
                '& .MuiOutlinedInput-root': {
                  height: 40,
                  borderRadius: 1,
                  '&.Mui-focused fieldset': {
                    borderColor: MANAGER_ACCENT,
                    boxShadow: `0 0 0 3px ${alpha(MANAGER_ACCENT, 0.12)}`,
                  },
                },
              }}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <Search size={19} />
                  </InputAdornment>
                ),
              }}
            />
          </Box>

          <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', px: 2, py: 1.5 }}>
            {filterFieldVisible('Risk Vector') && (
              <FilterSection title="Risk Vector">
                <CompactSelect
                  value={riskVectorFilter}
                  onChange={(value) => {
                    setRiskVectorFilter(value)
                    setPage(0)
                  }}
                  options={[
                    ['', 'All risk vectors'],
                    ...riskVectorOptions.map((category) => [category, `${humanizeFindingText(category)} ${categoryCounts[category] ?? 0}`] as [string, string]),
                  ]}
                />
              </FilterSection>
            )}

            {filterFieldVisible('Finding Severity') && (
              <FilterSection title="Finding Severity">
                <CompactSelect
                  value={severityFilter}
                  onChange={(value) => {
                    setSeverityFilter(value as SeverityFilter)
                    setPage(0)
                  }}
                  options={[
                    ['all', 'All severity'],
                    ...FINDING_ORDER.map((severity) => [severity, `${severityLabel(severity)} ${severityCounts[severity]}`] as [string, string]),
                  ]}
                />
              </FilterSection>
            )}

            {filterFieldVisible('Grade') && (
              <FilterSection title="Grade">
                <CompactSelect
                  value={gradeFilter}
                  onChange={(value) => {
                    setGradeFilter(value as GradeFilter)
                    setPage(0)
                  }}
                  options={[
                    ['all', 'All grades'],
                    ...GRADE_ORDER.map((grade) => [grade, humanizeFindingText(grade)] as [string, string]),
                  ]}
                />
              </FilterSection>
            )}

            {filterFieldVisible('Impacts Risk Vector Grade') && (
              <FilterSection title="Impacts Risk Vector Grade">
                <CompactSelect
                  value={affectsRatingFilter}
                  onChange={(value) => {
                    setAffectsRatingFilter(value as NullableBoolFilter)
                    setPage(0)
                  }}
                  options={[
                    ['all', 'All'],
                    ['yes', 'Yes'],
                    ['no', 'No'],
                  ]}
                />
              </FilterSection>
            )}

            {filterFieldVisible('First Seen') && (
              <FilterSection title="First Seen">
                <DatePair
                  from={firstSeenFrom}
                  to={firstSeenTo}
                  onFrom={(value) => {
                    setFirstSeenFrom(value)
                    setPage(0)
                  }}
                  onTo={(value) => {
                    setFirstSeenTo(value)
                    setPage(0)
                  }}
                />
              </FilterSection>
            )}

            {filterFieldVisible('Last Seen') && (
              <FilterSection title="Last Seen">
                <DatePair
                  from={lastSeenFrom}
                  to={lastSeenTo}
                  onFrom={(value) => {
                    setLastSeenFrom(value)
                    setPage(0)
                  }}
                  onTo={(value) => {
                    setLastSeenTo(value)
                    setPage(0)
                  }}
                />
              </FilterSection>
            )}

            {filterFieldVisible('Web App Sec Tests') && (
              <FilterSection title="Web App Sec Tests">
                <FilterTextField
                  value={webAppTestFilter}
                  onChange={(value) => setTextFilter(setWebAppTestFilter, value)}
                  placeholder="hsts, csp, network exposure..."
                />
              </FilterSection>
            )}

            {filterFieldVisible('Impact End Date') && (
              <FilterSection title="Impact End Date">
                <DatePair
                  from={impactEndDateFrom}
                  to={impactEndDateTo}
                  onFrom={(value) => {
                    setImpactEndDateFrom(value)
                    setPage(0)
                  }}
                  onTo={(value) => {
                    setImpactEndDateTo(value)
                    setPage(0)
                  }}
                />
              </FilterSection>
            )}

            {filterFieldVisible('Remaining Lifetime') && (
              <FilterSection title="Remaining Lifetime">
                <FilterTextField
                  value={remainingLifetimeMax}
                  onChange={(value) => setTextFilter(setRemainingLifetimeMax, value)}
                  placeholder="Max days"
                  type="number"
                />
              </FilterSection>
            )}

            {filterFieldVisible('Threat Insights') && (
              <FilterSection title="Threat Insights">
                <CompactSelect
                  value={threatInsightsFilter}
                  onChange={(value) => {
                    setThreatInsightsFilter(value as NullableBoolFilter)
                    setPage(0)
                  }}
                  options={[
                    ['all', 'All'],
                    ['yes', 'Yes'],
                    ['no', 'No'],
                  ]}
                />
              </FilterSection>
            )}

            {filterFieldVisible('Threat Groups') && (
              <FilterSection title="Threat Groups">
                <FilterTextField
                  value={threatGroupFilter}
                  onChange={(value) => setTextFilter(setThreatGroupFilter, value)}
                  placeholder="Group name"
                />
              </FilterSection>
            )}

            {filterFieldVisible('Threat Activity Score') && (
              <FilterSection title="Threat Activity Score">
                <CompactSelect
                  value={threatActivityFilter}
                  onChange={(value) => {
                    setThreatActivityFilter(value as ThreatActivityLabel)
                    setPage(0)
                  }}
                  options={[
                    ['', 'All activity'],
                    ...THREAT_ACTIVITY_OPTIONS.map((item) => [item, humanizeFindingText(item)] as [string, string]),
                  ]}
                />
              </FilterSection>
            )}

            {filterFieldVisible('No Impact End Date') && (
              <FilterSection title="No Impact End Date">
                <DatePair
                  from={noImpactEndDateFrom}
                  to={noImpactEndDateTo}
                  onFrom={(value) => {
                    setNoImpactEndDateFrom(value)
                    setPage(0)
                  }}
                  onTo={(value) => {
                    setNoImpactEndDateTo(value)
                    setPage(0)
                  }}
                />
              </FilterSection>
            )}

            {filterFieldVisible('Tag') && (
              <FilterSection title="Tag">
                <FilterTextField value={tagFilter} onChange={(value) => setTextFilter(setTagFilter, value)} placeholder="Tag" />
              </FilterSection>
            )}

            {filterFieldVisible('Assets') && (
              <FilterSection title="Assets">
                <FilterTextField
                  value={assetsFilter}
                  onChange={(value) => setTextFilter(setAssetsFilter, value)}
                  placeholder="Asset name, host, IP"
                />
              </FilterSection>
            )}

            {filterFieldVisible('Asset Importance') && (
              <FilterSection title="Asset Importance">
                <CompactSelect
                  value={assetImportanceFilter}
                  onChange={(value) => {
                    setAssetImportanceFilter(value as AssetImportanceFilter)
                    setPage(0)
                  }}
                  options={[
                    ['all', 'All importance'],
                    ...ASSET_IMPORTANCE_ORDER.map((item) => [item, humanizeFindingText(item)] as [string, string]),
                  ]}
                />
              </FilterSection>
            )}

            {filterFieldVisible('Vulnerability') && (
              <FilterSection title="Vulnerability">
                <FilterTextField
                  value={vulnerabilityFilter}
                  onChange={(value) => setTextFilter(setVulnerabilityFilter, value)}
                  placeholder="CVE, identifier, description"
                />
              </FilterSection>
            )}
          </Box>

          <Box sx={{ p: 2, borderTop: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between', gap: 1 }}>
            <ActionButton label="Reset" onClick={resetFilters} disabled={!filtersActive} />
            <ActionButton primary label="Apply" onClick={() => setFiltersOpen(false)} />
          </Box>
        </Box>
      </Drawer>

      <ColumnCustomizeDialog
        open={columnsOpen}
        columns={FINDING_COLUMNS}
        draftColumnIds={draftFindingColumnIds}
        search={columnSearch}
        onSearch={setColumnSearch}
        onToggle={toggleDraftColumn}
        onToggleAll={toggleAllDraftColumns}
        onReset={resetColumns}
        onCancel={() => setColumnsOpen(false)}
        onApply={applyColumns}
      />
      <FindingDetailDrawer
        open={!!selectedFinding}
        row={selectedFinding}
        onClose={() => setSelectedFinding(null)}
      />
    </Box>
  )
}

function ColumnCustomizeDialog({
  open,
  columns,
  draftColumnIds,
  search,
  onSearch,
  onToggle,
  onToggleAll,
  onReset,
  onCancel,
  onApply,
}: {
  open: boolean
  columns: FindingColumnDef[]
  draftColumnIds: Set<FindingColumnId>
  search: string
  onSearch: (value: string) => void
  onToggle: (id: FindingColumnId) => void
  onToggleAll: () => void
  onReset: () => void
  onCancel: () => void
  onApply: () => void
}) {
  const visibleColumns = columns.filter((column) => draftColumnIds.has(column.id))
  const selectableColumns = columns.filter((column) => !column.locked)
  const allOptionalSelected = selectableColumns.every((column) => draftColumnIds.has(column.id))
  const someOptionalSelected = selectableColumns.some((column) => draftColumnIds.has(column.id)) && !allOptionalSelected
  const filteredColumns = search.trim()
    ? columns.filter((column) => includesSearch(`${column.label} ${column.description}`, search))
    : columns

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 1.5,
          overflow: 'hidden',
          bgcolor: 'background.paper',
        },
      }}
    >
      <DialogTitle
        sx={{
          px: 3,
          py: 2.25,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          borderBottom: (theme) => `1px solid ${alpha(theme.palette.text.primary, 0.1)}`,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 22, fontWeight: 800 }}>Customize Columns</Typography>
          <Typography variant="body2" color="text.secondary">
            Show only the evidence columns this view can actually support.
          </Typography>
        </Box>
        <Chip
          label={`${visibleColumns.length}/${columns.length}`}
          sx={{
            borderRadius: 1,
            fontWeight: 800,
            bgcolor: alpha(MANAGER_ACCENT, 0.12),
            color: MANAGER_ACCENT,
          }}
        />
      </DialogTitle>

      <Box sx={{ px: 3, py: 1.75, display: 'flex', alignItems: 'center', gap: 2 }}>
        <ManagerCheckbox
          checked={allOptionalSelected}
          indeterminate={someOptionalSelected}
          onChange={onToggleAll}
          inputProps={{ 'aria-label': 'Toggle optional finding columns' }}
        />
        <TextField
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search columns..."
          size="small"
          sx={{
            maxWidth: 380,
            flex: 1,
            '& .MuiOutlinedInput-root': {
              height: 42,
              borderRadius: 1,
              '&.Mui-focused fieldset': {
                borderColor: MANAGER_ACCENT,
                boxShadow: `0 0 0 3px ${alpha(MANAGER_ACCENT, 0.12)}`,
              },
            },
          }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <Search size={20} />
              </InputAdornment>
            ),
          }}
        />
      </Box>

      <DialogContent dividers sx={{ p: 0 }}>
        <Box sx={{ maxHeight: { xs: 360, md: 470 }, overflow: 'auto' }}>
          {filteredColumns.map((column) => {
            const checked = draftColumnIds.has(column.id)
            return (
              <Box
                key={column.id}
                component="button"
                type="button"
                disabled={column.locked}
                onClick={() => onToggle(column.id)}
                sx={{
                  width: '100%',
                  minHeight: 62,
                  px: 2.5,
                  border: 0,
                  borderBottom: (theme) => `1px solid ${alpha(theme.palette.text.primary, 0.08)}`,
                  bgcolor: checked ? alpha(MANAGER_ACCENT, 0.055) : 'background.paper',
                  color: 'text.primary',
                  font: 'inherit',
                  textAlign: 'left',
                  display: 'grid',
                  gridTemplateColumns: { xs: '44px minmax(0, 1fr)', md: '44px minmax(160px, 0.44fr) minmax(0, 1fr) 74px' },
                  alignItems: 'center',
                  gap: 1.5,
                  cursor: column.locked ? 'default' : 'pointer',
                  '&:hover': {
                    bgcolor: column.locked ? undefined : alpha(MANAGER_ACCENT, 0.08),
                  },
                }}
              >
                <ManagerCheckbox
                  checked={checked}
                  disabled={column.locked}
                  onChange={() => onToggle(column.id)}
                  onClick={(event) => event.stopPropagation()}
                  inputProps={{ 'aria-label': `Toggle ${column.label}` }}
                />
                <Typography sx={{ minWidth: 0, fontWeight: 800 }} noWrap>
                  {column.label}
                </Typography>
                <Typography
                  color="text.secondary"
                  sx={{
                    display: { xs: 'none', md: 'block' },
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={column.description}
                >
                  {column.description}
                </Typography>
                {column.locked && (
                  <Chip
                    size="small"
                    label="Locked"
                    sx={{
                      display: { xs: 'none', md: 'inline-flex' },
                      borderRadius: 0.75,
                      fontWeight: 800,
                      bgcolor: alpha(MANAGER_ACCENT, 0.1),
                      color: MANAGER_ACCENT,
                    }}
                  />
                )}
              </Box>
            )
          })}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        <Button onClick={onReset} sx={{ fontWeight: 800, color: MANAGER_ACCENT }}>
          Reset Defaults
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={onCancel} sx={{ fontWeight: 800, color: 'text.secondary' }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={onApply}
          sx={{
            minWidth: 138,
            borderRadius: 1,
            fontWeight: 800,
            bgcolor: MANAGER_ACCENT,
            background: `linear-gradient(135deg, ${MANAGER_ACCENT}, ${MANAGER_ACCENT_LIGHT})`,
            boxShadow: `0 10px 24px ${alpha(MANAGER_ACCENT, 0.22)}`,
            '&:hover': {
              bgcolor: MANAGER_ACCENT,
              boxShadow: `0 0 0 3px ${alpha(MANAGER_ACCENT, 0.14)}`,
            },
          }}
        >
          Apply Changes
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function FindingDetailDrawer({
  open,
  row,
  onClose,
}: {
  open: boolean
  row: FindingRow | null
  onClose: () => void
}) {
  const theme = useTheme()
  const drawerBorder = alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.16 : 0.12)
  const hasFindingGrade = gradeLabel(row?.grade) !== '-'
  const detailText = row?.details && row.details !== '-'
    ? row.details
    : 'No backend detail text is available for this finding.'

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      ModalProps={{ keepMounted: true }}
      PaperProps={{
        sx: {
          width: { xs: '100%', sm: 560, md: 680 },
          maxWidth: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          bgcolor: 'background.paper',
          borderLeft: `1px solid ${drawerBorder}`,
        },
      }}
    >
      {row && (
        <Box sx={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <Box
            sx={{
              flexShrink: 0,
              px: 3,
              py: 2.25,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 1.5,
              borderBottom: `1px solid ${drawerBorder}`,
              backgroundImage: `linear-gradient(90deg, ${alpha(MANAGER_ACCENT, 0.095)}, transparent 70%)`,
            }}
          >
            <ToolbarIconButton
              label="Close details"
              icon={<X size={18} />}
              onClick={onClose}
            />
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography sx={{ fontSize: 22, fontWeight: 800, lineHeight: 1.2 }} noWrap title={row.identifier}>
                {row.identifier}
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 0.25, fontWeight: 600 }} noWrap title={row.riskVector}>
                {row.riskVector}
              </Typography>
            </Box>
          </Box>

          <Box
            sx={{
              flexShrink: 0,
              px: 3,
              pt: 1.5,
              borderBottom: `1px solid ${drawerBorder}`,
            }}
          >
            <Typography
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                minHeight: 36,
                fontSize: 14,
                fontWeight: 800,
                color: MANAGER_ACCENT,
                borderBottom: `3px solid ${MANAGER_ACCENT}`,
              }}
            >
              Overview
            </Typography>
          </Box>

          <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', px: 3, py: 2.25 }}>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
                gap: 1.25,
                mb: 2,
              }}
            >
              <DetailMetric label="Finding Identifier">
                <Typography sx={{ fontWeight: 700 }} noWrap title={row.identifier}>
                  {row.identifier}
                </Typography>
              </DetailMetric>
              <DetailMetric label="Lifecycle">
                <LifecycleChip row={row} />
              </DetailMetric>
              {hasFindingGrade && (
                <DetailMetric label="Finding Grade">
                  <DetailChip label={gradeLabel(row.grade)} tone={gradeTone(row.grade)} />
                </DetailMetric>
              )}
              <DetailMetric label="Severity">
                <DetailChip label={severityLabel(row.severity)} tone={severityColor(row.severity)} />
              </DetailMetric>
              <DetailMetric label="Impacts RV Grade">
                {row.impacts == null ? (
                  <Typography sx={{ fontWeight: 700 }}>-</Typography>
                ) : (
                  <DetailChip
                    label={row.impacts ? 'Yes' : 'No'}
                    tone={row.impacts ? colors.semantic.success : colors.semantic.neutral}
                  />
                )}
              </DetailMetric>
            </Box>

            <DetailSection title="Summary">
              <Typography sx={{ fontSize: 15, lineHeight: 1.65, color: row.details === '-' ? 'text.secondary' : 'text.primary' }}>
                {detailText}
              </Typography>
            </DetailSection>

            <DetailSection title="Evidence">
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
                  gap: 1.25,
                }}
              >
                <DetailMetric label="First Seen">
                  <Typography sx={{ fontWeight: 700 }}>{row.firstSeen}</Typography>
                </DetailMetric>
                <DetailMetric label="Last Seen">
                  <Typography sx={{ fontWeight: 700 }}>{row.lastSeen}</Typography>
                </DetailMetric>
                <DetailMetric label="Rolled Up ID">
                  <Typography sx={{ fontWeight: 700 }} noWrap title={row.rowId}>
                    {row.rowId}
                  </Typography>
                </DetailMetric>
                <DetailMetric label="Impact End Date">
                  <Typography sx={{ fontWeight: 700 }}>{row.impactEndDate}</Typography>
                </DetailMetric>
                <DetailMetric label="Remaining Lifetime">
                  <Typography sx={{ fontWeight: 700 }}>{row.remainingLifetime}</Typography>
                </DetailMetric>
                <DetailMetric label="No Impact End Date">
                  <Typography sx={{ fontWeight: 700 }}>{row.noImpactEndDate}</Typography>
                </DetailMetric>
                <DetailMetric label="Domain">
                  <Typography sx={{ fontWeight: 700 }} noWrap title={row.domain}>
                    {row.domain}
                  </Typography>
                </DetailMetric>
                <DetailMetric label="Source">
                  <Typography sx={{ fontWeight: 700 }}>{row.source}</Typography>
                </DetailMetric>
                <DetailMetric label="Asset Importance">
                  <Typography sx={{ fontWeight: 700 }}>{row.assetImportance}</Typography>
                </DetailMetric>
                <DetailMetric label="Confidence">
                  <Typography sx={{ fontWeight: 700 }}>{row.confidence}%</Typography>
                </DetailMetric>
                <DetailMetric label="Tags">
                  <Typography sx={{ fontWeight: 700 }} noWrap title={row.tags}>
                    {row.tags}
                  </Typography>
                </DetailMetric>
                <DetailMetric label="Web App Test">
                  <Typography sx={{ fontWeight: 700 }} noWrap title={row.webAppTest}>
                    {row.webAppTest}
                  </Typography>
                </DetailMetric>
                <DetailMetric label="Country">
                  <Typography sx={{ fontWeight: 700 }}>{row.country}</Typography>
                </DetailMetric>
                <DetailMetric label="State Versions">
                  <Typography sx={{ fontWeight: 700 }}>{row.stateVersionCount ?? '-'}</Typography>
                </DetailMetric>
              </Box>
            </DetailSection>
          </Box>
        </Box>
      )}
    </Drawer>
  )
}

function DetailSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <Box
      sx={{
        mt: 1.5,
        border: (theme) => `1px solid ${alpha(theme.palette.text.primary, 0.1)}`,
        borderRadius: 1,
        bgcolor: (theme) => alpha(theme.palette.background.default, theme.palette.mode === 'dark' ? 0.36 : 0.72),
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          px: 2,
          py: 1.25,
          borderBottom: (theme) => `1px solid ${alpha(theme.palette.text.primary, 0.08)}`,
        }}
      >
        <Typography sx={{ fontSize: 15, fontWeight: 800 }}>{title}</Typography>
      </Box>
      <Box sx={{ p: 2 }}>{children}</Box>
    </Box>
  )
}

function DetailMetric({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <Box sx={{ minWidth: 0, px: 1.5, py: 1.25, borderRadius: 1, bgcolor: 'background.paper' }}>
      <Typography color="text.secondary" sx={{ mb: 0.5, fontSize: 12.5, fontWeight: 800, textTransform: 'uppercase' }}>
        {label}
      </Typography>
      <Box sx={{ minWidth: 0 }}>{children}</Box>
    </Box>
  )
}

function DetailChip({ label, tone }: { label: string; tone: string }) {
  return (
    <Chip
      size="small"
      label={label}
      sx={{
        height: 24,
        borderRadius: 0.75,
        fontWeight: 800,
        bgcolor: alpha(tone, 0.13),
        color: tone,
        '& .MuiChip-label': { px: 0.8 },
      }}
    />
  )
}

function FindingsTable({
  rows,
  columns,
  border,
  headerBg,
  selectedIds,
  allPageSelected,
  somePageSelected,
  onTogglePage,
  onToggleRow,
  selectedFindingId,
  onOpenRow,
}: {
  rows: FindingRow[]
  columns: FindingColumnDef[]
  border: string
  headerBg: string
  selectedIds: Set<string>
  allPageSelected: boolean
  somePageSelected: boolean
  onTogglePage: () => void
  onToggleRow: (id: string) => void
  selectedFindingId?: string
  onOpenRow: (row: FindingRow) => void
}) {
  const gridColumns = findingGridColumns(columns)

  return (
    <Box sx={{ width: 'max-content', minWidth: '100%', isolation: 'isolate' }}>
      <GridHeader
        border={border}
        headerBg={headerBg}
        columns={gridColumns}
      >
        <ManagerCheckbox
          checked={allPageSelected}
          indeterminate={somePageSelected}
          onChange={onTogglePage}
          onClick={(event) => event.stopPropagation()}
          inputProps={{ 'aria-label': 'Select visible findings' }}
        />
        {columns.map((column) => (
          <HeaderCell key={column.id} active={column.id === 'lastSeen'}>
            {column.label}
          </HeaderCell>
        ))}
      </GridHeader>

      {rows.length === 0 ? (
        <EmptyRows text="No findings match this view." />
      ) : (
        rows.map((row) => (
          <GridRow
            key={row.id}
            border={border}
            columns={gridColumns}
            selected={selectedFindingId === row.id}
            interactive
            onClick={() => onOpenRow(row)}
          >
            <ManagerCheckbox
              checked={selectedIds.has(row.id)}
              onChange={() => onToggleRow(row.id)}
              onClick={(event) => event.stopPropagation()}
              inputProps={{ 'aria-label': `Select ${row.identifier}` }}
            />
            {columns.map((column) => (
              <Box key={column.id} sx={{ minWidth: 0 }}>
                {column.render(row)}
              </Box>
            ))}
          </GridRow>
        ))
      )}
    </Box>
  )
}

function DomainsTable({
  rows,
  border,
  headerBg,
  selectedIds,
  allPageSelected,
  somePageSelected,
  onTogglePage,
  onToggleRow,
}: {
  rows: DomainRow[]
  border: string
  headerBg: string
  selectedIds: Set<string>
  allPageSelected: boolean
  somePageSelected: boolean
  onTogglePage: () => void
  onToggleRow: (id: string) => void
}) {
  const columns = {
    xs: '42px minmax(240px, 1.3fr) 96px 104px 118px',
    md: '44px minmax(260px, 1.35fr) 128px 100px 104px 118px 128px',
    xl: '44px minmax(280px, 1.35fr) 132px 104px 104px 118px minmax(220px, 0.9fr) 132px 112px',
  }

  return (
    <Box sx={{ width: 'max-content', minWidth: '100%', isolation: 'isolate' }}>
      <GridHeader
        border={border}
        headerBg={headerBg}
        columns={columns}
      >
        <ManagerCheckbox
          checked={allPageSelected}
          indeterminate={somePageSelected}
          onChange={onTogglePage}
          onClick={(event) => event.stopPropagation()}
          inputProps={{ 'aria-label': 'Select visible domains' }}
        />
        <HeaderCell>Domain</HeaderCell>
        <HeaderCell display={FLEX_HIDE_UNTIL_MD}>Type</HeaderCell>
        <HeaderCell>Grade</HeaderCell>
        <HeaderCell>Findings</HeaderCell>
        <HeaderCell>Confidence</HeaderCell>
        <HeaderCell display={FLEX_HIDE_UNTIL_XL}>Sources</HeaderCell>
        <HeaderCell display={FLEX_HIDE_UNTIL_MD}>Last Scan</HeaderCell>
        <HeaderCell display={FLEX_HIDE_UNTIL_XL}>Tier</HeaderCell>
      </GridHeader>

      {rows.length === 0 ? (
        <EmptyRows text="No domains match this view." />
      ) : (
        rows.slice(0, 100).map((row) => (
          <GridRow
            key={row.id}
            border={border}
            columns={columns}
          >
            <ManagerCheckbox
              checked={selectedIds.has(row.id)}
              onChange={() => onToggleRow(row.id)}
              onClick={(event) => event.stopPropagation()}
              inputProps={{ 'aria-label': `Select ${row.domain}` }}
            />
            <Cell strong>{row.domain}</Cell>
            <Cell display={FLEX_HIDE_UNTIL_MD}>{row.type}</Cell>
            <GradeCell grade={row.grade} />
            <Cell>{row.findings}</Cell>
            <Cell>{row.confidence}%</Cell>
            <Cell display={FLEX_HIDE_UNTIL_XL}>{row.sources}</Cell>
            <Cell display={FLEX_HIDE_UNTIL_MD}>{row.lastScanned}</Cell>
            <Cell display={FLEX_HIDE_UNTIL_XL}>{row.tier}</Cell>
          </GridRow>
        ))
      )}
    </Box>
  )
}

function FilterSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <Box
      sx={{
        py: 1.25,
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: '138px minmax(0, 1fr)' },
        alignItems: 'center',
        gap: { xs: 0.75, sm: 1.5 },
        borderBottom: (theme) => `1px solid ${alpha(theme.palette.text.primary, 0.08)}`,
      }}
    >
      <Typography sx={{ fontSize: 14, fontWeight: 850, color: 'text.primary' }}>
        {title}
      </Typography>
      <Box sx={{ minWidth: 0 }}>{children}</Box>
    </Box>
  )
}

function FilterTextField({
  value,
  onChange,
  placeholder,
  type,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  type?: string
}) {
  return (
    <TextField
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      type={type}
      size="small"
      fullWidth
      sx={{
        '& .MuiOutlinedInput-root': {
          height: 36,
          borderRadius: 1,
          bgcolor: (theme) => alpha(theme.palette.background.default, theme.palette.mode === 'dark' ? 0.32 : 0.58),
          '& fieldset': {
            borderColor: alpha(MANAGER_ACCENT, 0.28),
          },
          '&:hover fieldset': {
            borderColor: alpha(MANAGER_ACCENT, 0.52),
          },
          '&.Mui-focused fieldset': {
            borderColor: MANAGER_ACCENT,
            boxShadow: `0 0 0 3px ${alpha(MANAGER_ACCENT, 0.12)}`,
          },
        },
        '& input': {
          py: 0,
          fontSize: 13,
          fontWeight: 650,
        },
      }}
    />
  )
}

function DatePair({
  from,
  to,
  onFrom,
  onTo,
}: {
  from: string
  to: string
  onFrom: (value: string) => void
  onTo: (value: string) => void
}) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 0.75 }}>
      <FilterTextField value={from} onChange={onFrom} placeholder="From" type="date" />
      <FilterTextField value={to} onChange={onTo} placeholder="To" type="date" />
    </Box>
  )
}

function CompactSelect({
  value,
  options,
  onChange,
  disabled,
}: {
  value: string
  options: Array<[string, string]>
  onChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <Select
      size="small"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      sx={{
        height: 36,
        minWidth: 136,
        borderRadius: 1,
        fontSize: 13,
        fontWeight: 800,
        color: disabled ? 'text.disabled' : 'text.primary',
        bgcolor: 'background.paper',
        '& .MuiOutlinedInput-notchedOutline': {
          borderColor: alpha(MANAGER_ACCENT, disabled ? 0.18 : 0.35),
        },
        '&:hover .MuiOutlinedInput-notchedOutline': {
          borderColor: alpha(MANAGER_ACCENT, 0.6),
        },
        '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
          borderColor: MANAGER_ACCENT,
          boxShadow: `0 0 0 3px ${alpha(MANAGER_ACCENT, 0.12)}`,
        },
        '& .MuiSelect-select': {
          py: 0.75,
          pr: 4,
        },
      }}
    >
      {options.map(([optionValue, label]) => (
        <MenuItem key={optionValue} value={optionValue}>
          {label}
        </MenuItem>
      ))}
    </Select>
  )
}

function ManagerCheckbox({ sx: _sx, ...props }: React.ComponentProps<typeof Checkbox>) {
  const baseSx = {
    p: 0.65,
    color: alpha(MANAGER_ACCENT, 0.72),
    '& .MuiSvgIcon-root': {
      fontSize: 22,
    },
    '&.Mui-checked, &.MuiCheckbox-indeterminate': {
      color: MANAGER_ACCENT,
    },
    '&.Mui-disabled': {
      color: alpha(MANAGER_ACCENT, 0.32),
    },
  }

  return (
    <Checkbox
      {...props}
      size="medium"
      sx={baseSx}
    />
  )
}

function GridHeader({
  children,
  columns,
  border,
  headerBg,
}: {
  children: React.ReactNode
  columns: ResponsiveCssValue
  border: string
  headerBg: string
}) {
  return (
    <Box
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 12,
        display: 'grid',
        gridTemplateColumns: columns,
        width: 'max-content',
        minWidth: '100%',
        boxSizing: 'border-box',
        alignItems: 'center',
        minHeight: 54,
        borderBottom: `1px solid ${border}`,
        backgroundColor: headerBg,
        background: `linear-gradient(0deg, ${alpha(MANAGER_ACCENT, 0.07)}, ${alpha(MANAGER_ACCENT, 0.07)}), ${headerBg}`,
        backgroundClip: 'padding-box',
        isolation: 'isolate',
        transform: 'translateZ(0)',
        boxShadow: `0 1px 0 ${border}, 0 10px 20px ${alpha(MANAGER_ACCENT, 0.08)}`,
        '& > *': {
          position: 'relative',
          zIndex: 1,
        },
      }}
    >
      {children}
    </Box>
  )
}

function GridRow({
  children,
  columns,
  border,
  selected,
  interactive,
  onClick,
}: {
  children: React.ReactNode
  columns: ResponsiveCssValue
  border: string
  selected?: boolean
  interactive?: boolean
  onClick?: () => void
}) {
  return (
    <Box
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(event) => {
        if (!interactive || !onClick) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onClick()
        }
      }}
      sx={{
        display: 'grid',
        gridTemplateColumns: columns,
        alignItems: 'center',
        width: 'max-content',
        minWidth: '100%',
        boxSizing: 'border-box',
        minHeight: 58,
        borderBottom: `1px solid ${border}`,
        bgcolor: selected ? alpha(MANAGER_ACCENT, 0.095) : 'background.paper',
        cursor: interactive ? 'pointer' : 'default',
        textAlign: 'left',
        outline: 0,
        '&:hover': {
          bgcolor: selected ? alpha(MANAGER_ACCENT, 0.13) : alpha(MANAGER_ACCENT, 0.055),
        },
        '&:focus-visible': {
          boxShadow: `inset 0 0 0 2px ${alpha(MANAGER_ACCENT, 0.48)}`,
        },
      }}
    >
      {children}
    </Box>
  )
}

function HeaderCell({
  children,
  active,
  display,
}: {
  children: React.ReactNode
  active?: boolean
  display?: ResponsiveCssValue
}) {
  return (
    <Typography
      sx={{
        px: 1.5,
        minWidth: 0,
        fontSize: 14,
        fontWeight: 800,
        color: active ? MANAGER_ACCENT : 'text.primary',
        display: display ?? 'flex',
        alignItems: 'center',
        gap: 0.5,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
      {active && <ChevronDown size={15} />}
    </Typography>
  )
}

function Cell({
  children,
  strong,
  display,
}: {
  children: React.ReactNode
  strong?: boolean
  display?: ResponsiveCssValue
}) {
  return (
    <Typography
      sx={{
        px: 1.5,
        minWidth: 0,
        fontSize: 14,
        fontWeight: strong ? 700 : 500,
        color: 'text.primary',
        display: display ?? 'block',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
      title={typeof children === 'string' ? children : undefined}
    >
      {children}
    </Typography>
  )
}

function GradeCell({ grade }: { grade: string }) {
  const tone = gradeTone(grade)
  const label = gradeLabel(grade)
  return (
    <Box sx={{ px: { xs: 0.75, md: 1.5 }, minWidth: 0 }}>
      <Chip
        size="small"
        label={label}
        sx={{
          maxWidth: '100%',
          height: 24,
          borderRadius: 0.75,
          fontWeight: 800,
          bgcolor: alpha(tone, 0.12),
          color: label === '-' ? 'text.secondary' : tone,
          '& .MuiChip-label': {
            px: 0.75,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          },
        }}
      />
    </Box>
  )
}

function SeverityChip({ severity }: { severity: Severity }) {
  const tone = severityColor(severity)
  return (
    <Box sx={{ px: { xs: 0.75, md: 1.5 }, minWidth: 0 }}>
      <Chip
        size="small"
        label={severityLabel(severity)}
        sx={{
          maxWidth: '100%',
          height: 24,
          borderRadius: 0.75,
          fontSize: 12.5,
          fontWeight: 800,
          bgcolor: alpha(tone, 0.12),
          color: tone,
          '& .MuiChip-label': {
            px: 0.75,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          },
        }}
      />
    </Box>
  )
}

function lifecycleTone(row: FindingRow): string {
  const state = `${row.lifecycleState} ${row.lifecycle}`.toLowerCase()
  if (state.includes('good') || state.includes('fixed')) return colors.semantic.success
  if (state.includes('historical') || state.includes('resolved')) return colors.semantic.neutral
  if (state.includes('pending')) return colors.semantic.warning
  if (state.includes('reopened') || state.includes('bad') || state.includes('issue')) return colors.semantic.danger
  return MANAGER_ACCENT
}

function LifecycleChip({ row }: { row: FindingRow }) {
  const tone = lifecycleTone(row)
  return (
    <Box sx={{ px: { xs: 0.75, md: 1.5 }, minWidth: 0 }}>
      <Chip
        size="small"
        label={row.lifecycle}
        sx={{
          maxWidth: '100%',
          height: 24,
          borderRadius: 0.75,
          fontSize: 12.5,
          fontWeight: 800,
          bgcolor: alpha(tone, 0.12),
          color: tone,
          '& .MuiChip-label': {
            px: 0.75,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          },
        }}
      />
    </Box>
  )
}

function ActionButton({
  label,
  primary,
  endIcon,
  disabled,
  onClick,
}: {
  label: string
  primary?: boolean
  endIcon?: React.ReactNode
  disabled?: boolean
  onClick?: () => void
}) {
  return (
    <Box
      component="button"
      type="button"
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      sx={{
        height: 42,
        px: 1.5,
        borderRadius: 1,
        border: `1px solid ${primary ? MANAGER_ACCENT : alpha(MANAGER_ACCENT, 0.4)}`,
        bgcolor: primary ? MANAGER_ACCENT : 'background.paper',
        background: primary ? `linear-gradient(135deg, ${MANAGER_ACCENT}, ${MANAGER_ACCENT_LIGHT})` : undefined,
        color: primary ? '#fff' : MANAGER_ACCENT,
        font: 'inherit',
        fontWeight: 800,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        whiteSpace: 'nowrap',
        boxShadow: primary ? `0 10px 24px ${alpha(MANAGER_ACCENT, 0.22)}` : 'none',
        '&:hover': disabled
          ? undefined
          : {
              borderColor: MANAGER_ACCENT,
              boxShadow: `0 0 0 3px ${alpha(MANAGER_ACCENT, 0.12)}`,
            },
      }}
    >
      {label}
      {endIcon}
    </Box>
  )
}

function ToolbarIconButton({
  label,
  icon,
  primary,
  disabled,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  primary?: boolean
  disabled?: boolean
  onClick?: () => void
}) {
  return (
    <Tooltip title={label} arrow>
      <Box
        component="button"
        type="button"
        aria-label={label}
        disabled={disabled}
        onClick={disabled ? undefined : onClick}
        sx={{
          width: 36,
          height: 36,
          borderRadius: 1,
          border: `1px solid ${primary ? MANAGER_ACCENT : alpha(MANAGER_ACCENT, 0.38)}`,
          bgcolor: primary ? MANAGER_ACCENT : alpha(MANAGER_ACCENT, 0.045),
          background: primary ? `linear-gradient(135deg, ${MANAGER_ACCENT}, ${MANAGER_ACCENT_LIGHT})` : undefined,
          color: primary ? '#fff' : MANAGER_ACCENT,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: '0 0 auto',
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.45 : 1,
          transition: 'border-color 140ms ease, background-color 140ms ease, box-shadow 140ms ease',
          '&:hover': disabled
            ? undefined
            : {
                bgcolor: primary ? MANAGER_ACCENT : alpha(MANAGER_ACCENT, 0.1),
                borderColor: MANAGER_ACCENT,
                boxShadow: primary
                  ? `0 8px 20px ${alpha(MANAGER_ACCENT, 0.22)}`
                  : `0 0 0 3px ${alpha(MANAGER_ACCENT, 0.12)}`,
              },
        }}
      >
        {icon}
      </Box>
    </Tooltip>
  )
}

function EmptyRows({ text }: { text: string }) {
  return (
    <Box sx={{ height: 260, display: 'grid', placeItems: 'center', color: 'text.secondary' }}>
      <Box sx={{ textAlign: 'center' }}>
        <SlidersHorizontal size={22} />
        <Typography sx={{ mt: 1 }}>{text}</Typography>
      </Box>
    </Box>
  )
}
