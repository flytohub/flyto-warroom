import { useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import LinearProgress from '@mui/material/LinearProgress'
import Typography from '@mui/material/Typography'
import { alpha, useTheme } from '@mui/material/styles'
import {
  Building2,
  ClipboardCheck,
  DatabaseZap,
  FileCheck2,
  Radar,
  ShieldAlert,
  ShieldCheck,
  Target,
  Workflow,
} from 'lucide-react'

import {
  ChartCard,
  DonutChart,
  KpiCard,
  ManagerDashboard,
  StackedBarChart,
  type DonutDatum,
} from '@compounds/_shared'
import { qk } from '@lib/queryKeys'
import { t } from '@lib/i18n'
import { type Severity } from '@lib/tokens/severity'
import { colors } from '@/styles/designTokens'
import {
  getVendorRiskSummary,
  listVendors,
  type VendorAssessment,
  type VendorRiskLevel,
} from '@lib/engine/ctem/vendors'

const ACCENT = colors.section.exposure
const CONTROL = colors.brand

const RISK_SEVERITY: Record<VendorRiskLevel, Severity> = {
  critical: 'critical',
  high: 'high',
  medium: 'medium',
  low: 'low',
  unknown: '',
}

const RISK_ORDER: VendorRiskLevel[] = ['critical', 'high', 'medium', 'low', 'unknown']

const RISK_LABEL: Record<VendorRiskLevel, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  unknown: 'Unscored',
}

const STATUS_LABEL: Record<string, string> = {
  pending: '待評估',
  in_progress: '評估中',
  completed: '已完成',
  expired: '已過期',
}

export interface VendorRiskManagerViewProps {
  orgId: string
}

interface VendorQueueItem {
  id: string
  title: ReactNode
  subtitle?: ReactNode
  meta?: ReactNode
  value?: ReactNode
  severity: 'critical' | 'high' | 'medium' | 'low'
}

export function VendorRiskManagerView({ orgId }: VendorRiskManagerViewProps) {
  const summaryQ = useQuery({
    queryKey: qk.ctem.vendorRiskSummary(orgId),
    queryFn: () => getVendorRiskSummary(orgId),
    enabled: !!orgId,
    staleTime: 30_000,
  })

  const vendorsQ = useQuery({
    queryKey: qk.ctem.vendors(orgId),
    queryFn: () => listVendors(orgId),
    enabled: !!orgId,
    staleTime: 30_000,
  })

  const summary = summaryQ.data
  const vendors = useMemo(() => vendorsQ.data ?? [], [vendorsQ.data])
  const loading = summaryQ.isLoading || vendorsQ.isLoading
  const hasData = !!summary && summary.total_vendors > 0
  const total = summary?.total_vendors ?? vendors.length
  const assessed = summary?.assessed ?? vendors.filter((v) => v.combined_score != null).length
  const pending = summary?.pending ?? Math.max(0, total - assessed)
  const coveragePct = total > 0 ? Math.round((assessed / total) * 100) : 0
  const highRiskCount = summary
    ? (summary.by_risk?.critical ?? 0) + (summary.by_risk?.high ?? 0)
    : vendors.filter((vendor) => vendor.risk_level === 'critical' || vendor.risk_level === 'high').length

  const riskDonut: DonutDatum[] = useMemo(() => {
    if (!summary) return []
    return RISK_ORDER.map((level) => ({
      label: RISK_LABEL[level],
      value: summary.by_risk?.[level] ?? 0,
      severity: RISK_SEVERITY[level] || undefined,
    })).filter((item) => item.value > 0)
  }, [summary])

  const categoryBars = useMemo(() => {
    const entries = Object.entries(summary?.by_category ?? {})
      .filter(([, value]) => value > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
    return {
      categories: entries.map(([name]) => name.toUpperCase()),
      data: entries.map(([, value]) => value),
    }
  }, [summary])

  const sortedVendors = useMemo(() => {
    return [...vendors].sort((a, b) => vendorPriority(b) - vendorPriority(a))
  }, [vendors])

  const topRisks = summary?.top_risks ?? []
  const worstVendor = topRisks[0] ?? sortedVendors[0] ?? null
  const reviewQueue = useMemo<VendorQueueItem[]>(() => {
    if (topRisks.length > 0) {
      return topRisks.slice(0, 6).map((vendor) => ({
        id: vendor.id,
        title: vendor.vendor_name,
        subtitle: `${vendor.criticality} criticality`,
        meta: `${RISK_LABEL[vendor.risk_level]} risk`,
        value: vendor.combined_score != null ? `${vendor.combined_score}/100` : '待評分',
        severity: queueSeverity(vendor.risk_level),
      }))
    }
    return sortedVendors.slice(0, 6).map((vendor) => ({
      id: vendor.id,
      title: vendor.vendor_name,
      subtitle: [vendor.vendor_domain, vendor.category, `${vendor.criticality} criticality`].filter(Boolean).join(' / '),
      meta: [RISK_LABEL[vendor.risk_level], STATUS_LABEL[vendor.status] ?? vendor.status].join(' / '),
      value: vendor.combined_score != null ? `${vendor.combined_score}/100` : '待評分',
      severity: queueSeverity(vendor.risk_level),
    }))
  }, [sortedVendors, topRisks])

  const guidanceQueue: VendorQueueItem[] = [
    {
      id: 'vendor-register',
      title: '建立供應商名冊',
      subtitle: '先把關鍵 SaaS、雲端、金流、通知與資料處理供應商納入清單。',
      meta: '工程模式新增供應商後，這裡會形成第三方風險圖譜。',
      value: '1',
      severity: 'medium',
    },
    {
      id: 'vendor-evidence',
      title: '補齊審查證據',
      subtitle: '連結問卷、外部評分、合約或安全白皮書，避免只有供應商名稱。',
      meta: '沒有證據的供應商不能形成可信風險結論。',
      value: '2',
      severity: 'high',
    },
    {
      id: 'vendor-review',
      title: '設定週期審查',
      subtitle: '依 criticality 與 risk band 排定重新評估節奏。',
      meta: '高關鍵供應商應比一般供應商更早進入複審。',
      value: '3',
      severity: 'low',
    },
  ]

  return (
    <ManagerDashboard
      title={t('vendorRisk.title')}
      subtitle={t('vendorRisk.subtitle')}
      accent={ACCENT}
      titleIcon={<Building2 size={20} />}
      layout="dashboard"
      chartMinWidth={420}
      hero={
        <VendorCommandHero
          hasData={hasData}
          total={total}
          assessed={assessed}
          pending={pending}
          coveragePct={coveragePct}
          highRiskCount={highRiskCount}
          worstVendor={worstVendor}
        />
      }
      kpis={
        <>
          <KpiCard
            label={t('vendorRisk.trackedVendorsLabel')}
            value={loading ? null : total}
            loading={loading}
            empty={!loading && !hasData}
            emptyHint="尚未追蹤"
            icon={<Building2 size={15} />}
            tone={ACCENT}
          />
          <KpiCard
            label={t('vendorRisk.assessmentCoverageLabel')}
            value={loading ? null : coveragePct}
            unit="%"
            loading={loading}
            empty={!loading && !hasData}
            emptyHint="尚未評估"
            icon={<FileCheck2 size={15} />}
            tone={coveragePct >= 75 ? colors.semantic.success : colors.semantic.warning}
          />
          <KpiCard
            label={t('external.avgRiskScore')}
            value={loading || !summary || summary.avg_score <= 0 ? null : summary.avg_score}
            unit="/ 100"
            invertDelta
            loading={loading}
            empty={!loading && (!summary || summary.avg_score <= 0)}
            emptyHint="尚無分數"
            icon={<ShieldAlert size={15} />}
            tone={highRiskCount > 0 ? colors.semantic.danger : colors.semantic.success}
          />
          <KpiCard
            label={t('vendorRisk.highRiskVendorsLabel')}
            value={loading ? null : highRiskCount}
            invertDelta
            loading={loading}
            empty={!loading && !hasData}
            emptyHint="尚無高風險"
            icon={<Radar size={15} />}
            tone={highRiskCount > 0 ? colors.semantic.danger : colors.tech}
          />
        </>
      }
      charts={
        hasData ? (
          <>
            <ChartCard title={t('vendors.byRisk')}>
              {riskDonut.length > 0 ? (
                <DonutChart data={riskDonut} totalLabel="Vendors" height={220} />
              ) : (
                <VendorSignalEmpty mode="risk" />
              )}
            </ChartCard>

            <ChartCard title={t('vendorRisk.vendorsByCategoryTitle')}>
              {categoryBars.categories.length > 0 ? (
                <StackedBarChart
                  categories={categoryBars.categories}
                  height={220}
                  series={[{ name: 'Vendors', data: categoryBars.data }]}
                />
              ) : (
                <VendorSignalEmpty mode="category" />
              )}
            </ChartCard>
          </>
        ) : (
          <VendorIntakeCommandCenter />
        )
      }
      workItems={
        <VendorReviewBoard
          hasData={hasData}
          items={hasData ? reviewQueue : guidanceQueue}
          total={total}
          assessed={assessed}
          pending={pending}
          coveragePct={coveragePct}
          highRiskCount={highRiskCount}
          vendors={vendors}
        />
      }
    />
  )
}

function vendorPriority(vendor: VendorAssessment) {
  const riskWeight: Record<VendorRiskLevel, number> = {
    critical: 500,
    high: 400,
    medium: 300,
    low: 150,
    unknown: 80,
  }
  const criticalityWeight: Record<string, number> = {
    critical: 90,
    high: 60,
    medium: 30,
    low: 10,
  }
  return (riskWeight[vendor.risk_level] ?? 0) + (criticalityWeight[vendor.criticality] ?? 0) + (vendor.combined_score ?? 0)
}

function queueSeverity(level: VendorRiskLevel): VendorQueueItem['severity'] {
  if (level === 'critical') return 'critical'
  if (level === 'high') return 'high'
  if (level === 'medium' || level === 'unknown') return 'medium'
  return 'low'
}

function riskTone(level?: VendorRiskLevel) {
  if (level === 'critical' || level === 'high') return colors.semantic.danger
  if (level === 'medium' || level === 'unknown') return colors.semantic.warning
  return colors.semantic.success
}

function queueTone(severity: VendorQueueItem['severity']) {
  if (severity === 'critical') return colors.semantic.danger
  if (severity === 'high') return colors.semantic.warning
  if (severity === 'medium') return CONTROL
  return colors.semantic.success
}

function VendorCommandHero({
  hasData,
  total,
  assessed,
  pending,
  coveragePct,
  highRiskCount,
  worstVendor,
}: {
  hasData: boolean
  total: number
  assessed: number
  pending: number
  coveragePct: number
  highRiskCount: number
  worstVendor: {
    vendor_name: string
    risk_level: VendorRiskLevel
    combined_score?: number | null
    criticality: string
  } | VendorAssessment | null
}) {
  const theme = useTheme()
  const dark = theme.palette.mode === 'dark'
  const tone = worstVendor ? riskTone(worstVendor.risk_level) : ACCENT
  const decision = highRiskCount > 0
    ? `${highRiskCount} 個高風險供應商需要審查`
    : hasData
      ? '供應商風險目前可控'
      : '尚未建立供應商風險名冊'

  return (
    <Box
      sx={{
        minHeight: { xs: 300, lg: 198 },
        borderRadius: 1,
        border: '1px solid',
        borderColor: alpha(ACCENT, dark ? 0.38 : 0.28),
        bgcolor: alpha(theme.palette.background.paper, dark ? 0.58 : 0.95),
        backgroundImage: `
          linear-gradient(90deg, ${alpha(ACCENT, dark ? 0.08 : 0.04)} 1px, transparent 1px),
          linear-gradient(0deg, ${alpha(CONTROL, dark ? 0.05 : 0.025)} 1px, transparent 1px),
          radial-gradient(circle at 12% 18%, ${alpha(tone, dark ? 0.18 : 0.09)} 0%, transparent 30%)
        `,
        backgroundSize: '36px 36px, 36px 36px, auto',
        p: { xs: 1.25, md: 1.5 },
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', lg: '174px minmax(0, 1fr) 270px' },
        gap: 1.25,
        alignItems: 'stretch',
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      <VendorScopeRadar total={total} assessed={assessed} highRiskCount={highRiskCount} tone={tone} />

      <Box
        sx={{
          minWidth: 0,
          borderRadius: 1,
          border: `1px solid ${alpha(ACCENT, dark ? 0.28 : 0.18)}`,
          bgcolor: alpha(theme.palette.background.paper, dark ? 0.42 : 0.72),
          p: { xs: 1.25, md: 1.5 },
          display: 'grid',
          gridTemplateRows: 'auto auto minmax(0, 1fr)',
          gap: 1,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 950, color: ACCENT, display: 'flex', alignItems: 'center', gap: 0.7 }}>
            <Radar size={14} />
            第三方風險決策
          </Typography>
          <Typography sx={{ mt: 0.35, fontSize: { xs: 22, md: 30 }, fontWeight: 950, lineHeight: 1.06, color: 'text.primary' }}>
            {decision}
          </Typography>
          <Typography sx={{ mt: 0.65, fontSize: 13, color: 'text.secondary', lineHeight: 1.45 }}>
            {hasData
              ? `已追蹤 ${total} 個供應商，${assessed} 個已完成評估，${pending} 個仍待補齊。`
              : '先建立關鍵供應商與證據來源，管理模式才會顯示可審查的風險分布。'}
          </Typography>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 0.9 }}>
          <HeroNode icon={<Building2 size={16} />} label="供應商" value={String(total)} detail={hasData ? `${assessed} 已評估` : '尚未追蹤'} tone={ACCENT} />
          <HeroNode icon={<FileCheck2 size={16} />} label="覆蓋率" value={`${coveragePct}%`} detail={`${pending} 待評估`} tone={coveragePct >= 75 ? colors.semantic.success : colors.semantic.warning} />
          <HeroNode icon={<ShieldAlert size={16} />} label="高風險" value={String(highRiskCount)} detail={worstVendor ? worstVendor.vendor_name : '無高風險'} tone={highRiskCount > 0 ? colors.semantic.danger : colors.semantic.success} />
        </Box>

        <SignalMeter label="Assessment coverage" value={coveragePct} max={100} tone={coveragePct >= 75 ? colors.semantic.success : colors.semantic.warning} />
      </Box>

      <Box
        sx={{
          minWidth: 0,
          borderRadius: 1,
          border: `1px solid ${alpha(theme.palette.text.primary, dark ? 0.14 : 0.08)}`,
          bgcolor: alpha(theme.palette.background.paper, dark ? 0.48 : 0.78),
          p: 1.25,
          display: 'grid',
          gap: 1,
          alignContent: 'start',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
          <ShieldCheck size={15} color={ACCENT} />
          <Typography sx={{ fontSize: 13, fontWeight: 950 }}>值班摘要</Typography>
        </Box>
        <CommandMetric icon={<DatabaseZap size={14} />} label="名冊狀態" value={hasData ? 'ACTIVE' : 'EMPTY'} tone={hasData ? colors.semantic.success : CONTROL} />
        <CommandMetric icon={<ClipboardCheck size={14} />} label="待評估" value={pending} tone={pending > 0 ? colors.semantic.warning : colors.semantic.success} />
        <CommandMetric icon={<Target size={14} />} label="最高風險" value={worstVendor ? RISK_LABEL[worstVendor.risk_level] : '--'} tone={tone} />
      </Box>
    </Box>
  )
}

function VendorScopeRadar({ total, assessed, highRiskCount, tone }: { total: number; assessed: number; highRiskCount: number; tone: string }) {
  const theme = useTheme()
  const pct = total > 0 ? Math.round((assessed / total) * 100) : 0
  return (
    <Box
      sx={{
        borderRadius: 1,
        border: `1px solid ${alpha(tone, 0.22)}`,
        bgcolor: alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.46 : 0.74),
        p: 1,
        display: 'grid',
        placeItems: 'center',
        minWidth: 0,
      }}
    >
      <Box
        sx={{
          width: 124,
          height: 124,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          background: `conic-gradient(${tone} ${pct * 3.6}deg, ${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.16 : 0.08)} 0deg)`,
          position: 'relative',
          '&::after': {
            content: '""',
            position: 'absolute',
            inset: 13,
            borderRadius: '50%',
            bgcolor: theme.palette.background.paper,
            border: `1px solid ${alpha(tone, 0.25)}`,
          },
        }}
      >
        <Box sx={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
          <Typography sx={{ fontSize: 11, fontWeight: 900, color: 'text.secondary' }}>覆蓋</Typography>
          <Typography sx={{ fontFamily: 'ui-monospace, monospace', fontSize: 30, fontWeight: 950, lineHeight: 1, color: tone }}>{pct}</Typography>
          <Typography sx={{ fontSize: 10.5, fontWeight: 850, color: 'text.secondary' }}>%</Typography>
        </Box>
      </Box>
      <Box sx={{ mt: 1, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 0.55, width: '100%' }}>
        <MiniBadge label="總數" value={total} tone={ACCENT} />
        <MiniBadge label="已評" value={assessed} tone={colors.semantic.success} />
        <MiniBadge label="高風險" value={highRiskCount} tone={highRiskCount > 0 ? colors.semantic.danger : colors.semantic.neutral} />
      </Box>
    </Box>
  )
}

function MiniBadge({ label, value, tone }: { label: string; value: ReactNode; tone: string }) {
  return (
    <Box sx={{ borderRadius: 1, px: 0.7, py: 0.55, bgcolor: alpha(tone, 0.09), border: `1px solid ${alpha(tone, 0.2)}`, minWidth: 0 }}>
      <Typography sx={{ fontSize: 10.5, fontWeight: 850, color: 'text.secondary' }} noWrap>{label}</Typography>
      <Typography sx={{ fontFamily: 'ui-monospace, monospace', fontSize: 15, fontWeight: 950, color: tone, lineHeight: 1.15 }}>{value}</Typography>
    </Box>
  )
}

function HeroNode({ icon, label, value, detail, tone }: { icon: ReactNode; label: string; value: string; detail: string; tone: string }) {
  return (
    <Box
      sx={{
        minWidth: 0,
        borderRadius: 1,
        border: `1px solid ${alpha(tone, 0.24)}`,
        bgcolor: alpha(tone, 0.065),
        p: 1,
        display: 'grid',
        gridTemplateColumns: '30px minmax(0, 1fr)',
        gap: 0.85,
        alignItems: 'center',
      }}
    >
      <Box sx={{ width: 30, height: 30, borderRadius: 1, display: 'grid', placeItems: 'center', bgcolor: alpha(tone, 0.12), color: tone }}>
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 11, fontWeight: 900, color: tone }}>{label}</Typography>
        <Typography sx={{ fontFamily: 'ui-monospace, monospace', fontSize: 20, fontWeight: 950, lineHeight: 1.1 }} noWrap>{value}</Typography>
        <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }} noWrap title={detail}>{detail}</Typography>
      </Box>
    </Box>
  )
}

function CommandMetric({ icon, label, value, tone }: { icon: ReactNode; label: string; value: ReactNode; tone: string }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: '24px minmax(0, 1fr) auto',
        gap: 0.75,
        alignItems: 'center',
        borderRadius: 1,
        p: 0.85,
        border: (theme) => `1px solid ${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.13 : 0.08)}`,
        bgcolor: (theme) => alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.32 : 0.66),
        minWidth: 0,
      }}
    >
      <Box sx={{ color: tone, display: 'flex' }}>{icon}</Box>
      <Typography sx={{ fontSize: 12, fontWeight: 850, color: 'text.secondary' }} noWrap>{label}</Typography>
      <Typography sx={{ fontFamily: 'ui-monospace, monospace', fontSize: 13.5, fontWeight: 950, color: tone, whiteSpace: 'nowrap' }}>{value}</Typography>
    </Box>
  )
}

function SignalMeter({ label, value, max, tone }: { label: string; value: number; max: number; tone: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.35 }}>
        <Typography sx={{ fontSize: 11.5, fontWeight: 900, color: 'text.secondary' }}>{label}</Typography>
        <Typography sx={{ fontSize: 11.5, fontWeight: 950, color: tone }}>{value}/{max}</Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={pct}
        sx={{
          height: 7,
          borderRadius: 999,
          bgcolor: alpha(tone, 0.11),
          '& .MuiLinearProgress-bar': { bgcolor: tone, borderRadius: 999 },
        }}
      />
    </Box>
  )
}

function VendorIntakeCommandCenter() {
  const steps = [
    ['名冊', '新增關鍵供應商與所屬類別'],
    ['證據', '補上問卷、外部評分與合約證據'],
    ['節奏', '依關鍵度排定複審週期'],
  ]
  return (
    <ChartCard title="第三方風險建置狀態">
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.05fr 1fr' }, gap: 1.25, minHeight: 220 }}>
        <Box sx={{ borderRadius: 1, border: `1px solid ${alpha(ACCENT, 0.22)}`, bgcolor: alpha(ACCENT, 0.055), p: 1.5 }}>
          <Typography sx={{ fontSize: 20, fontWeight: 950 }}>尚未開始第三方風險盤點</Typography>
          <Typography sx={{ mt: 0.7, fontSize: 13, color: 'text.secondary', lineHeight: 1.55 }}>
            這不是空白圖表。供應商頁需要先有名冊與證據，管理端才會顯示風險分布、最高風險供應商與審查佇列。
          </Typography>
        </Box>
        <Box sx={{ display: 'grid', gap: 0.75 }}>
          {steps.map(([label, detail], index) => (
            <Box key={label} sx={{ display: 'grid', gridTemplateColumns: '32px minmax(0, 1fr)', gap: 1, alignItems: 'center', borderRadius: 1, border: (theme) => `1px solid ${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.14 : 0.09)}`, p: 1 }}>
              <Box sx={{ width: 28, height: 28, borderRadius: 1, display: 'grid', placeItems: 'center', bgcolor: alpha(ACCENT, 0.12), color: ACCENT, fontWeight: 950 }}>{index + 1}</Box>
              <Box>
                <Typography sx={{ fontSize: 13, fontWeight: 950 }}>{label}</Typography>
                <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{detail}</Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    </ChartCard>
  )
}

function VendorSignalEmpty({ mode }: { mode: 'risk' | 'category' }) {
  const labels = mode === 'risk'
    ? ['Critical', 'High', 'Medium', 'Low']
    : ['SaaS', 'Infra', 'Data', 'Security']
  return (
    <Box sx={{ height: 220, display: 'grid', placeItems: 'center', borderRadius: 1, border: (theme) => `1px dashed ${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.2 : 0.14)}` }}>
      <Box sx={{ width: '76%', maxWidth: 420, display: 'grid', gap: 1 }}>
        {labels.map((label, index) => (
          <Box key={label} sx={{ display: 'grid', gridTemplateColumns: '92px 1fr 28px', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 850, color: 'text.secondary' }}>{label}</Typography>
            <Box sx={{ height: 10, borderRadius: 999, bgcolor: (theme) => alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.16 : 0.08), overflow: 'hidden' }}>
              <Box sx={{ width: `${Math.max(5, 18 - index * 3)}%`, height: '100%', borderRadius: 999, bgcolor: alpha(mode === 'risk' ? colors.semantic.warning : ACCENT, 0.72) }} />
            </Box>
            <Typography sx={{ fontSize: 12, fontWeight: 950, color: ACCENT }}>0</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

function VendorReviewBoard({
  hasData,
  items,
  total,
  assessed,
  pending,
  coveragePct,
  highRiskCount,
  vendors,
}: {
  hasData: boolean
  items: VendorQueueItem[]
  total: number
  assessed: number
  pending: number
  coveragePct: number
  highRiskCount: number
  vendors: VendorAssessment[]
}) {
  const categoryCount = new Set(vendors.map((vendor) => vendor.category)).size
  const expired = vendors.filter((vendor) => vendor.status === 'expired').length

  return (
    <Box
      sx={{
        borderRadius: 1,
        border: '1px solid',
        borderColor: (theme) => alpha(ACCENT, theme.palette.mode === 'dark' ? 0.38 : 0.28),
        bgcolor: (theme) => alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.54 : 0.95),
        overflow: 'hidden',
        minWidth: 0,
      }}
    >
      <Box sx={{ px: { xs: 1.5, md: 2 }, py: 1.35, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.25, flexWrap: 'wrap', borderBottom: '1px solid', borderColor: (theme) => alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.12 : 0.08), bgcolor: (theme) => alpha(ACCENT, theme.palette.mode === 'dark' ? 0.08 : 0.045) }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 16, fontWeight: 950 }}>供應商審查佇列</Typography>
          <Typography sx={{ mt: 0.25, fontSize: 12.5, color: 'text.secondary' }}>
            {hasData ? '依風險、關鍵度與評分排序，先處理最可能造成營運曝險的供應商。' : '先完成這三步，頁面才會從空狀態變成可追蹤的供應商風險戰情。'}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
          <Chip size="small" label={`總數 ${total}`} sx={{ borderRadius: 1, fontWeight: 900, bgcolor: alpha(ACCENT, 0.12), color: ACCENT }} />
          <Chip size="small" label={`覆蓋 ${coveragePct}%`} sx={{ borderRadius: 1, fontWeight: 900, bgcolor: alpha(coveragePct >= 75 ? colors.semantic.success : colors.semantic.warning, 0.12), color: coveragePct >= 75 ? colors.semantic.success : colors.semantic.warning }} />
          <Chip size="small" label={`高風險 ${highRiskCount}`} sx={{ borderRadius: 1, fontWeight: 900, bgcolor: alpha(highRiskCount > 0 ? colors.semantic.danger : colors.semantic.success, 0.12), color: highRiskCount > 0 ? colors.semantic.danger : colors.semantic.success }} />
        </Box>
      </Box>

      <Box sx={{ p: { xs: 1.25, md: 1.6 }, display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.45fr) minmax(292px, 0.72fr)' }, gap: 1.25, alignItems: 'stretch' }}>
        <Box sx={{ display: 'grid', gap: 0.85, minWidth: 0 }}>
          {items.map((item, index) => {
            const tone = queueTone(item.severity)
            return (
              <Box key={item.id} sx={{ display: 'grid', gridTemplateColumns: { xs: '34px minmax(0, 1fr)', md: '34px minmax(0, 1fr) minmax(100px, 0.24fr)' }, gap: 1, alignItems: 'center', borderRadius: 1, border: `1px solid ${alpha(tone, 0.22)}`, bgcolor: (theme) => alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.52 : 0.82), px: 1, py: 0.92, boxShadow: `inset 3px 0 0 ${alpha(tone, 0.7)}`, minWidth: 0 }}>
                <Box sx={{ width: 28, height: 28, borderRadius: 1, display: 'grid', placeItems: 'center', bgcolor: alpha(tone, 0.13), color: tone, fontFamily: 'ui-monospace, monospace', fontSize: 13, fontWeight: 950 }}>
                  {index + 1}
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 13.5, fontWeight: 950, color: 'text.primary' }} noWrap title={String(item.title)}>
                    {item.title}
                  </Typography>
                  {item.subtitle && <Typography sx={{ mt: 0.25, fontSize: 12, color: 'text.secondary', overflowWrap: 'anywhere' }}>{item.subtitle}</Typography>}
                  {item.meta && <Typography sx={{ mt: 0.35, fontSize: 11.5, color: tone, fontWeight: 850, overflowWrap: 'anywhere' }}>{item.meta}</Typography>}
                </Box>
                <Box sx={{ display: { xs: 'none', md: 'grid' }, justifyItems: 'end', gap: 0.35 }}>
                  <Typography sx={{ fontSize: 11, fontWeight: 850, color: 'text.secondary' }}>排序</Typography>
                  <Typography sx={{ fontFamily: 'ui-monospace, monospace', fontSize: 18, fontWeight: 950, color: tone }}>{item.value ?? index + 1}</Typography>
                </Box>
              </Box>
            )
          })}
        </Box>

        <Box sx={{ borderRadius: 1, border: (theme) => `1px solid ${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.12 : 0.08)}`, bgcolor: (theme) => alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.52 : 0.82), p: 1.25, display: 'grid', gap: 1, alignContent: 'start', minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
            <Workflow size={16} color={ACCENT} />
            <Typography sx={{ fontSize: 14, fontWeight: 950 }}>審查健康度</Typography>
          </Box>
          <MiniSignal label="待評估" value={pending} max={Math.max(1, total)} tone={pending > 0 ? colors.semantic.warning : colors.semantic.success} />
          <MiniSignal label="供應商類別" value={categoryCount} max={Math.max(1, Math.min(6, total || 6))} tone={ACCENT} />
          <MiniSignal label="過期評估" value={expired} max={Math.max(1, total)} tone={expired > 0 ? colors.semantic.danger : colors.semantic.success} />
          <Typography sx={{ fontSize: 12.2, lineHeight: 1.55, color: 'text.secondary' }}>
            {hasData
              ? `目前 ${assessed}/${total} 個供應商完成評估。若待評估或過期評估增加，管理端應要求工程模式補齊證據。`
              : '目前沒有供應商名冊。新增供應商後，此處會顯示風險排序、類別分布與複審健康度。'}
          </Typography>
        </Box>
      </Box>
    </Box>
  )
}

function MiniSignal({ label, value, max, tone }: { label: string; value: number; max: number; tone: string }) {
  const pct = max > 0 ? Math.max(4, Math.min(100, (value / max) * 100)) : 4
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 1, alignItems: 'center' }}>
      <Typography sx={{ fontSize: 12, fontWeight: 850, color: 'text.secondary' }}>{label}</Typography>
      <Typography sx={{ fontFamily: 'ui-monospace, monospace', fontSize: 14, fontWeight: 950, color: tone }}>{value}</Typography>
      <Box sx={{ gridColumn: '1 / -1', height: 6, borderRadius: 999, bgcolor: alpha(tone, 0.1), overflow: 'hidden' }}>
        <Box sx={{ width: `${pct}%`, height: '100%', borderRadius: 999, bgcolor: tone }} />
      </Box>
    </Box>
  )
}
