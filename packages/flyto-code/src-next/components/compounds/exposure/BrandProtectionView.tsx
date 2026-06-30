import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  Divider,
  IconButton,
  LinearProgress,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  GitBranch,
  ImageOff,
  Link2,
  Network,
  Search,
  Shield,
  ShieldCheck,
  X,
} from 'lucide-react'

import { FlytoPageHeader } from '@atoms/FlytoPageHeader'
import { InlineErrorNotice } from '@atoms/InlineErrorNotice'
import { LoadingState } from '@atoms/LoadingState'
import { QueryError } from '@atoms/QueryError'
import { useOrg } from '@hooks/useOrg'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import {
  downloadEvidenceBundle,
  getAttackSurfaceScreenshotBlobUrl,
  getBrandProtection,
  parseProviderChain,
  setTakedownState,
  submitBrandProtectionFeedback,
  type AttackSurfaceAsset,
  type BrandProtectionCase,
  type BrandProtectionCampaignContext,
  type BrandProtectionEvidenceAxis,
  type BrandProtectionFeedbackLabel,
  type BrandProtectionFootprintContext,
  type BrandProtectionQuality,
  type ProviderChain,
  type ProviderChainRow,
  type TakedownState,
} from '@lib/engine/code/pentest'
import {
  getCandidatePaths,
  getSurfaceEvidence,
  type CandidatePath,
  type ResourceEvidence,
} from '@lib/engine/code/footprintSurface'
import { Loading, Empty } from '../scanning/_shared'
import { TakedownLetterDialog } from './TakedownLetterDialog'

type Ownership = 'third_party' | 'self_owned' | 'unknown'
type StageView = 'cases' | 'candidates' | 'owned' | 'all'

interface ImpersonationMeta {
  type?: string
  original_domain?: string
  lookalike_domain?: string
  source?: string
  brand_term?: string
  url_host?: string
  targeted_brand?: string
  risk?: string
  confidence?: number
  screenshot_id?: string
  page_title?: string
  final_url?: string
  screenshot_error?: string
  html_id?: string
  resolves_to?: string
  detected_at?: string
  registrar?: string
  registered_at?: string
  expires_at?: string
  nameservers?: string
  provider_chain?: string
  domain_similarity_score?: number
  domain_similarity_class?: string
  similarity_signals?: string[]
  monitoring_tier?: string
  active_evidence_status?: string
  last_evidence_scan_at?: string
  transition_state?: string
  evidence_fingerprint?: string
  last_transition_at?: string
  last_notified_at?: string
  ownership?: Ownership
  registrant_org?: string
  rdap_status?: string
  rdap_registrar?: string
  rdap_registered_at?: string
  rdap_expires_at?: string
  rdap_registrant_org?: string
  rdap_registrant_email_domain?: string
  rdap_target_registrant_org?: string
  rdap_target_registrant_email_domain?: string
  ocr_status?: string
  ocr_provider?: string
  ocr_brand_match?: string
  ocr_brand_confidence?: number
  github_url?: string
  github_login?: string
  github_full_name?: string
  github_company?: string
  github_website?: string
}

interface BrandItem {
  item: BrandProtectionCase
  asset: AttackSurfaceAsset
  meta: ImpersonationMeta
  owner: Ownership
}

const STAGE_META: Record<string, { label: string; tone: 'danger' | 'warning' | 'success' | 'neutral'; helper: string }> = {
  action_ready: { label: t('hardcoded.action.ready.tone.danger.helper.relationship.and.abuse.d8d95b05'), tone: 'danger', helper: t('hardcoded.relationship.and.abuse.intent.are.both.supported.2c6f2410') },
  needs_evidence: { label: t('hardcoded.needs.evidence.tone.warning.helper.similarity.or.weak.f86c1f8b'), tone: 'warning', helper: t('hardcoded.similarity.or.weak.signals.exist.but.proof.is.incomplete.b59b2efd') },
  investigate: { label: t('hardcoded.investigate.tone.warning.helper.evidence.is.mixed.and.75dfb2df'), tone: 'warning', helper: t('hardcoded.evidence.is.mixed.and.needs.review.6af43f40') },
  watch: { label: t('hardcoded.watch.tone.neutral.helper.tracked.without.abuse.proof.02b2eb60'), tone: 'neutral', helper: t('hardcoded.tracked.without.abuse.proof.d28d91fd') },
  closed: { label: t('hardcoded.closed.tone.success.helper.owned.defensive.or.suppressed.ecd4de8a'), tone: 'success', helper: t('hardcoded.owned.defensive.or.suppressed.after.review.53a89a5d') },
}

const AXIS_TONE: Record<string, { color: string; bg: string }> = {
  supported: { color: '#16a34a', bg: 'rgba(22, 163, 74, 0.12)' },
  partial: { color: '#d97706', bg: 'rgba(217, 119, 6, 0.12)' },
  missing: { color: '#64748b', bg: 'rgba(100, 116, 139, 0.12)' },
  unknown: { color: '#64748b', bg: 'rgba(100, 116, 139, 0.12)' },
  refuted: { color: '#16a34a', bg: 'rgba(22, 163, 74, 0.12)' },
}

const STAGE_TONE: Record<string, { color: string; bg: string; border: string }> = {
  danger: { color: '#dc2626', bg: 'rgba(220, 38, 38, 0.10)', border: 'rgba(220, 38, 38, 0.28)' },
  warning: { color: '#b45309', bg: 'rgba(180, 83, 9, 0.10)', border: 'rgba(180, 83, 9, 0.28)' },
  success: { color: '#15803d', bg: 'rgba(21, 128, 61, 0.10)', border: 'rgba(21, 128, 61, 0.28)' },
  neutral: { color: '#475569', bg: 'rgba(71, 85, 105, 0.10)', border: 'rgba(71, 85, 105, 0.22)' },
}

function parseMeta(asset?: AttackSurfaceAsset | null): ImpersonationMeta {
  if (!asset) return {}
  try {
    const parsed = typeof asset.metadata === 'string' ? JSON.parse(asset.metadata || '{}') : asset.metadata
    return (parsed ?? {}) as ImpersonationMeta
  } catch {
    return {}
  }
}

function ownershipOf(meta: ImpersonationMeta, item?: BrandProtectionCase): Ownership {
  const owner = item?.ownership || meta.ownership
  if (owner === 'self_owned' || owner === 'third_party') return owner
  return 'unknown'
}

function legacyCaseFromAsset(asset: AttackSurfaceAsset): BrandProtectionCase | null {
  const meta = parseMeta(asset)
  const owner = ownershipOf(meta)
  return {
    id: `legacy-${asset.id}`,
    asset_id: asset.id,
    asset_type: asset.asset_type,
    source: meta.source || 'lookalike',
    value: asset.value,
    display_value: meta.lookalike_domain || meta.url_host || asset.value,
    target: meta.original_domain || meta.brand_term || meta.targeted_brand,
    stage: owner === 'self_owned' ? 'owned' : 'candidate',
    workflow_stage: owner === 'self_owned' ? 'closed' : 'needs_evidence',
    verdict: owner === 'self_owned' ? 'defensive_registration' : 'similar_domain_only',
    confidence: owner === 'self_owned' ? 45 : 50,
    risk: owner === 'self_owned' ? 'low' : 'medium',
    relationship: owner === 'self_owned' ? 'owned' : 'similar',
    relationship_score: owner === 'self_owned' ? 100 : 25,
    intent: 'none',
    intent_score: 0,
    ownership: owner,
    evidence: [],
    asset,
  }
}

function displayValue(item: BrandProtectionCase, meta: ImpersonationMeta): string {
  return item.display_value || meta.lookalike_domain || meta.url_host || item.asset?.value || item.value
}

function targetValue(item: BrandProtectionCase, meta: ImpersonationMeta): string {
  return item.target || meta.original_domain || meta.brand_term || meta.targeted_brand || ''
}

function sourceLabel(source?: string, assetType?: string): string {
  switch (source || assetType || 'lookalike') {
    case 'phishtank': return 'PhishTank'
    case 'openphish': return 'OpenPhish'
    case 'crt.sh':
    case 'ct_log': return t('hardcoded.ct.log.c936e1a6')
    case 'virustotal': return 'VirusTotal'
    case 'urlscan': return 'urlscan'
    case 'brand_vision': return t('hardcoded.brand.vision.b1a4674f')
    case 'high_similarity_watch':
    case 'candidate_loop': return t('hardcoded.high.sim.watch.a8f12247')
    case 'defensive': return 'Defensive'
    case 'rdap': return 'RDAP'
    case 'github_public_search':
    case 'github_brand_candidate': return 'GitHub'
    case 'phishing_feed': return t('hardcoded.phishing.feed.b54d49ec')
    case 'lookalike': return 'Lookalike'
    default: return source || assetType || 'Unknown'
  }
}

function verdictLabel(verdict: string): string {
  switch (verdict) {
    case 'brand_abuse_evidence_chain': return t('hardcoded.evidence.backed.abuse.93ccfac1')
    case 'brand_visual_impersonation': return t('hardcoded.logo.login.copy.bfd08484')
    case 'visual_brand_candidate': return t('hardcoded.visual.candidate.937b995b')
    case 'external_malicious': return t('hardcoded.external.malicious.97832e1a')
    case 'malicious_domain_relationship_unproven': return t('hardcoded.malicious.relation.unproven.7c686b90')
    case 'claimed_phishing_relationship_unproven': return t('hardcoded.claimed.phishing.relation.unproven.70396c14')
    case 'similar_domain_only': return t('hardcoded.similar.domain.only.74e42cfd')
    case 'community_verified_phishing': return t('hardcoded.verified.phishing.feed.4843cd3a')
    case 'community_claimed_phishing': return t('hardcoded.claimed.phishing.feed.f9b9dbc9')
    case 'confirmed_campaign_match': return t('hardcoded.analyst.confirmed.900e164b')
    case 'campaign_inferred_phishing': return t('hardcoded.campaign.inferred.4bdbd1d6')
    case 'suppressed_false_positive': return t('assetMap.falsePositive')
    case 'high_confidence_ct_candidate': return t('hardcoded.high.confidence.ct.5fecd13a')
    case 'ct_log_candidate': return t('hardcoded.ct.candidate.9eb14af5')
    case 'github_brand_candidate': return t('hardcoded.github.candidate.0aea1ac8')
    case 'defensive_registration': return t('hardcoded.defensive.registration.592fe4be')
    case 'resolving_lookalike': return t('hardcoded.resolving.lookalike.9ef2a65e')
    default: return t('autofix.statusNeedsReview')
  }
}

function workflowStage(item: BrandProtectionCase): string {
  if (item.workflow_stage) return item.workflow_stage
  if (item.stage === 'owned') return 'closed'
  if (item.stage === 'case') return 'action_ready'
  if ((item.relationship_score ?? 0) > 0 || (item.intent_score ?? 0) > 0) return 'needs_evidence'
  return 'watch'
}

function axisLabel(status: string): string {
  switch (status) {
    case 'supported': return 'Supported'
    case 'partial': return 'Partial'
    case 'missing': return 'Missing'
    case 'refuted': return 'Refuted'
    case 'unknown': return 'Unknown'
    default: return status || 'Unknown'
  }
}

function scoreLabel(score?: number): string {
  return typeof score === 'number' ? `${score}%` : '0%'
}

function monitoringLabel(tier?: string): string {
  switch (tier) {
    case 'high_similarity_4h': return t('hardcoded.high.sim.watch.a8f12247')
    case 'high_similarity_watch': return t('hardcoded.high.sim.watch.a8f12247')
    case 'similarity_watch': return t('hardcoded.similarity.watch.685e7210')
    case 'active_evidence': return t('hardcoded.active.evidence.1fda8a4a')
    case 'defensive': return t('hardcoded.defensive.inventory.60b5549e')
    case 'low_similarity_context': return t('hardcoded.context.only.995c79a2')
    default: return tier || ''
  }
}

function workflowLabel(stage: string): string {
  switch (stage) {
    case 'action_ready': return t('hardcoded.action.ready.f94562fa')
    case 'needs_evidence': return t('hardcoded.needs.evidence.322a2648')
    case 'closed': return 'Closed'
    case 'investigate': return 'Investigate'
    case 'watch': return 'Watch'
    default: return stage || 'Review'
  }
}

function campaignStatusLabel(status?: string): string {
  switch (status) {
    case 'confirmed': return t('hardcoded.confirmed.campaign.fb3d8665')
    case 'campaign_inferred': return t('hardcoded.inferred.campaign.aeb344d3')
    case 'candidate': return t('hardcoded.campaign.candidate.b62054e2')
    case 'suppressed': return 'Suppressed'
    case 'defensive': return 'Defensive'
    default: return status || 'No campaign'
  }
}

function campaignTone(status?: string): keyof typeof STAGE_TONE {
  switch (status) {
    case 'confirmed': return 'danger'
    case 'campaign_inferred':
    case 'candidate': return 'warning'
    case 'suppressed':
    case 'defensive': return 'success'
    default: return 'neutral'
  }
}

function decisionTone(mode?: string): keyof typeof STAGE_TONE {
  switch (mode) {
    case 'machine_case':
    case 'analyst_confirmed':
      return 'danger'
    case 'machine_recommendation':
    case 'human_review':
      return 'warning'
    case 'human_closed':
      return 'success'
    default:
      return 'neutral'
  }
}

function freshnessTone(status?: string): keyof typeof STAGE_TONE {
  switch (status) {
    case 'fresh':
      return 'success'
    case 'due':
      return 'warning'
    case 'stale':
      return 'danger'
    default:
      return 'neutral'
  }
}

function learningTone(state?: string): keyof typeof STAGE_TONE {
  switch (state) {
    case 'confirmed_pattern':
      return 'danger'
    case 'known_pattern':
      return 'warning'
    case 'suppressed_pattern':
      return 'success'
    default:
      return 'neutral'
  }
}

function qualityTone(score?: number): keyof typeof STAGE_TONE {
  if ((score ?? 0) >= 85) return 'success'
  if ((score ?? 0) >= 70) return 'warning'
  return 'danger'
}

function freshnessLabel(status?: string): string {
  switch (status) {
    case 'fresh': return t('hardcoded.fresh.evidence.58076a0c')
    case 'due': return t('hardcoded.refresh.due.e4f1ef5c')
    case 'stale': return t('hardcoded.stale.evidence.072689be')
    case 'unknown': return t('hardcoded.unknown.freshness.3f69d965')
    default: return status || 'Unknown freshness'
  }
}

function learningLabel(state?: string): string {
  switch (state) {
    case 'confirmed_pattern': return t('hardcoded.confirmed.pattern.a3004271')
    case 'known_pattern': return t('hardcoded.known.pattern.fe5d70c3')
    case 'suppressed_pattern': return t('hardcoded.suppressed.pattern.b9c30ad3')
    case 'new': return t('hardcoded.new.pattern.19494c06')
    default: return state || 'New pattern'
  }
}

function campaignFamilyLabel(context?: BrandProtectionCampaignContext | null): string {
  const key = context?.family_key ?? ''
  if (key.startsWith('public_invoice|')) return t('hardcoded.public.invoice.lure.580e2823')
  if (key.startsWith('logistics_lure|')) return t('hardcoded.logistics.lure.92ae633e')
  if (key.startsWith('payment_lure|')) return t('hardcoded.payment.lure.bcbf3732')
  if (key.startsWith('brand:')) return t('hardcoded.brand.lure.db150de8')
	  return key ? t('hardcoded.learned.campaign.no.learned.campaign.1fa51216') : t('hardcoded.no.learned.campaign.4ea55ce9')
}

function fallbackAxes(item: BrandProtectionCase): BrandProtectionEvidenceAxis[] {
  const relationshipScore = item.relationship_score ?? 0
  const intentScore = item.intent_score ?? 0
  const owner = item.ownership
  const footprint = item.footprint_context
  const campaign = item.campaign_context
  return [
    {
      key: 'brand_relationship',
      label: t('hardcoded.brand.relationship.e437f5d6'),
      status: relationshipScore >= 60 ? 'supported' : relationshipScore > 0 ? 'partial' : 'missing',
      score: relationshipScore,
      top_reasons: (item.evidence ?? []).filter(e => (e.axis ?? 'relationship') === 'relationship').slice(0, 3).map(e => e.value ? `${e.label}: ${e.value}` : e.label),
      missing_evidence: relationshipScore >= 60 ? [] : ['logo, page, OCR, or public content tying this to the brand'],
    },
    {
      key: 'abuse_intent',
      label: t('hardcoded.abuse.intent.4f9c703b'),
      status: intentScore >= 60 ? 'supported' : intentScore > 0 ? 'partial' : 'missing',
      score: intentScore,
      top_reasons: (item.evidence ?? []).filter(e => e.axis === 'intent').slice(0, 3).map(e => e.value ? `${e.label}: ${e.value}` : e.label),
      missing_evidence: intentScore >= 60 ? [] : ['login, payment, credential, malicious reputation, or verified phishing evidence'],
    },
    {
      key: 'ownership',
      label: 'Ownership',
      status: owner === 'self_owned' ? 'refuted' : owner === 'third_party' ? 'supported' : 'unknown',
      score: owner === 'self_owned' ? 100 : owner === 'third_party' ? 70 : 20,
      top_reasons: owner === 'self_owned' ? ['Known defensive registration'] : owner === 'third_party' ? ['Third-party registration'] : [],
      missing_evidence: owner === 'unknown' ? ['RDAP registrant comparison'] : [],
    },
    {
      key: 'footprint_context',
      label: t('hardcoded.footprint.context.8b11aba2'),
      status: footprint?.surface_resource_id ? 'partial' : 'missing',
      score: footprint?.surface_resource_id ? 60 : 0,
      top_reasons: footprint?.surface_resource_id ? ['Linked to Footprint/surface resource'] : [],
      missing_evidence: footprint?.surface_resource_id ? [] : ['Footprint resource or entity link'],
    },
    {
      key: 'campaign_context',
      label: t('hardcoded.campaign.context.2c375628'),
      status: campaign?.status === 'confirmed' ? 'supported' : campaign?.family_key ? 'partial' : 'missing',
      score: campaign?.confidence ?? 0,
      top_reasons: campaign?.family_key ? [`${campaignFamilyLabel(campaign)} · ${campaign.related_count ?? 1} related`] : [],
      missing_evidence: campaign?.family_key ? [] : ['confirmed campaign seed or repeatable URL signature'],
    },
  ]
}

function axesOf(item: BrandProtectionCase): BrandProtectionEvidenceAxis[] {
  return item.evidence_axes?.length ? item.evidence_axes : fallbackAxes(item)
}

function missingEvidenceCount(item: BrandProtectionCase): number {
  return axesOf(item).reduce((sum, axis) => sum + (axis.missing_evidence?.length ?? 0), 0)
}

function formatDate(iso?: string): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

function externalHref(item: BrandProtectionCase, meta: ImpersonationMeta): string {
  const value = displayValue(item, meta)
  return meta.final_url || (item.value.startsWith('http') ? item.value : `https://${value}`)
}

function matchesPath(path: CandidatePath, selected: BrandItem): boolean {
  const value = displayValue(selected.item, selected.meta).toLowerCase()
  const target = targetValue(selected.item, selected.meta).toLowerCase()
  const chain = path.chain ?? []
  return path.value.toLowerCase() === value ||
    path.leafEntityId === selected.item.footprint_context?.footprint_entity_id ||
    chain.some(n => n.value.toLowerCase() === value || (target && n.value.toLowerCase() === target))
}

export function BrandProtectionView() {
  const { org } = useOrg()
  const orgId = org?.id

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.exposure.brandProtection(orgId),
    queryFn: () => getBrandProtection(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const [stageView, setStageView] = useState<StageView>('cases')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const allItems = useMemo<BrandItem[]>(() => {
    const serverItems = [
      ...(data?.cases ?? []),
      ...(data?.candidates ?? []),
      ...(data?.owned ?? []),
    ]
    const source = serverItems.length > 0
      ? serverItems
      : (data?.assets ?? []).map(legacyCaseFromAsset).filter((x): x is BrandProtectionCase => x !== null)
    return source
      .filter(item => !!item.asset)
      .map(item => {
        const meta = parseMeta(item.asset)
        return { item, asset: item.asset, meta, owner: ownershipOf(meta, item) }
      })
  }, [data])

  const summary = useMemo(() => {
    const cases = data?.stage_counts?.case ?? allItems.filter(x => x.item.stage === 'case').length
    const candidates = data?.stage_counts?.candidate ?? allItems.filter(x => x.item.stage === 'candidate').length
    const owned = data?.stage_counts?.owned ?? allItems.filter(x => x.item.stage === 'owned').length
    const needsEvidence = allItems.filter(x => workflowStage(x.item) === 'needs_evidence').length
    const footprintLinked = allItems.filter(x => !!x.item.footprint_context?.surface_resource_id || !!x.item.footprint_context?.footprint_entity_id).length
    const highSimilarityOnly = allItems.filter(x => x.item.verdict === 'similar_domain_only' || x.item.domain_similarity_class === 'high').length
    const campaignClusters = data?.campaigns?.length ?? new Set(allItems.map(x => x.item.campaign_context?.family_key).filter(Boolean)).size
    const campaignInferred = allItems.filter(x => x.item.campaign_context?.status === 'campaign_inferred').length
    const quality = data?.quality
    return {
      total: allItems.length,
      cases,
      candidates,
      owned,
      needsEvidence,
      footprintLinked,
      highSimilarityOnly,
      campaignClusters,
      campaignInferred,
      evidenceCoverage: quality?.evidence_coverage ?? (allItems.length ? Math.round((footprintLinked / allItems.length) * 100) : 0),
      freshnessCoverage: quality?.freshness_coverage ?? 0,
      footprintCoverage: quality?.footprint_coverage ?? (allItems.length ? Math.round((footprintLinked / allItems.length) * 100) : 0),
      learningCoverage: quality?.learning_coverage ?? 0,
      humanReview: quality?.human_review_count ?? needsEvidence,
      machineCases: quality?.machine_case_count ?? 0,
      stale: quality?.stale_count ?? allItems.filter(x => x.item.freshness?.status === 'stale').length,
    }
  }, [allItems, data])

  const items = useMemo(() => {
    if (stageView === 'all') return allItems
    const stage = stageView === 'cases' ? 'case' : stageView === 'candidates' ? 'candidate' : 'owned'
    return allItems.filter(x => x.item.stage === stage)
  }, [allItems, stageView])

  useEffect(() => {
    if (items.length === 0) {
      setSelectedId(null)
      return
    }
    if (!selectedId || !items.some(x => x.item.id === selectedId)) {
      setSelectedId(items[0].item.id)
    }
  }, [items, selectedId])

  const selected = useMemo(() => items.find(x => x.item.id === selectedId) ?? items[0] ?? null, [items, selectedId])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden', p: 2, gap: 2 }}>
      <FlytoPageHeader
        title={t('exposure.brand.title')}
        subtitle={t('exposure.brand.subtitle')}
        count={summary.cases > 0 ? <Chip label={summary.cases} size="small" color="error" sx={{ fontWeight: 700 }} /> : undefined}
      />

      {isLoading && <Loading />}
      {!isLoading && isError && <QueryError error={error} onRetry={refetch} />}
      {!isLoading && !isError && allItems.length === 0 && (
        <Empty
          icon={Shield}
          text={t('exposure.brand.noThreats')}
          description={t('exposure.brand.noThreatsDesc')}
        />
      )}

      {!isLoading && !isError && allItems.length > 0 && (
        <>
          <QualityBar summary={summary} quality={data?.quality} providerStatus={data?.provider_status} />
          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', lg: '360px minmax(0, 1fr)' },
              gap: 1.5,
              overflow: 'hidden',
            }}
          >
            <QueuePanel
              stageView={stageView}
              onStageView={setStageView}
              summary={summary}
              items={items}
              selectedId={selected?.item.id}
              onSelect={setSelectedId}
            />
            <EvidenceWorkbench orgId={orgId ?? ''} selected={selected} />
          </Box>
        </>
      )}
    </Box>
  )
}

function QualityBar({
  summary,
  quality,
  providerStatus,
}: {
  summary: {
    cases: number
    candidates: number
    owned: number
    needsEvidence: number
    footprintLinked: number
    highSimilarityOnly: number
    campaignClusters: number
    campaignInferred: number
    evidenceCoverage: number
    freshnessCoverage: number
    footprintCoverage: number
    learningCoverage: number
    humanReview: number
    machineCases: number
    stale: number
  }
  quality?: BrandProtectionQuality
  providerStatus?: Record<string, { configured: boolean; status: string; message?: string }>
}) {
  const score = quality?.score ?? summary.evidenceCoverage
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, minmax(0, 1fr))' },
        gap: 1,
      }}
    >
      <MetricCell label="Quality" value={`${score}${quality?.grade ? ` ${quality.grade}` : ''}`} tone={qualityTone(score)} />
      <MetricCell label={t('hardcoded.human.review.40176d93')} value={summary.humanReview} tone={summary.humanReview > 0 ? 'warning' : 'success'} />
      <MetricCell label={t('hardcoded.fresh.evidence.58076a0c')} value={`${summary.freshnessCoverage}%`} tone={summary.stale > 0 ? 'danger' : summary.freshnessCoverage >= 75 ? 'success' : 'warning'} />
      <MetricCell label="Learning" value={`${summary.learningCoverage}%`} tone={summary.learningCoverage > 0 ? 'warning' : 'neutral'} />
      <MetricCell label="Footprint" value={`${summary.footprintCoverage}%`} tone={summary.footprintCoverage >= 75 ? 'success' : 'neutral'} />
      <Box sx={{ gridColumn: { xs: '1 / -1', md: '1 / -1' }, display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
        <SmallPill icon={<Shield size={13} />} label={`${summary.cases} actionable`} tone={summary.cases > 0 ? 'danger' : 'neutral'} />
        <SmallPill icon={<ShieldCheck size={13} />} label={`${summary.machineCases} machine case`} tone={summary.machineCases > 0 ? 'danger' : 'neutral'} />
        <SmallPill icon={<Search size={13} />} label={`${summary.candidates} candidates`} tone="neutral" />
        <SmallPill icon={<ShieldCheck size={13} />} label={`${summary.highSimilarityOnly} high-sim watch`} tone="warning" />
        {summary.stale > 0 && <SmallPill icon={<AlertTriangle size={13} />} label={`${summary.stale} stale`} tone="danger" />}
        {summary.campaignInferred > 0 && <SmallPill icon={<GitBranch size={13} />} label={`${summary.campaignInferred} campaign-inferred`} tone="warning" />}
        <SmallPill icon={<GitBranch size={13} />} label={`${summary.footprintLinked} with Footprint context`} tone="success" />
        {quality?.reasons?.slice(0, 2).map(reason => (
          <SmallPill key={reason} label={reason} tone="neutral" />
        ))}
        {providerStatus && Object.entries(providerStatus).map(([provider, status]) => (
          <SmallPill
            key={provider}
            label={`${sourceLabel(provider)}: ${status.status}`}
            tone={status.configured ? 'success' : 'neutral'}
            title={status.message}
          />
        ))}
      </Box>
    </Box>
  )
}

function QueuePanel({
  stageView,
  onStageView,
  summary,
  items,
  selectedId,
  onSelect,
}: {
  stageView: StageView
  onStageView: (stage: StageView) => void
  summary: { cases: number; candidates: number; owned: number; total: number }
  items: BrandItem[]
  selectedId?: string
  onSelect: (id: string) => void
}) {
  const tabs: { key: StageView; label: string; count: number }[] = [
    { key: 'cases', label: 'Actionable', count: summary.cases },
    { key: 'candidates', label: 'Candidates', count: summary.candidates },
    { key: 'owned', label: 'Defensive', count: summary.owned },
    { key: 'all', label: 'All', count: summary.total },
  ]
  return (
    <Box
      sx={{
        minHeight: 0,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        overflow: 'hidden',
        bgcolor: 'background.paper',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box sx={{ p: 1, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 0.75 }}>
        {tabs.map(tab => (
          <Button
            key={tab.key}
            size="small"
            variant={stageView === tab.key ? 'contained' : 'outlined'}
            onClick={() => onStageView(tab.key)}
            sx={{ minWidth: 0, textTransform: 'none', borderRadius: 1.5, fontSize: 12, fontWeight: 700, justifyContent: 'space-between', px: 1 }}
          >
            <span>{tab.label}</span>
            <span>{tab.count}</span>
          </Button>
        ))}
      </Box>
      <Divider />
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 1, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        {items.length === 0 && (
          <Box sx={{ py: 4, px: 2, textAlign: 'center', color: 'text.secondary' }}>
            <Typography variant="body2">
              {stageView === 'cases'
                ? t('hardcoded.no.actionable.cases.candidate.rows.stay.review.only.2f815c73')
                : 'No rows in this view.'}
            </Typography>
          </Box>
        )}
        {items.map(row => (
          <QueueRow
            key={row.item.id}
            row={row}
            selected={selectedId === row.item.id}
            onSelect={() => onSelect(row.item.id)}
          />
        ))}
      </Box>
    </Box>
  )
}

function QueueRow({ row, selected, onSelect }: { row: BrandItem; selected: boolean; onSelect: () => void }) {
  const stage = workflowStage(row.item)
  const meta = STAGE_META[stage] ?? STAGE_META.watch
  const tone = STAGE_TONE[meta.tone]
  const missing = missingEvidenceCount(row.item)
  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect()
        }
      }}
      sx={{
        p: 1.25,
        borderRadius: 1.5,
        border: '1px solid',
        borderColor: selected ? tone.border : 'divider',
        bgcolor: selected ? tone.bg : 'background.default',
        cursor: 'pointer',
        outline: 'none',
        '&:focus-visible': { boxShadow: `0 0 0 2px ${tone.border}` },
      }}
    >
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" fontWeight={800} sx={{ overflowWrap: 'anywhere', lineHeight: 1.25 }}>
            {displayValue(row.item, row.meta)}
          </Typography>
          {targetValue(row.item, row.meta) && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25, overflowWrap: 'anywhere' }}>
              vs {targetValue(row.item, row.meta)}
            </Typography>
          )}
        </Box>
        <Chip
          size="small"
          label={meta.label}
          sx={{ height: 22, fontSize: 12, fontWeight: 800, bgcolor: tone.bg, color: tone.color, border: `1px solid ${tone.border}` }}
        />
      </Box>
      <Box sx={{ mt: 1, display: 'grid', gridTemplateColumns: '1fr auto', gap: 1, alignItems: 'center' }}>
        <LinearProgress
          variant="determinate"
          value={Math.max(0, Math.min(100, row.item.confidence ?? 0))}
          sx={{ height: 6, borderRadius: 1, bgcolor: alpha(tone.color, 0.12), '& .MuiLinearProgress-bar': { bgcolor: tone.color } }}
        />
        <Typography variant="caption" fontWeight={800}>{row.item.confidence}%</Typography>
      </Box>
      <Box sx={{ mt: 0.75, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
        <SmallPill label={sourceLabel(row.item.source, row.item.asset_type)} tone="neutral" />
        <SmallPill label={verdictLabel(row.item.verdict)} tone={stage === 'action_ready' ? 'danger' : stage === 'closed' ? 'success' : 'neutral'} />
        {row.item.decision_authority && <SmallPill label={row.item.decision_authority.label} tone={decisionTone(row.item.decision_authority.mode)} />}
        {row.item.freshness && <SmallPill label={freshnessLabel(row.item.freshness.status)} tone={freshnessTone(row.item.freshness.status)} />}
        {row.item.campaign_context?.family_key && (
          <SmallPill
            icon={<GitBranch size={12} />}
            label={`${campaignFamilyLabel(row.item.campaign_context)} · ${row.item.campaign_context.related_count ?? 1}`}
            tone={campaignTone(row.item.campaign_context.status)}
          />
        )}
        {missing > 0 && <SmallPill label={`${missing} missing`} tone="warning" />}
      </Box>
    </Box>
  )
}

function EvidenceWorkbench({ orgId, selected }: { orgId: string; selected: BrandItem | null }) {
  const [detailOpen, setDetailOpen] = useState(false)
  const resourceID = selected?.item.footprint_context?.surface_resource_id
  const evidenceQ = useQuery({
    queryKey: qk.footprint.surfaceEvidence(orgId, resourceID),
    queryFn: () => getSurfaceEvidence(orgId, resourceID!),
    enabled: !!orgId && !!resourceID,
    staleTime: 60_000,
    retry: false,
  })
  const pathsQ = useQuery({
    queryKey: qk.footprint.candidatePaths(orgId, 50),
    queryFn: () => getCandidatePaths(orgId, 50),
    enabled: !!orgId && !!selected,
    staleTime: 60_000,
    retry: false,
  })
  const matchingPaths = useMemo(() => {
    if (!selected) return []
    return (pathsQ.data?.paths ?? []).filter(path => matchesPath(path, selected)).slice(0, 3)
  }, [pathsQ.data?.paths, selected])

  if (!selected) {
    return (
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper', p: 3, minHeight: 0 }}>
        <Typography variant="body2" color="text.secondary">{t('hardcoded.select.a.brand.protection.row.to.review.evidence.e6621cff')}</Typography>
      </Box>
    )
  }

  const stage = workflowStage(selected.item)
  const stageMeta = STAGE_META[stage] ?? STAGE_META.watch
  const stageTone = STAGE_TONE[stageMeta.tone]
  const value = displayValue(selected.item, selected.meta)
  const target = targetValue(selected.item, selected.meta)
  const href = externalHref(selected.item, selected.meta)
  const axes = axesOf(selected.item)

  return (
    <Box
      sx={{
        minHeight: 0,
        overflow: 'auto',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        bgcolor: 'background.paper',
      }}
    >
      <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap', mb: 0.75 }}>
              <Chip
                size="small"
                label={stageMeta.label}
                sx={{ height: 24, fontSize: 12, fontWeight: 800, bgcolor: stageTone.bg, color: stageTone.color, border: `1px solid ${stageTone.border}` }}
              />
              <Chip size="small" label={verdictLabel(selected.item.verdict)} sx={{ height: 24, fontSize: 12, fontWeight: 700 }} />
              {selected.item.monitoring_tier && <Chip size="small" label={monitoringLabel(selected.item.monitoring_tier)} sx={{ height: 24, fontSize: 12, fontWeight: 700 }} />}
            </Box>
            <Typography variant="h6" fontWeight={850} sx={{ overflowWrap: 'anywhere', lineHeight: 1.2 }}>
              {value}
            </Typography>
            {target && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, overflowWrap: 'anywhere' }}>
                Compared with <Box component="span" sx={{ fontWeight: 700 }}>{target}</Box>
              </Typography>
            )}
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
              {stageMeta.helper}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 0.75, flexShrink: 0 }}>
            <IconButton component="a" href={href} target="_blank" rel="noopener noreferrer" size="small" aria-label={t('hardcoded.open.site.fd0f0a0b')} title={t('hardcoded.open.site.fd0f0a0b')}>
              <ExternalLink size={16} />
            </IconButton>
            <IconButton onClick={() => setDetailOpen(true)} size="small" aria-label={t('hardcoded.open.evidence.detail.03992c2b')} title={t('hardcoded.open.evidence.detail.03992c2b')}>
              <FileText size={16} />
            </IconButton>
          </Box>
        </Box>
      </Box>

      <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '1.1fr 0.9fr' }, gap: 1.5 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0 }}>
          <VerdictPanel item={selected.item} axes={axes} />
          <AxisMatrix axes={axes} />
          <MissingEvidencePanel axes={axes} />
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0 }}>
          <LearningFreshnessPanel item={selected.item} />
          <CampaignContextPanel context={selected.item.campaign_context} />
          <FootprintPanel context={selected.item.footprint_context} evidence={evidenceQ.data} loading={evidenceQ.isLoading} paths={matchingPaths} />
          <VisualEvidencePanel orgId={orgId} selected={selected} />
          <ActionPanel orgId={orgId} selected={selected} />
        </Box>
      </Box>

      <DetailDialog
        orgId={orgId}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        selected={selected}
        surfaceEvidence={evidenceQ.data}
        matchingPaths={matchingPaths}
      />
    </Box>
  )
}

function VerdictPanel({ item, axes }: { item: BrandProtectionCase; axes: BrandProtectionEvidenceAxis[] }) {
  const supported = axes.filter(axis => axis.status === 'supported').length
  const missing = missingEvidenceCount(item)
  const intent = axes.find(axis => axis.key === 'abuse_intent')
  const relation = axes.find(axis => axis.key === 'brand_relationship')
  const authority = item.decision_authority
  const authorityTone = decisionTone(authority?.mode)
  return (
    <Panel title={t('hardcoded.evidence.verdict.c030785d')} icon={<ShieldCheck size={15} />}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1 }}>
        <CompactStat label={t('hardcoded.supported.axes.133c2be4')} value={`${supported}/${axes.length}`} />
        <CompactStat label="Relation" value={scoreLabel(relation?.score)} />
        <CompactStat label="Intent" value={scoreLabel(intent?.score)} />
      </Box>
      <Box sx={{ mt: 1.25, display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
        <SmallPill label={`${item.confidence}% confidence`} tone="neutral" />
        {authority && (
          <SmallPill
            label={authority.label}
            tone={authorityTone}
            title={authority.reason}
          />
        )}
        <SmallPill label={`${missing} missing evidence`} tone={missing > 0 ? 'warning' : 'success'} />
	        <SmallPill label={item.ownership === 'self_owned' ? t('hardcoded.owned.defensive.2f13c145') : item.ownership === 'third_party' ? t('hardcoded.third.party.unknown.owner.e648c48e') : t('hardcoded.unknown.owner.5f721612')} tone={item.ownership === 'self_owned' ? 'success' : item.ownership === 'third_party' ? 'warning' : 'neutral'} />
      </Box>
      {authority?.requires_human_action && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
          {authority.external_action_requires_human
            ? t('hardcoded.external.action.still.requires.analyst.approval.2212558f')
            : 'Analyst action is required before escalation.'}
        </Typography>
      )}
    </Panel>
  )
}

function AxisMatrix({ axes }: { axes: BrandProtectionEvidenceAxis[] }) {
  return (
    <Panel title={t('hardcoded.evidence.matrix.7adfb5df')} icon={<CheckCircle2 size={15} />}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1 }}>
        {axes.map(axis => (
          <AxisCard key={axis.key} axis={axis} />
        ))}
      </Box>
    </Panel>
  )
}

function AxisCard({ axis }: { axis: BrandProtectionEvidenceAxis }) {
  const tone = AXIS_TONE[axis.status] ?? AXIS_TONE.unknown
  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, p: 1.25, bgcolor: 'background.default', minWidth: 0 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'center' }}>
        <Typography variant="body2" fontWeight={800}>{axis.label}</Typography>
        <Chip size="small" label={axisLabel(axis.status)} sx={{ height: 22, fontSize: 12, fontWeight: 800, bgcolor: tone.bg, color: tone.color }} />
      </Box>
      <LinearProgress
        variant="determinate"
        value={Math.max(0, Math.min(100, axis.score ?? 0))}
        sx={{ mt: 1, height: 6, borderRadius: 1, bgcolor: alpha(tone.color, 0.12), '& .MuiLinearProgress-bar': { bgcolor: tone.color } }}
      />
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
        {axis.top_reasons?.[0] || axis.missing_evidence?.[0] || 'No evidence yet'}
      </Typography>
    </Box>
  )
}

function MissingEvidencePanel({ axes }: { axes: BrandProtectionEvidenceAxis[] }) {
  const missing = axes.flatMap(axis => (axis.missing_evidence ?? []).map(text => ({ axis: axis.label, text })))
  if (missing.length === 0) return null
  return (
    <Panel title={t('footprint.breakthrough.gapColGap')} icon={<AlertTriangle size={15} />}>
      <Box component="ul" sx={{ m: 0, pl: 2.25, display: 'grid', gap: 0.75 }}>
        {missing.slice(0, 6).map((entry, index) => (
          <Typography key={`${entry.axis}-${index}`} component="li" variant="body2" color="text.secondary" sx={{ pl: 0.25 }}>
            <Box component="span" sx={{ fontWeight: 800, color: 'text.primary' }}>{entry.axis}:</Box> {entry.text}
          </Typography>
        ))}
      </Box>
    </Panel>
  )
}

function LearningFreshnessPanel({ item }: { item: BrandProtectionCase }) {
  const learning = item.learning_context
  const freshness = item.freshness
  const authority = item.decision_authority
  return (
    <Panel title={t('hardcoded.decision.quality.30e964ac')} icon={<ShieldCheck size={15} />}>
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
        {authority && <SmallPill label={authority.label} tone={decisionTone(authority.mode)} title={authority.reason} />}
        {learning && <SmallPill label={learningLabel(learning.state)} tone={learningTone(learning.state)} title={learning.reason} />}
        {freshness && <SmallPill label={freshnessLabel(freshness.status)} tone={freshnessTone(freshness.status)} title={freshness.reason} />}
      </Box>
      <Box sx={{ mt: 1, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1 }}>
        <CompactStat label="Confirmed" value={learning?.confirmed_count ?? 0} />
        <CompactStat label="Suppressed" value={learning?.suppressed_count ?? 0} />
        <CompactStat label="Delta" value={learning?.confidence_delta ? `${learning.confidence_delta > 0 ? '+' : ''}${learning.confidence_delta}` : '0'} />
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
        {authority?.reason || learning?.reason || freshness?.reason || 'No quality context yet.'}
      </Typography>
    </Panel>
  )
}

function CampaignContextPanel({ context }: { context?: BrandProtectionCampaignContext | null }) {
  if (!context?.family_key) {
    return (
      <Panel title={t('hardcoded.campaign.learning.a1b53ce0')} icon={<GitBranch size={15} />}>
        <Typography variant="body2" color="text.secondary">
          No learned campaign signature is attached yet.
        </Typography>
      </Panel>
    )
  }
  const tone = campaignTone(context.status)
  return (
    <Panel title={t('hardcoded.campaign.learning.a1b53ce0')} icon={<GitBranch size={15} />}>
      <Box sx={{ display: 'grid', gap: 1 }}>
        <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
          <Chip
            size="small"
            label={campaignStatusLabel(context.status)}
            sx={{
              height: 23,
              fontSize: 12,
              fontWeight: 850,
              bgcolor: STAGE_TONE[tone].bg,
              color: STAGE_TONE[tone].color,
              border: `1px solid ${STAGE_TONE[tone].border}`,
            }}
          />
          {context.inherited_from_confirmed_case && <SmallPill label={t('hardcoded.inherited.from.seed.8b1ca68c')} tone="warning" />}
        </Box>
        <Typography variant="body2" fontWeight={850}>{campaignFamilyLabel(context)}</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1 }}>
          <CompactStat label="Confidence" value={`${context.confidence ?? 0}%`} />
          <CompactStat label="Seeds" value={context.seed_count ?? 0} />
          <CompactStat label="Related" value={context.related_count ?? 1} />
        </Box>
        <InfoRow label="Family" value={context.family_key} mono />
        {context.matched_features?.length ? (
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {context.matched_features.slice(0, 5).map(feature => (
              <SmallPill key={feature} label={feature} tone="neutral" />
            ))}
          </Box>
        ) : null}
      </Box>
    </Panel>
  )
}

function FootprintPanel({
  context,
  evidence,
  loading,
  paths,
}: {
  context?: BrandProtectionFootprintContext | null
  evidence?: ResourceEvidence
  loading: boolean
  paths: CandidatePath[]
}) {
  return (
    <Panel title={t('hardcoded.footprint.context.8b11aba2')} icon={<Network size={15} />}>
      {!context && (
        <Typography variant="body2" color="text.secondary">
          No Footprint resource is linked yet. Treat this as a review candidate until the resource relationship is proven.
        </Typography>
      )}
      {context && (
        <Box sx={{ display: 'grid', gap: 1 }}>
          <InfoRow label="Resource" value={context.surface_resource_id || context.footprint_entity_id || 'Linked context'} mono />
          <InfoRow label="Pool" value={context.pool} />
          <InfoRow label="Sources" value={(context.sources ?? []).join(', ')} />
          <InfoRow label={t('hardcoded.evidence.chain.f9c2517b')} value={loading ? t('common.loading') : `${evidence?.chain?.length ?? context.evidence_count ?? 0} step(s)`} />
          {context.attribution_reasons?.slice(0, 3).map((reason, index) => (
            <Typography key={`${reason}-${index}`} variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {reason}
            </Typography>
          ))}
        </Box>
      )}
      {paths.length > 0 && (
        <Box sx={{ mt: 1.25, display: 'grid', gap: 0.75 }}>
          <Typography variant="caption" fontWeight={800}>{t('hardcoded.candidate.path.58dddf13')}</Typography>
          {paths.map(path => (
            <Box key={`${path.leafEntityId}-${path.value}`} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, p: 1 }}>
              <Typography variant="body2" fontWeight={800} sx={{ overflowWrap: 'anywhere' }}>{path.value}</Typography>
              <Typography variant="caption" color="text.secondary">
                {path.hops} hop(s), {path.distinctSources} source(s), pool {path.pool}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Panel>
  )
}

function VisualEvidencePanel({ orgId, selected }: { orgId: string; selected: BrandItem }) {
  const item = selected.item
  const meta = selected.meta
  const visualBits = [
    item.visual_similarity != null ? `Visual ${item.visual_similarity}%` : '',
    item.visual_evidence?.logo_similarity != null ? `Logo ${item.visual_evidence.logo_similarity}%` : '',
    item.visual_evidence?.page_similarity != null ? `Page ${item.visual_evidence.page_similarity}%` : '',
	    item.visual_evidence?.login_form_detected ? t('hardcoded.login.form.87e312da') : '',
    item.ocr_evidence?.brand_match ? `OCR ${item.ocr_evidence.brand_match}` : '',
    (item.reference_matches ?? []).length > 0 ? `${item.reference_matches?.length} reference match(es)` : '',
  ].filter(Boolean)
  return (
    <Panel title={t('hardcoded.visual.and.source.evidence.9eadfea3')} icon={<ImageOff size={15} />}>
      <ScreenshotPreview orgId={orgId} assetId={selected.asset.id} hasScreenshot={!!meta.screenshot_id} captureError={meta.screenshot_error} />
      <Box sx={{ mt: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
        {visualBits.length === 0 && <SmallPill label={t('hardcoded.no.visual.proof.yet.126c80ca')} tone="neutral" />}
        {visualBits.map(bit => <SmallPill key={bit} label={bit} tone="neutral" />)}
        {item.github_evidence?.url && <SmallPill label={t('hardcoded.github.evidence.5efce12b')} tone="neutral" />}
        {item.rdap_evidence?.ownership && <SmallPill label={`RDAP ${item.rdap_evidence.ownership}`} tone={item.rdap_evidence.ownership === 'self_owned' ? 'success' : 'warning'} />}
      </Box>
    </Panel>
  )
}

function ActionPanel({ orgId, selected }: { orgId: string; selected: BrandItem }) {
  const item = selected.item
  const qc = useQueryClient()
  const feedbackMut = useMutation({
    mutationFn: (label: BrandProtectionFeedbackLabel) => submitBrandProtectionFeedback(orgId, selected.asset.id, { label }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.exposure.brandProtection(orgId) })
      qc.invalidateQueries({ queryKey: qk.exposure.brandProtectionCampaigns(orgId) })
      qc.invalidateQueries({ queryKey: qk.attackSurface(orgId) })
    },
  })
  const feedbackActions: { label: BrandProtectionFeedbackLabel; text: string; tone: keyof typeof STAGE_TONE }[] = [
    { label: 'confirmed_phishing', text: t('hardcoded.confirm.phishing.tone.danger.a0d5332b'), tone: 'danger' },
    { label: 'needs_more_evidence', text: t('hardcoded.needs.evidence.tone.warning.3a2cf224'), tone: 'warning' },
    { label: 'false_positive', text: t('hardcoded.false.positive.tone.success.ae32f2ce'), tone: 'success' },
    { label: 'owned_defensive', text: t('hardcoded.owned.defensive.tone.success.96748644'), tone: 'success' },
  ]
  return (
    <Panel title="Actions" icon={<FileText size={15} />}>
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
        {item.footprint_context?.research_selector && (
          <Button
            component="a"
            href={`/projects/${orgId}/footprint`}
            size="small"
            variant="outlined"
            startIcon={<GitBranch size={14} />}
            sx={{ textTransform: 'none', borderRadius: 1.5 }}
          >
            Open Footprint
          </Button>
        )}
        {item.stage === 'case' && supportsTakedownLetter(selected.asset) && <EvidenceDownloadButton orgId={orgId} asset={selected.asset} />}
        {item.stage === 'case' && supportsTakedownLetter(selected.asset) && <TakedownLetterButton orgId={orgId} asset={selected.asset} />}
      </Box>
      <Box sx={{ mt: 1.25, display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
        {feedbackActions.map(action => (
          <Button
            key={action.label}
            size="small"
            variant={action.label === 'confirmed_phishing' ? 'contained' : 'outlined'}
            disabled={!orgId || feedbackMut.isPending}
            onClick={() => feedbackMut.mutate(action.label)}
            sx={{
              textTransform: 'none',
              borderRadius: 1.5,
              fontSize: 12,
              fontWeight: 750,
              ...(action.label !== 'confirmed_phishing'
                ? { color: STAGE_TONE[action.tone].color, borderColor: STAGE_TONE[action.tone].border }
                : undefined),
            }}
          >
            {feedbackMut.isPending && feedbackMut.variables === action.label ? t('settings.ciGate.saving') : action.text}
          </Button>
        ))}
      </Box>
      {feedbackMut.isError && (
        <Box sx={{ mt: 0.75 }}>
          <InlineErrorNotice error={feedbackMut.error ?? t('hardcoded.failed.to.save.feedback.a91367b6')} />
        </Box>
      )}
      <Box sx={{ mt: 1 }}>
        <TakedownStateBar orgId={orgId} asset={selected.asset} />
      </Box>
    </Panel>
  )
}

function DetailDialog({
  orgId,
  open,
  onClose,
  selected,
  surfaceEvidence,
  matchingPaths,
}: {
  orgId: string
  open: boolean
  onClose: () => void
  selected: BrandItem
  surfaceEvidence?: ResourceEvidence
  matchingPaths: CandidatePath[]
}) {
  const item = selected.item
  const meta = selected.meta
  const chain = parseProviderChain(selected.asset.metadata)
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" PaperProps={{ sx: { borderRadius: 2 } }}>
      <Box sx={{ p: 2, display: 'flex', alignItems: 'flex-start', gap: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" fontWeight={850} sx={{ overflowWrap: 'anywhere' }}>{displayValue(item, meta)}</Typography>
          <Typography variant="body2" color="text.secondary">{verdictLabel(item.verdict)} · {workflowLabel(workflowStage(item))}</Typography>
        </Box>
        <IconButton component="a" href={externalHref(item, meta)} target="_blank" rel="noopener noreferrer" size="small" aria-label={t('hardcoded.open.site.fd0f0a0b')}>
          <ExternalLink size={16} />
        </IconButton>
        <IconButton onClick={onClose} size="small" aria-label="Close">
          <X size={16} />
        </IconButton>
      </Box>
      <Box sx={{ p: 2, display: 'grid', gap: 1.5 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
          <Panel title="Registration" icon={<Shield size={15} />}>
            <InfoRow label="Ownership" value={item.rdap_evidence?.ownership || meta.ownership || item.ownership} />
            <InfoRow label="Registrar" value={item.rdap_evidence?.registrar || meta.rdap_registrar || meta.registrar} />
            <InfoRow label="Registered" value={formatDate(item.rdap_evidence?.registered_at || meta.rdap_registered_at || meta.registered_at)} />
            <InfoRow label={t('hardcoded.registrant.org.1dccdd2f')} value={item.rdap_evidence?.registrant_org || meta.rdap_registrant_org || meta.registrant_org} />
          </Panel>
          <Panel title="Network" icon={<Network size={15} />}>
            <InfoRow label={t('exposure.brand.resolvesTo')} value={meta.resolves_to} mono />
            <InfoRow label={t('exposure.brand.finalURL')} value={meta.final_url} mono />
            <InfoRow label="Nameservers" value={meta.nameservers} mono />
            <InfoRow label="Detected" value={formatDate(meta.detected_at)} />
          </Panel>
        </Box>
        <Panel title={t('hardcoded.evidence.chain.f9c2517b')} icon={<GitBranch size={15} />}>
          {surfaceEvidence?.chain?.length ? (
            <Box sx={{ display: 'grid', gap: 0.75 }}>
              {surfaceEvidence.chain.slice(0, 6).map((step, index) => (
                <Typography key={`${step.kind}-${index}`} variant="body2" color="text.secondary">
                  <Box component="span" sx={{ fontWeight: 800, color: 'text.primary' }}>{step.kind}</Box>: {step.description}
                </Typography>
              ))}
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">{t('hardcoded.no.footprint.evidence.chain.is.linked.for.this.8c84d733')}</Typography>
          )}
          {matchingPaths.length > 0 && (
            <Box sx={{ mt: 1, display: 'grid', gap: 0.75 }}>
              {matchingPaths.map(path => (
                <Typography key={path.leafEntityId} variant="caption" color="text.secondary">
                  Candidate path: {path.chain.map(n => n.value).join(' -> ') || path.value}
                </Typography>
              ))}
            </Box>
          )}
        </Panel>
        <ProviderChainSection chain={chain} />
        <RawAuditSection item={item} meta={meta} />
      </Box>
      <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        <ActionPanel orgId={orgId} selected={selected} />
      </Box>
    </Dialog>
  )
}

function RawAuditSection({ item, meta }: { item: BrandProtectionCase; meta: ImpersonationMeta }) {
  return (
    <Box component="details" sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, p: 1.25 }}>
      <Typography component="summary" variant="body2" fontWeight={800} sx={{ cursor: 'pointer' }}>
        Raw audit fields
      </Typography>
      <Box sx={{ mt: 1, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
        <InfoRow label={t('cred.assetId')} value={item.asset_id} mono />
        <InfoRow label={t('hardcoded.stage.reason.dee2845d')} value={item.stage_reason} />
        <InfoRow label={t('hardcoded.transition.state.c3d765df')} value={item.transition_state || meta.transition_state || item.stage} />
        <InfoRow label={t('hardcoded.evidence.fingerprint.53d5bf3f')} value={item.evidence_fingerprint || meta.evidence_fingerprint} mono />
        <InfoRow label={t('hardcoded.last.transition.38887c7a')} value={formatDate(item.last_transition_at || meta.last_transition_at)} />
        <InfoRow label={t('hardcoded.last.notified.4b66614f')} value={formatDate(item.last_notified_at || meta.last_notified_at)} />
      </Box>
    </Box>
  )
}

function ProviderChainSection({ chain }: { chain: ProviderChain | null }) {
  if (!chain || chain.providers.length === 0) return null
  return (
    <Panel title={t('hardcoded.provider.chain.2d147403')} icon={<Link2 size={15} />}>
      <Box sx={{ display: 'grid', gap: 0.75 }}>
        {chain.providers.map((provider, index) => (
          <ProviderRow key={`${provider.kind}-${index}`} provider={provider} />
        ))}
      </Box>
    </Panel>
  )
}

function ProviderRow({ provider }: { provider: ProviderChainRow }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr) auto', gap: 1, alignItems: 'center' }}>
      <Typography variant="caption" color="text.secondary" fontWeight={800}>{provider.kind}</Typography>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{provider.name}</Typography>
        {provider.detail && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflowWrap: 'anywhere' }}>{provider.detail}</Typography>}
      </Box>
      {provider.abuse_url && (
        <IconButton component="a" href={provider.abuse_url} target="_blank" rel="noopener noreferrer" size="small" aria-label={t('hardcoded.open.provider.abuse.page.b4b02dee')}>
          <ExternalLink size={15} />
        </IconButton>
      )}
    </Box>
  )
}

function ScreenshotPreview({ orgId, assetId, hasScreenshot, captureError }: { orgId: string; assetId: string; hasScreenshot: boolean; captureError?: string }) {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let mounted = true
    let url: string | null = null
    setSrc(null)
    setFailed(false)
    if (!orgId || !assetId || !hasScreenshot) return undefined
    getAttackSurfaceScreenshotBlobUrl(orgId, assetId)
      .then(blobUrl => {
        url = blobUrl
        if (mounted) setSrc(blobUrl)
      })
      .catch(() => {
        if (mounted) setFailed(true)
      })
    return () => {
      mounted = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [assetId, hasScreenshot, orgId])

  if (!hasScreenshot || failed) {
    return (
      <Box sx={{ minHeight: 96, border: '1px dashed', borderColor: 'divider', borderRadius: 1.5, display: 'grid', placeItems: 'center', color: 'text.secondary', p: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ImageOff size={16} />
          <Typography variant="body2">{captureError || 'No screenshot captured yet'}</Typography>
        </Box>
      </Box>
    )
  }
  if (!src) {
    return (
      <Box sx={{ minHeight: 96, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, display: 'grid', placeItems: 'center' }}>
        <LoadingState variant="spinner" py={1} />
      </Box>
    )
  }
  return (
    <Box component="img" src={src} alt="" sx={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 1.5, border: '1px solid', borderColor: 'divider' }} />
  )
}

function EvidenceDownloadButton({ orgId, asset }: { orgId: string; asset: AttackSurfaceAsset }) {
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const onDownload = async () => {
    setDownloading(true)
    setError(null)
    try {
      await downloadEvidenceBundle(orgId, asset.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setDownloading(false)
    }
  }
  return (
    <>
      <Button
        size="small"
        variant="contained"
        startIcon={downloading ? <CircularProgress size={14} color="inherit" /> : <Download size={14} />}
        disabled={downloading}
        onClick={onDownload}
        sx={{ textTransform: 'none', borderRadius: 1.5 }}
      >
        Evidence package
      </Button>
      {error && (
        <Box sx={{ mt: 0.75 }}>
          <InlineErrorNotice error={error} />
        </Box>
      )}
    </>
  )
}

function TakedownLetterButton({ orgId, asset }: { orgId: string; asset: AttackSurfaceAsset }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        size="small"
        variant="outlined"
        startIcon={<FileText size={14} />}
        onClick={() => setOpen(true)}
        sx={{ textTransform: 'none', borderRadius: 1.5 }}
      >
        Takedown letter
      </Button>
      <TakedownLetterDialog open={open} onClose={() => setOpen(false)} orgId={orgId} asset={asset} />
    </>
  )
}

const TAKEDOWN_STATES: { value: TakedownState; label: string }[] = [
  { value: 'detected', label: 'Detected' },
  { value: 'evidence_collected', label: t('exposure.brand.takedown.evidence_collected') },
  { value: 'submitted', label: 'Submitted' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'rejected', label: 'Rejected' },
]

function TakedownStateBar({ orgId, asset }: { orgId: string; asset: AttackSurfaceAsset }) {
  const current = useMemo<TakedownState>(() => {
    try {
      const parsed = JSON.parse(asset.metadata || '{}')
      const state = parsed?.takedown?.state
      if (typeof state === 'string' && TAKEDOWN_STATES.some(row => row.value === state)) return state as TakedownState
    } catch {
      return 'detected'
    }
    return 'detected'
  }, [asset.metadata])
  const tracking = useMemo(() => {
    try {
      return JSON.parse(asset.metadata || '{}')?.takedown?.tracking_id ?? ''
    } catch {
      return ''
    }
  }, [asset.metadata])
  const [state, setState] = useState<TakedownState>(current)
  const [trackingID, setTrackingID] = useState(tracking)
  const qc = useQueryClient()
  const mut = useMutation({
    mutationFn: (update: { state: TakedownState; tracking_id: string }) => setTakedownState(orgId, asset.id, update),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.exposure.brandProtection(orgId) })
      qc.invalidateQueries({ queryKey: qk.attackSurface(orgId) })
    },
  })
  const dirty = state !== current || trackingID !== tracking
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '180px 1fr auto' }, gap: 0.75 }}>
      <TextField
        select
        size="small"
        value={state}
        onChange={(event) => setState(event.target.value as TakedownState)}
        sx={{ '& .MuiSelect-select': { py: 0.75, fontSize: 12, fontWeight: 700 } }}
      >
        {TAKEDOWN_STATES.map(row => (
          <MenuItem key={row.value} value={row.value} sx={{ fontSize: 12 }}>{row.label}</MenuItem>
        ))}
      </TextField>
      <TextField
        size="small"
        placeholder={t('exposure.brand.trackingPlaceholder')}
        value={trackingID}
        onChange={(event) => setTrackingID(event.target.value)}
        sx={{ '& .MuiInputBase-input': { py: 0.75, fontSize: 12 } }}
      />
      <Button
        size="small"
        variant="contained"
        disabled={!dirty || mut.isPending}
        onClick={() => mut.mutate({ state, tracking_id: trackingID })}
        sx={{ textTransform: 'none', borderRadius: 1.5 }}
      >
	        {mut.isPending ? t('hardcoded.saving.update.dba99644') : t('exposure.brand.saveState')}
      </Button>
    </Box>
  )
}

function MetricCell({ label, value, tone }: { label: string; value: string | number; tone: keyof typeof STAGE_TONE }) {
  const style = STAGE_TONE[tone]
  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper', p: 1.25 }}>
      <Typography variant="h5" fontWeight={850} sx={{ color: style.color, lineHeight: 1.1 }}>{value}</Typography>
      <Typography variant="caption" color="text.secondary" fontWeight={800}>{label}</Typography>
    </Box>
  )
}

function Panel({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5, bgcolor: 'background.default', minWidth: 0 }}>
      <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', mb: 1 }}>
        {icon}
        <Typography variant="body2" fontWeight={850}>{title}</Typography>
      </Box>
      {children}
    </Box>
  )
}

function CompactStat({ label, value }: { label: string; value: string | number }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="body1" fontWeight={850}>{value}</Typography>
      <Typography variant="caption" color="text.secondary" fontWeight={700}>{label}</Typography>
    </Box>
  )
}

function SmallPill({ label, tone = 'neutral', icon, title }: { label: string; tone?: keyof typeof STAGE_TONE; icon?: ReactNode; title?: string }) {
  const style = STAGE_TONE[tone]
  return (
    <Box
      title={title}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        minHeight: 22,
        px: 0.75,
        borderRadius: 1,
        bgcolor: style.bg,
        color: style.color,
        border: `1px solid ${style.border}`,
        fontSize: 12,
        fontWeight: 800,
        maxWidth: '100%',
      }}
    >
      {icon}
      <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</Box>
    </Box>
  )
}

function InfoRow({ label, value, mono }: { label: string; value?: string | number | null; mono?: boolean }) {
  if (value == null || value === '') return null
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '116px minmax(0, 1fr)', gap: 1, alignItems: 'baseline' }}>
      <Typography variant="caption" color="text.secondary" fontWeight={800}>{label}</Typography>
      <Typography variant="body2" sx={{ fontFamily: mono ? 'monospace' : undefined, overflowWrap: 'anywhere' }}>{value}</Typography>
    </Box>
  )
}

function supportsTakedownLetter(asset: AttackSurfaceAsset): boolean {
  return ['impersonation', 'lookalike_domain', 'phishing_url', 'phishing'].includes(asset.asset_type)
}
