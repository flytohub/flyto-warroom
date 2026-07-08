/**
 * FootprintManagerView - manager-mode EASM decision surface.
 *
 * This view is intentionally not a graph. Managers need one calm answer first:
 * what changed, what is exploitable, and whether the evidence is trustworthy.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import { alpha, useTheme } from '@mui/material/styles'
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Database,
  FileText,
  GitBranch,
  Network,
  Radar,
  Shield,
  ShieldCheck,
  Target,
  Zap,
} from 'lucide-react'

import { type Severity } from '@lib/tokens/severity'
import { tOr } from '@lib/i18n'
import { colors } from '@/styles/designTokens'

import {
  getFootprintTimeseries,
  getFootprintActionable,
  getFootprintNarrative,
  getPostureHeadline,
} from '@lib/engine/code/footprintGraph'
import {
  getFootprintSurface,
  getBOYAttackPathCandidates,
  getBOYBreakthroughPaths,
  getCandidatePaths,
  researchFootprintCandidateSelector,
  researchFootprintPathSelector,
  researchFootprintSubjectSelector,
  type ResearchFootprintSelector,
} from '@lib/engine/code/footprintSurface'
import { qk } from '@lib/queryKeys'
import { ResearchFootprintDrawer } from './ResearchFootprintDrawer'
import { DataBoundary } from '@atoms/DataBoundary'

interface Props {
  orgId: string
}

interface FootprintVerdictDatum {
  label: string
  value: number
  severity: Severity
}

interface PriorityItem {
  eyebrow: string
  title: string
  detail: string
  value: string
  tone: string
  icon: ReactNode
}

interface OpsMetric {
  icon: ReactNode
  label: string
  value: string | number
  detail: string
  tone: string
}

const TIER_META: Record<string, { label: string; labelKey: string; severity: Severity }> = {
  red_team_actionable: {
    label: '紅隊可利用',
    labelKey: 'footprint.tier.redTeamActionable',
    severity: 'critical',
  },
  needs_more_evidence: {
    label: '需要補證據',
    labelKey: 'footprint.tier.needsEvidence',
    severity: 'high',
  },
  informational: {
    label: '情報參考',
    labelKey: 'footprint.tier.informational',
    severity: 'medium',
  },
  rejected: {
    label: '已排除',
    labelKey: 'footprint.tier.rejected',
    severity: 'low',
  },
}

function dayKey(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

function copy(key: string, fallback: string): string {
  return tOr(key, fallback)
}

export function FootprintManagerView({ orgId }: Props) {
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const [researchSelector, setResearchSelector] = useState<ResearchFootprintSelector | null>(null)

  const tsQ = useQuery({
    queryKey: qk.footprint.timeseries(orgId),
    queryFn: () => getFootprintTimeseries(orgId),
    enabled: !!orgId,
    staleTime: 60_000,
  })
  const actQ = useQuery({
    queryKey: qk.footprint.actionable(orgId, 'any', 200),
    queryFn: () => getFootprintActionable(orgId, 'any', 200),
    enabled: !!orgId,
    staleTime: 60_000,
  })
  const noiseQ = useQuery({
    queryKey: qk.footprint.surface(orgId, 'noise'),
    queryFn: () => getFootprintSurface(orgId, 'noise'),
    enabled: !!orgId,
    staleTime: 60_000,
  })
  const pathsQ = useQuery({
    queryKey: qk.footprint.candidatePaths(orgId, 50),
    queryFn: () => getCandidatePaths(orgId, 50),
    enabled: !!orgId,
    staleTime: 60_000,
  })
  const boyQ = useQuery({
    queryKey: qk.footprint.breakthroughCandidates(orgId, 50),
    queryFn: () => getBOYAttackPathCandidates(orgId, 50),
    enabled: !!orgId,
    staleTime: 60_000,
  })
  const breakthroughPathsQ = useQuery({
    queryKey: qk.footprint.breakthroughPaths(orgId, 50),
    queryFn: () => getBOYBreakthroughPaths(orgId, 50),
    enabled: !!orgId,
    staleTime: 60_000,
  })
  const narrQ = useQuery({
    queryKey: qk.footprint.narrative(orgId),
    queryFn: () => getFootprintNarrative(orgId),
    enabled: !!orgId,
    staleTime: 5 * 60_000,
    retry: false,
  })
  const postureQ = useQuery({
    queryKey: qk.footprint.postureHeadline(orgId),
    queryFn: () => getPostureHeadline(orgId),
    enabled: !!orgId,
    staleTime: 60_000,
    retry: false,
  })

  const exposure = useMemo(() => {
    const signals = (tsQ.data?.signals ?? []).filter((s) => s.signal === 'newly_exposed')
    const byDay = new Map<string, number>()
    for (const s of signals) {
      const k = dayKey(s.first_seen_at)
      if (!k) continue
      byDay.set(k, (byDay.get(k) ?? 0) + 1)
    }
    const days = [...byDay.keys()].sort()
    const values = days.map((d) => byDay.get(d) ?? 0)
    const last = values.length ? values[values.length - 1] : 0
    const prev = values.length > 1 ? values[values.length - 2] : null
    return { values, last, prev, total: signals.length }
  }, [tsQ.data])

  const verdictRows: FootprintVerdictDatum[] = useMemo(() => {
    const findings = actQ.data?.findings ?? []
    const counts = new Map<string, number>()
    for (const f of findings) counts.set(f.tier, (counts.get(f.tier) ?? 0) + 1)
    return Object.entries(TIER_META)
      .map(([tier, meta]) => ({
        label: copy(meta.labelKey, meta.label),
        value: counts.get(tier) ?? 0,
        severity: meta.severity,
      }))
      .filter((d) => d.value > 0)
  }, [actQ.data])

  const brandBar = useMemo(() => {
    const items = noiseQ.data?.items ?? []
    const byType = new Map<string, number>()
    for (const it of items) {
      const key = it.Type || 'unknown'
      byType.set(key, (byType.get(key) ?? 0) + 1)
    }
    const entries = [...byType.entries()].sort((a, b) => b[1] - a[1])
    return {
      categories: entries.map((e) => e[0]),
      values: entries.map((e) => e[1]),
      total: items.length,
    }
  }, [noiseQ.data])

  const actionableCount = useMemo(
    () => (actQ.data?.findings ?? []).filter((f) => f.tier === 'red_team_actionable').length,
    [actQ.data],
  )

  const topPath = useMemo(() => {
    const paths = pathsQ.data?.paths ?? []
    if (paths.length === 0) return null
    return [...paths].sort((a, b) => (b.score - a.score) || (a.hops - b.hops))[0]
  }, [pathsQ.data])

  const topBreakthrough = useMemo(() => {
    const candidates = boyQ.data?.candidates ?? []
    if (candidates.length === 0) return null
    return [...candidates].sort((a, b) => (
      (b.priority_score - a.priority_score) || (b.updated_at || '').localeCompare(a.updated_at || '')
    ))[0]
  }, [boyQ.data])

  const topBreakthroughPath = useMemo(() => {
    const paths = breakthroughPathsQ.data?.paths ?? []
    if (paths.length === 0) return null
    return [...paths].sort((a, b) => (
      (b.priority_score - a.priority_score) || (b.updated_at || '').localeCompare(a.updated_at || '')
    ))[0]
  }, [breakthroughPathsQ.data])

  const validatedBreakthroughs = useMemo(
    () => (
      (breakthroughPathsQ.data?.paths ?? []).filter((c) => c.state === 'validated').length
      || (boyQ.data?.candidates ?? []).filter((c) => c.state === 'validated').length
    ),
    [boyQ.data, breakthroughPathsQ.data],
  )
  const blockedBreakthroughs = useMemo(
    () => (breakthroughPathsQ.data?.paths ?? []).filter((p) => p.missing_evidence > 0 || p.state === 'needs_validation').length,
    [breakthroughPathsQ.data],
  )
  const acceptedRiskBreakthroughs = useMemo(
    () => (
      (breakthroughPathsQ.data?.paths ?? []).filter((p) => p.state === 'accepted_risk').length
      || (boyQ.data?.candidates ?? []).filter((c) => c.state === 'accepted_risk').length
    ),
    [boyQ.data, breakthroughPathsQ.data],
  )

  const topResearchSelector = useMemo<ResearchFootprintSelector | null>(() => {
    if (topBreakthroughPath) return researchFootprintPathSelector(topBreakthroughPath)
    if (topBreakthrough) return researchFootprintCandidateSelector(topBreakthrough)
    if (topPath) return researchFootprintSubjectSelector(topPath.type, topPath.value)
    return null
  }, [topBreakthrough, topBreakthroughPath, topPath])

  const loading = tsQ.isLoading || actQ.isLoading
  const primaryError = tsQ.error ?? actQ.error
  const partialError = noiseQ.error ?? pathsQ.error ?? boyQ.error ?? breakthroughPathsQ.error ?? narrQ.error ?? postureQ.error

  const accent = colors.section.exposure
  const warning = colors.severity.medium
  const danger = colors.severity.high
  const success = colors.semantic.success
  const totalBreakthroughs = breakthroughPathsQ.data
    ? (breakthroughPathsQ.data.paths?.length ?? 0)
    : boyQ.data
      ? (boyQ.data.candidates?.length ?? 0)
      : 0
  const candidateChains = pathsQ.data?.paths?.length ?? 0
  const healthRatio = normalizePercent(postureQ.data?.health_ratio)
  const healthLabel = healthRatio == null ? '--' : `${healthRatio}%`
  const exposureDelta = exposure.prev != null ? exposure.last - exposure.prev : null
  const leadCount = actQ.data?.findings?.length ?? 0
  const verdictTotal = verdictRows.reduce((sum, row) => sum + row.value, 0)
  const brandRows = brandBar.categories.map((category, index) => ({
    label: category,
    value: brandBar.values[index] ?? 0,
  })).slice(0, 5)

  const topScore = topBreakthroughPath
    ? Math.round(topBreakthroughPath.priority_score)
    : topBreakthrough
      ? Math.round(topBreakthrough.priority_score)
      : topPath
        ? Math.round(topPath.score)
        : null
  const focusSubject = topBreakthroughPath?.subject_value ?? topBreakthrough?.subject_value ?? topPath?.value ?? null
  const focusState = topBreakthroughPath
    ? `${humanState(topBreakthroughPath.state)} / ${topBreakthroughPath.missing_evidence} ${copy('footprint.managerView.missingEvidence', '項證據缺口')}`
    : topBreakthrough
      ? `${humanState(topBreakthrough.state)} / ${humanState(topBreakthrough.recommended_verifier)}`
      : topPath
        ? `${topPath.hops} 跳 / ${topPath.distinctSources} 個來源`
        : null

  const readinessCount = sourceCount(tsQ.data, actQ.data, noiseQ.data, pathsQ.data)
  const readinessText = `${readinessCount}/4`
  const decisionTone = actionableCount > 0 || blockedBreakthroughs > 0
    ? danger
    : totalBreakthroughs > 0 || candidateChains > 0 || exposure.last > 0
      ? warning
      : success
  const decisionLabel = actionableCount > 0
    ? copy('footprint.managerView.decision.actNow', '立即處置')
    : blockedBreakthroughs > 0
      ? copy('footprint.managerView.decision.collectEvidence', '補齊證據')
      : candidateChains > 0 || totalBreakthroughs > 0
        ? copy('footprint.managerView.decision.validatePath', '驗證路徑')
        : copy('footprint.managerView.decision.monitor', '持續監控')
  const narrativeText = narrQ.isLoading
    ? copy('footprint.managerView.generatingNarrative', '正在整理攻擊者敘事...')
    : narrQ.data?.narrative
      ? narrQ.data.narrative
      : loading
        ? copy('footprint.managerView.loadingSurfaceData', '正在讀取攻擊面資料...')
        : copy('footprint.managerView.narrativeEmpty', '目前沒有足夠的外部曝露訊號可形成敘事。')

  const priorityItems: PriorityItem[] = [
    {
      eyebrow: copy('footprint.managerView.topBreakthrough', '最可能突破點'),
      title: focusSubject ?? copy('footprint.managerView.noCandidateTitle', '尚未找到高可信突破點'),
      detail: focusState ?? copy('footprint.managerView.noCandidateDesc', '目前沒有足夠的鏈路可支撐管理層決策。'),
      value: topScore == null ? '--' : `${topScore}/100`,
      tone: decisionTone,
      icon: <Target size={15} />,
    },
    {
      eyebrow: copy('footprint.managerView.ownershipVerdicts', '所有權判定'),
      title: verdictRows[0]?.label ?? copy('footprint.managerView.empty.classifiedLeads', '尚無已分類線索'),
      detail: `${verdictTotal} ${copy('footprint.managerView.classifiedItems', '筆判定')} / ${leadCount} 筆線索`,
      value: String(verdictTotal),
      tone: verdictTotal > 0 ? accent : success,
      icon: <FileText size={15} />,
    },
    {
      eyebrow: copy('footprint.managerView.brandImpersonation', '品牌仿冒'),
      title: brandRows[0]?.label ?? copy('footprint.managerView.empty.lookalikeHosts', '尚未偵測到仿冒主機'),
      detail: `${brandBar.total} ${copy('footprint.managerView.surfaceNoiseSignals', '個外部噪音訊號')}`,
      value: String(brandBar.total),
      tone: brandBar.total > 0 ? warning : success,
      icon: <AlertTriangle size={15} />,
    },
  ]
  const opsMetrics: OpsMetric[] = [
    {
      icon: <Network size={15} />,
      label: copy('footprint.managerView.newExposuresShort', '新增曝露'),
      value: exposure.values.length ? exposure.last : '--',
      detail: `${exposure.total} 總數`,
      tone: exposure.last > 0 ? warning : success,
    },
    {
      icon: <Radar size={15} />,
      label: copy('footprint.managerView.redTeamShort', '紅隊可用'),
      value: actionableCount,
      detail: `${leadCount} 筆線索`,
      tone: actionableCount > 0 ? danger : success,
    },
    {
      icon: <GitBranch size={15} />,
      label: copy('footprint.managerView.breakthroughsShort', '突破路徑'),
      value: totalBreakthroughs,
      detail: `${validatedBreakthroughs} ${copy('footprint.managerView.validated', '已驗證')}`,
      tone: totalBreakthroughs > 0 ? accent : success,
    },
    {
      icon: <AlertTriangle size={15} />,
      label: copy('footprint.managerView.validationBlockedShort', '證據缺口'),
      value: blockedBreakthroughs,
      detail: `${acceptedRiskBreakthroughs} ${copy('footprint.managerView.acceptedRisk', '已接受風險')}`,
      tone: blockedBreakthroughs > 0 ? danger : success,
    },
    {
      icon: <Shield size={15} />,
      label: copy('footprint.managerView.healthyRatioShort', '健康比例'),
      value: healthLabel,
      detail: postureQ.data ? copy('footprint.managerView.backendPosture', '後端姿態') : copy('footprint.managerView.empty.postureData', '尚無姿態資料'),
      tone: healthRatio != null && healthRatio < 70 ? warning : success,
    },
  ]

  if ((loading || primaryError) && !tsQ.data && !actQ.data) {
    return (
      <Box sx={{ height: '100%', display: 'grid', placeItems: 'center', p: 3 }}>
        <DataBoundary
          isLoading={loading}
          isError={!!primaryError}
          error={primaryError}
          hasData={false}
          label="attack surface"
          loadingVariant="spinner"
        >
          <span />
        </DataBoundary>
      </Box>
    )
  }

  return (
    <Box
      sx={{
        '--fp-bg': isDark ? '#08111f' : '#f5f7fb',
        '--fp-panel': isDark ? '#0f172a' : '#ffffff',
        '--fp-panel-soft': isDark ? '#111c2d' : '#f8fafc',
        '--fp-console': isDark ? '#07111f' : '#0c1627',
        '--fp-console-soft': isDark ? '#0d1a2b' : '#111d31',
        '--fp-border': isDark ? alpha('#94a3b8', 0.16) : alpha('#0f172a', 0.11),
        '--fp-border-strong': isDark ? alpha('#67e8f9', 0.22) : alpha('#0e7490', 0.22),
        '--fp-muted': isDark ? '#94a3b8' : '#64748b',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        p: { xs: 1.2, lg: 1.55 },
        display: 'grid',
        gridTemplateRows: 'auto auto minmax(0, 1fr)',
        gap: 1.15,
        bgcolor: 'var(--fp-bg)',
        backgroundImage: isDark
          ? 'linear-gradient(rgba(103,232,249,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(103,232,249,.04) 1px, transparent 1px), radial-gradient(circle at 15% 0%, rgba(14,165,233,.14), transparent 32%)'
          : 'linear-gradient(rgba(14,116,144,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(14,116,144,.045) 1px, transparent 1px), linear-gradient(135deg, #f8fbff 0%, #f4f7fb 48%, #eef5ff 100%)',
        backgroundSize: '32px 32px, 32px 32px, auto',
      }}
    >
      <Box
        sx={{
          px: 0.15,
          py: 0.2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          flexWrap: 'wrap',
        }}
      >
        <Box sx={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 1.1 }}>
          <IconFrame tone={accent}>
            <Radar size={21} />
          </IconFrame>
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h2" sx={{ fontSize: 24, fontWeight: 950, lineHeight: 1.02 }} noWrap>
              {copy('footprint.managerView.commandTitle', '攻擊面戰情室')}
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {copy('footprint.managerView.commandSubtitle', '外部曝露、可利用線索與證據缺口的作戰態勢')}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.75, justifyContent: { xs: 'flex-start', lg: 'flex-end' }, flexWrap: 'wrap' }}>
          <StatusChip icon={<Shield size={13} />} label={decisionLabel} tone={decisionTone} />
          <StatusChip icon={<Database size={13} />} label={`${copy('footprint.managerView.dataReadiness', '資料可信度')} ${readinessText}`} tone={readinessCount >= 3 ? success : warning} />
          <StatusChip icon={<GitBranch size={13} />} label={`${copy('footprint.managerView.chains', '路徑')} ${candidateChains}`} tone={candidateChains > 0 ? accent : success} />
        </Box>
      </Box>

      {partialError && (
        <Alert severity="warning" variant="outlined" sx={{ borderRadius: 1 }}>
          {copy('footprint.managerView.partialRefreshFailed', '部分攻擊面資料更新失敗，畫面已保留目前可用資料。')}
        </Alert>
      )}

      <CommandBoard
        accent={decisionTone}
        title={focusSubject ?? copy('footprint.managerView.noCandidateTitle', '尚未找到高可信突破點')}
        subtitle={focusState ?? copy('footprint.managerView.noCandidateDesc', '目前外部訊號不足以形成可執行突破路徑，先維持監控與證據收斂。')}
        score={topScore == null ? decisionLabel : `${topScore}/100`}
        decisionLabel={decisionLabel}
        exposureDelta={exposureDelta}
        exposureDeltaLabel={copy('footprint.managerView.newExposureDelta', '新增變化')}
        warningTone={warning}
        successTone={success}
        actionLabel={copy('footprint.managerView.openResearchFootprint', '開啟研究足跡')}
        onAction={topResearchSelector ? () => setResearchSelector(topResearchSelector) : undefined}
        metrics={opsMetrics}
      />

      <Box
        sx={{
          minHeight: 0,
          overflow: 'hidden',
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.35fr) minmax(360px, 0.65fr)' },
          gap: 1.15,
        }}
      >
        <Box sx={{ minHeight: 0, display: 'grid', overflow: 'hidden' }}>
          <SectionPanel
            title={copy('footprint.managerView.priorityQueue', '攻擊面優先序')}
            icon={<Zap size={16} />}
            accent={accent}
            right={`${priorityItems.length}`}
            bodySx={{ minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
          >
            <Box sx={{ minHeight: 0, overflow: 'auto', display: 'grid', alignContent: 'start', gap: 0.85, pr: 0.25 }}>
              {priorityItems.map((item) => (
                <PriorityRow key={item.eyebrow} item={item} />
              ))}

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 0.85, mt: 0.15 }}>
                <BreakdownPanel
                  title={copy('footprint.managerView.ownershipVerdicts', '所有權判定')}
                  empty={copy('footprint.managerView.empty.classifiedLeads', '尚無已分類線索')}
                  rows={verdictRows.map((row) => ({
                    label: row.label,
                    value: row.value,
                    tone: severityColor(row.severity),
                    total: Math.max(verdictTotal, 1),
                  }))}
                />
                <BreakdownPanel
                  title={copy('footprint.managerView.brandImpersonation', '品牌/相似網域')}
                  empty={copy('footprint.managerView.empty.lookalikeHosts', '尚未偵測仿冒主機')}
                  rows={brandRows.map((row) => ({
                    label: row.label,
                    value: row.value,
                    tone: warning,
                    total: Math.max(brandBar.total, 1),
                  }))}
                />
              </Box>
            </Box>
          </SectionPanel>
        </Box>

        <Box sx={{ minHeight: 0, display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', gap: 1.15, overflow: 'hidden' }}>
          <SectionPanel
            title={copy('footprint.managerView.dataReadiness', '資料可信度')}
            icon={<CheckCircle2 size={16} />}
            accent={readinessCount >= 3 ? success : warning}
            right={readinessText}
          >
            <Box sx={{ display: 'grid', gap: 0.7 }}>
              <ReadinessRow label="時間序列" ready={!!tsQ.data} detail={`${exposure.total} 個訊號`} />
              <ReadinessRow label="可行線索" ready={!!actQ.data} detail={`${leadCount} 筆線索`} />
              <ReadinessRow label="曝露噪音" ready={!!noiseQ.data} detail={`${brandBar.total} 台主機`} />
              <ReadinessRow label="候選路徑" ready={!!pathsQ.data} detail={`${candidateChains} 條路徑`} />
            </Box>
          </SectionPanel>

          <SectionPanel
            title={copy('footprint.managerView.attackerNarrative', '攻擊者敘事')}
            icon={<FileText size={16} />}
            accent={accent}
            bodySx={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}
          >
            <Box sx={{ minHeight: 0, overflow: 'auto', pr: 0.4 }}>
              <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line', lineHeight: 1.72 }}>
                {narrativeText}
              </Typography>
            </Box>
            <Box
              sx={{
                mt: 1,
                border: '1px solid var(--fp-border)',
                borderRadius: 1,
                bgcolor: 'var(--fp-panel-soft)',
                p: 1,
                display: 'grid',
                gap: 0.7,
              }}
            >
              <ConclusionRow label={copy('footprint.managerView.topBreakthrough', '最可能突破點')} value={focusSubject ?? '--'} tone={decisionTone} />
              <ConclusionRow label={copy('footprint.managerView.validationBlocked', '證據缺口')} value={String(blockedBreakthroughs)} tone={blockedBreakthroughs > 0 ? danger : success} />
              <ConclusionRow label={copy('footprint.managerView.healthyRatio', '健康比例')} value={healthLabel} tone={healthRatio != null && healthRatio < 70 ? warning : success} />
            </Box>
          </SectionPanel>
        </Box>
      </Box>

      <ResearchFootprintDrawer
        orgId={orgId}
        open={!!researchSelector}
        selector={researchSelector}
        onClose={() => setResearchSelector(null)}
      />
    </Box>
  )
}

function CommandBoard({
  accent,
  title,
  subtitle,
  score,
  decisionLabel,
  exposureDelta,
  exposureDeltaLabel,
  warningTone,
  successTone,
  actionLabel,
  onAction,
  metrics,
}: {
  accent: string
  title: string
  subtitle: string
  score: string
  decisionLabel: string
  exposureDelta: number | null
  exposureDeltaLabel: string
  warningTone: string
  successTone: string
  actionLabel: string
  onAction?: () => void
  metrics: OpsMetric[]
}) {
  return (
    <Box
      sx={{
        minWidth: 0,
        border: '1px solid var(--fp-border-strong)',
        borderRadius: 1.25,
        overflow: 'hidden',
        bgcolor: 'var(--fp-panel)',
        boxShadow: `0 12px 30px ${alpha('#0f172a', 0.07)}`,
      }}
    >
      <Box
        sx={{
          px: 1.1,
          py: 0.78,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          borderBottom: '1px solid var(--fp-border)',
          background: `linear-gradient(90deg, ${alpha(accent, 0.1)}, transparent 62%)`,
          boxShadow: `inset 3px 0 0 ${accent}`,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
          <ShieldCheck size={16} color={accent} />
          <Typography variant="subtitle2" sx={{ fontWeight: 950, color: 'text.primary' }} noWrap>
            {copy('footprint.managerView.commandBoard', '外部曝露作戰板')}
          </Typography>
        </Box>
        <Chip
          size="small"
          label={score}
          sx={{
            height: 23,
            borderRadius: 1,
            color: accent,
            bgcolor: alpha(accent, 0.12),
            fontWeight: 950,
          }}
        />
      </Box>

      <Box
        sx={{
          p: 1.1,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '170px minmax(0, 1fr) 300px' },
          gap: 1,
          alignItems: 'stretch',
          backgroundImage:
            `linear-gradient(${alpha(accent, 0.045)} 1px, transparent 1px), linear-gradient(90deg, ${alpha(accent, 0.045)} 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
        }}
      >
        <Box
          sx={{
            minHeight: 150,
            borderRadius: 1.15,
            border: `1px solid ${alpha(accent, 0.2)}`,
            bgcolor: alpha(accent, 0.06),
            display: 'grid',
            placeItems: 'center',
            position: 'relative',
            overflow: 'hidden',
            '&::before': {
              content: '""',
              position: 'absolute',
              inset: 18,
              borderRadius: '50%',
              border: `1px solid ${alpha(accent, 0.28)}`,
              boxShadow: `0 0 0 18px ${alpha(accent, 0.05)}, 0 0 0 36px ${alpha(accent, 0.028)}`,
            },
            '&::after': {
              content: '""',
              position: 'absolute',
              width: 1,
              height: '72%',
              bgcolor: alpha(accent, 0.22),
              boxShadow: `38px 0 0 ${alpha(accent, 0.1)}, -38px 0 0 ${alpha(accent, 0.1)}`,
            },
          }}
        >
          <Target size={32} color={accent} />
        </Box>

        <Box sx={{ minWidth: 0, display: 'grid', gridTemplateRows: 'auto auto', gap: 0.9 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 900, letterSpacing: 0 }}>
              {copy('footprint.managerView.primaryQuestion', '焦點曝露 / 管理層目前要盯住的外部曝露')}
            </Typography>
            <Typography sx={{ mt: 0.45, fontSize: { xs: 24, lg: 30 }, fontWeight: 950, lineHeight: 1.05, color: 'text.primary' }} noWrap title={title}>
              {title}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.7, maxWidth: 760, lineHeight: 1.55 }}>
              {subtitle}
            </Typography>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(auto-fit, minmax(140px, 1fr))' }, gap: 0.65 }}>
            {metrics.map((metric) => (
              <OpsMetricCell key={metric.label} metric={metric} />
            ))}
          </Box>
        </Box>

        <Box
          sx={{
            minWidth: 0,
            border: '1px solid var(--fp-border)',
            borderRadius: 1,
            bgcolor: 'var(--fp-panel-soft)',
            p: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 1,
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 900 }}>
              {copy('footprint.managerView.nextStep', '下一步')}
            </Typography>
            <Typography sx={{ mt: 0.3, fontWeight: 950, color: accent }}>
              {decisionLabel}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.55, lineHeight: 1.5 }}>
              {copy('footprint.managerView.nextStepDesc', '把焦點曝露與證據缺口交給工程模式驗證，避免只看總數。')}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 0.7, flexWrap: 'wrap' }}>
            {exposureDelta != null && exposureDelta !== 0 && (
              <StatusChip
                icon={<ArrowUpRight size={13} />}
                label={`${exposureDelta > 0 ? '+' : ''}${exposureDelta} ${exposureDeltaLabel}`}
                tone={exposureDelta > 0 ? warningTone : successTone}
              />
            )}
            <StatusChip icon={<Shield size={13} />} label={score} tone={accent} />
          </Box>
          {onAction && (
            <Button
              size="small"
              variant="contained"
              startIcon={<FileText size={15} />}
              onClick={onAction}
              sx={{
                minHeight: 34,
                borderRadius: 1,
                px: 1.25,
                fontWeight: 900,
                bgcolor: alpha(accent, 0.1),
                color: accent,
                border: `1px solid ${alpha(accent, 0.28)}`,
                boxShadow: 'none',
                '&:hover': { bgcolor: alpha(accent, 0.16), boxShadow: `0 0 0 3px ${alpha(accent, 0.12)}` },
              }}
            >
              {actionLabel}
            </Button>
          )}
        </Box>
      </Box>
    </Box>
  )
}

function SectionPanel({
  title,
  icon,
  accent,
  right,
  children,
  bodySx,
}: {
  title: string
  icon: ReactNode
  accent: string
  right?: string
  children: ReactNode
  bodySx?: object
}) {
  return (
    <Box
      sx={{
        minWidth: 0,
        minHeight: 0,
        border: '1px solid var(--fp-border)',
        borderRadius: 1.25,
        bgcolor: 'var(--fp-panel)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box
        sx={{
          px: 1.15,
          py: 0.85,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          borderBottom: '1px solid var(--fp-border)',
          bgcolor: 'var(--fp-panel-soft)',
          boxShadow: `inset 3px 0 0 ${accent}`,
        }}
      >
        <Box sx={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 0.7, color: accent }}>
          {icon}
          <Typography variant="subtitle2" sx={{ fontWeight: 950, color: 'text.primary' }} noWrap>
            {title}
          </Typography>
        </Box>
        {right && (
          <Chip
            size="small"
            label={right}
            sx={{
              height: 22,
              borderRadius: 1,
              fontWeight: 950,
              color: accent,
              bgcolor: alpha(accent, 0.1),
            }}
          />
        )}
      </Box>
      <Box sx={{ p: 1.15, minHeight: 0, ...bodySx }}>
        {children}
      </Box>
    </Box>
  )
}

function IconFrame({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <Box
      sx={{
        width: 42,
        height: 42,
        borderRadius: 1.15,
        display: 'grid',
        placeItems: 'center',
        border: `1px solid ${alpha(tone, 0.32)}`,
        color: tone,
        bgcolor: alpha(tone, 0.1),
        flex: '0 0 auto',
      }}
    >
      {children}
    </Box>
  )
}

function StatusChip({ icon, label, tone }: { icon: ReactNode; label: string; tone: string }) {
  return (
    <Chip
      size="small"
      icon={<Box component="span" sx={{ display: 'grid', color: 'inherit' }}>{icon}</Box>}
      label={label}
      sx={{
        height: 28,
        borderRadius: 1,
        px: 0.25,
        border: `1px solid ${alpha(tone, 0.28)}`,
        color: tone,
        bgcolor: alpha(tone, 0.1),
        fontWeight: 900,
        '& .MuiChip-icon': { color: 'inherit', ml: 0.7 },
      }}
    />
  )
}

function OpsMetricCell({ metric }: { metric: OpsMetric }) {
  return (
    <Box
      sx={{
        minWidth: 0,
        border: '1px solid var(--fp-border)',
        borderRadius: 1,
        bgcolor: 'var(--fp-panel-soft)',
        px: 0.85,
        py: 0.75,
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr)',
        gap: 0.6,
        alignItems: 'start',
      }}
    >
      <Box
        sx={{
          width: 26,
          height: 26,
          borderRadius: 0.85,
          display: 'grid',
          placeItems: 'center',
          color: metric.tone,
          bgcolor: alpha(metric.tone, 0.1),
        }}
      >
        {metric.icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ minWidth: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 0.5 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', fontWeight: 850, lineHeight: 1.1 }}
            noWrap
          >
            {metric.label}
          </Typography>
          <Typography sx={{ flex: '0 0 auto', fontSize: 17, fontWeight: 950, color: metric.tone, lineHeight: 1 }} noWrap>
            {metric.value}
          </Typography>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25, lineHeight: 1.1 }} noWrap>
          {metric.detail}
        </Typography>
      </Box>
    </Box>
  )
}

function PriorityRow({ item }: { item: PriorityItem }) {
  return (
    <Box
      sx={{
        minWidth: 0,
        border: '1px solid var(--fp-border)',
        borderRadius: 1.1,
        bgcolor: 'var(--fp-panel-soft)',
        px: 1,
        py: 0.9,
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr) auto',
        gap: 0.85,
        alignItems: 'center',
        boxShadow: `inset 3px 0 0 ${item.tone}`,
      }}
    >
      <Box
        sx={{
          width: 30,
          height: 30,
          borderRadius: 1,
          display: 'grid',
          placeItems: 'center',
          color: item.tone,
          bgcolor: alpha(item.tone, 0.1),
        }}
      >
        {item.icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 900 }} noWrap>
          {item.eyebrow}
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 950 }} noWrap title={item.title}>
          {item.title}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap title={item.detail}>
          {item.detail}
        </Typography>
      </Box>
      <Typography sx={{ fontWeight: 950, color: item.tone, fontSize: 15 }} noWrap>
        {item.value}
      </Typography>
    </Box>
  )
}

function BreakdownPanel({
  title,
  rows,
  empty,
}: {
  title: string
  rows: { label: string; value: number; total: number; tone: string }[]
  empty: string
}) {
  return (
    <Box
      sx={{
        minWidth: 0,
        border: '1px solid var(--fp-border)',
        borderRadius: 1.1,
        bgcolor: 'var(--fp-panel-soft)',
        p: 1,
        display: 'grid',
        gap: 0.8,
      }}
    >
      <Typography variant="subtitle2" sx={{ fontWeight: 950 }} noWrap>
        {title}
      </Typography>
      {rows.length > 0 ? rows.slice(0, 4).map((row) => (
        <DistributionRow key={row.label} {...row} />
      )) : (
        <Typography variant="body2" color="text.secondary" sx={{ py: 1.4, textAlign: 'center' }}>
          {empty}
        </Typography>
      )}
    </Box>
  )
}

function DistributionRow({ label, value, total, tone }: { label: string; value: number; total: number; tone: string }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, total)) * 100))
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.45 }}>
        <Typography variant="caption" sx={{ fontWeight: 850 }} noWrap title={label}>
          {label}
        </Typography>
        <Typography variant="caption" sx={{ fontWeight: 950, color: tone }}>
          {value}
        </Typography>
      </Box>
      <Box sx={{ height: 7, borderRadius: 999, bgcolor: 'action.hover', overflow: 'hidden' }}>
        <Box sx={{ width: `${pct}%`, height: 1, bgcolor: tone, borderRadius: 999 }} />
      </Box>
    </Box>
  )
}

function ReadinessRow({ label, ready, detail }: { label: string; ready: boolean; detail: string }) {
  const tone = ready ? colors.semantic.success : colors.severity.medium
  return (
    <Box
      sx={{
        minWidth: 0,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        gap: 0.8,
        alignItems: 'center',
        border: '1px solid var(--fp-border)',
        borderRadius: 1,
        px: 0.9,
        py: 0.75,
        bgcolor: 'var(--fp-panel-soft)',
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 900 }} noWrap>
          {label}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap>
          {detail}
        </Typography>
      </Box>
      <Chip
        size="small"
        label={ready ? '已就緒' : '缺資料'}
        sx={{
          height: 22,
          borderRadius: 1,
          fontSize: 10,
          fontWeight: 950,
          color: tone,
          bgcolor: alpha(tone, 0.1),
        }}
      />
    </Box>
  )
}

function ConclusionRow({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr)', gap: 1, alignItems: 'center' }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 850 }} noWrap>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 900, color: tone }} noWrap title={value}>
        {value}
      </Typography>
    </Box>
  )
}

function normalizePercent(value?: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null
  const pct = value <= 1 ? value * 100 : value
  return Math.max(0, Math.min(100, Math.round(pct)))
}

function sourceCount(...sources: unknown[]): number {
  return sources.filter(Boolean).length
}

function severityColor(severity: Severity): string {
  if (severity === 'critical') return colors.severity.critical
  if (severity === 'high') return colors.severity.high
  if (severity === 'medium') return colors.severity.medium
  if (severity === 'low') return colors.severity.low
  return colors.section.exposure
}

function humanState(value?: string | null): string {
  if (!value) return '--'
  return value.replace(/_/g, ' ')
}
