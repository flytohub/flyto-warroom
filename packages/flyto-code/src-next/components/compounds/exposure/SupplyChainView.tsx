/**
 * Supply Chain — third-party vendor risk intelligence across all domains.
 * Shows which vendors your domains depend on and their risk profile.
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Chip } from '@mui/material'
import { Package, Link2, AlertTriangle, ShieldCheck } from 'lucide-react'
import { useOrg } from '@hooks/useOrg'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { Loading, Empty } from '../scanning/_shared'
import { getExternalPosture } from './shared'
import { KpiTile, KpiRow } from './KpiTile'

// Backend returns one row per vendor-domain pair (a single vendor
// like "Varnish" appears N times when it's detected on N subdomains).
// Surface that as one row per vendor with the affected domains
// collapsed into a list. Pick the WORST criticality + max risk_score
// across instances so we don't soften the signal on aggregation.
type RawRisk = { name: string; category: string; criticality: string; risk_score: number; domain: string }
type DedupedRisk = { name: string; category: string; criticality: string; risk_score: number; domains: string[] }

const CRIT_RANK: Record<string, number> = { critical: 3, high: 2, medium: 1, low: 0 }

function dedupeByVendor(rows: RawRisk[]): DedupedRisk[] {
  const byName = new Map<string, DedupedRisk>()
  for (const r of rows) {
    const existing = byName.get(r.name)
    if (!existing) {
      byName.set(r.name, {
        name: r.name,
        category: r.category,
        criticality: r.criticality,
        risk_score: r.risk_score,
        domains: r.domain ? [r.domain] : [],
      })
      continue
    }
    if (r.domain && !existing.domains.includes(r.domain)) existing.domains.push(r.domain)
    if ((CRIT_RANK[r.criticality] ?? 0) > (CRIT_RANK[existing.criticality] ?? 0)) {
      existing.criticality = r.criticality
    }
    if (r.risk_score > existing.risk_score) existing.risk_score = r.risk_score
  }
  // Sort by criticality desc, then risk_score desc — most urgent on top.
  return Array.from(byName.values()).sort((a, b) => {
    const ca = CRIT_RANK[a.criticality] ?? 0
    const cb = CRIT_RANK[b.criticality] ?? 0
    if (cb !== ca) return cb - ca
    return b.risk_score - a.risk_score
  })
}

export interface SupplyChainViewProps { embedded?: boolean }

export function SupplyChainView({ embedded }: SupplyChainViewProps = {}) {
  const { org } = useOrg()
  const orgId = org?.id

  const { data, isLoading } = useQuery({
    queryKey: qk.externalPosture(orgId),
    queryFn: () => getExternalPosture(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const supply = data?.supply_chain
  const dedupedRisks = useMemo(
    () => dedupeByVendor((supply?.top_risks ?? []) as RawRisk[]),
    [supply?.top_risks],
  )

  return (
    <div className="exp-root" style={{ '--exp-accent': '#8b5cf6', '--exp-accent-end': '#a78bfa' } as React.CSSProperties}>
      {/* Header — hidden when embedded in PostureOverview tab. */}
      {!embedded && (
        <div className="exp-header">
          <div className="exp-header-icon"><Package size={20} /></div>
          <div>
            <div className="exp-header-title">{t('external.supplyChainTitle')}</div>
            <div className="exp-header-sub">{t('external.supplyChainSub')}</div>
          </div>
        </div>
      )}

      {isLoading && <Loading />}

      {!isLoading && (!supply || supply.total_vendors === 0) && (
        <Empty
          icon={Package}
          text={t('external.noVendors')}
          description={t('external.noVendorsDesc')}
        />
      )}

      {!isLoading && supply && supply.total_vendors > 0 && (
        <div style={{
          flex: 1, minHeight: 0,
          display: 'flex', flexDirection: 'column',
          gap: 14, overflow: 'auto',
        }}>
          {/* Row 1: KPI tiles — unified KpiTile across all CTEM pages */}
          <KpiRow>
            <KpiTile
              icon={Package}
              value={supply.total_vendors}
              label={t('external.totalVendors')}
              tone="neutral"
            />
            <KpiTile
              icon={AlertTriangle}
              value={supply.critical_vendors}
              label={t('external.criticalRisk')}
              tone="critical"
            />
            <KpiTile
              value={Math.round(supply.avg_risk_score)}
              label={t('external.avgRiskScore')}
              hint={t('external.outOf100')}
              tone={supply.avg_risk_score >= 50 ? 'critical' : supply.avg_risk_score >= 30 ? 'high' : 'ok'}
            />
            <KpiTile
              icon={ShieldCheck}
              value={supply.risk_level.toUpperCase()}
              label={t('external.overallRisk')}
              tone={supply.risk_level === 'critical' ? 'critical'
                  : supply.risk_level === 'high' ? 'high'
                  : supply.risk_level === 'medium' ? 'medium'
                  : 'ok'}
            />
          </KpiRow>

          {/* Row 2: Vendor list (scrollable) */}
          <div className="exp-card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
            <div className="exp-card-head" style={{ padding: '14px 22px' }}>
              <Link2 size={16} style={{ color: '#8b5cf6' }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                {t('external.vendorBreakdown')}
              </span>
              {supply.critical_vendors > 0 && (
                <Chip
                  icon={<AlertTriangle size={12} />}
                  label={`${supply.critical_vendors} critical`}
                  size="small"
                  sx={{ height: 22, fontSize: 13, bgcolor: '#ef444418', color: '#ef4444' }}
                />
              )}
            </div>

            {/* Column headers */}
            <div className="exp-col-head" style={{ gridTemplateColumns: '1fr 100px 100px 80px 140px' }}>
              <div>{t('external.vendor')}</div>
              <div>{t('external.category')}</div>
              <div>{t('external.criticality')}</div>
              <div style={{ textAlign: 'center' }}>{t('external.risk')}</div>
              <div>{t('external.usedBy')}</div>
            </div>

            <div style={{ flex: 1, overflow: 'auto', minHeight: 0, paddingRight: 6 }}>
              {dedupedRisks.map((v, i) => (
                <div key={i} className="exp-row" style={{ gridTemplateColumns: '1fr 100px 100px 80px 140px', padding: '14px 20px' }}>
                  <div style={{ fontWeight: 600 }}>{v.name}</div>
                  <div>
                    <Chip label={v.category} size="small" variant="outlined" sx={{ height: 22, fontSize: 12 }} />
                  </div>
                  <div>
                    <Chip label={v.criticality} size="small" sx={{
                      height: 22, fontSize: 12, fontWeight: 700,
                      bgcolor: v.criticality === 'critical' ? '#ef444418' : v.criticality === 'high' ? '#f9731618' : '#94a3b818',
                      color: v.criticality === 'critical' ? '#ef4444' : v.criticality === 'high' ? '#f97316' : '#94a3b8',
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <RiskBar score={v.risk_score} />
                  </div>
                  <div
                    className="exp-mono"
                    title={v.domains.join(', ')}
                    style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {v.domains.length === 0 ? '—'
                      : v.domains.length === 1 ? v.domains[0]
                      : `${v.domains[0]} +${v.domains.length - 1}`}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Row 3: Recommendations (pinned at bottom) */}
          <div className="exp-info" style={{ flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <ShieldCheck size={16} />
              {t('external.supplyChainAdvice')}
            </span>
            <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.8 }}>
              {supply.critical_vendors > 0
                ? t('external.supplyAdviceCritical')
                : t('external.supplyAdviceOk')}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function RiskBar({ score }: { score: number }) {
  const color = score >= 60 ? '#ef4444' : score >= 40 ? '#f97316' : score >= 20 ? '#eab308' : '#22c55e'
  return (
    <div className="exp-risk-bar">
      <div className="exp-risk-bar-track">
        <div className="exp-risk-bar-fill" style={{ width: `${score}%`, background: color }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{score}</span>
    </div>
  )
}
