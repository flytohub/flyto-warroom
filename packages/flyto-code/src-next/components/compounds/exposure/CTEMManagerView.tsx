/**
 * CTEMManagerView - manager-mode surface for CTEM Actions.
 *
 * Manager mode should answer one question quickly: what must move now?
 * The backend owns the CTEM queue and scoring. This view only presents
 * that queue as a calm command surface with a stable layout.
 */

import { useMemo, type ReactElement, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import LinearProgress from '@mui/material/LinearProgress'
import Typography from '@mui/material/Typography'
import { alpha, useTheme, type Theme } from '@mui/material/styles'
import type { SxProps } from '@mui/material/styles'
import {
  AlertTriangle,
  ArrowUpRight,
  Clock3,
  Crosshair,
  DollarSign,
  ListChecks,
  RadioTower,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  Zap,
} from 'lucide-react'

import { useExperience } from '@/contexts/ExperienceContext'
import { type CTEMPriorityItem } from '@lib/engine/ctem/ctem'
import { getCtemPrioritiesPage } from '@lib/engine/code/posture'
import { getTriageStats } from '@lib/engine/ctem/findingUnified'
import { qk } from '@lib/queryKeys'
import { tOr } from '@lib/i18n'
import { colors } from '@/styles/designTokens'

const ACCENT = colors.section.exposure
const BRAND = colors.brand

const SEVERITIES = [
  { key: 'critical', label: 'Critical', color: colors.severity.critical },
  { key: 'high', label: 'High', color: colors.severity.high },
  { key: 'medium', label: 'Medium', color: colors.severity.medium },
  { key: 'low', label: 'Low', color: colors.severity.low },
] as const

const TIER_LABELS: Record<string, string> = {
  crown_jewel: '核心資產',
  customer_facing: '對外服務',
  internal: '內部資產',
  sandbox: '沙盒',
}

export interface CTEMManagerViewProps {
  orgId: string
}

function fmtUSD(usd: number): string {
  if (!usd || usd <= 0) return '$0'
  if (usd >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(1)}B`
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`
  if (usd >= 1_000) return `$${Math.round(usd / 1_000)}K`
  return `$${Math.round(usd)}`
}

function hoursUntil(iso?: string): number | null {
  if (!iso) return null
  const parsed = Date.parse(iso)
  if (Number.isNaN(parsed)) return null
  return (parsed - Date.now()) / 3_600_000
}

function countdownText(hours: number): string {
  if (hours <= 0) return tOr('common.now', '現在')
  return hours < 24
    ? tOr('common.inHoursCompact', '{hours} 小時內', { hours: Math.round(hours) })
    : tOr('common.inDaysCompact', '{days} 天內', { days: Math.round(hours / 24) })
}

function severityTone(severity?: string): string {
  return colors.severity[severity as keyof typeof colors.severity] ?? colors.semantic.neutral
}

function tierLabel(tier?: string): string {
  if (!tier) return tOr('exposure.ctem.tier.asset', '資產')
  return tOr(`exposure.ctem.tier.${tier}`, TIER_LABELS[tier] ?? tier)
}

function pressureScore(item: CTEMPriorityItem): number {
  return item.priority_score +
    (item.breached ? 32 : 0) +
    (item.kev_listed ? 24 : 0) +
    (item.impact ? Math.min(24, item.impact.mid_usd / 120_000) : 0)
}

function deadlineLabel(item: CTEMPriorityItem): string {
  if (item.breached) return tOr('exposure.ctem.sla.breached', 'SLA 已逾期')
  const hours = hoursUntil(item.sla_breach_at)
  if (hours == null) return tOr('exposure.ctem.sla.none', '未設定 SLA')
  return tOr('exposure.ctem.sla.withCountdown', '{countdown} 到期', { countdown: countdownText(hours) })
}

export function CTEMManagerView({ orgId }: CTEMManagerViewProps) {
  const theme = useTheme()
  const dark = theme.palette.mode === 'dark'
  const { setMode } = useExperience()

  const ctemQ = useQuery({
    queryKey: qk.ctem.priorities(orgId, 'manager:dedup:1000'),
    queryFn: () => getCtemPrioritiesPage(orgId, { dedup: true, limit: 1000, offset: 0, sort: 'priority' }),
    staleTime: 60_000,
  })
  const triageQ = useQuery({
    queryKey: qk.exposure.triageStats(orgId),
    queryFn: () => getTriageStats(orgId),
    staleTime: 60_000,
    retry: false,
  })

  const items = useMemo<CTEMPriorityItem[]>(() => ctemQ.data?.items ?? [], [ctemQ.data])
  const loading = ctemQ.isLoading

  const reportedTotal = ctemQ.data?.total ?? items.length
  const loadedTotal = items.length

  const model = useMemo(() => {
    const severityCounts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 }
    const tiers: Record<string, { count: number; mid: number }> = {}
    let breached = 0
    let kev = 0
    let lowImpact = 0
    let midImpact = 0
    let highImpact = 0
    let prioritySum = 0
    let soonest: number | null = null

    for (const item of items) {
      const sev = item.effective_severity || 'low'
      severityCounts[sev] = (severityCounts[sev] ?? 0) + 1
      if (item.breached) breached += 1
      if (item.kev_listed) kev += 1
      prioritySum += item.priority_score

      if (!item.breached) {
        const hours = hoursUntil(item.sla_breach_at)
        if (hours != null && hours > 0 && (soonest == null || hours < soonest)) soonest = hours
      }

      if (item.impact) {
        lowImpact += item.impact.low_usd
        midImpact += item.impact.mid_usd
        highImpact += item.impact.high_usd
      }

      const tier = item.asset_tier || 'internal'
      tiers[tier] ??= { count: 0, mid: 0 }
      tiers[tier].count += 1
      tiers[tier].mid += item.impact?.mid_usd ?? 0
    }

    const topQueue = [...items]
      .sort((a, b) => pressureScore(b) - pressureScore(a))
      .slice(0, 10)

    const tierRows = Object.entries(tiers)
      .map(([tier, value]) => ({ tier, ...value }))
      .sort((a, b) => b.mid - a.mid || b.count - a.count)
      .slice(0, 4)

    return {
      total: reportedTotal,
      loaded: loadedTotal,
      critical: severityCounts.critical ?? 0,
      high: severityCounts.high ?? 0,
      breached,
      kev,
      lowImpact,
      midImpact,
      highImpact,
      avgPriority: loadedTotal ? Math.round(prioritySum / loadedTotal) : 0,
      soonest,
      severityCounts,
      tierRows,
      topQueue,
    }
  }, [items, loadedTotal, reportedTotal])

  const noiseStats = triageQ.data
  const noisePct = noiseStats && noiseStats.total_issues > 0 ? Math.round(noiseStats.noise_reduction_pct) : 0
  const statusTone = model.breached > 0
    ? colors.semantic.danger
    : model.critical > 0 || model.kev > 0
      ? colors.semantic.warning
      : colors.semantic.success
  const statusLabel = model.breached > 0
    ? tOr('exposure.ctem.manager.statusBreach', 'SLA 壓力正在升高')
    : model.critical > 0
      ? tOr('exposure.ctem.manager.statusCritical', 'Critical 曝險待決策')
      : model.kev > 0
        ? tOr('exposure.ctem.manager.statusKev', 'KEV 風險需追蹤')
        : tOr('exposure.ctem.manager.statusStable', '行動隊列穩定')
  const decisionCopy = model.total === 0
    ? tOr('exposure.ctem.manager.emptyDecision', '目前沒有可排程的 CTEM 行動。等待後端掃描或切到工程模式檢查來源。')
    : model.breached > 0
      ? tOr('exposure.ctem.manager.breachDecision', '先處理已逾期 SLA，再看 Critical 與 KEV。這是今天最不該放過的隊列。')
      : model.critical > 0
        ? tOr('exposure.ctem.manager.criticalDecision', 'Critical 曝險仍在隊列中，先確認 owner、修復窗口與驗證方式。')
        : tOr('exposure.ctem.manager.steadyDecision', '隊列沒有立即失控訊號，重點是維持驗證節奏與降低噪音。')

  function refresh() {
    void ctemQ.refetch()
    void triageQ.refetch()
  }

  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        display: 'grid',
        gridTemplateRows: 'auto minmax(0, 1fr)',
        gap: 1.25,
        p: { xs: 1.25, md: 1.75 },
        bgcolor: dark ? '#08111f' : '#f5f7fb',
        background: dark
          ? `linear-gradient(135deg, ${alpha('#0ea5e9', 0.08)}, transparent 34%), #08111f`
          : `linear-gradient(135deg, ${alpha('#0ea5e9', 0.07)}, transparent 32%), #f5f7fb`,
      }}
    >
      <Panel
        accent={ACCENT}
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) auto' },
          alignItems: 'center',
          gap: 1.5,
          py: { xs: 1.25, md: 1.5 },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
          <IconFrame color={ACCENT}><RadioTower size={20} /></IconFrame>
          <Box sx={{ minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography component="h1" sx={{ fontSize: { xs: 23, md: 28 }, fontWeight: 850, lineHeight: 1.08, letterSpacing: 0 }}>
                {tOr('exposure.ctem.managerTitle', 'CTEM 行動中樞')}
              </Typography>
              <StatusChip color={statusTone} icon={<Sparkles size={13} />} label={statusLabel} />
            </Box>
            <Typography sx={{ mt: 0.5, color: 'text.secondary', fontSize: 13, maxWidth: 780 }}>
              {decisionCopy}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, justifyContent: { xs: 'flex-start', lg: 'flex-end' }, flexWrap: 'wrap' }}>
          <StatusChip color={ACCENT} icon={<Target size={13} />} label={`${model.total} ${tOr('common.findings', '項行動')}`} />
          <StatusChip color={model.breached > 0 ? colors.semantic.danger : colors.semantic.neutral} icon={<Clock3 size={13} />} label={model.soonest == null ? tOr('exposure.ctem.sla.none', '未設定 SLA') : countdownText(model.soonest)} />
          <Button
            size="small"
            variant="outlined"
            startIcon={<RefreshCw size={14} />}
            onClick={refresh}
            disabled={ctemQ.isFetching || triageQ.isFetching}
            sx={{ height: 32, borderRadius: 1.25, textTransform: 'none', fontWeight: 750 }}
          >
            {tOr('common.refresh', '重新整理')}
          </Button>
          <Button
            size="small"
            variant="contained"
            endIcon={<ArrowUpRight size={14} />}
            onClick={() => setMode('engineer')}
            sx={{ height: 32, borderRadius: 1.25, textTransform: 'none', fontWeight: 800, boxShadow: 'none' }}
          >
            {tOr('exposure.ctem.manager.openEngineer', '工程處置')}
          </Button>
        </Box>
      </Panel>

      <Box
        sx={{
          minHeight: 0,
          display: 'grid',
          gridTemplateRows: 'auto minmax(0, 1fr)',
          gap: 1.25,
        }}
      >
        <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))', lg: 'repeat(5, minmax(0, 1fr))' } }}>
          <Kpi label={tOr('exposure.ctem.kpi.openFindings', '待處理')} value={loading ? '--' : model.total} icon={<ListChecks size={16} />} color={ACCENT} />
          <Kpi label={tOr('exposure.ctem.kpi.openCriticals', 'Critical')} value={loading ? '--' : model.critical} icon={<ShieldAlert size={16} />} color={colors.semantic.danger} />
          <Kpi label={tOr('exposure.ctem.kpi.slaBreached', 'SLA 逾期')} value={loading ? '--' : model.breached} icon={<Clock3 size={16} />} color={model.breached > 0 ? colors.semantic.danger : colors.semantic.neutral} />
          <Kpi label={tOr('exposure.ctem.kpi.kevListed', 'KEV')} value={loading ? '--' : model.kev} icon={<Zap size={16} />} color={colors.semantic.warning} />
          <Kpi label={tOr('exposure.ctem.kpi.impactAtRiskMid', '估計影響')} value={loading ? '--' : fmtUSD(model.midImpact)} icon={<DollarSign size={16} />} color={BRAND} />
        </Box>

        <Box
          sx={{
            minHeight: 0,
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.45fr) minmax(340px, 0.55fr)' },
            gap: 1.25,
          }}
        >
          <Panel accent={statusTone} sx={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <PanelHeader
              icon={<Crosshair size={16} />}
              title={tOr('exposure.ctem.actionList.title', '優先處置隊列')}
              subtitle={tOr('exposure.ctem.actionList.subtitle', '依 SLA、KEV、嚴重度與後端優先分數排序。')}
              color={statusTone}
            />
            <Box sx={{ minHeight: 0, overflow: 'auto', pr: 0.25, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              {model.topQueue.length > 0 ? (
                model.topQueue.map((item, index) => (
                  <PriorityRow key={item.fingerprint || item.id} item={item} index={index + 1} />
                ))
              ) : (
                <EmptyCell text={tOr('exposure.ctem.actionList.empty', '目前沒有後端回傳的行動項目。')} />
              )}
            </Box>
          </Panel>

          <Box sx={{ minHeight: 0, display: 'grid', gap: 1.25, gridTemplateRows: 'auto minmax(0, 1fr)' }}>
            <Panel accent={ACCENT} sx={{ minHeight: 0 }}>
              <PanelHeader
                icon={<ShieldCheck size={16} />}
                title={tOr('exposure.ctem.manager.decisionTitle', '管理判斷')}
                subtitle={tOr('exposure.ctem.manager.decisionSubtitle', '先決定處置節奏，再切工程模式落地。')}
                color={ACCENT}
              />
              <DecisionList
                total={model.total}
                breached={model.breached}
                critical={model.critical}
                kev={model.kev}
                avgPriority={model.avgPriority}
              />
            </Panel>

            <Panel accent={BRAND} sx={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <PanelHeader
                icon={<AlertTriangle size={16} />}
                title={tOr('exposure.ctem.manager.riskShape', '風險結構')}
                subtitle={tOr('exposure.ctem.manager.riskShapeSubtitle', '少量指標，避免把重點藏在圖表裡。')}
                color={BRAND}
              />
              <Box sx={{ minHeight: 0, overflow: 'auto', display: 'grid', gap: 1.2, alignContent: 'start' }}>
                <SectionLabel>{tOr('exposure.ctem.chart.severityMix', '嚴重度分布')}</SectionLabel>
                <Box sx={{ display: 'grid', gap: 0.8 }}>
                  {SEVERITIES.map((severity) => (
                    <BarRow
                      key={severity.key}
                      label={severity.label}
                      value={model.severityCounts[severity.key] ?? 0}
                      max={Math.max(1, model.total)}
                      color={severity.color}
                    />
                  ))}
                </Box>

                <SectionLabel>{tOr('exposure.ctem.manager.assetPressure', '資產壓力')}</SectionLabel>
                <Box sx={{ display: 'grid', gap: 0.8 }}>
                  {model.tierRows.length > 0 ? model.tierRows.map((row) => (
                    <PressureRow
                      key={row.tier}
                      label={tierLabel(row.tier)}
                      detail={`${row.count} ${tOr('common.findings', '項')}`}
                      value={fmtUSD(row.mid)}
                      color={row.mid > 0 ? colors.semantic.warning : ACCENT}
                    />
                  )) : (
                    <Typography sx={{ color: 'text.secondary', fontSize: 12 }}>
                      {tOr('exposure.ctem.empty.monetizedImpactOnFindings', '目前沒有金額影響資料。')}
                    </Typography>
                  )}
                </Box>

                <SectionLabel>{tOr('exposure.ctem.chart.noiseReduction', '噪音削減')}</SectionLabel>
                <NoiseBlock loading={triageQ.isLoading} pct={noisePct} total={noiseStats?.total_issues ?? 0} filtered={noiseStats?.noise_filtered ?? 0} />
              </Box>
            </Panel>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

function Panel({
  children,
  accent = ACCENT,
  sx,
}: {
  children: ReactNode
  accent?: string
  sx?: SxProps<Theme>
}) {
  const theme = useTheme()
  const dark = theme.palette.mode === 'dark'

  return (
    <Box
      sx={{
        minWidth: 0,
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 2,
        border: '1px solid',
        borderColor: alpha(accent, dark ? 0.26 : 0.18),
        bgcolor: dark ? alpha('#101827', 0.86) : alpha('#ffffff', 0.92),
        boxShadow: dark
          ? `0 18px 44px ${alpha('#000000', 0.28)}, inset 0 1px 0 ${alpha('#ffffff', 0.05)}`
          : `0 18px 44px ${alpha('#334155', 0.08)}, inset 0 1px 0 ${alpha('#ffffff', 0.75)}`,
        p: { xs: 1.25, md: 1.5 },
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: `linear-gradient(135deg, ${alpha(accent, dark ? 0.08 : 0.055)}, transparent 44%)`,
        },
        '& > *': {
          position: 'relative',
          zIndex: 1,
        },
        ...sx,
      }}
    >
      {children}
    </Box>
  )
}

function PanelHeader({ icon, title, subtitle, color }: { icon: ReactNode; title: string; subtitle?: string; color: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1, mb: 1.25 }}>
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color }}>
          {icon}
          <Typography sx={{ fontWeight: 850, fontSize: 14 }}>{title}</Typography>
        </Box>
        {subtitle && <Typography sx={{ mt: 0.35, color: 'text.secondary', fontSize: 12 }}>{subtitle}</Typography>}
      </Box>
    </Box>
  )
}

function Kpi({ label, value, icon, color }: { label: string; value: ReactNode; icon: ReactNode; color: string }) {
  const theme = useTheme()
  const dark = theme.palette.mode === 'dark'

  return (
    <Box
      sx={{
        minWidth: 0,
        borderRadius: 1.75,
        border: `1px solid ${alpha(color, dark ? 0.26 : 0.2)}`,
        bgcolor: dark ? alpha('#111827', 0.76) : alpha('#ffffff', 0.9),
        px: 1.25,
        py: 1.1,
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr)',
        gap: 1,
        alignItems: 'center',
        boxShadow: dark ? 'none' : `0 10px 28px ${alpha('#334155', 0.055)}`,
      }}
    >
      <Box sx={{ width: 34, height: 34, borderRadius: 1.25, display: 'grid', placeItems: 'center', color, bgcolor: alpha(color, dark ? 0.14 : 0.1) }}>
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ color: 'text.secondary', fontSize: 11, fontWeight: 750, textTransform: 'uppercase', letterSpacing: 0.35 }}>
          {label}
        </Typography>
        <Typography sx={{ mt: 0.2, fontSize: 24, fontWeight: 850, lineHeight: 1, fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {value}
        </Typography>
      </Box>
    </Box>
  )
}

function PriorityRow({ item, index }: { item: CTEMPriorityItem; index: number }) {
  const theme = useTheme()
  const dark = theme.palette.mode === 'dark'
  const tone = severityTone(item.effective_severity)
  const asset = item.domain || item.repo_id || item.category || '-'
  const impact = item.impact ? fmtUSD(item.impact.mid_usd) : '--'

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '30px minmax(0, 1fr)', md: '34px minmax(0, 1fr) auto' },
        alignItems: 'center',
        gap: 1,
        borderRadius: 1.5,
        border: `1px solid ${alpha(tone, dark ? 0.28 : 0.18)}`,
        bgcolor: alpha(tone, dark ? 0.08 : 0.045),
        p: 1,
        minHeight: 66,
      }}
    >
      <Box sx={{ width: 28, height: 28, borderRadius: 1, display: 'grid', placeItems: 'center', bgcolor: alpha(tone, 0.14), color: tone, fontWeight: 850, fontSize: 12 }}>
        {index}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 850, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.title || item.description}
        </Typography>
        <Typography sx={{ mt: 0.25, color: 'text.secondary', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {asset} / {tierLabel(item.asset_tier)} / {deadlineLabel(item)}
        </Typography>
      </Box>
      <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 0.5, justifyContent: 'flex-end' }}>
        {item.kev_listed && <MiniPill color={colors.semantic.warning} label="KEV" />}
        {item.affected_count && item.affected_count > 1 && <MiniPill color={ACCENT} label={`${item.affected_count}x`} />}
        <MiniPill color={tone} label={item.effective_severity || item.severity || 'risk'} />
        <MiniPill color={BRAND} label={impact} />
        <MiniPill color={ACCENT} label={String(Math.round(item.priority_score))} />
      </Box>
    </Box>
  )
}

function DecisionList({
  total,
  breached,
  critical,
  kev,
  avgPriority,
}: {
  total: number
  breached: number
  critical: number
  kev: number
  avgPriority: number
}) {
  const actions = total === 0
    ? [
        tOr('exposure.ctem.manager.actionCheckFeed', '確認掃描來源與 CTEM feed 是否已完成同步。'),
        tOr('exposure.ctem.manager.actionEngineer', '切到工程模式檢查原始隊列與錯誤訊息。'),
      ]
    : [
        breached > 0
          ? tOr('exposure.ctem.manager.actionBreach', '先指定 owner 處理 SLA 已逾期項目。')
          : tOr('exposure.ctem.manager.actionNoBreach', '沒有逾期時，維持每日驗證節奏。'),
        critical > 0
          ? tOr('exposure.ctem.manager.actionCritical', 'Critical 項目需要修復窗口與驗證方式。')
          : tOr('exposure.ctem.manager.actionNoCritical', 'Critical 清空後，聚焦 High 與 KEV。'),
        kev > 0
          ? tOr('exposure.ctem.manager.actionKev', 'KEV 項目要拉高處置優先級。')
          : tOr('exposure.ctem.manager.actionNoKev', '沒有 KEV 訊號，避免過度升級。'),
      ]

  return (
    <Box sx={{ display: 'grid', gap: 0.75 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 0.75 }}>
        <SmallStat label={tOr('exposure.ctem.manager.avgPriority', '平均優先')} value={avgPriority || '--'} color={ACCENT} />
        <SmallStat label={tOr('exposure.ctem.manager.breachCount', '逾期')} value={breached} color={breached > 0 ? colors.semantic.danger : colors.semantic.neutral} />
        <SmallStat label={tOr('exposure.ctem.manager.kevCount', 'KEV')} value={kev} color={colors.semantic.warning} />
      </Box>
      {actions.map((action, index) => (
        <Box key={action} sx={{ display: 'grid', gridTemplateColumns: '22px minmax(0, 1fr)', gap: 0.75, alignItems: 'start' }}>
          <Box sx={{ mt: 0.1, width: 18, height: 18, borderRadius: '50%', bgcolor: alpha(ACCENT, 0.12), color: ACCENT, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 850 }}>
            {index + 1}
          </Box>
          <Typography sx={{ fontSize: 12.5, color: 'text.primary', lineHeight: 1.45 }}>
            {action}
          </Typography>
        </Box>
      ))}
    </Box>
  )
}

function SmallStat({ label, value, color }: { label: string; value: ReactNode; color: string }) {
  const theme = useTheme()
  return (
    <Box sx={{ borderRadius: 1.25, bgcolor: alpha(color, theme.palette.mode === 'dark' ? 0.1 : 0.065), border: `1px solid ${alpha(color, 0.16)}`, p: 0.9 }}>
      <Typography sx={{ fontSize: 11, color: 'text.secondary', fontWeight: 750 }}>{label}</Typography>
      <Typography sx={{ mt: 0.2, color, fontSize: 20, lineHeight: 1, fontWeight: 850, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
    </Box>
  )
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Typography sx={{ fontSize: 11, color: 'text.secondary', fontWeight: 850, textTransform: 'uppercase', letterSpacing: 0.45 }}>
      {children}
    </Typography>
  )
}

function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const theme = useTheme()
  const pct = Math.min(100, Math.round((value / max) * 100))
  return (
    <Box sx={{ display: 'grid', gap: 0.45 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 750 }}>{label}</Typography>
        <Typography sx={{ fontSize: 12, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={pct}
        sx={{
          height: 8,
          borderRadius: 999,
          bgcolor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.12 : 0.08),
          '& .MuiLinearProgress-bar': { borderRadius: 999, bgcolor: color },
        }}
      />
    </Box>
  )
}

function PressureRow({ label, detail, value, color }: { label: string; detail: string; value: string; color: string }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 1, alignItems: 'center' }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 12.5, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</Typography>
        <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>{detail}</Typography>
      </Box>
      <Typography sx={{ fontSize: 12.5, fontWeight: 850, color, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
    </Box>
  )
}

function NoiseBlock({ loading, pct, total, filtered }: { loading: boolean; pct: number; total: number; filtered: number }) {
  const theme = useTheme()
  const color = colors.semantic.success

  if (loading) {
    return <Typography sx={{ color: 'text.secondary', fontSize: 12 }}>{tOr('common.loading', '載入中')}</Typography>
  }
  if (total <= 0) {
    return <Typography sx={{ color: 'text.secondary', fontSize: 12 }}>{tOr('exposure.ctem.empty.reachability', '尚無可呈現的噪音削減資料。')}</Typography>
  }

  return (
    <Box sx={{ display: 'grid', gap: 0.55 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1 }}>
        <Typography sx={{ color, fontSize: 22, lineHeight: 1, fontWeight: 850 }}>{pct}%</Typography>
        <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>{filtered}/{total}</Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={Math.min(100, Math.max(0, pct))}
        sx={{
          height: 8,
          borderRadius: 999,
          bgcolor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.12 : 0.08),
          '& .MuiLinearProgress-bar': { borderRadius: 999, bgcolor: color },
        }}
      />
    </Box>
  )
}

function IconFrame({ color, children }: { color: string; children: ReactNode }) {
  return (
    <Box
      sx={{
        width: 42,
        height: 42,
        borderRadius: 1.5,
        display: 'grid',
        placeItems: 'center',
        color,
        bgcolor: alpha(color, 0.12),
        boxShadow: `inset 0 0 0 1px ${alpha(color, 0.28)}`,
        flexShrink: 0,
      }}
    >
      {children}
    </Box>
  )
}

function StatusChip({ color, label, icon }: { color: string; label: string; icon: ReactElement }) {
  return <Chip size="small" icon={icon} label={label} sx={chipSx(color)} />
}

function MiniPill({ color, label }: { color: string; label: ReactNode }) {
  return <Chip size="small" label={label} sx={{ ...chipSx(color), height: 24, '& .MuiChip-label': { px: 0.8 } }} />
}

function chipSx(color: string) {
  return {
    height: 28,
    borderRadius: 1.15,
    fontSize: 11.5,
    fontWeight: 800,
    color,
    bgcolor: alpha(color, 0.1),
    border: `1px solid ${alpha(color, 0.22)}`,
    '& .MuiChip-icon': { color: 'inherit' },
  }
}

function EmptyCell({ text }: { text: string }) {
  const theme = useTheme()
  return (
    <Box sx={{ flex: 1, minHeight: 220, display: 'grid', placeItems: 'center', textAlign: 'center', px: 2 }}>
      <Box sx={{ display: 'grid', placeItems: 'center', gap: 1 }}>
        <Box sx={{ width: 40, height: 40, borderRadius: 1.5, display: 'grid', placeItems: 'center', color: ACCENT, bgcolor: alpha(ACCENT, theme.palette.mode === 'dark' ? 0.12 : 0.08) }}>
          <Target size={18} />
        </Box>
        <Typography sx={{ color: 'text.secondary', fontSize: 13, maxWidth: 280 }}>{text}</Typography>
      </Box>
    </Box>
  )
}
