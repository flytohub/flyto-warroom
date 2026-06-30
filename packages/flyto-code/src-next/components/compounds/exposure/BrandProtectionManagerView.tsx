import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Box, Chip, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { AlertTriangle, CheckCircle2, GitBranch, Search, ShieldAlert } from 'lucide-react'

import { useOrg } from '@hooks/useOrg'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { colors } from '@/styles/designTokens'
import {
  ManagerDashboard,
  KpiCard,
  ManagerActionList,
  ManagerHero,
  HeroStat,
} from '@compounds/_shared'
import { getBrandProtection, type AttackSurfaceAsset, type BrandProtectionCase } from '@lib/engine/code/pentest'

const ACCENT = colors.semantic.warning

interface BrandManagerRow {
  item: BrandProtectionCase
  asset: AttackSurfaceAsset
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

function learningLabel(state?: string): string {
  switch (state) {
    case 'confirmed_pattern': return 'confirmed learning'
    case 'known_pattern': return 'known pattern'
    case 'suppressed_pattern': return 'suppressed pattern'
    case 'new': return 'new pattern'
    default: return state || 'new pattern'
  }
}

function freshnessLabel(status?: string): string {
  switch (status) {
    case 'fresh': return 'fresh'
    case 'due': return 'refresh due'
    case 'stale': return 'stale'
    case 'unknown': return 'unknown freshness'
    default: return status || 'unknown freshness'
  }
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

  const agg = useMemo(() => {
    let actionReady = 0
    let needsEvidence = 0
    let watch = 0
    let closed = 0
    let footprintLinked = 0
    let visualSupported = 0
    let similarityOnly = 0
    let missing = 0
    for (const { item } of rows) {
      const stage = workflowStage(item)
      if (stage === 'action_ready') actionReady++
      else if (stage === 'needs_evidence') needsEvidence++
      else if (stage === 'closed') closed++
      else watch++
      if (item.footprint_context?.surface_resource_id || item.footprint_context?.footprint_entity_id) footprintLinked++
      if ((item.visual_evidence?.logo_similarity ?? 0) >= 85 || item.visual_evidence?.logo_match || (item.visual_evidence?.page_similarity ?? 0) >= 80 || (item.reference_matches ?? []).length > 0 || !!item.ocr_evidence?.brand_match) visualSupported++
      if (item.verdict === 'similar_domain_only' || item.domain_similarity_class === 'high') similarityOnly++
      missing += missingEvidenceCount(item)
    }
    const total = rows.length
    const quality = data?.quality
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
      score: quality?.score ?? (total ? Math.round(((visualSupported + footprintLinked) / (total * 2)) * 100) : 100),
      grade: quality?.grade ?? '',
      footprintCoverage: quality?.footprint_coverage ?? (total ? Math.round((footprintLinked / total) * 100) : 0),
      evidenceCoverage: quality?.evidence_coverage ?? (total ? Math.round(((visualSupported + footprintLinked) / (total * 2)) * 100) : 0),
      freshnessCoverage: quality?.freshness_coverage ?? 0,
      learningCoverage: quality?.learning_coverage ?? 0,
      humanReview: quality?.human_review_count ?? needsEvidence,
      machineCases: quality?.machine_case_count ?? 0,
      stale: quality?.stale_count ?? rows.filter(({ item }) => item.freshness?.status === 'stale').length,
    }
  }, [data?.quality, rows])

  const queue = useMemo(() => {
    const severityRank: Record<string, number> = { action_ready: 4, needs_evidence: 3, watch: 2, closed: 1 }
    return [...rows]
      .filter(({ item }) => workflowStage(item) !== 'closed')
      .sort((a, b) => {
        const stageDiff = (severityRank[workflowStage(b.item)] ?? 0) - (severityRank[workflowStage(a.item)] ?? 0)
        if (stageDiff) return stageDiff
        return (b.item.confidence ?? 0) - (a.item.confidence ?? 0)
      })
      .slice(0, 6)
      .map(({ item, asset }) => {
        const stage = workflowStage(item)
        const severity = stage === 'action_ready' ? 'high' as const : stage === 'needs_evidence' ? 'medium' as const : 'low' as const
        return {
          id: item.id || asset.id,
          title: displayValue(item),
          subtitle: item.decision_authority?.label || verdictLabel(item.verdict),
          meta: `${stage.replaceAll('_', ' ')} · ${freshnessLabel(item.freshness?.status)} · ${learningLabel(item.learning_context?.state)} · ${missingEvidenceCount(item)} missing`,
          value: `${item.confidence}%`,
          severity,
        }
      })
  }, [rows])

  return (
    <ManagerDashboard
      title={t('exposure.brand.title')}
      subtitle={t('exposure.brand.subtitle')}
      accent={ACCENT}
      titleIcon={<ShieldAlert size={20} />}
      layout="hero-split"
      hero={
        <ManagerHero
          accent={ACCENT}
          icon={<ShieldAlert size={15} />}
          minHeight={190}
          headline={{
            label: t('exposure.brand.managerHeadline'),
            value: isLoading ? '—' : agg.score,
            delta: (
              <Chip
                size="small"
                icon={agg.stale > 0 ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}
                label={agg.grade || (agg.stale > 0 ? 'needs refresh' : 'quality')}
                sx={{
                  fontWeight: 800,
                  fontSize: 12,
                  bgcolor: alpha(agg.stale > 0 ? colors.semantic.danger : colors.semantic.success, 0.12),
                  color: agg.stale > 0 ? colors.semantic.danger : colors.semantic.success,
                  '& .MuiChip-icon': { color: 'inherit' },
                }}
              />
            ),
            sub: isLoading
              ? t('hardcoded.loading.evidence.posture.c5115c20')
              : `${agg.humanReview} row(s) require analyst judgment; ${agg.machineCases} machine case(s) passed the precision gate.`,
          }}
          aside={
            <Box>
              <HeroStat icon={<ShieldAlert size={14} />} tone={colors.semantic.danger} label={t('hardcoded.action.ready.f94562fa')} value={agg.actionReady} />
              <HeroStat icon={<GitBranch size={14} />} tone={colors.semantic.info} label="Footprint" value={`${agg.footprintCoverage}%`} />
              <HeroStat icon={<CheckCircle2 size={14} />} tone={colors.semantic.success} label="Learning" value={`${agg.learningCoverage}%`} />
            </Box>
          }
        />
      }
      kpis={
        <>
          <KpiCard label={t('hardcoded.human.review.40176d93')} value={agg.humanReview} loading={isLoading} icon={<Search size={15} />} tone={ACCENT} />
          <KpiCard label={t('hardcoded.fresh.evidence.58076a0c')} value={agg.freshnessCoverage} unit="%" loading={isLoading} icon={<CheckCircle2 size={15} />} tone={agg.stale > 0 ? colors.semantic.danger : colors.semantic.success} />
          <KpiCard label={t('hardcoded.learning.coverage.88106ac2')} value={agg.learningCoverage} unit="%" loading={isLoading} icon={<GitBranch size={15} />} tone={colors.semantic.info} />
          <KpiCard label={t('hardcoded.similarity.only.watch.140f47b7')} value={agg.similarityOnly} loading={isLoading} icon={<AlertTriangle size={15} />} tone={colors.semantic.info} />
        </>
      }
      workItems={
        <ManagerActionList
          title={t('exposure.brand.managerQueue')}
          subtitle={t('exposure.brand.managerQueueSub')}
          items={queue}
          emptyText={t('exposure.brand.noManagerQueue')}
          actionLabel={t('common.review')}
        />
      }
      narrative={
        <Box sx={{
          border: '1px solid',
          borderColor: alpha(ACCENT, 0.24),
          borderRadius: 1,
          p: 2,
          bgcolor: alpha(ACCENT, 0.06),
        }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.5 }}>
            Evidence posture
          </Typography>
          <Typography variant="body2" color="text.secondary">
            High-similarity domains stay in watch or needs-evidence until relationship and abuse intent are both supported. Confirmed and suppressed feedback now feed campaign learning, while stale rows stay out of machine-case authority.
          </Typography>
        </Box>
      }
    />
  )
}
