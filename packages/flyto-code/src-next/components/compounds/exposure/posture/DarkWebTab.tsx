import { Alert, Box, Chip } from '@mui/material'
import { AlertTriangle, Check } from 'lucide-react'
import { t } from '@lib/i18n';
import { colors, softBg } from '@/styles/designTokens'
import type { LeakExposureResponse } from '@lib/engine'
import { Loading, Empty } from '@compounds/scanning/_shared'

// DarkWebTab — renders HIBP exposure per domain (breach count, total pwned,
// worst breach). Extracted verbatim from PostureOverview.tsx
// (behaviour-neutral split).

export function DarkWebTab({ data }: { data?: LeakExposureResponse }) {
  if (!data) {
    return <Loading />
  }
  if (data.domain_count === 0) {
    return (
      <Empty
        icon={AlertTriangle}
        text={t('darkweb.noDomains')}
        description={t('darkweb.noDomainsDesc')}
      />
    )
  }
  const hits = data.domains.filter(d => d.breach_count > 0)
  const unassessed = data.domains.filter(d => d.status === 'not_assessed' || !!d.error_code)
  const failedCount = data.failed_count ?? unassessed.length
  const checkedCount = data.checked_count ?? Math.max(0, data.domain_count - failedCount)
  const hasAssessmentGap = failedCount > 0 || data.status === 'partial' || data.status === 'not_assessed'
  const statusColor = hits.length > 0
    ? colors.severity.high
    : hasAssessmentGap
      ? colors.semantic.warning
      : colors.semantic.success
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{
        display: 'flex', gap: 2, padding: '12px 16px',
        background: softBg(statusColor, 0.08),
        border: `1px solid ${softBg(statusColor, 0.20)}`,
        borderRadius: 1.5,
      }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 800, color: statusColor, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {data.hit_count}
          </div>
          <div style={{ fontSize: 12, textTransform: 'uppercase', fontWeight: 700, color: 'var(--mui-palette-text-secondary)', marginTop: 4 }}>
            {t('darkweb.breachedDomains')}
          </div>
        </div>
        <div style={{ width: 1, background: 'var(--mui-palette-divider)' }} />
        <div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--mui-palette-text-primary)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {data.total_pwned.toLocaleString()}
          </div>
          <div style={{ fontSize: 12, textTransform: 'uppercase', fontWeight: 700, color: 'var(--mui-palette-text-secondary)', marginTop: 4 }}>
            {t('darkweb.totalPwned')}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--mui-palette-text-tertiary)', alignSelf: 'center' }}>
          {t('darkweb.source')} · {checkedCount}/{data.domain_count} {t('darkweb.checked')}
        </div>
      </Box>

      {hasAssessmentGap && (
        <Alert severity="warning" sx={{ borderRadius: 1.5 }}>
          {data.message ?? t('darkweb.partialAssessment')}
        </Alert>
      )}

      {hits.length === 0 && !hasAssessmentGap && (
        <div className="exp-card" style={{ padding: 24, textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: colors.semantic.success }}>
            <Check size={14} aria-hidden />
            {t('darkweb.allClear')}
          </div>
        </div>
      )}

      <Box sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))',
        gap: 1.5,
      }}>
        {hits.map(d => (
          <div key={d.domain} className="exp-card" style={{
            borderLeft: `3px solid ${d.sensitive_hit ? colors.severity.critical : colors.severity.high}`,
            padding: 14,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, fontSize: 13 }}>{d.domain}</span>
              {d.sensitive_hit && (
                <Chip size="small" label={t('darkweb.sensitive')} sx={{
                  height: 18, fontSize: 12, fontWeight: 700,
                  bgcolor: softBg(colors.severity.critical, 0.18),
                  color: colors.severity.critical,
                }} />
              )}
              <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--mui-palette-text-secondary)' }}>
                {d.breach_count} {t('darkweb.breaches')}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--mui-palette-text-secondary)', marginBottom: 6 }}>
              {d.total_pwned.toLocaleString()} {t('darkweb.accountsLeaked')}
            </div>
            {d.worst_breach && (
              <div style={{
                fontSize: 13, padding: '8px 10px', borderRadius: 6,
                background: softBg(colors.semantic.neutral, 0.10),
                color: 'var(--mui-palette-text-secondary)',
              }}>
                <strong>{d.worst_breach.Title || d.worst_breach.Name}</strong>
                {d.worst_breach.BreachDate && <> ({d.worst_breach.BreachDate})</>}
              </div>
            )}
          </div>
        ))}
        {unassessed.map(d => (
          <div key={`${d.domain}-not-assessed`} className="exp-card" style={{
            borderLeft: `3px solid ${colors.semantic.warning}`,
            padding: 14,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, fontSize: 13 }}>{d.domain}</span>
              <Chip size="small" label={t('darkweb.notAssessed')} sx={{
                height: 18, fontSize: 12, fontWeight: 700,
                bgcolor: softBg(colors.semantic.warning, 0.18),
                color: colors.semantic.warning,
              }} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--mui-palette-text-secondary)' }}>
              {d.error ?? t('darkweb.providerUnavailable')}
            </div>
          </div>
        ))}
      </Box>
    </Box>
  )
}
