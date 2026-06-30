/**
 * VendorRiskManagerView — manager-mode third-party risk summary.
 *
 * The engineer view is the editable vendor register (add / assess /
 * questionnaire / delete). This manager surface answers: "what is the
 * shape of our third-party risk, and which vendors are dragging us
 * down?" — sourced entirely from real endpoints:
 *
 *   GET /vendor-risk-summary  → totals, by_risk, avg_score, top_risks
 *   GET /vendors              → per-vendor combined_score for the
 *                               score-distribution bubble / bar
 *
 * Client functions imported by DIRECT FILE PATH per the parallel-safety
 * decoupling rule.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import { alpha } from '@mui/material/styles'
import { Building2, ShieldAlert, TrendingDown, TrendingUp } from 'lucide-react'

import {
  ManagerDashboard,
  ChartCard,
  KpiCard,
  DonutChart,
  StackedBarChart,
  GaugeChart,
  ManagerActionList,
  ManagerHero,
  HeroStat,
  type DonutDatum,
} from '@compounds/_shared'
import { type Severity } from '@lib/tokens/severity'
import { qk } from '@lib/queryKeys'
import { t } from '@lib/i18n';
import { colors } from '@/styles/designTokens'

import {
  listVendors,
  getVendorRiskSummary,
  type VendorRiskLevel,
} from '@lib/engine/ctem/vendors'

// Map the vendor risk ladder onto the severity token palette so the
// charts share the org-wide red→green language. `unknown` has no
// severity (renders from the categorical palette instead).
const RISK_SEVERITY: Record<VendorRiskLevel, Severity> = {
  critical: 'critical',
  high: 'high',
  medium: 'medium',
  low: 'low',
  unknown: '',
}

const RISK_ORDER: VendorRiskLevel[] = ['critical', 'high', 'medium', 'low', 'unknown']

export interface VendorRiskManagerViewProps {
  orgId: string
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
  const loading = summaryQ.isLoading || vendorsQ.isLoading
  const hasData = !!summary && summary.total_vendors > 0

  // Risk distribution donut from the server-resolved by_risk counts.
  const riskDonut: DonutDatum[] = useMemo(() => {
    if (!summary) return []
    return RISK_ORDER.map((level) => ({
      label: level === 'unknown' ? t('darkweb.notAssessed') : level[0].toUpperCase() + level.slice(1),
      value: summary.by_risk?.[level] ?? 0,
      severity: RISK_SEVERITY[level] || undefined,
    })).filter((d) => d.value > 0)
  }, [summary])

  // Category exposure — count of vendors per category, surfaced from
  // the summary's by_category map. Helps a manager see concentration
  // (e.g. "12 SaaS vendors, only 3 assessed").
  const categoryBars = useMemo(() => {
    const map = summary?.by_category ?? {}
    const entries = Object.entries(map)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
    return {
      categories: entries.map(([k]) => k.toUpperCase()),
      data: entries.map(([, v]) => v),
    }
  }, [summary])

  // Assessment-coverage gauge data: how many vendors actually carry a
  // score vs how many are still pending. A high "pending" count means
  // the risk picture is incomplete.
  const coveragePct = useMemo(() => {
    if (!summary || summary.total_vendors === 0) return 0
    return Math.round((summary.assessed / summary.total_vendors) * 100)
  }, [summary])

  const topRisks = summary?.top_risks ?? []

  // The 重點: the single worst vendor — highest combined_score among the
  // server-ranked top risks. Derived purely from data already fetched.
  const worstVendor = useMemo(() => {
    if (topRisks.length === 0) return null
    return topRisks.reduce((worst, v) =>
      (v.combined_score ?? -1) > (worst.combined_score ?? -1) ? v : worst,
    )
  }, [topRisks])

  const highRiskCount = hasData
    ? (summary!.by_risk?.critical ?? 0) + (summary!.by_risk?.high ?? 0)
    : 0

  const ACCENT = colors.semantic.info

  return (
    <ManagerDashboard
      title={t('vendorRisk.title')}
      subtitle={t('vendorRisk.subtitle')}
      accent={ACCENT}
      titleIcon={<Building2 size={20} />}
      layout="hero-split"
      hero={
        <ManagerHero
          accent={ACCENT}
          icon={<ShieldAlert size={15} />}
          minHeight={200}
          visual={
            hasData ? (
              <GaugeChart
                value={coveragePct}
                max={100}
                label={t('vendorRisk.assessedRingLabel')}
                severity={coveragePct >= 75 ? 'low' : coveragePct >= 40 ? 'medium' : 'high'}
                height={188}
              />
            ) : undefined
          }
          headline={{
            label: t('vendorRisk.worstVendorLabel'),
            value: worstVendor ? worstVendor.vendor_name : '—',
            sub: worstVendor
              ? `${
                  worstVendor.combined_score != null ? `${worstVendor.combined_score}/100 risk` : 'unscored'
                } · ${worstVendor.risk_level} band · ${worstVendor.criticality} criticality${
                  highRiskCount > 0
                    ? ` — ${highRiskCount} vendor${highRiskCount === 1 ? '' : 's'} in the high/critical band`
                    : ''
                }`
              : hasData
                ? 'No high-risk vendor flagged — your tracked third parties are within tolerance.'
                : 'No vendors tracked yet. Add third-party vendors in engineer mode to populate this view.',
            delta:
              worstVendor && worstVendor.combined_score != null ? (
                <Chip
                  size="small"
                  icon={
                    worstVendor.risk_level === 'critical' || worstVendor.risk_level === 'high' ? (
                      <TrendingUp size={13} />
                    ) : (
                      <TrendingDown size={13} />
                    )
                  }
                  label={String(worstVendor.risk_level).toUpperCase()}
                  sx={{
                    fontWeight: 700,
                    fontSize: 12,
                    bgcolor: alpha(
                      worstVendor.risk_level === 'critical' || worstVendor.risk_level === 'high'
                        ? colors.semantic.danger
                        : colors.semantic.success,
                      0.14,
                    ),
                    color:
                      worstVendor.risk_level === 'critical' || worstVendor.risk_level === 'high'
                        ? colors.semantic.danger
                        : colors.semantic.success,
                    '& .MuiChip-icon': { color: 'inherit' },
                  }}
                />
              ) : undefined,
          }}
          aside={
            <Box>
              <HeroStat
                icon={<Building2 size={14} />}
                tone={ACCENT}
                label={t('vendorRisk.assessedAsideLabel')}
                value={hasData ? `${coveragePct}%` : '—'}
              />
              <HeroStat
                icon={<ShieldAlert size={14} />}
                tone={highRiskCount > 0 ? colors.semantic.danger : ACCENT}
                label={t('vendorRisk.highRiskAsideLabel')}
                value={hasData ? highRiskCount : '—'}
              />
              <Box sx={{ mt: 1 }}>
                <Chip
                  size="small"
                  clickable
                  icon={<Building2 size={13} />}
                  label={t('vendorRisk.reviewCta')}
                  sx={{
                    fontWeight: 700,
                    fontSize: 12,
                    bgcolor: alpha(ACCENT, 0.14),
                    color: ACCENT,
                    '& .MuiChip-icon': { color: 'inherit' },
                  }}
                />
              </Box>
            </Box>
          }
        />
      }
      kpis={
        <>
          <KpiCard
            label={t('vendorRisk.trackedVendorsLabel')}
            value={hasData ? summary!.total_vendors : null}
            loading={loading}
            empty={!loading && !hasData}
            emptyHint="No vendors tracked"
          />
          <KpiCard
            label={t('vendorRisk.assessmentCoverageLabel')}
            value={hasData ? coveragePct : null}
            unit="%"
            loading={loading}
            empty={!loading && !hasData}
            emptyHint="—"
          />
          <KpiCard
            label={t('external.avgRiskScore')}
            value={hasData && summary!.avg_score > 0 ? summary!.avg_score : null}
            unit="/ 100"
            invertDelta
            loading={loading}
            empty={!loading && (!hasData || summary!.avg_score <= 0)}
            emptyHint="Unscored"
          />
          <KpiCard
            label={t('vendorRisk.highRiskVendorsLabel')}
            value={
              hasData
                ? (summary!.by_risk?.critical ?? 0) + (summary!.by_risk?.high ?? 0)
                : null
            }
            invertDelta
            loading={loading}
            empty={!loading && !hasData}
            emptyHint="—"
          />
        </>
      }
      charts={
        <>
          <ChartCard title={t('vendors.byRisk')}>
            {riskDonut.length > 0 ? (
              <DonutChart data={riskDonut} totalLabel="Vendors" height={260} />
            ) : (
              <EmptyCell text="No vendors to classify yet" />
            )}
          </ChartCard>

          <ChartCard title={t('vendorRisk.vendorsByCategoryTitle')}>
            {categoryBars.categories.length > 0 ? (
              <StackedBarChart
                categories={categoryBars.categories}
                height={260}
                series={[{ name: 'Vendors', data: categoryBars.data }]}
              />
            ) : (
              <EmptyCell text="No category data yet" />
            )}
          </ChartCard>

        </>
      }
      workItems={
        <ManagerActionList
          title={t('vendorRisk.reviewQueueTitle')}
          subtitle={t('vendorRisk.reviewQueueSubtitle')}
          items={topRisks.slice(0, 8).map((vendor) => ({
            id: vendor.id,
            title: vendor.vendor_name,
            subtitle: `${vendor.criticality} criticality`,
            meta: `${vendor.risk_level} risk`,
            value: vendor.combined_score != null ? `${vendor.combined_score}/100` : undefined,
            severity: RISK_SEVERITY[vendor.risk_level],
          }))}
          emptyText="No high-risk vendor needs review"
          actionLabel="Review"
        />
      }
      narrative={
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
            Third-party posture
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {hasData
              ? `You are tracking ${summary!.total_vendors} vendor${
                  summary!.total_vendors === 1 ? '' : 's'
                }, ${summary!.assessed} of which carry a risk score (${coveragePct}% coverage). ${
                  (summary!.by_risk?.critical ?? 0) + (summary!.by_risk?.high ?? 0) > 0
                    ? `${(summary!.by_risk?.critical ?? 0) + (summary!.by_risk?.high ?? 0)} vendor${
                        (summary!.by_risk?.critical ?? 0) + (summary!.by_risk?.high ?? 0) === 1 ? '' : 's'
                      } sit in the high or critical band and warrant a deeper review.`
                    : 'No vendors are currently in the high or critical risk band.'
                } ${
                  summary!.pending > 0
                    ? `${summary!.pending} assessment${summary!.pending === 1 ? ' is' : 's are'} still pending — coverage gaps hide risk. Switch to engineer mode to run assessments and fill questionnaires.`
                    : 'All tracked vendors have been assessed.'
                }`
              : 'No vendors tracked yet. Add third-party vendors in engineer mode — those with public domains automatically pull an external risk score from your attack-surface data.'}
          </Typography>
        </Box>
      }
    />
  )
}

function EmptyCell({ text }: { text: string }) {
  return (
    <Box sx={{ height: 260, display: 'grid', placeItems: 'center' }}>
      <Typography variant="body2" color="text.secondary">
        {text}
      </Typography>
    </Box>
  )
}
