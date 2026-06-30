/**
 * FindingsManagerView — manager-mode surface for the per-asset
 * external Findings list. Summarizes the same data the engineer
 * table drills into, sourced live from:
 *   • GET /findings/facets   → risk-vector mix (counts_by_category)
 *   • GET /findings          → severity / grade / threat rollups
 *
 * No fake numbers: rollups are computed from a single page of open
 * findings (cap 500) the same engine the engineer table reads.
 * Built from the _shared primitives; client imported by direct path.
 */

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import { alpha } from '@mui/material/styles'
import { Skull, Crosshair, Clock3, RotateCcw, CheckCircle2 } from 'lucide-react'

import {
  ManagerDashboard, ChartCard, KpiCard, DonutChart, StackedBarChart,
  ManagerHero, HeroStat,
  type DonutDatum,
} from '@compounds/_shared'

import {
  listFindings, listFindingFacets, parseJSONArray,
  type Finding,
} from '@lib/engine/code/findings'
import { qk } from '@lib/queryKeys'
import { t } from '@lib/i18n';
import { colors } from '@/styles/designTokens'

const ACCENT = colors.semantic.danger

const ROLLUP_LIMIT = 500

export function FindingsManagerView() {
  const { orgId } = useParams<{ orgId: string }>()
  const [panel, setPanel] = useState<'lifecycle' | 'risk' | 'vectors' | 'queue'>('lifecycle')

  const facetsQ = useQuery({
    queryKey: qk.exposure.findingsManagerFacets(orgId),
    queryFn: () => listFindingFacets(orgId!, false),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const findingsQ = useQuery({
    queryKey: qk.exposure.findingsManagerRollup(orgId),
    queryFn: () => listFindings(orgId!, { include_resolved: false, limit: ROLLUP_LIMIT, offset: 0 }),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const historyQ = useQuery({
    queryKey: qk.exposure.findingsManagerHistory(orgId),
    queryFn: () => listFindings(orgId!, { include_resolved: true, limit: ROLLUP_LIMIT, offset: 0 }),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const rows = useMemo<Finding[]>(() => findingsQ.data?.findings ?? [], [findingsQ.data])
  const historyRows = useMemo<Finding[]>(() => historyQ.data?.findings ?? [], [historyQ.data])
  const loading = findingsQ.isLoading || historyQ.isLoading

  // ── KPIs ────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    let crit = 0, high = 0, threat = 0, badGrade = 0
    for (const f of rows) {
      if (f.severity === 'critical') crit++
      if (f.severity === 'high') high++
      if (f.has_threat_insights) threat++
      if (f.grade === 'bad' || f.grade === 'warn') badGrade++
    }
    return { total: rows.length, crit, high, threat, badGrade }
  }, [rows])

  const continuity = useMemo(() => {
    const now = Date.now()
    const within30 = (iso?: string | null) => {
      if (!iso) return false
      const t = new Date(iso).getTime()
      return Number.isFinite(t) && now - t <= 30 * 86_400_000
    }
    let new30 = 0, resolved30 = 0, reopened = 0, pendingVerify = 0, verifiedFixed = 0, staleOpen = 0
    for (const f of historyRows) {
      if (within30(f.first_seen_at)) new30++
      if (within30(f.resolved_at)) resolved30++
      if (f.verification_state === 'reopened') reopened++
      if (f.verification_state === 'pending_verify') pendingVerify++
      if (f.verification_state === 'verified_fixed') verifiedFixed++
    }
    for (const f of rows) {
      const lastSeen = f.last_seen_at ? new Date(f.last_seen_at).getTime() : NaN
      if (!Number.isFinite(lastSeen) || now - lastSeen > 30 * 86_400_000) staleOpen++
    }
    const ageBuckets = { lt7: 0, d7to30: 0, d30to90: 0, gt90: 0 }
    for (const f of rows) {
      const age = ageDays(f.first_seen_at)
      if (age < 7) ageBuckets.lt7++
      else if (age < 30) ageBuckets.d7to30++
      else if (age < 90) ageBuckets.d30to90++
      else ageBuckets.gt90++
    }
    return { new30, resolved30, reopened, pendingVerify, verifiedFixed, staleOpen, ageBuckets }
  }, [historyRows, rows])

  // ── Severity donut ──────────────────────────────────────────────
  const sevDonut = useMemo<DonutDatum[]>(() => {
    const counts: Record<string, number> = {}
    for (const f of rows) counts[f.severity] = (counts[f.severity] || 0) + 1
    return (['critical', 'high', 'medium', 'low'] as const)
      .filter(s => counts[s])
      .map(s => ({ label: s[0].toUpperCase() + s.slice(1), value: counts[s], severity: s }))
  }, [rows])

  // ── Risk-vector mix (top categories) horizontal bar ─────────────
  const riskVectors = useMemo(() => {
    const counts = facetsQ.data?.counts_by_category ?? {}
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8)
    return {
      categories: entries.map(([cat]) => cat),
      data: entries.map(([, n]) => n),
      hasData: entries.length > 0,
    }
  }, [facetsQ.data])

  // ── Grade mix donut (Bitsight-parity grade) ─────────────────────
  const gradeDonut = useMemo<DonutDatum[]>(() => {
    const counts: Record<string, number> = {}
    for (const f of rows) {
      const g = f.grade || ''
      if (!g) continue
      counts[g] = (counts[g] || 0) + 1
    }
    const map: Record<string, DonutDatum['severity']> = {
      bad: 'critical', warn: 'high', fair: 'medium', neutral: 'low', good: 'low',
    }
    return (['bad', 'warn', 'fair', 'neutral', 'good'] as const)
      .filter(g => counts[g])
      .map(g => ({ label: g[0].toUpperCase() + g.slice(1), value: counts[g], severity: map[g] }))
  }, [rows])

  // ── Top threat-linked assets ────────────────────────────────────
  const threatGroups = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const f of rows) {
      if (!f.has_threat_insights) continue
      for (const g of parseJSONArray(f.threat_groups)) counts[g] = (counts[g] || 0) + 1
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6)
  }, [rows])

  const priorityItems = useMemo(() => {
    const gradeWeight: Record<string, number> = { bad: 40, warn: 25, fair: 12, neutral: 4, good: 0 }
    const severityWeight: Record<string, number> = { critical: 50, high: 35, medium: 18, low: 6 }
    const importanceWeight: Record<string, number> = { critical: 20, high: 12, medium: 6, low: 0 }
    return [...rows]
      .sort((a, b) => {
        const score = (f: Finding) =>
          (severityWeight[f.severity] ?? 0) +
          (gradeWeight[f.grade ?? ''] ?? 0) +
          (importanceWeight[f.asset_importance ?? ''] ?? 0) +
          (f.has_threat_insights ? 25 : 0)
        return score(b) - score(a)
      })
      .slice(0, 6)
      .map((finding) => ({
        id: finding.id,
        title: finding.domain || finding.external_id || finding.category,
        subtitle: finding.description || finding.category,
        meta: [
          finding.category,
          finding.grade ? `grade ${finding.grade}` : null,
          finding.has_threat_insights ? 'threat-linked' : null,
          finding.remaining_lifetime_days != null ? `${finding.remaining_lifetime_days}d impact` : null,
        ].filter(Boolean).join(' · '),
        value: finding.severity,
        severity: finding.severity,
      }))
  }, [rows])

  return (
    <ManagerDashboard
	      title={t('hardcoded.external.findings.posture.summary.2e84f1d0')}
	      subtitle={t('hardcoded.external.findings.posture.subtitle.ee5f4b22')}
      accent={ACCENT}
      titleIcon={<Skull size={20} />}
      layout="dashboard"
      contentOverflow="hidden"
      hero={
        <ManagerHero
          accent={ACCENT}
          icon={<Skull size={15} />}
          minHeight={140}
          headline={{
            label: t('exposure.findings.threatLinkedAssets'),
            value: loading ? '—' : stats.threat,
            delta: !loading && stats.threat > 0 ? (
              <Chip
                size="small"
                icon={<Crosshair size={13} />}
                label={`${threatGroups.length} actor${threatGroups.length === 1 ? '' : 's'}`}
                sx={{
                  fontWeight: 700, fontSize: 12,
                  bgcolor: alpha(ACCENT, 0.14),
                  color: ACCENT,
                  '& .MuiChip-icon': { color: 'inherit' },
                }}
              />
            ) : undefined,
            sub: loading
              ? undefined
              : stats.threat > 0
                ? `${stats.threat} of ${stats.total}${rows.length >= ROLLUP_LIMIT ? '+' : ''} open findings are linked to active threat-actor infrastructure across ${threatGroups.length} tracked group${threatGroups.length === 1 ? '' : 's'}.`
                : 'No findings are currently linked to active threat-actor infrastructure.',
          }}
          aside={
            threatGroups.length > 0 ? (
              <Box>
                {threatGroups.slice(0, 4).map(([group, n]) => (
                  <HeroStat
                    key={group}
                    icon={<Crosshair size={14} />}
                    tone={ACCENT}
                    label={group}
                    value={n}
                  />
                ))}
              </Box>
            ) : undefined
          }
        />
      }
      kpis={
        <>
          <KpiCard
            label={t('exposure.findings.openFindingsKpi')}
            value={loading ? null : stats.total}
            unit={rows.length >= ROLLUP_LIMIT ? `${ROLLUP_LIMIT}+` : undefined}
            loading={loading}
            empty={!loading && stats.total === 0}
            emptyHint="No open findings"
          />
          <KpiCard label={t('common.critical')} value={loading ? null : stats.crit} invertDelta loading={loading} />
          <KpiCard label={t('common.high')} value={loading ? null : stats.high} invertDelta loading={loading} />
          <KpiCard label={t('exposure.findings.threatLinkedKpi')} value={loading ? null : stats.threat} invertDelta loading={loading} />
          <KpiCard label={t('exposure.findings.badWarnGradeKpi')} value={loading ? null : stats.badGrade} invertDelta loading={loading} />
        </>
      }
      charts={
        <ChartCard title={t('hardcoded.continuous.monitoring.analysis.bb40696a')}>
          <Box sx={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <Tabs
              value={panel}
              onChange={(_, value) => setPanel(value)}
              variant="scrollable"
              allowScrollButtonsMobile
              sx={{ minHeight: 36, mb: 1.5, '& .MuiTab-root': { minHeight: 36, fontSize: 12, fontWeight: 700 } }}
            >
              <Tab value="lifecycle" label="Lifecycle" />
              <Tab value="risk" label={t('hardcoded.risk.mix.f46248be')} />
              <Tab value="vectors" label="Vectors" />
              <Tab value="queue" label="Queue" />
            </Tabs>

            <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
              {panel === 'lifecycle' && (
                <LifecyclePanel continuity={continuity} rows={rows} loading={loading} />
              )}
              {panel === 'risk' && (
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, minHeight: 0 }}>
                  {sevDonut.length > 0 ? (
                    <DonutChart data={sevDonut} totalLabel="Findings" />
                  ) : (
                    <EmptyCell text="No open findings" />
                  )}
                  {gradeDonut.length > 0 ? (
                    <DonutChart data={gradeDonut} totalLabel="Graded" />
                  ) : (
                    <EmptyCell text="No graded findings yet" />
                  )}
                </Box>
              )}
              {panel === 'vectors' && (
                riskVectors.hasData ? (
                  <StackedBarChart
                    categories={riskVectors.categories}
	                    series={[{ name: t('hardcoded.findings.data.riskvectors.data.severity.high.ba8f73a9'), data: riskVectors.data, severity: 'high' }]}
                    horizontal
                    stacked={false}
                    height={300}
                  />
                ) : (
                  <EmptyCell text="No risk-vector facets yet" />
                )
              )}
              {panel === 'queue' && (
                <PriorityQueue items={priorityItems} />
              )}
            </Box>
          </Box>
        </ChartCard>
      }
    />
  )
}

function LifecyclePanel({
  continuity,
  rows,
  loading,
}: {
  continuity: {
    new30: number
    resolved30: number
    reopened: number
    pendingVerify: number
    verifiedFixed: number
    staleOpen: number
    ageBuckets: { lt7: number; d7to30: number; d30to90: number; gt90: number }
  }
  rows: Finding[]
  loading: boolean
}) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.2fr 1fr' }, gap: 2, minHeight: 0 }}>
      <Box>
        {rows.length > 0 ? (
          <StackedBarChart
            categories={['<7d', '7-30d', '30-90d', '>90d']}
            series={[{
              name: 'Open',
              data: [
                continuity.ageBuckets.lt7,
                continuity.ageBuckets.d7to30,
                continuity.ageBuckets.d30to90,
                continuity.ageBuckets.gt90,
              ],
              severity: 'medium',
            }]}
            horizontal={false}
            stacked={false}
            height={240}
          />
        ) : (
          <EmptyCell text="No open findings" />
        )}
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
        <MiniStat label={t('hardcoded.new.30d.8ee69650')} value={loading ? '—' : continuity.new30} tone="warning" />
        <MiniStat label={t('hardcoded.resolved.30d.b461b9e9')} value={loading ? '—' : continuity.resolved30} tone="success" />
        <MiniStat label="Reopened" value={loading ? '—' : continuity.reopened} tone="error" icon={<RotateCcw size={14} />} />
        <MiniStat label={t('findings.pendingVerify')} value={loading ? '—' : continuity.pendingVerify} tone="warning" icon={<Clock3 size={14} />} />
        <MiniStat label={t('findings.verifiedFixed')} value={loading ? '—' : continuity.verifiedFixed} tone="success" icon={<CheckCircle2 size={14} />} />
        <MiniStat label={t('hardcoded.stale.open.03120c59')} value={loading ? '—' : continuity.staleOpen} tone="error" />
      </Box>
    </Box>
  )
}

function MiniStat({
  label,
  value,
  tone,
  icon,
}: {
  label: string
  value: string | number
  tone: 'success' | 'warning' | 'error'
  icon?: React.ReactNode
}) {
  const toneColor = tone === 'success' ? colors.semantic.success : tone === 'warning' ? colors.semantic.warning : colors.semantic.danger
  return (
    <Box sx={{
      border: '1px solid',
      borderColor: alpha(toneColor, 0.28),
      borderRadius: 1,
      p: 1.25,
      minWidth: 0,
      bgcolor: alpha(toneColor, 0.06),
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: toneColor }}>
        {icon}
        <Typography sx={{ fontSize: 12, fontWeight: 800 }}>{label}</Typography>
      </Box>
      <Typography sx={{ fontSize: 26, lineHeight: 1.1, fontWeight: 900, mt: 0.75 }}>{value}</Typography>
    </Box>
  )
}

function PriorityQueue({ items }: { items: Array<{ id: string; title: string; subtitle: string; meta: string; value: string; severity: string }> }) {
  if (items.length === 0) return <EmptyCell text="No open external findings need review" />
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      {items.map(item => (
        <Box key={item.id} sx={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) auto',
          gap: 1.5,
          py: 1.25,
          borderBottom: '1px solid',
          borderColor: 'divider',
          '&:last-child': { borderBottom: 0 },
        }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.title}
            </Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.subtitle}
            </Typography>
            {item.meta && (
              <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.meta}
              </Typography>
            )}
          </Box>
          <Chip size="small" label={item.value} color={item.severity === 'critical' || item.severity === 'high' ? 'error' : 'warning'} sx={{ fontSize: 12, fontWeight: 700 }} />
        </Box>
      ))}
    </Box>
  )
}

function EmptyCell({ text }: { text: string }) {
  return (
    <Box sx={{ height: 260, display: 'grid', placeItems: 'center' }}>
      <Typography variant="body2" color="text.secondary">{text}</Typography>
    </Box>
  )
}

function ageDays(iso?: string | null) {
  if (!iso) return Number.POSITIVE_INFINITY
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY
  return Math.floor((Date.now() - t) / 86_400_000)
}
