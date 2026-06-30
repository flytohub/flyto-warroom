import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Chip, Collapse, ButtonBase } from '@mui/material'
import {
  Search, Clock, ChevronDown, ShieldAlert,
} from 'lucide-react'
import { useOrg } from '@hooks/useOrg'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { Loading, Empty } from '../scanning/_shared'
import { getExternalPostureKernel, SEVERITY_ORDER, SEV_COLORS } from './shared'
import { kernelAssetsToIntelIssues } from './externalModel'

export function DomainIntel() {
  const { org } = useOrg()
  const orgId = org?.id

  const { data, isLoading } = useQuery({
    queryKey: qk.externalPostureKernel(orgId),
    queryFn: () => getExternalPostureKernel(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const sortedIssues = kernelAssetsToIntelIssues(data?.assets).sort((a, b) =>
    (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
  )
  // Supply-chain section removed — has its own dedicated `exp-supply`
  // page. The Domain Intel surface is now strictly findings + fix
  // guidance, no duplicated vendor risk panel.

  return (
    <div className="exp-root" style={{ '--exp-accent': '#f97316', '--exp-accent-end': '#fb923c' } as React.CSSProperties}>
      {/* Header */}
      <div className="exp-header">
        <div className="exp-header-icon"><Search size={20} /></div>
        <div>
          <div className="exp-header-title">{t('external.intelTitle')}</div>
          <div className="exp-header-sub">{t('external.intelSub')}</div>
        </div>
        {sortedIssues.length > 0 && <span className="exp-count">{sortedIssues.length}</span>}
      </div>

      {isLoading && <Loading />}

      {!isLoading && (!data || data.asset_count === 0) && (
        <Empty
          icon={Search}
          text={t('external.noDomains')}
          description={t('external.noDomainsDesc')}
        />
      )}

      {!isLoading && data && data.asset_count > 0 && (
        <div style={{
          flex: 1, minHeight: 0,
          display: 'grid',
          gridTemplateColumns: '1fr',
          gridTemplateRows: '1fr',
          gap: 14,
        }}>
          {/* Issues with full remediation (scrollable) */}
          <div className="exp-card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
            <div className="exp-card-head" style={{ padding: '14px 22px' }}>
              <ShieldAlert size={18} style={{ color: '#f97316' }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                {t('external.issuesRemediation')}
              </span>
              <span className="exp-count">{sortedIssues.length}</span>
            </div>

            <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
              {sortedIssues.length === 0 && (
                <div style={{ padding: 24, textAlign: 'center' }}>
                  <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                    {t('external.noIssues')}
                  </span>
                </div>
              )}

              {sortedIssues.map((issue, i) => (
                <IssueRow key={i} issue={issue} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function IssueRow({ issue }: {
  issue: { domain: string; category: string; severity: string; description: string; est_fix_time: string; recommendation: string }
}) {
  const [open, setOpen] = useState(false)
  const sevColor = SEV_COLORS[issue.severity] ?? '#94a3b8'
  return (
    <div style={{ borderBottom: '1px solid var(--mui-palette-divider, rgba(255,255,255,0.05))', borderLeft: `4px solid ${sevColor}` }}>
      <ButtonBase
        onClick={() => setOpen(!open)}
        sx={{
          width: '100%', padding: '14px 20px 14px 16px', textAlign: 'left', display: 'block',
          '&:hover': { bgcolor: 'rgba(167,139,250,0.06)' },
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
          <span className={`exp-sev exp-sev-${issue.severity}`}>{issue.severity}</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{issue.description}</span>
          <Chip label={issue.category} size="small" variant="outlined" sx={{ height: 20, fontSize: 12, flexShrink: 0 }} />
          <span className="exp-mono" style={{ flexShrink: 0 }}>{issue.domain}</span>
          <ChevronDown size={14} style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0)', opacity: 0.3, flexShrink: 0 }} />
        </div>
      </ButtonBase>
      <Collapse in={open}>
        <div className="exp-expand-body">
          <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock size={10} /> {t('external.estFix')}: {issue.est_fix_time}
            </span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 8, lineHeight: 1.6, margin: '0 0 8px' }}>
            {issue.recommendation}
          </p>
        </div>
      </Collapse>
    </div>
  )
}
