/**
 * IoCManagerView — manager-mode threat-exposure summary for the IoC
 * catalog. Engineer view keeps the searchable raw indicator table;
 * the manager view leads with exposure KPIs (org vs global), a kind
 * breakdown bar, and a feed-freshness narrative.
 *
 * Every number is real: per-kind `stats` / `global_stats` from
 * listIoCs + feed freshness from listFeedStatus.
 *
 * Client functions imported by DIRECT FILE PATH per the decoupling rule.
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Box, Typography, Chip } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { Crosshair, Radar, Database, ShieldCheck, AlertTriangle } from 'lucide-react'
import { useOrg } from '@hooks/useOrg'
import { t, tOr } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import {
  ManagerDashboard,
  ChartCard,
  KpiCard,
  StackedBarChart,
  DonutChart,
  ManagerActionList,
  ManagerHero,
  HeroStat,
  type DonutDatum,
} from '@compounds/_shared'
import { RAW } from '@lib/tokens/severity'
import { colors } from '@/styles/designTokens'
import { listIoCs, listFeedStatus } from '@lib/engine/code/threatIntel'

const ACCENT = colors.section.exposure

const KIND_LABEL: Record<string, string> = {
  c2: 'C2', url: 'URL', ip: 'IP', phishing: 'Phishing',
  credential: 'Credential', stealer: 'Stealer', breach: 'Breach',
}

function kindLabel(k: string): string {
  return KIND_LABEL[k] ?? k
}

function sumStats(s: Record<string, number>): number {
  return Object.values(s).reduce((a, b) => a + b, 0)
}

export function IoCManagerView() {
  const { org } = useOrg()
  const orgId = org?.id

  // One stats-only fetch covers both org + global rollups.
  const { data, isLoading } = useQuery({
    queryKey: qk.threatIntel.iocManagerStats(orgId),
    queryFn: () => listIoCs(orgId!, { scope: 'both', limit: 1, offset: 0 }),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const { data: feedStatus } = useQuery({
    queryKey: qk.threatIntel.iocFeedStatus(orgId),
    queryFn: () => listFeedStatus(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const orgStats = data?.stats ?? {}
  const globalStats = data?.global_stats ?? {}
  const orgTotal = sumStats(orgStats)
  const globalTotal = sumStats(globalStats)

  // High-signal exposure: credential + stealer + breach hits scoped
  // to this org are the ones a manager actually cares about.
  const exposureKinds = ['credential', 'stealer', 'breach', 'phishing']
  const orgExposure = exposureKinds.reduce((s, k) => s + (orgStats[k] ?? 0), 0)
  const c2Count = orgStats['c2'] ?? 0

  // Focal datum (the 重點): high-signal OUR-exposure — C2 + credential
  // + stealer hits scoped to this org. These are the active-compromise
  // indicators a manager treats as alarms (vs. catalog monitoring).
  const focalKinds = ['c2', 'credential', 'stealer']
  const orgFocalHits = focalKinds.reduce((s, k) => s + (orgStats[k] ?? 0), 0)
  const globalFocalHits = focalKinds.reduce((s, k) => s + (globalStats[k] ?? 0), 0)
  // Share of the global catalog that landed on us, for the org-vs-global split.
  const orgSharePct =
    globalTotal > 0 ? Math.round((orgTotal / globalTotal) * 1000) / 10 : 0

  const hasData = !isLoading && (orgTotal > 0 || globalTotal > 0)

  // Kind breakdown — org vs global side-by-side grouped bars.
  const kinds = useMemo(() => {
    const set = new Set([...Object.keys(orgStats), ...Object.keys(globalStats)])
    return [...set].sort((a, b) => (globalStats[b] ?? 0) - (globalStats[a] ?? 0))
  }, [orgStats, globalStats])

  const donutData: DonutDatum[] = useMemo(
    () => Object.entries(orgStats)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => ({ label: kindLabel(k), value: n })),
    [orgStats],
  )

  // Feed freshness: most-stale OK timestamp across active feeds.
  const stalest = useMemo(() => {
    if (!feedStatus?.feeds?.length) return null
    let oldest: number | null = null
    for (const f of feedStatus.feeds) {
      if (!f.last_ok_at) continue
      const t = Date.parse(f.last_ok_at)
      if (Number.isNaN(t)) continue
      if (oldest === null || t < oldest) oldest = t
    }
    if (oldest === null) return null
    return Math.round((Date.now() - oldest) / 60000)
  }, [feedStatus])
  const exposureQueue = useMemo(() => {
    return Object.entries(orgStats)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([kind, count]) => {
        const severity = exposureKinds.includes(kind) ? 'high' : kind === 'c2' ? 'critical' : 'medium'
        return {
          id: kind,
          title: kindLabel(kind),
          subtitle: `${globalStats[kind] ?? 0} global catalog entries`,
          meta: exposureKinds.includes(kind) ? 'org exposure signal' : 'monitoring signal',
          value: count,
          severity: severity as 'critical' | 'high' | 'medium',
        }
      })
  }, [orgStats, globalStats])

  return (
    <ManagerDashboard
      title={t('threatIntel.iocLookup')}
      subtitle={t('threatIntel.iocLookupLede')}
      accent={ACCENT}
      titleIcon={<Crosshair size={20} />}
      layout="hero-split"
      hero={
        <ManagerHero
          accent={ACCENT}
          icon={<Crosshair size={15} />}
          minHeight={200}
          tintValue={false}
          visual={
            hasData ? (
              <OrgVsGlobalBar
                orgValue={orgFocalHits}
                globalValue={globalFocalHits}
              />
            ) : undefined
          }
          headline={{
            label: t('threatIntel.orgExposureFocal'),
            value: (
              <Box component="span" sx={{ color: orgFocalHits > 0 ? colors.semantic.danger : 'text.primary' }}>
                {hasData ? orgFocalHits : '—'}
              </Box>
            ),
            sub: hasData
              ? tOr('threatIntel.orgExposureFocalLede',
                  `C2 / credential / stealer indicators scoped to your org — your exposure out of ${globalFocalHits.toLocaleString()} in the global catalog.`)
              : t('threatIntel.noOrgHits'),
            delta: hasData && orgFocalHits > 0 ? (
              <Chip
                size="small"
                icon={<AlertTriangle size={13} />}
                label={t('threatIntel.ourExposure')}
                sx={{
                  fontWeight: 700, fontSize: 12,
                  bgcolor: alpha(colors.semantic.danger, 0.14),
                  color: colors.semantic.danger,
                  '& .MuiChip-icon': { color: 'inherit' },
                }}
              />
            ) : undefined,
          }}
          aside={
            <Box>
              <HeroStat
                icon={<Radar size={14} />}
                tone={colors.semantic.danger}
                label={t('threatIntel.scopeOrg')}
                value={hasData ? orgTotal : '—'}
              />
              <HeroStat
                icon={<Database size={14} />}
                tone={ACCENT}
                label={t('threatIntel.scopeGlobal')}
                value={hasData ? globalTotal.toLocaleString() : '—'}
              />
              <HeroStat
                icon={<ShieldCheck size={14} />}
                tone={
                  stalest == null ? undefined
                    : stalest < 120 ? colors.semantic.success
                    : colors.semantic.warning
                }
                label={t('threatIntel.feedFreshness')}
                value={stalest != null ? `${stalest}m` : (hasData ? `${orgSharePct}%` : '—')}
              />
            </Box>
          }
        />
      }
      kpis={
        <>
          <KpiCard
            label={t('threatIntel.orgExposureHits')}
            value={hasData ? orgExposure : null}
            invertDelta
            loading={isLoading}
            empty={!isLoading && orgTotal === 0 && globalTotal === 0}
            emptyHint={t('threatIntel.noOrgHits')}
          />
          <KpiCard
            label={t('threatIntel.orgC2')}
            value={hasData ? c2Count : null}
            invertDelta
            loading={isLoading}
          />
          <KpiCard
            label={t('threatIntel.orgIndicators')}
            value={hasData ? orgTotal : null}
            loading={isLoading}
          />
          <KpiCard
            label={t('threatIntel.globalIndicators')}
            value={hasData ? globalTotal : null}
            loading={isLoading}
          />
        </>
      }
      charts={
        <>
          {/* The org-vs-global TOTAL split moved to the hero (diverging
              bar + org/global aside), so the duplicate totals comparison
              is gone. The per-kind grouped bar below keeps the breakdown
              the hero collapses, and the donut keeps org composition. */}
          <ChartCard title={t('threatIntel.iocByKindDetail')}>
            {hasData ? (
              <StackedBarChart
                categories={kinds.map(kindLabel)}
                series={[
                  { name: t('threatIntel.scopeOrg'), data: kinds.map(k => orgStats[k] ?? 0), severity: 'high' },
                  { name: t('threatIntel.scopeGlobal'), data: kinds.map(k => globalStats[k] ?? 0), severity: 'low' },
                ]}
                stacked={false}
                height={260}
              />
            ) : (
              <EmptyChart loading={isLoading} />
            )}
          </ChartCard>
          <ChartCard title={t('threatIntel.orgKindShare')}>
            {hasData && donutData.length > 0 ? (
              <DonutChart data={donutData} totalLabel={t('threatIntel.orgIndicators')} height={260} />
            ) : (
              <EmptyChart loading={isLoading} />
            )}
          </ChartCard>
        </>
      }
      workItems={
        <ManagerActionList
          title={t('threatIntel.iocReviewQueue')}
          subtitle={t('threatIntel.iocReviewQueueLede')}
          items={exposureQueue}
          emptyText={t('threatIntel.noOrgHits')}
          actionLabel={t('common.review')}
        />
      }
      narrative={
        feedStatus && feedStatus.feeds.length > 0 ? (
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
              {t('threatIntel.feedFreshness')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              {stalest !== null
                ? tOr('threatIntel.feedFreshnessLede',
                    `Oldest successful feed refresh was ${stalest} minutes ago. Indicator coverage stays current while feeds run green.`)
                : t('threatIntel.feedNoRun')}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
              {feedStatus.feeds.map(f => {
                const lastOk = f.last_ok_at ? Date.parse(f.last_ok_at) : NaN
                const ageMin = Number.isNaN(lastOk) ? null : Math.round((Date.now() - lastOk) / 60000)
                const hasError = !!f.last_error
                const tone = hasError ? RAW.red500 : (ageMin !== null && ageMin < 120 ? RAW.green500 : RAW.slate400)
                return (
                  <Chip
                    key={f.source}
                    size="small"
                    variant="outlined"
                    label={`${f.source} · ${f.rows_ingested.toLocaleString()} · ${ageMin !== null ? `${ageMin}m` : (hasError ? 'err' : '·')}`}
                    sx={{ fontSize: 12, height: 22, color: tone, borderColor: tone }}
                    title={hasError ? f.last_error : undefined}
                  />
                )
              })}
            </Box>
          </Box>
        ) : undefined
      }
    />
  )
}

/** OrgVsGlobalBar — the hero focal visual: two diverging horizontal
 *  bars contrasting OUR scoped active-compromise hits (red) against the
 *  global catalog of the same kinds (accent). No new data — both values
 *  are summed from the stats the view already fetched. */
function OrgVsGlobalBar({ orgValue, globalValue }: { orgValue: number; globalValue: number }) {
  const max = Math.max(orgValue, globalValue, 1)
  const orgPct = Math.max(2, Math.round((orgValue / max) * 100))
  const globalPct = Math.max(2, Math.round((globalValue / max) * 100))
  const rows: { label: string; value: number; pct: number; tone: string }[] = [
    { label: t('threatIntel.scopeOrg'), value: orgValue, pct: orgPct, tone: colors.semantic.danger },
    { label: t('threatIntel.scopeGlobal'), value: globalValue, pct: globalPct, tone: ACCENT },
  ]
  return (
    <Box sx={{ width: { xs: '100%', md: 200 }, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      {rows.map((r) => (
        <Box key={r.label}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary' }}>
              {r.label}
            </Typography>
            <Typography sx={{ fontSize: 13, fontWeight: 800, fontFamily: 'ui-monospace, monospace', color: r.tone }}>
              {r.value.toLocaleString()}
            </Typography>
          </Box>
          <Box sx={{ height: 8, borderRadius: 4, bgcolor: alpha(r.tone, 0.12), overflow: 'hidden' }}>
            <Box sx={{ width: `${r.pct}%`, height: '100%', borderRadius: 4, bgcolor: r.tone }} />
          </Box>
        </Box>
      ))}
    </Box>
  )
}

function EmptyChart({ loading }: { loading: boolean }) {
  return (
    <Box sx={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.secondary', fontSize: 13 }}>
      {loading ? t('common.loading') : t('threatIntel.noIoCs')}
    </Box>
  )
}
