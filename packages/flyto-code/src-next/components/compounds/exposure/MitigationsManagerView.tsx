/**
 * MitigationsManagerView — manager-mode surface for compensating
 * controls, centred on TRUST DECAY.
 *
 * The engineer view is the operator catalog (add / edit / verify /
 * evidence ledger). This manager view answers the executive question:
 * "how much of our declared risk-reduction is actually live right now,
 * and how much has decayed into wishful thinking?"
 *
 * Every number is sourced from GET /mitigations — the same endpoint the
 * engineer view reads — using the backend-resolved `evidence_tier`
 * (verified / fading / stale / aspirational) and `freshness_factor`
 * (0..1, what the priority engine actually applies). No client-side
 * re-derivation of the decay math: we render what the engine resolved.
 *
 * Client functions imported by DIRECT FILE PATH per the parallel-safety
 * decoupling rule (not the @lib/engine barrel).
 */

import { useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import { alpha } from '@mui/material/styles'
import { Activity, ClipboardCheck, ListChecks, ShieldHalf, ShieldCheck, ShieldAlert, TrendingDown } from 'lucide-react'

import {
  ManagerDashboard,
  ChartCard,
  KpiCard,
  DonutChart,
  StackedBarChart,
  GaugeChart,
  type DonutDatum,
} from '@compounds/_shared'

import {
  listMitigations,
  type Mitigation,
  type EvidenceTier,
} from '@lib/engine/ctem/ctem'
import { qk } from '@lib/queryKeys'
import { t } from '@lib/i18n';
import { colors } from '@/styles/designTokens'

// Decay amber — the warning hue signals "controls erode over time".
const ACCENT = colors.semantic.warning

// Tier presentation order (best → worst) + the severity token each
// tier borrows for color. We map tiers onto the severity palette so
// the dashboard reads at a glance: green = trustworthy, red-ish =
// decayed. Kept in lockstep with the engine thresholds in
// internal/ctem/evidence.go (>=0.999 verified, >=0.5 fading, >0 stale,
// else aspirational).
const TIER_ORDER: EvidenceTier[] = ['verified', 'fading', 'stale', 'aspirational']

// Tier labels for the donut. Slice colors come from the donut's own
// categorical palette — we intentionally don't force severity hues
// because "verified" isn't a severity, it's a trust state.
const TIER_LABEL: Record<EvidenceTier, string> = {
  verified: '已驗證',
  fading: '衰退中',
  stale: '過期',
  aspirational: '待證據',
}

function tierOf(m: Mitigation): EvidenceTier {
  return (m.evidence_tier ?? 'aspirational') as EvidenceTier
}

export interface MitigationsManagerViewProps {
  orgId: string
}

interface MitigationQueueItem {
  id: string
  title: ReactNode
  subtitle?: ReactNode
  meta?: ReactNode
  value?: ReactNode
  severity: 'critical' | 'high' | 'medium' | 'low'
}

export function MitigationsManagerView({ orgId }: MitigationsManagerViewProps) {
  const q = useQuery({
    queryKey: qk.ctem.mitigations(orgId),
    queryFn: () => listMitigations(orgId),
    staleTime: 30_000,
  })

  const items: Mitigation[] = useMemo(() => q.data?.items ?? [], [q.data])
  const loading = q.isLoading

  // ── Aggregate decay metrics ────────────────────────────────────
  const stats = useMemo(() => {
    const total = items.length
    const byTier: Record<EvidenceTier, number> = {
      verified: 0,
      fading: 0,
      stale: 0,
      aspirational: 0,
    }
    let claimedReduction = 0 // Σ severity_reduction (what operators declared)
    let effectiveReduction = 0 // Σ severity_reduction * freshness_factor (what engine applies)
    let liveCount = 0 // tiers the engine still credits (freshness > 0)

    for (const m of items) {
      const tier = tierOf(m)
      byTier[tier] += 1
      const sr = m.severity_reduction ?? 0
      const ff = m.freshness_factor ?? (tier === 'aspirational' ? 0 : 1)
      claimedReduction += sr
      effectiveReduction += sr * ff
      if (ff > 0) liveCount += 1
    }

    // Trust-retained ratio: of all the risk-reduction operators
    // declared, how much is the priority engine still honouring after
    // freshness decay? This is the headline "are our controls real?"
    // number. 100% = every claim is backed by fresh evidence; a low
    // number means the catalog is decorative.
    const trustRetained =
      claimedReduction > 0
        ? Math.round((effectiveReduction / claimedReduction) * 100)
        : 0

    return { total, byTier, claimedReduction, effectiveReduction, liveCount, trustRetained }
  }, [items])

  // Donut: distribution of controls across trust tiers. Slice colors
  // come from the donut's own categorical palette (verified→aspirational
  // reads green→grey there); we don't force severity hues because
  // "verified" isn't a severity.
  const tierDonut: DonutDatum[] = useMemo(
    () =>
      TIER_ORDER.map((t) => ({
        label: TIER_LABEL[t],
        value: stats.byTier[t],
      })).filter((d) => d.value > 0),
    [stats],
  )

  // Stacked bar: claimed vs effective reduction per control type — the
  // "decay gap" made visual. The gap between the two bars in each
  // control-type column is the risk-reduction that has quietly evaporated.
  const decayByType = useMemo(() => {
    const types = Array.from(new Set(items.map((m) => m.control_type)))
    const claimed: number[] = []
    const effective: number[] = []
    for (const ct of types) {
      const rows = items.filter((m) => m.control_type === ct)
      let c = 0
      let e = 0
      for (const m of rows) {
        const sr = m.severity_reduction ?? 0
        const ff = m.freshness_factor ?? (tierOf(m) === 'aspirational' ? 0 : 1)
        c += sr * 100
        e += sr * ff * 100
      }
      claimed.push(Math.round(c))
      effective.push(Math.round(e))
    }
    return { types, claimed, effective }
  }, [items])

  const hasData = stats.total > 0
  const emptyGuidanceQueue: MitigationQueueItem[] = [
    {
      id: 'register-control',
      title: '建立補償控制',
      subtitle: 'WAF、EDR、修補基準或網段隔離',
      meta: '先把管理者承諾轉成可追蹤控制',
      value: '1',
      severity: 'medium' as const,
    },
    {
      id: 'attach-evidence',
      title: '接上可驗證證據',
      subtitle: 'URL、探針、截圖、設定檔或掃描結果',
      meta: '沒有證據就不進入信任分數',
      value: '2',
      severity: 'high' as const,
    },
    {
      id: 'schedule-refresh',
      title: '設定衰退檢查',
      subtitle: '定期確認控制仍然存在且有效',
      meta: '避免控制措施只剩文件',
      value: '3',
      severity: 'low' as const,
    },
  ]
  const mitigationQueue = useMemo<MitigationQueueItem[]>(() => {
    const tierRank: Record<EvidenceTier, number> = { aspirational: 4, stale: 3, fading: 2, verified: 1 }
    const tierSeverity: Record<EvidenceTier, 'critical' | 'high' | 'medium' | 'low'> = {
      aspirational: 'critical',
      stale: 'high',
      fading: 'medium',
      verified: 'low',
    }
    return [...items]
      .sort((a, b) => {
        const score = (m: Mitigation) => tierRank[tierOf(m)] * 100 + (m.severity_reduction ?? 0) * 100
        return score(b) - score(a)
      })
      .slice(0, 6)
      .map((mitigation) => {
        const tier = tierOf(mitigation)
        return {
          id: mitigation.id,
          title: mitigation.name,
          subtitle: [mitigation.control_type, mitigation.applies_to_tag].filter(Boolean).join(' · '),
          meta: `${TIER_LABEL[tier]} · freshness ${Math.round((mitigation.freshness_factor ?? 0) * 100)}%`,
          value: `${Math.round((mitigation.severity_reduction ?? 0) * 100)}%`,
          severity: tierSeverity[tier],
        }
      })
  }, [items])

  return (
    <ManagerDashboard
      title="補償控制"
      subtitle="追蹤已宣告防護是否仍有新鮮證據支撐，避免控制措施只剩文字。"
      accent={ACCENT}
      titleIcon={<ShieldHalf size={20} />}
      layout="dashboard"
      hero={
        <MitigationCommandBand hasData={hasData} stats={stats} />
      }
      kpis={
        <>
          <KpiCard
            label={t('mit.manager.kpiDeclaredControls')}
            value={loading ? null : stats.total}
            loading={loading}
            icon={<ClipboardCheck size={15} />}
            tone={ACCENT}
          />
          <KpiCard
            label={t('mit.manager.kpiVerifiedControls')}
            value={loading ? null : stats.byTier.verified}
            unit={!loading ? `of ${stats.total}` : undefined}
            loading={loading}
            icon={<ShieldCheck size={15} />}
            tone={colors.semantic.success}
          />
          <KpiCard
            label={t('mit.manager.kpiDecayedAspirational')}
            value={loading ? null : stats.byTier.stale + stats.byTier.aspirational}
            invertDelta
            loading={loading}
            icon={<Activity size={15} />}
            tone={colors.semantic.danger}
          />
        </>
      }
      charts={
        <>
          <ChartCard title={t('mit.manager.chartTrustTier')}>
            {tierDonut.length > 0 ? (
              <DonutChart data={tierDonut} totalLabel="Controls" height={260} />
            ) : (
              <TrustEmptyChart />
            )}
          </ChartCard>

          <ChartCard title={t('mit.manager.chartReductionByType')}>
            {decayByType.types.length > 0 ? (
              <StackedBarChart
                categories={decayByType.types}
                stacked={false}
                height={260}
                series={[
	                  { name: t('hardcoded.claimed.data.decaybytype.claimed.severity.medium.59b768f5'), data: decayByType.claimed, severity: 'medium' },
	                  { name: t('hardcoded.effective.after.decay.data.decaybytype.effective.severity.low.8492b637'), data: decayByType.effective, severity: 'low' },
                ]}
              />
            ) : (
              <TrustEmptyChart mode="bars" />
            )}
          </ChartCard>
        </>
      }
      workItems={
        <MitigationControlQueue
          hasData={hasData}
          items={hasData ? mitigationQueue : emptyGuidanceQueue}
          stats={stats}
        />
      }
      narrative={false && (
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
            Trust posture
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {hasData
              ? `Your team has declared ${stats.total} compensating control${
                  stats.total === 1 ? '' : 's'
                }. The priority engine is currently honouring ${stats.trustRetained}% of the declared risk-reduction — the remainder has decayed because the automated freshness probe hasn't confirmed those controls recently. ${
                  stats.byTier.aspirational > 0
                    ? `${stats.byTier.aspirational} control${
                        stats.byTier.aspirational === 1 ? ' is' : 's are'
                      } aspirational and contribute nothing to scoring until evidence lands.`
                    : 'Every control still carries at least partial evidence credit.'
                } Switch to engineer mode (top bar) to refresh evidence URLs and inspect the append-only ledger per control.`
              : '尚未宣告補償控制。當團隊新增 WAF、EDR、修補基準或分段控制，並附上可驗證證據後，這裡會顯示哪些防護仍可信、哪些已衰退。'}
          </Typography>
        </Box>
      )}
    />
  )
}

function MitigationCommandBand({
  hasData,
  stats,
}: {
  hasData: boolean
  stats: {
    total: number
    byTier: Record<EvidenceTier, number>
    claimedReduction: number
    effectiveReduction: number
    trustRetained: number
  }
}) {
  const trusted = Math.round(stats.effectiveReduction * 100)
  const claimed = Math.round(stats.claimedReduction * 100)
  const decayed = Math.max(0, claimed - trusted)
  const stages = [
    { label: '宣告', value: stats.total, tone: ACCENT },
    { label: '證據', value: stats.byTier.verified + stats.byTier.fading + stats.byTier.stale, tone: colors.semantic.info },
    { label: '新鮮度', value: stats.byTier.verified + stats.byTier.fading, tone: colors.semantic.warning },
    { label: '採信', value: trusted, tone: colors.semantic.success },
  ]

  return (
    <Box sx={{
      minHeight: 176,
      display: 'grid',
      gridTemplateColumns: { xs: '1fr', md: '210px minmax(0, 1fr) 220px' },
      gap: { xs: 1.5, md: 2 },
      alignItems: 'center',
      minWidth: 0,
    }}>
      <Box sx={{ display: 'flex', justifyContent: 'center', minWidth: 0 }}>
        {hasData ? (
          <GaugeChart
            value={stats.trustRetained}
            max={100}
            label="信任保留"
            grade={
              stats.trustRetained >= 75
                ? 'good'
                : stats.trustRetained >= 50
                  ? 'fair'
                  : stats.trustRetained >= 25
                    ? 'warn'
                    : 'bad'
            }
            height={154}
          />
        ) : (
          <TrustDecayVisual compact />
        )}
      </Box>

      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Box sx={{
            width: 28,
            height: 28,
            borderRadius: 1,
            display: 'grid',
            placeItems: 'center',
            bgcolor: alpha(ACCENT, 0.12),
            color: ACCENT,
          }}>
            <ShieldHalf size={16} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 900, color: 'text.primary' }}>
              保留的信任度
            </Typography>
            <Typography sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.45 }}>
              {hasData
                ? `已宣告 ${stats.total} 個控制，實際採信 ${trusted} 點，衰退 ${decayed} 點。`
                : '尚未宣告可驗證的補償控制。先建立控制，再接證據與衰退檢查。'}
            </Typography>
          </Box>
          {hasData && decayed > 0 && (
            <Chip
              size="small"
              icon={<TrendingDown size={13} />}
              label={`衰退 ${decayed}`}
              sx={{
                ml: 'auto',
                fontWeight: 800,
                bgcolor: alpha(colors.semantic.danger, 0.12),
                color: colors.semantic.danger,
                '& .MuiChip-icon': { color: 'inherit' },
              }}
            />
          )}
        </Box>

        <Box sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 1,
          mt: 1.25,
        }}>
          {stages.map((stage) => (
            <Box key={stage.label} sx={{
              minHeight: 64,
              borderRadius: 1,
              p: 1,
              border: `1px solid ${alpha(stage.tone, 0.24)}`,
              bgcolor: alpha(stage.tone, 0.07),
            }}>
              <Typography sx={{ fontSize: 11, fontWeight: 800, color: 'text.secondary' }}>
                {stage.label}
              </Typography>
              <Typography sx={{ mt: 0.5, fontFamily: 'ui-monospace, monospace', fontSize: 24, fontWeight: 900, color: stage.tone }}>
                {stage.value}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gap: 1 }}>
        <CommandMetric icon={<ShieldAlert size={15} />} label="已聲明" value={claimed} tone={ACCENT} />
        <CommandMetric icon={<ShieldCheck size={15} />} label="有效採信" value={trusted} tone={colors.semantic.success} />
        <CommandMetric icon={<Activity size={15} />} label="衰退缺口" value={decayed} tone={decayed > 0 ? colors.semantic.danger : colors.semantic.info} />
      </Box>
    </Box>
  )
}

function CommandMetric({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode
  label: string
  value: number
  tone: string
}) {
  return (
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: '28px minmax(0, 1fr) auto',
      alignItems: 'center',
      gap: 1,
      borderRadius: 1,
      p: 1,
      border: (theme) => `1px solid ${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.12 : 0.08)}`,
      bgcolor: (theme) => alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.24 : 0.62),
    }}>
      <Box sx={{ color: tone, display: 'flex' }}>{icon}</Box>
      <Typography sx={{ fontSize: 12, fontWeight: 800, color: 'text.secondary' }}>
        {label}
      </Typography>
      <Typography sx={{ fontFamily: 'ui-monospace, monospace', fontSize: 18, fontWeight: 900, color: tone }}>
        {value}
      </Typography>
    </Box>
  )
}

function queueTone(severity: MitigationQueueItem['severity']) {
  if (severity === 'critical') return colors.semantic.danger
  if (severity === 'high') return colors.semantic.warning
  if (severity === 'medium') return ACCENT
  return colors.semantic.info
}

function MitigationControlQueue({
  hasData,
  items,
  stats,
}: {
  hasData: boolean
  items: MitigationQueueItem[]
  stats: {
    total: number
    byTier: Record<EvidenceTier, number>
    claimedReduction: number
    effectiveReduction: number
    trustRetained: number
  }
}) {
  const claimed = Math.round(stats.claimedReduction * 100)
  const trusted = Math.round(stats.effectiveReduction * 100)
  const decayed = Math.max(0, claimed - trusted)

  return (
    <Box sx={{
      borderRadius: 1,
      border: '1px solid',
      borderColor: (theme) => alpha(ACCENT, theme.palette.mode === 'dark' ? 0.38 : 0.28),
      bgcolor: (theme) => alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.52 : 0.94),
      backgroundImage: (theme) => `
        linear-gradient(90deg, ${alpha(ACCENT, theme.palette.mode === 'dark' ? 0.06 : 0.035)} 1px, transparent 1px),
        linear-gradient(0deg, ${alpha(colors.tech, theme.palette.mode === 'dark' ? 0.06 : 0.03)} 1px, transparent 1px)
      `,
      backgroundSize: '36px 36px',
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
        bgcolor: (theme) => alpha(ACCENT, theme.palette.mode === 'dark' ? 0.08 : 0.045),
      }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 16, fontWeight: 950, letterSpacing: 0 }}>
            控制措施證據隊列
          </Typography>
          <Typography sx={{ mt: 0.25, fontSize: 12.5, color: 'text.secondary' }}>
            把宣告、證據與衰退檢查排成可以執行的控制流程。
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
          <Chip size="small" label={`控制 ${stats.total}`} sx={{ borderRadius: 1, fontWeight: 900, bgcolor: alpha(ACCENT, 0.12), color: ACCENT }} />
          <Chip size="small" label={`採信 ${hasData ? `${stats.trustRetained}%` : '待建立'}`} sx={{ borderRadius: 1, fontWeight: 900, bgcolor: alpha(colors.semantic.success, 0.12), color: colors.semantic.success }} />
          <Chip size="small" label={`缺口 ${decayed}`} sx={{ borderRadius: 1, fontWeight: 900, bgcolor: alpha(decayed > 0 ? colors.semantic.danger : colors.tech, 0.12), color: decayed > 0 ? colors.semantic.danger : colors.tech }} />
        </Box>
      </Box>

      <Box sx={{
        p: { xs: 1.25, md: 1.6 },
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.5fr) minmax(280px, 0.65fr)' },
        gap: 1.25,
        alignItems: 'stretch',
      }}>
        <Box sx={{ display: 'grid', gap: 0.85, minWidth: 0 }}>
          {items.map((item, index) => {
            const tone = queueTone(item.severity)
            return (
              <Box
                key={item.id}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '34px minmax(0, 1fr)', md: '34px minmax(0, 1fr) minmax(120px, 0.28fr)' },
                  gap: 1,
                  alignItems: 'center',
                  borderRadius: 1,
                  border: '1px solid',
                  borderColor: alpha(tone, 0.22),
                  bgcolor: (theme) => alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.52 : 0.78),
                  px: 1,
                  py: 0.9,
                  boxShadow: (theme) => `inset 3px 0 0 ${alpha(tone, theme.palette.mode === 'dark' ? 0.78 : 0.72)}`,
                }}
              >
                <Box sx={{
                  width: 28,
                  height: 28,
                  borderRadius: 1,
                  display: 'grid',
                  placeItems: 'center',
                  bgcolor: alpha(tone, 0.13),
                  color: tone,
                  fontFamily: 'ui-monospace, monospace',
                  fontSize: 13,
                  fontWeight: 950,
                }}>
                  {index + 1}
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 13.5, fontWeight: 950, color: 'text.primary' }}>
                    {item.title}
                  </Typography>
                  {item.subtitle && (
                    <Typography sx={{ mt: 0.25, fontSize: 12, color: 'text.secondary', overflowWrap: 'anywhere' }}>
                      {item.subtitle}
                    </Typography>
                  )}
                  {item.meta && (
                    <Typography sx={{ mt: 0.35, fontSize: 11.5, color: tone, fontWeight: 800, overflowWrap: 'anywhere' }}>
                      {item.meta}
                    </Typography>
                  )}
                </Box>
                <Box sx={{
                  display: { xs: 'none', md: 'grid' },
                  justifyItems: 'end',
                  gap: 0.35,
                }}>
                  <Typography sx={{ fontSize: 11, fontWeight: 850, color: 'text.secondary' }}>
                    優先序
                  </Typography>
                  <Typography sx={{ fontFamily: 'ui-monospace, monospace', fontSize: 18, fontWeight: 950, color: tone }}>
                    {item.value ?? index + 1}
                  </Typography>
                </Box>
              </Box>
            )
          })}
        </Box>

        <Box sx={{
          borderRadius: 1,
          border: '1px solid',
          borderColor: (theme) => alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.12 : 0.08),
          bgcolor: (theme) => alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.52 : 0.82),
          p: 1.25,
          display: 'grid',
          gap: 1,
          alignContent: 'start',
          minWidth: 0,
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
            <ShieldCheck size={16} color={colors.semantic.success} />
            <Typography sx={{ fontSize: 14, fontWeight: 950 }}>
              Trust posture
            </Typography>
          </Box>
          <Box sx={{
            borderRadius: 1,
            p: 1,
            border: `1px solid ${alpha(hasData ? colors.semantic.success : ACCENT, 0.24)}`,
            bgcolor: alpha(hasData ? colors.semantic.success : ACCENT, 0.07),
          }}>
            <Typography sx={{ fontSize: 11.5, fontWeight: 900, color: 'text.secondary' }}>
              引擎採信率
            </Typography>
            <Typography sx={{ mt: 0.25, fontFamily: 'ui-monospace, monospace', fontSize: 32, fontWeight: 950, lineHeight: 1, color: hasData ? colors.semantic.success : ACCENT }}>
              {hasData ? `${stats.trustRetained}%` : '待建立'}
            </Typography>
          </Box>
          <Box sx={{ display: 'grid', gap: 0.65 }}>
            <MiniSignal label="宣告降風險" value={claimed} tone={ACCENT} />
            <MiniSignal label="有效採信" value={trusted} tone={colors.semantic.success} />
            <MiniSignal label="衰退缺口" value={decayed} tone={decayed > 0 ? colors.semantic.danger : colors.tech} />
          </Box>
          <Typography sx={{ fontSize: 12.2, lineHeight: 1.55, color: 'text.secondary' }}>
            {hasData
              ? '補償控制只有在證據仍新鮮時才會被評分引擎採信；右側數字用來判斷哪些宣告已經變成紙上防護。'
              : '目前尚未形成可採信控制。先建立控制、接上證據，再排定衰退檢查，才能讓補償措施進入評分。'}
          </Typography>
        </Box>
      </Box>
    </Box>
  )
}

function MiniSignal({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: string
}) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 1, alignItems: 'center' }}>
      <Typography sx={{ fontSize: 12, fontWeight: 850, color: 'text.secondary' }}>
        {label}
      </Typography>
      <Typography sx={{ fontFamily: 'ui-monospace, monospace', fontSize: 14, fontWeight: 950, color: tone }}>
        {value}
      </Typography>
      <Box sx={{ gridColumn: '1 / -1', height: 6, borderRadius: 999, bgcolor: alpha(tone, 0.1), overflow: 'hidden' }}>
        <Box sx={{ width: `${Math.min(100, Math.max(4, value))}%`, height: '100%', borderRadius: 999, bgcolor: tone }} />
      </Box>
    </Box>
  )
}

function TrustDecayVisual({ compact = false }: { compact?: boolean }) {
  const tiers = [
    { label: '已驗證', value: 0, tone: colors.semantic.success },
    { label: '衰退中', value: 0, tone: ACCENT },
    { label: '過期', value: 0, tone: colors.semantic.danger },
  ]
  return (
    <Box sx={{ width: '100%', maxWidth: compact ? 180 : 190 }}>
      <Box sx={{
        height: compact ? 118 : 132,
        borderRadius: 1.5,
        p: 1.5,
        border: `1px solid ${alpha(ACCENT, 0.26)}`,
        bgcolor: (theme) => alpha(ACCENT, theme.palette.mode === 'dark' ? 0.08 : 0.045),
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 1.1,
      }}>
        {tiers.map((tier) => (
          <Box key={tier.label}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.35 }}>
              <Typography sx={{ fontSize: 11, fontWeight: 800, color: 'text.secondary' }}>{tier.label}</Typography>
              <Typography sx={{ fontSize: 11, fontWeight: 900, color: tier.tone }}>{tier.value}</Typography>
            </Box>
            <Box sx={{ height: 7, borderRadius: 999, bgcolor: (theme) => alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.14 : 0.08) }}>
              <Box sx={{ width: 6, height: 7, borderRadius: 999, bgcolor: tier.tone }} />
            </Box>
          </Box>
        ))}
      </Box>
      <Typography sx={{ mt: 1, fontSize: 12, fontWeight: 700, color: 'text.secondary', textAlign: 'center' }}>
        新增控制措施後開始追蹤
      </Typography>
    </Box>
  )
}

function TrustEmptyChart({ mode = 'tiers' }: { mode?: 'tiers' | 'bars' }) {
  const stages = ['宣告', '證據', '新鮮度', '採信']
  return (
    <Box sx={{
      height: 260,
      display: 'grid',
      placeItems: 'center',
      borderRadius: 1,
      border: (theme) => `1px dashed ${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.18 : 0.14)}`,
      background: (theme) => `linear-gradient(135deg, ${alpha(ACCENT, theme.palette.mode === 'dark' ? 0.08 : 0.045)}, transparent 60%)`,
    }}>
      <Box sx={{ width: '74%', maxWidth: 420 }}>
        {mode === 'bars' ? (
          <Box sx={{ display: 'grid', gap: 1 }}>
            {['已宣告', '有證據', '已過期'].map((label, index) => (
              <Box key={label} sx={{ display: 'grid', gridTemplateColumns: '110px 1fr 28px', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 800, color: 'text.secondary' }}>{label}</Typography>
                <Box sx={{ height: 10, borderRadius: 999, bgcolor: (theme) => alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.16 : 0.08) }}>
                  <Box sx={{ width: index === 0 ? '14%' : '4%', height: 10, borderRadius: 999, bgcolor: index === 2 ? colors.semantic.danger : ACCENT }} />
                </Box>
                <Typography sx={{ fontSize: 12, fontWeight: 900, color: index === 2 ? colors.semantic.danger : ACCENT }}>0</Typography>
              </Box>
            ))}
          </Box>
        ) : (
          <Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, mb: 1 }}>
              {stages.map((stage, index) => (
                <Box key={stage} sx={{
                  height: 52,
                  borderRadius: 1,
                  border: `1px solid ${alpha(index === 3 ? colors.semantic.success : ACCENT, 0.24)}`,
                  bgcolor: alpha(index === 3 ? colors.semantic.success : ACCENT, 0.065),
                  display: 'grid',
                  placeItems: 'center',
                }}>
                  <Typography sx={{ fontSize: 12, fontWeight: 900, color: index === 3 ? colors.semantic.success : ACCENT }}>
                    {stage}
                  </Typography>
                </Box>
              ))}
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: '28px 1fr', gap: 1, alignItems: 'center' }}>
              <Box sx={{ color: ACCENT, display: 'flex' }}>
                <ListChecks size={18} />
              </Box>
              <Box sx={{ height: 10, borderRadius: 999, bgcolor: (theme) => alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.16 : 0.08) }}>
                <Box sx={{ width: 10, height: 10, borderRadius: 999, bgcolor: ACCENT }} />
              </Box>
            </Box>
          </Box>
        )}
        <Typography sx={{ mt: 1.5, fontSize: 13, fontWeight: 700, color: 'text.secondary', textAlign: 'center' }}>
          控制措施需要證據，才能形成信任分數。
        </Typography>
      </Box>
    </Box>
  )
}
