import { useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Box, Chip, Skeleton, Typography } from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  Fingerprint,
  GitBranch,
  Globe2,
  Radar,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  TimerReset,
} from 'lucide-react'

import { useOrg } from '@hooks/useOrg'
import { t, tOr } from '@lib/i18n'
import { qk } from '@lib/queryKeys'
import { colors } from '@/styles/designTokens'
import {
  ChartCard,
  DonutChart,
  KpiCard,
  ManagerDashboard,
  StackedBarChart,
  type DonutDatum,
} from '@compounds/_shared'
import {
  getBrandProtection,
  type AttackSurfaceAsset,
  type BrandProtectionCase,
  type BrandProtectionProviderStatus,
} from '@lib/engine/code/pentest'

const ACCENT = colors.section.exposure
const CONTROL = colors.brand
const ALERT = colors.semantic.danger
const WARNING = colors.semantic.warning

type QueueSeverity = 'critical' | 'high' | 'medium' | 'low'

interface BrandManagerRow {
  item: BrandProtectionCase
  asset: AttackSurfaceAsset
}

interface BrandQueueItem {
  id: string
  title: string
  subtitle: string
  meta: string[]
  value: string
  severity: QueueSeverity
  stage: string
  item: BrandProtectionCase
}

function workflowStage(item: BrandProtectionCase): string {
  if (item.workflow_stage) return item.workflow_stage
  if (item.stage === 'owned') return 'closed'
  if (item.stage === 'case') return 'action_ready'
  if ((item.relationship_score ?? 0) > 0 || (item.intent_score ?? 0) > 0) return 'needs_evidence'
  return 'watch'
}

function missingEvidenceCount(item: BrandProtectionCase): number {
  return (item.evidence_axes ?? []).reduce((sum, axis) => sum + (axis.missing_evidence?.length ?? 0), 0)
}

function verdictLabel(verdict: string): string {
  switch (verdict) {
    case 'brand_abuse_evidence_chain': return t('hardcoded.evidence.backed.abuse.93ccfac1')
    case 'brand_visual_impersonation': return t('hardcoded.logo.login.copy.bfd08484')
    case 'similar_domain_only': return t('hardcoded.similar.domain.only.74e42cfd')
    case 'malicious_domain_relationship_unproven': return t('hardcoded.malicious.relation.unproven.7c686b90')
    case 'claimed_phishing_relationship_unproven': return t('hardcoded.claimed.phishing.relation.unproven.70396c14')
    case 'defensive_registration': return t('hardcoded.defensive.registration.592fe4be')
    case 'github_brand_candidate': return t('hardcoded.github.candidate.0aea1ac8')
    case 'ct_log_candidate': return t('hardcoded.ct.candidate.9eb14af5')
    default: return t('autofix.statusNeedsReview')
  }
}

function parseMeta(asset: AttackSurfaceAsset): Record<string, unknown> {
  try {
    return JSON.parse(asset.metadata || '{}') as Record<string, unknown>
  } catch {
    return {}
  }
}

function displayValue(item: BrandProtectionCase): string {
  const meta = parseMeta(item.asset)
  return item.display_value || String(meta.lookalike_domain || meta.url_host || item.asset.value || item.value)
}

function compactNumber(value: number): string {
  if (!Number.isFinite(value)) return '0'
  if (Math.abs(value) < 1000) return String(Math.round(value))
  if (Math.abs(value) < 10_000) return `${(value / 1000).toFixed(1)}k`
  return `${Math.round(value / 1000)}k`
}

function learningLabel(state?: string): string {
  switch (state) {
    case 'confirmed_pattern': return tOr('exposure.brand.learning.confirmedPattern', 'Confirmed learning')
    case 'known_pattern': return tOr('exposure.brand.learning.knownPattern', 'Known pattern')
    case 'suppressed_pattern': return tOr('exposure.brand.learning.suppressedPattern', 'Suppressed pattern')
    case 'new': return tOr('exposure.brand.learning.newPattern', 'New pattern')
    default: return state?.replaceAll('_', ' ') || tOr('exposure.brand.learning.newPattern', 'New pattern')
  }
}

function freshnessLabel(status?: string): string {
  switch (status) {
    case 'fresh': return tOr('exposure.brand.freshness.fresh', 'Fresh')
    case 'due': return tOr('exposure.brand.freshness.due', 'Refresh due')
    case 'stale': return tOr('exposure.brand.freshness.stale', 'Stale')
    case 'unknown': return tOr('exposure.brand.freshness.unknown', 'Unknown freshness')
    default: return status?.replaceAll('_', ' ') || tOr('exposure.brand.freshness.unknown', 'Unknown freshness')
  }
}

function workflowStageLabel(stage: string): string {
  switch (stage) {
    case 'action_ready': return tOr('exposure.brand.workflow.actionReady', 'Action ready')
    case 'needs_evidence': return tOr('exposure.brand.workflow.needsEvidence', 'Needs evidence')
    case 'investigate': return tOr('exposure.brand.workflow.investigate', 'Investigate')
    case 'closed': return tOr('exposure.brand.workflow.closed', 'Closed')
    case 'watch': return tOr('exposure.brand.workflow.watch', 'Watch')
    default: return stage.replaceAll('_', ' ')
  }
}

function decisionAuthorityLabel(authority?: BrandProtectionCase['decision_authority']): string {
  switch (authority?.mode) {
    case 'computer_context': return tOr('exposure.brand.authority.computerContext', 'Computer context')
    case 'human_review': return tOr('exposure.brand.authority.humanReview', 'Human review')
    case 'machine_recommendation': return tOr('exposure.brand.authority.machineRecommendation', 'Machine recommendation')
    case 'machine_case': return tOr('exposure.brand.authority.machineCase', 'Machine case')
    case 'analyst_confirmed': return tOr('exposure.brand.authority.analystConfirmed', 'Analyst confirmed')
    case 'human_closed': return tOr('exposure.brand.authority.humanClosed', 'Human closed')
    default:
      return authority?.label || ''
  }
}

function stageTone(stage: string): string {
  if (stage === 'action_ready') return ALERT
  if (stage === 'needs_evidence' || stage === 'investigate') return WARNING
  if (stage === 'closed') return colors.semantic.success
  return ACCENT
}

function queueSeverity(item: BrandProtectionCase): QueueSeverity {
  const stage = workflowStage(item)
  if (stage === 'action_ready') return 'critical'
  if (stage === 'needs_evidence' || stage === 'investigate') return 'high'
  if (item.risk === 'medium') return 'medium'
  return 'low'
}

function isProviderReady(status: BrandProtectionProviderStatus): boolean {
  if (!status.configured) return false
  return !/error|failed|missing|disabled/i.test(status.status || '')
}

export function BrandProtectionManagerView() {
  const { org } = useOrg()
  const orgId = org?.id

  const { data, isLoading } = useQuery({
    queryKey: qk.exposure.brandProtection(orgId),
    queryFn: () => getBrandProtection(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const rows = useMemo<BrandManagerRow[]>(() => {
    const serverItems: BrandProtectionCase[] = [
      ...(data?.cases ?? []),
      ...(data?.candidates ?? []),
      ...(data?.owned ?? []),
    ]
    return serverItems
      .filter(item => !!item.asset)
      .map(item => ({ item, asset: item.asset }))
  }, [data])

  const providerRows = useMemo(
    () => Object.entries(data?.provider_status ?? {}).map(([name, status]) => ({ name, status })),
    [data?.provider_status],
  )

  const agg = useMemo(() => {
    let actionReady = 0
    let needsEvidence = 0
    let watch = 0
    let closed = 0
    let footprintLinked = 0
    let visualSupported = 0
    let similarityOnly = 0
    let missing = 0
    let confirmedLearning = 0
    let suppressedLearning = 0

    for (const { item } of rows) {
      const stage = workflowStage(item)
      if (stage === 'action_ready') actionReady += 1
      else if (stage === 'needs_evidence' || stage === 'investigate') needsEvidence += 1
      else if (stage === 'closed') closed += 1
      else watch += 1

      if (item.footprint_context?.surface_resource_id || item.footprint_context?.footprint_entity_id) footprintLinked += 1
      if (
        (item.visual_evidence?.logo_similarity ?? 0) >= 85 ||
        item.visual_evidence?.logo_match ||
        (item.visual_evidence?.page_similarity ?? 0) >= 80 ||
        (item.reference_matches ?? []).length > 0 ||
        !!item.ocr_evidence?.brand_match
      ) {
        visualSupported += 1
      }
      if (item.verdict === 'similar_domain_only' || item.domain_similarity_class === 'high') similarityOnly += 1
      if (item.learning_context?.state === 'confirmed_pattern') confirmedLearning += 1
      if (item.learning_context?.state === 'suppressed_pattern') suppressedLearning += 1
      missing += missingEvidenceCount(item)
    }

    const total = rows.length
    const quality = data?.quality
    const providersReady = providerRows.filter(({ status }) => isProviderReady(status)).length

    return {
      total,
      actionReady,
      needsEvidence,
      watch,
      closed,
      footprintLinked,
      visualSupported,
      similarityOnly,
      missing,
      confirmedLearning: quality?.confirmed_feedback_count ?? confirmedLearning,
      suppressedLearning: quality?.suppressed_feedback_count ?? suppressedLearning,
      score: quality?.score ?? (total ? Math.round(((visualSupported + footprintLinked) / (total * 2)) * 100) : 0),
      grade: quality?.grade ?? '',
      footprintCoverage: quality?.footprint_coverage ?? (total ? Math.round((footprintLinked / total) * 100) : 0),
      evidenceCoverage: quality?.evidence_coverage ?? (total ? Math.round(((visualSupported + footprintLinked) / (total * 2)) * 100) : 0),
      freshnessCoverage: quality?.freshness_coverage ?? 0,
      learningCoverage: quality?.learning_coverage ?? 0,
      humanReview: quality?.human_review_count ?? needsEvidence,
      machineCases: quality?.machine_case_count ?? 0,
      stale: quality?.stale_count ?? rows.filter(({ item }) => item.freshness?.status === 'stale').length,
      providersReady,
      providersTotal: providerRows.length,
      canonicalLogin: !!data?.canonical_login_configured,
    }
  }, [data?.canonical_login_configured, data?.quality, providerRows, rows])

  const queue = useMemo<BrandQueueItem[]>(() => {
    const severityRank: Record<QueueSeverity, number> = { critical: 4, high: 3, medium: 2, low: 1 }
    return [...rows]
      .filter(({ item }) => workflowStage(item) !== 'closed')
      .sort((a, b) => {
        const severityDiff = severityRank[queueSeverity(b.item)] - severityRank[queueSeverity(a.item)]
        if (severityDiff) return severityDiff
        return (b.item.confidence ?? 0) - (a.item.confidence ?? 0)
      })
      .slice(0, 7)
      .map(({ item, asset }) => {
        const stage = workflowStage(item)
        const missing = missingEvidenceCount(item)
        return {
          id: item.id || asset.id,
          title: displayValue(item),
          subtitle: decisionAuthorityLabel(item.decision_authority) || verdictLabel(item.verdict),
          meta: [
            workflowStageLabel(stage),
            freshnessLabel(item.freshness?.status),
            learningLabel(item.learning_context?.state),
            tOr('exposure.brand.missingEvidenceCount', '{count} missing', { count: missing }),
          ],
          value: `${item.confidence}%`,
          severity: queueSeverity(item),
          stage,
          item,
        }
      })
  }, [rows])

  const workflowSeries = useMemo(() => ([
    { name: workflowStageLabel('action_ready'), data: [agg.actionReady], severity: 'critical' as const },
    { name: workflowStageLabel('needs_evidence'), data: [agg.needsEvidence], severity: 'high' as const },
    { name: workflowStageLabel('watch'), data: [agg.watch], severity: 'medium' as const },
    { name: workflowStageLabel('closed'), data: [agg.closed], severity: 'low' as const },
  ]), [agg.actionReady, agg.closed, agg.needsEvidence, agg.watch])

  const authorityData = useMemo<DonutDatum[]>(() => ([
    { label: tOr('exposure.brand.authority.humanReview', 'Human review'), value: agg.humanReview, severity: 'high' as const },
    { label: tOr('exposure.brand.authority.machineCase', 'Machine case'), value: agg.machineCases, severity: 'low' as const },
    { label: tOr('exposure.brand.confirmedPatterns', 'Confirmed patterns'), value: agg.confirmedLearning, severity: 'medium' as const },
    { label: tOr('exposure.brand.workflow.closed', 'Closed'), value: agg.closed, severity: 'low' as const },
  ].filter(item => item.value > 0)), [agg.closed, agg.confirmedLearning, agg.humanReview, agg.machineCases])

  const canRenderCharts = typeof globalThis.ResizeObserver !== 'undefined'

  return (
    <ManagerDashboard
      title={t('exposure.brand.title')}
      subtitle={t('exposure.brand.subtitle')}
      accent={ACCENT}
      titleIcon={<ShieldAlert size={20} />}
      layout="dashboard"
      chartMinWidth={360}
      hero={
        <BrandCommandHero
          isLoading={isLoading}
          agg={agg}
          queue={queue}
          providers={providerRows}
        />
      }
      kpis={
        <>
          <KpiCard
            label={tOr('exposure.brand.authority.humanReview', 'Human review')}
            value={agg.humanReview}
            loading={isLoading}
            icon={<Search size={15} />}
            tone={agg.humanReview > 0 ? WARNING : colors.semantic.success}
          />
          <KpiCard
            label={tOr('exposure.brand.freshEvidence', 'Fresh evidence')}
            value={agg.freshnessCoverage}
            unit="%"
            loading={isLoading}
            icon={<TimerReset size={15} />}
            tone={agg.stale > 0 ? ALERT : colors.semantic.success}
          />
          <KpiCard
            label={tOr('exposure.brand.learningCoverage', 'Learning coverage')}
            value={agg.learningCoverage}
            unit="%"
            loading={isLoading}
            icon={<GitBranch size={15} />}
            tone={CONTROL}
          />
          <KpiCard
            label={tOr('exposure.brand.similarityWatch', 'Similarity-only watch')}
            value={agg.similarityOnly}
            loading={isLoading}
            icon={<Eye size={15} />}
            tone={ACCENT}
          />
        </>
      }
      charts={
        <>
          <ChartCard title={tOr('exposure.brand.workflowPosture', 'Workflow posture')}>
            {isLoading ? (
              <Skeleton variant="rounded" height={230} />
            ) : canRenderCharts ? (
              <StackedBarChart
                categories={[tOr('exposure.brand.reviewLane', 'Review lane')]}
                series={workflowSeries}
                height={230}
              />
            ) : (
              <WorkflowFallback series={workflowSeries} />
            )}
          </ChartCard>

          <ChartCard title={tOr('exposure.brand.evidenceMatrix', 'Evidence matrix')}>
            <EvidenceMatrix agg={agg} loading={isLoading} />
          </ChartCard>

          <ChartCard title={tOr('exposure.brand.decisionAuthority', 'Decision authority')}>
            {isLoading ? (
              <Skeleton variant="rounded" height={230} />
            ) : authorityData.length > 0 && canRenderCharts ? (
              <DonutChart data={authorityData} totalLabel={tOr('exposure.brand.cases', 'Cases')} height={230} />
            ) : authorityData.length > 0 ? (
              <DecisionFallback data={authorityData} />
            ) : (
              <EmptyPanel
                icon={<ShieldCheck size={18} />}
                title={tOr('exposure.brand.noAuthorityData', 'No decision authority yet')}
                body={tOr('exposure.brand.noAuthorityBody', 'Add feedback or evidence before assigning automated authority.')}
              />
            )}
          </ChartCard>
        </>
      }
      workItems={
        <BrandReviewBoard
          items={queue}
          agg={agg}
          loading={isLoading}
          providers={providerRows}
        />
      }
      narrative={
        <BrandRunbook agg={agg} loading={isLoading} />
      }
    />
  )
}

function BrandCommandHero({
  isLoading,
  agg,
  queue,
  providers,
}: {
  isLoading: boolean
  agg: ReturnType<typeof useBrandAggShape>
  queue: BrandQueueItem[]
  providers: Array<{ name: string; status: BrandProtectionProviderStatus }>
}) {
  const theme = useTheme()
  const dark = theme.palette.mode === 'dark'
  const focal = queue[0]
  const scoreTone = agg.score >= 90 ? colors.semantic.success : agg.score >= 70 ? WARNING : ALERT

  return (
    <Box sx={{
      minHeight: { xs: 360, lg: 222 },
      borderRadius: 1,
      border: '1px solid',
      borderColor: alpha(ACCENT, dark ? 0.4 : 0.28),
      bgcolor: alpha(theme.palette.background.paper, dark ? 0.58 : 0.96),
      backgroundImage: `
        linear-gradient(90deg, ${alpha(ACCENT, dark ? 0.07 : 0.035)} 1px, transparent 1px),
        linear-gradient(0deg, ${alpha(CONTROL, dark ? 0.055 : 0.026)} 1px, transparent 1px),
        radial-gradient(circle at 18% 18%, ${alpha(scoreTone, dark ? 0.16 : 0.08)} 0%, transparent 32%)
      `,
      backgroundSize: '38px 38px, 38px 38px, auto',
      p: { xs: 1.25, md: 1.5 },
      display: 'grid',
      gridTemplateColumns: { xs: '1fr', lg: 'minmax(240px, 0.74fr) minmax(0, 1.42fr) minmax(260px, 0.74fr)' },
      gap: 1.15,
      alignItems: 'stretch',
      minWidth: 0,
      overflow: 'hidden',
    }}>
      <CommandPanel tone={scoreTone}>
        <Typography sx={{ fontSize: 12, fontWeight: 950, color: scoreTone, display: 'flex', alignItems: 'center', gap: 0.7 }}>
          <Fingerprint size={14} />
          {tOr('exposure.brand.precisionQuality', 'Precision quality')}
        </Typography>
        {isLoading ? (
          <Skeleton variant="text" height={60} width="72%" />
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mt: 0.25 }}>
            <Typography sx={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: { xs: 40, md: 52 },
              fontWeight: 950,
              lineHeight: 0.96,
              color: scoreTone,
            }}>
              {agg.score}
            </Typography>
            <Chip
              size="small"
              label={agg.grade || tOr('exposure.brand.pendingGrade', 'Pending')}
              sx={{
                height: 24,
                borderRadius: 1,
                fontWeight: 950,
                color: scoreTone,
                bgcolor: alpha(scoreTone, 0.13),
              }}
            />
          </Box>
        )}
        <Box sx={{ mt: 'auto', display: 'grid', gap: 0.7 }}>
          <SignalMeter label={tOr('exposure.brand.evidenceCoverage', 'Evidence coverage')} value={agg.evidenceCoverage} tone={scoreTone} loading={isLoading} />
          <SignalMeter label={tOr('exposure.brand.footprintCoverage', 'Footprint coverage')} value={agg.footprintCoverage} tone={ACCENT} loading={isLoading} />
        </Box>
      </CommandPanel>

      <CommandPanel tone={ACCENT}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 950, color: ACCENT, display: 'flex', alignItems: 'center', gap: 0.7 }}>
              <Radar size={14} />
              {tOr('exposure.brand.commandFocus', 'Brand abuse command')}
            </Typography>
            <Typography sx={{ mt: 0.45, fontSize: { xs: 22, md: 30 }, fontWeight: 950, lineHeight: 1.08, color: 'text.primary', overflowWrap: 'anywhere' }}>
              {focal ? `${tOr('exposure.brand.focusTarget', 'Focus')} / ${focal.title}` : tOr('exposure.brand.noFocalTarget', 'No active brand-abuse target')}
            </Typography>
            <Typography sx={{ mt: 0.5, fontSize: 12.5, color: 'text.secondary', overflowWrap: 'anywhere' }}>
              {focal
                ? `${focal.subtitle} / ${focal.meta.slice(0, 2).join(' / ')}`
                : tOr('exposure.brand.noFocalTargetSub', 'Monitoring is waiting for a candidate with enough evidence to enter review.')}
            </Typography>
          </Box>
          <Chip
            size="small"
            icon={agg.actionReady > 0 ? <AlertTriangle size={13} /> : <ShieldCheck size={13} />}
            label={agg.actionReady > 0 ? tOr('exposure.brand.needsAction', 'Needs action') : tOr('exposure.brand.noUrgentRows', 'No urgent rows')}
            sx={{
              height: 26,
              borderRadius: 1,
              fontWeight: 950,
              color: agg.actionReady > 0 ? ALERT : colors.semantic.success,
              bgcolor: alpha(agg.actionReady > 0 ? ALERT : colors.semantic.success, 0.12),
              '& .MuiChip-icon': { color: 'inherit' },
            }}
          />
        </Box>

        <Box sx={{ mt: 1.25, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 0.85 }}>
          <StageNode icon={<Target size={16} />} label={workflowStageLabel('action_ready')} value={agg.actionReady} tone={ALERT} />
          <StageNode icon={<Search size={16} />} label={workflowStageLabel('needs_evidence')} value={agg.needsEvidence} tone={WARNING} />
          <StageNode icon={<Eye size={16} />} label={workflowStageLabel('watch')} value={agg.watch} tone={ACCENT} />
        </Box>
      </CommandPanel>

      <CommandPanel tone={CONTROL}>
        <Typography sx={{ fontSize: 12, fontWeight: 950, color: CONTROL, display: 'flex', alignItems: 'center', gap: 0.7 }}>
          <GitBranch size={14} />
          {tOr('exposure.brand.pipelineState', 'Pipeline state')}
        </Typography>
        <Box sx={{ mt: 0.9, display: 'grid', gap: 0.75 }}>
          <ReadoutLine
            icon={<CheckCircle2 size={14} />}
            label={tOr('exposure.brand.providersReady', 'Providers ready')}
            value={`${agg.providersReady}/${agg.providersTotal || 0}`}
            tone={agg.providersReady > 0 ? colors.semantic.success : WARNING}
          />
          <ReadoutLine
            icon={<Globe2 size={14} />}
            label={tOr('exposure.brand.canonicalLogin', 'Canonical login')}
            value={agg.canonicalLogin ? tOr('common.ready', 'Ready') : tOr('common.notSet', 'Not set')}
            tone={agg.canonicalLogin ? colors.semantic.success : WARNING}
          />
          <ReadoutLine
            icon={<TimerReset size={14} />}
            label={tOr('exposure.brand.staleRows', 'Stale rows')}
            value={agg.stale}
            tone={agg.stale > 0 ? ALERT : colors.semantic.success}
          />
          <ReadoutLine
            icon={<Sparkles size={14} />}
            label={tOr('exposure.brand.machineCases', 'Machine cases')}
            value={agg.machineCases}
            tone={CONTROL}
          />
        </Box>
        <ProviderStrip providers={providers} />
      </CommandPanel>
    </Box>
  )
}

function useBrandAggShape() {
  return {
    total: 0,
    actionReady: 0,
    needsEvidence: 0,
    watch: 0,
    closed: 0,
    footprintLinked: 0,
    visualSupported: 0,
    similarityOnly: 0,
    missing: 0,
    confirmedLearning: 0,
    suppressedLearning: 0,
    score: 0,
    grade: '',
    footprintCoverage: 0,
    evidenceCoverage: 0,
    freshnessCoverage: 0,
    learningCoverage: 0,
    humanReview: 0,
    machineCases: 0,
    stale: 0,
    providersReady: 0,
    providersTotal: 0,
    canonicalLogin: false,
  }
}

function CommandPanel({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <Box sx={{
      borderRadius: 1,
      border: '1px solid',
      borderColor: alpha(tone, 0.24),
      bgcolor: (theme) => alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.46 : 0.76),
      p: 1.25,
      display: 'flex',
      flexDirection: 'column',
      gap: 0.75,
      minWidth: 0,
      boxShadow: `inset 3px 0 0 ${alpha(tone, 0.65)}`,
    }}>
      {children}
    </Box>
  )
}

function StageNode({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number; tone: string }) {
  return (
    <Box sx={{
      minWidth: 0,
      borderRadius: 1,
      border: `1px solid ${alpha(tone, 0.22)}`,
      bgcolor: alpha(tone, 0.07),
      p: 0.95,
      display: 'grid',
      gridTemplateColumns: '30px minmax(0, 1fr)',
      gap: 0.8,
      alignItems: 'center',
      minHeight: 68,
    }}>
      <Box sx={{ width: 30, height: 30, borderRadius: 1, display: 'grid', placeItems: 'center', bgcolor: alpha(tone, 0.13), color: tone }}>
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 11.5, fontWeight: 900, color: tone }} noWrap>{label}</Typography>
        <Typography sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 22, fontWeight: 950, lineHeight: 1.08 }}>
          {compactNumber(value)}
        </Typography>
      </Box>
    </Box>
  )
}

function ReadoutLine({ icon, label, value, tone }: { icon: ReactNode; label: string; value: ReactNode; tone: string }) {
  return (
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: '28px minmax(0, 1fr) auto',
      gap: 0.75,
      alignItems: 'center',
      borderRadius: 1,
      border: (theme) => `1px solid ${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.13 : 0.08)}`,
      bgcolor: (theme) => alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.32 : 0.68),
      p: 0.8,
      minWidth: 0,
    }}>
      <Box sx={{ color: tone, display: 'flex' }}>{icon}</Box>
      <Typography sx={{ fontSize: 12, fontWeight: 850, color: 'text.secondary' }} noWrap>{label}</Typography>
      <Typography sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13.5, fontWeight: 950, color: tone, whiteSpace: 'nowrap' }}>
        {value}
      </Typography>
    </Box>
  )
}

function SignalMeter({
  label,
  value,
  tone,
  loading,
}: {
  label: string
  value: number
  tone: string
  loading?: boolean
}) {
  const pct = Math.max(0, Math.min(100, value || 0))
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.35 }}>
        <Typography sx={{ fontSize: 11, fontWeight: 900, color: 'text.secondary' }}>{label}</Typography>
        <Typography sx={{ fontSize: 11, fontWeight: 950, color: tone }}>{loading ? '--' : `${pct}%`}</Typography>
      </Box>
      <Box sx={{ height: 7, borderRadius: 999, bgcolor: alpha(tone, 0.12), overflow: 'hidden' }}>
        <Box sx={{ width: loading ? '18%' : `${pct}%`, height: '100%', borderRadius: 999, bgcolor: alpha(tone, loading ? 0.36 : 0.92) }} />
      </Box>
    </Box>
  )
}

function ProviderStrip({ providers }: { providers: Array<{ name: string; status: BrandProtectionProviderStatus }> }) {
  if (providers.length === 0) {
    return (
      <Typography sx={{ mt: 'auto', fontSize: 12, color: 'text.secondary' }}>
        {tOr('exposure.brand.noProviders', 'No provider telemetry configured yet.')}
      </Typography>
    )
  }

  return (
    <Box sx={{ mt: 'auto', display: 'flex', flexWrap: 'wrap', gap: 0.55 }}>
      {providers.slice(0, 5).map(({ name, status }) => {
        const ready = isProviderReady(status)
        const tone = ready ? colors.semantic.success : WARNING
        return (
          <Chip
            key={name}
            size="small"
            label={`${name} / ${status.status || (ready ? 'ready' : 'pending')}`}
            variant="outlined"
            sx={{
              height: 22,
              borderRadius: 1,
              fontSize: 11,
              fontWeight: 800,
              color: tone,
              borderColor: alpha(tone, 0.42),
              bgcolor: alpha(tone, 0.06),
            }}
          />
        )
      })}
    </Box>
  )
}

function EvidenceMatrix({
  agg,
  loading,
}: {
  agg: ReturnType<typeof useBrandAggShape>
  loading: boolean
}) {
  const tiles = [
    { label: tOr('exposure.brand.evidenceCoverage', 'Evidence coverage'), value: agg.evidenceCoverage, tone: agg.evidenceCoverage >= 70 ? colors.semantic.success : WARNING, icon: <Fingerprint size={15} /> },
    { label: tOr('exposure.brand.freshnessCoverage', 'Freshness coverage'), value: agg.freshnessCoverage, tone: agg.stale > 0 ? ALERT : colors.semantic.success, icon: <TimerReset size={15} /> },
    { label: tOr('exposure.brand.learningSignal', 'Learning signal'), value: agg.learningCoverage, tone: CONTROL, icon: <GitBranch size={15} /> },
    { label: tOr('exposure.brand.footprintCoverage', 'Footprint coverage'), value: agg.footprintCoverage, tone: ACCENT, icon: <Globe2 size={15} /> },
  ]

  return (
    <Box sx={{ minHeight: 230, display: 'grid', gridTemplateRows: 'auto 1fr', gap: 1.2 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 0.85 }}>
        {tiles.map(tile => (
          <AxisTile key={tile.label} {...tile} loading={loading} />
        ))}
      </Box>
      <Box sx={{
        borderRadius: 1,
        border: (theme) => `1px dashed ${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.2 : 0.14)}`,
        p: 1,
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' },
        gap: 0.8,
        alignItems: 'center',
      }}>
        <MiniReadout label={tOr('exposure.brand.visualSupported', 'Visual supported')} value={agg.visualSupported} tone={colors.semantic.success} />
        <MiniReadout label={tOr('exposure.brand.footprintLinked', 'Footprint linked')} value={agg.footprintLinked} tone={ACCENT} />
        <MiniReadout label={tOr('exposure.brand.missingEvidence', 'Missing evidence')} value={agg.missing} tone={agg.missing > 0 ? WARNING : colors.semantic.success} />
      </Box>
    </Box>
  )
}

function AxisTile({
  label,
  value,
  tone,
  icon,
  loading,
}: {
  label: string
  value: number
  tone: string
  icon: ReactNode
  loading: boolean
}) {
  return (
    <Box sx={{
      borderRadius: 1,
      border: `1px solid ${alpha(tone, 0.22)}`,
      bgcolor: alpha(tone, 0.055),
      p: 1,
      minWidth: 0,
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.7, minWidth: 0 }}>
          <Box sx={{ width: 26, height: 26, borderRadius: 1, display: 'grid', placeItems: 'center', bgcolor: alpha(tone, 0.14), color: tone }}>
            {icon}
          </Box>
          <Typography sx={{ fontSize: 12.2, fontWeight: 900, color: 'text.secondary' }} noWrap>{label}</Typography>
        </Box>
        <Typography sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 16, fontWeight: 950, color: tone }}>
          {loading ? '--' : `${value}%`}
        </Typography>
      </Box>
      <SignalMeter label="" value={value} tone={tone} loading={loading} />
    </Box>
  )
}

function MiniReadout({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <Box sx={{ display: 'grid', gap: 0.3, minWidth: 0 }}>
      <Typography sx={{ fontSize: 11.5, fontWeight: 850, color: 'text.secondary' }} noWrap>{label}</Typography>
      <Typography sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 20, fontWeight: 950, color: tone }}>
        {compactNumber(value)}
      </Typography>
    </Box>
  )
}

function severityTone(severity?: string): string {
  if (severity === 'critical') return ALERT
  if (severity === 'high') return WARNING
  if (severity === 'medium') return ACCENT
  return colors.semantic.success
}

function WorkflowFallback({
  series,
}: {
  series: Array<{ name: string; data: number[]; severity?: string }>
}) {
  const total = series.reduce((sum, item) => sum + (item.data[0] ?? 0), 0)
  return (
    <Box sx={{ minHeight: 230, display: 'grid', alignContent: 'center', gap: 1.15 }}>
      {series.map(item => {
        const value = item.data[0] ?? 0
        const pct = total > 0 ? Math.max(4, Math.round((value / total) * 100)) : 4
        const tone = severityTone(item.severity)
        return (
          <Box key={item.name} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 132px) 1fr 44px', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 900, color: 'text.secondary' }} noWrap>{item.name}</Typography>
            <Box sx={{ height: 10, borderRadius: 999, bgcolor: alpha(tone, 0.12), overflow: 'hidden' }}>
              <Box sx={{ width: `${pct}%`, height: '100%', borderRadius: 999, bgcolor: tone }} />
            </Box>
            <Typography sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, fontWeight: 950, color: tone, textAlign: 'right' }}>
              {value}
            </Typography>
          </Box>
        )
      })}
    </Box>
  )
}

function DecisionFallback({ data }: { data: DonutDatum[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0)
  return (
    <Box sx={{ minHeight: 230, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '130px 1fr' }, alignItems: 'center', gap: 1.5 }}>
      <Box sx={{
        width: 112,
        height: 112,
        mx: 'auto',
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        border: `12px solid ${alpha(CONTROL, 0.18)}`,
        boxShadow: `inset 0 0 0 2px ${alpha(ACCENT, 0.25)}`,
      }}>
        <Box sx={{ textAlign: 'center' }}>
          <Typography sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 24, fontWeight: 950, color: CONTROL }}>
            {total}
          </Typography>
          <Typography sx={{ fontSize: 11, fontWeight: 850, color: 'text.secondary' }}>
            {tOr('exposure.brand.cases', 'Cases')}
          </Typography>
        </Box>
      </Box>
      <Box sx={{ display: 'grid', gap: 0.7 }}>
        {data.map(item => {
          const tone = severityTone(item.severity)
          return (
            <Box key={item.label} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 1, alignItems: 'center' }}>
              <Typography sx={{ fontSize: 12.5, fontWeight: 900, color: 'text.secondary' }} noWrap>{item.label}</Typography>
              <Typography sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 14, fontWeight: 950, color: tone }}>
                {item.value}
              </Typography>
              <Box sx={{ gridColumn: '1 / -1', height: 7, borderRadius: 999, bgcolor: alpha(tone, 0.12), overflow: 'hidden' }}>
                <Box sx={{ width: `${total > 0 ? Math.max(5, (item.value / total) * 100) : 5}%`, height: '100%', borderRadius: 999, bgcolor: tone }} />
              </Box>
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}

function EmptyPanel({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <Box sx={{
      minHeight: 230,
      display: 'grid',
      placeItems: 'center',
      borderRadius: 1,
      border: (theme) => `1px dashed ${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.2 : 0.14)}`,
      bgcolor: (theme) => alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.35 : 0.68),
      textAlign: 'center',
      p: 2,
    }}>
      <Box sx={{ maxWidth: 360 }}>
        <Box sx={{ mx: 'auto', width: 38, height: 38, borderRadius: 1, display: 'grid', placeItems: 'center', bgcolor: alpha(ACCENT, 0.12), color: ACCENT, mb: 1 }}>
          {icon}
        </Box>
        <Typography sx={{ fontSize: 14, fontWeight: 950 }}>{title}</Typography>
        <Typography sx={{ mt: 0.5, fontSize: 12.5, color: 'text.secondary' }}>{body}</Typography>
      </Box>
    </Box>
  )
}

function BrandReviewBoard({
  items,
  agg,
  loading,
  providers,
}: {
  items: BrandQueueItem[]
  agg: ReturnType<typeof useBrandAggShape>
  loading: boolean
  providers: Array<{ name: string; status: BrandProtectionProviderStatus }>
}) {
  const top = items[0]

  return (
    <Box sx={{
      borderRadius: 1,
      border: '1px solid',
      borderColor: (theme) => alpha(ACCENT, theme.palette.mode === 'dark' ? 0.38 : 0.28),
      bgcolor: (theme) => alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.54 : 0.96),
      backgroundImage: (theme) => `
        linear-gradient(90deg, ${alpha(ACCENT, theme.palette.mode === 'dark' ? 0.055 : 0.024)} 1px, transparent 1px),
        linear-gradient(0deg, ${alpha(CONTROL, theme.palette.mode === 'dark' ? 0.045 : 0.02)} 1px, transparent 1px)
      `,
      backgroundSize: '34px 34px',
      overflow: 'hidden',
      minWidth: 0,
    }}>
      <Box sx={{
        px: { xs: 1.5, md: 2 },
        py: 1.35,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 1.25,
        flexWrap: 'wrap',
        borderBottom: '1px solid',
        borderColor: (theme) => alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.12 : 0.08),
        bgcolor: (theme) => alpha(ACCENT, theme.palette.mode === 'dark' ? 0.08 : 0.04),
      }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 16, fontWeight: 950, letterSpacing: 0 }}>
            {tOr('exposure.brand.managerQueue', 'Brand review queue')}
          </Typography>
          <Typography sx={{ mt: 0.25, fontSize: 12.5, color: 'text.secondary' }}>
            {tOr('exposure.brand.managerQueueSub', 'Review only rows with enough signal; similarity-only records stay in watch until evidence arrives.')}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.7, flexWrap: 'wrap' }}>
          <Chip size="small" label={`${workflowStageLabel('action_ready')} ${agg.actionReady}`} sx={{ borderRadius: 1, fontWeight: 900, bgcolor: alpha(ALERT, 0.1), color: ALERT }} />
          <Chip size="small" label={`${tOr('exposure.brand.authority.humanReview', 'Human review')} ${agg.humanReview}`} sx={{ borderRadius: 1, fontWeight: 900, bgcolor: alpha(WARNING, 0.1), color: WARNING }} />
          <Chip size="small" label={`${tOr('exposure.brand.confirmedPatterns', 'Confirmed patterns')} ${agg.confirmedLearning}`} sx={{ borderRadius: 1, fontWeight: 900, bgcolor: alpha(CONTROL, 0.1), color: CONTROL }} />
        </Box>
      </Box>

      <Box sx={{
        p: { xs: 1.25, md: 1.6 },
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.42fr) minmax(300px, 0.72fr)' },
        gap: 1.25,
        alignItems: 'stretch',
      }}>
        <Box sx={{ display: 'grid', gap: 0.85, alignContent: 'start', minWidth: 0 }}>
          {loading ? (
            Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} variant="rounded" height={72} />)
          ) : items.length > 0 ? (
            items.map(item => <QueueRow key={item.id} item={item} />)
          ) : (
            <EmptyPanel
              icon={<ShieldCheck size={18} />}
              title={tOr('exposure.brand.noManagerQueue', 'No brand rows need manager review')}
              body={tOr('exposure.brand.noManagerQueueBody', 'Engineer mode can still collect new evidence and promote future candidates.')}
            />
          )}
          {!loading && <QueueTriageStrip agg={agg} />}
        </Box>

        <Box sx={{
          borderRadius: 1,
          border: (theme) => `1px solid ${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.13 : 0.08)}`,
          bgcolor: (theme) => alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.52 : 0.82),
          p: 1.25,
          display: 'grid',
          gap: 1,
          alignContent: 'start',
          minWidth: 0,
        }}>
          <Typography sx={{ fontSize: 14, fontWeight: 950, display: 'flex', alignItems: 'center', gap: 0.8 }}>
            <Radar size={16} color={ACCENT} />
            {tOr('exposure.brand.commandReadout', 'Command readout')}
          </Typography>
          {top ? (
            <>
              <Box sx={{ borderRadius: 1, p: 1, border: `1px solid ${alpha(stageTone(top.stage), 0.24)}`, bgcolor: alpha(stageTone(top.stage), 0.07) }}>
                <Typography sx={{ fontSize: 11.5, fontWeight: 900, color: 'text.secondary' }}>
                  {workflowStageLabel(top.stage)}
                </Typography>
                <Typography sx={{ mt: 0.25, fontSize: 18, fontWeight: 950, overflowWrap: 'anywhere' }}>
                  {`${tOr('exposure.brand.selectedTarget', 'Selected')} / ${top.title}`}
                </Typography>
                <Typography sx={{ mt: 0.35, fontSize: 12, color: 'text.secondary', overflowWrap: 'anywhere' }}>
                  {top.subtitle}
                </Typography>
              </Box>
              <Box sx={{ display: 'grid', gap: 0.7 }}>
                <SignalMeter label={tOr('exposure.brand.relationshipScore', 'Relationship score')} value={top.item.relationship_score ?? 0} tone={ACCENT} />
                <SignalMeter label={tOr('exposure.brand.intentScore', 'Intent score')} value={top.item.intent_score ?? 0} tone={(top.item.intent_score ?? 0) > 70 ? ALERT : WARNING} />
                <SignalMeter label={tOr('exposure.brand.confidence', 'Confidence')} value={top.item.confidence ?? 0} tone={CONTROL} />
              </Box>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6 }}>
                {top.item.evidence_axes?.slice(0, 6).map(axis => (
                  <Chip
                    key={axis.key}
                    size="small"
                    label={`${axis.label}: ${axis.status}`}
                    variant="outlined"
                    sx={{
                      height: 23,
                      borderRadius: 1,
                      fontSize: 11,
                      fontWeight: 800,
                      color: axis.status === 'missing' ? WARNING : colors.semantic.success,
                      borderColor: alpha(axis.status === 'missing' ? WARNING : colors.semantic.success, 0.38),
                    }}
                  />
                ))}
              </Box>
            </>
          ) : (
            <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>
              {tOr('exposure.brand.noCommandReadout', 'No active review target.')}
            </Typography>
          )}
          <ProviderStrip providers={providers} />
        </Box>
      </Box>
    </Box>
  )
}

function QueueTriageStrip({ agg }: { agg: ReturnType<typeof useBrandAggShape> }) {
  const cards = [
    {
      label: tOr('exposure.brand.evidenceDebt', 'Evidence debt'),
      value: agg.missing,
      body: tOr('exposure.brand.evidenceDebtBody', 'Missing proof blocks automated authority.'),
      tone: agg.missing > 0 ? WARNING : colors.semantic.success,
    },
    {
      label: tOr('exposure.brand.reviewGate', 'Review gate'),
      value: agg.humanReview,
      body: tOr('exposure.brand.reviewGateBody', 'Human-review rows stay out of machine takedown.'),
      tone: agg.humanReview > 0 ? WARNING : colors.semantic.success,
    },
    {
      label: tOr('exposure.brand.learningMemory', 'Learning memory'),
      value: agg.confirmedLearning,
      body: tOr('exposure.brand.learningMemoryBody', 'Confirmed feedback sharpens future candidates.'),
      tone: CONTROL,
    },
  ]

  return (
    <Box sx={{ mt: 0.2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 0.75 }}>
      {cards.map(card => (
        <Box
          key={card.label}
          sx={{
            borderRadius: 1,
            border: `1px solid ${alpha(card.tone, 0.2)}`,
            bgcolor: alpha(card.tone, 0.055),
            p: 0.9,
            minWidth: 0,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 950, color: card.tone }} noWrap>{card.label}</Typography>
            <Typography sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 18, fontWeight: 950, color: card.tone }}>
              {compactNumber(card.value)}
            </Typography>
          </Box>
          <Typography sx={{ mt: 0.3, fontSize: 11.5, color: 'text.secondary', lineHeight: 1.35 }}>
            {card.body}
          </Typography>
        </Box>
      ))}
    </Box>
  )
}

function QueueRow({ item }: { item: BrandQueueItem }) {
  const tone = stageTone(item.stage)
  return (
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: { xs: '30px minmax(0, 1fr)', md: '30px minmax(0, 1fr) minmax(76px, 0.14fr)' },
      gap: 1,
      alignItems: 'center',
      borderRadius: 1,
      border: '1px solid',
      borderColor: alpha(tone, 0.22),
      bgcolor: (theme) => alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.52 : 0.86),
      px: 1,
      py: 0.95,
      boxShadow: `inset 3px 0 0 ${alpha(tone, 0.72)}`,
      minWidth: 0,
    }}>
      <Box sx={{ width: 24, height: 24, borderRadius: 1, display: 'grid', placeItems: 'center', bgcolor: alpha(tone, 0.14), color: tone }}>
        {item.severity === 'critical' ? <AlertTriangle size={14} /> : <Search size={14} />}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 13.5, fontWeight: 950, color: 'text.primary', overflowWrap: 'anywhere' }}>
          {item.title}
        </Typography>
        <Typography sx={{ mt: 0.25, fontSize: 12, color: 'text.secondary', overflowWrap: 'anywhere' }}>
          {item.subtitle}
        </Typography>
        <Box sx={{ mt: 0.5, display: 'flex', flexWrap: 'wrap', gap: 0.45 }}>
          {item.meta.map(meta => (
            <Chip
              key={meta}
              size="small"
              label={meta}
              sx={{
                height: 21,
                borderRadius: 1,
                fontSize: 10.5,
                fontWeight: 800,
                bgcolor: alpha(tone, 0.08),
                color: tone,
              }}
            />
          ))}
        </Box>
      </Box>
      <Typography sx={{ display: { xs: 'none', md: 'block' }, justifySelf: 'end', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 18, fontWeight: 950, color: tone }}>
        {item.value}
      </Typography>
    </Box>
  )
}

function BrandRunbook({ agg, loading }: { agg: ReturnType<typeof useBrandAggShape>; loading: boolean }) {
  const steps = [
    {
      label: tOr('exposure.brand.runbook.confirmEvidence', 'Confirm evidence chain'),
      body: tOr('exposure.brand.runbook.confirmEvidenceBody', 'Tie similarity, footprint context, visual reference, and abuse intent before calling a brand-abuse case.'),
      tone: agg.missing > 0 ? WARNING : colors.semantic.success,
    },
    {
      label: tOr('exposure.brand.runbook.routeHuman', 'Route human decisions'),
      body: tOr('exposure.brand.runbook.routeHumanBody', 'Rows marked human review should not become machine cases until feedback is recorded.'),
      tone: agg.humanReview > 0 ? WARNING : colors.semantic.success,
    },
    {
      label: tOr('exposure.brand.runbook.refreshStale', 'Refresh stale evidence'),
      body: tOr('exposure.brand.runbook.refreshStaleBody', 'Stale candidates stay visible, but do not carry automated takedown authority.'),
      tone: agg.stale > 0 ? ALERT : colors.semantic.success,
    },
  ]

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1 }}>
      {steps.map((step, index) => (
        <Box
          key={step.label}
          sx={{
            borderRadius: 1,
            border: `1px solid ${alpha(step.tone, 0.22)}`,
            bgcolor: alpha(step.tone, 0.055),
            p: 1.25,
            minWidth: 0,
          }}
        >
          <Typography sx={{ fontSize: 12, fontWeight: 950, color: step.tone }}>
            {loading ? '--' : `${index + 1}. ${step.label}`}
          </Typography>
          <Typography sx={{ mt: 0.45, fontSize: 12.4, color: 'text.secondary', lineHeight: 1.45 }}>
            {step.body}
          </Typography>
        </Box>
      ))}
    </Box>
  )
}
