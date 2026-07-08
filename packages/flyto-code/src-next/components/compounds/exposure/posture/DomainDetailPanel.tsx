import type { ReactNode } from 'react'
import { Box, Typography, Chip, Button, IconButton } from '@mui/material'
import { Activity, AlertTriangle, CheckCircle2, Clock3, Database, Globe2, X } from 'lucide-react'
import { t } from '@lib/i18n';
import { JellyCard } from '@atoms/JellyCard'
import { GradeCircle } from '@compounds/_shared/GradeCircle'
import { displayScore, GRADE_COLORS } from '@compounds/_shared/scoring'
import { RAW } from '@lib/tokens/severity'

// Right-column "資訊詳細" panel for the selected domain. Extracted verbatim
// from PostureOverview.tsx (behaviour-neutral split). DetailStatRow is its
// only consumer, so it lives here too.

export function DomainDetailPanel({
  domain,
  onClear,
  onViewFindings,
}: {
  domain: {
    domain: string
    environment?: string
    asset_count: number
    issue_count: number
    score?: number | null
    grade?: string | null
    domainScored?: boolean
  } | null
  onClear: () => void
  onViewFindings: () => void
}) {
  if (!domain) {
    return (
      <JellyCard delay={0.28} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div className="exp-card" style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          flex: 1, padding: 28, textAlign: 'center', gap: 12,
        }}>
          <Globe2 size={36} style={{ opacity: 0.32 }} />
          <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 240 }}>
            {t('external.detailEmptyTitle')}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 12, maxWidth: 260, lineHeight: 1.5 }}>
            {t('external.detailEmptyDesc')}
          </Typography>
        </div>
      </JellyCard>
    )
  }
  const hasScore = domain.domainScored !== false && typeof domain.score === 'number' && Number.isFinite(domain.score)
  const grade = hasScore ? (domain.grade || '').toUpperCase() : '--'
  const gc = hasScore ? (GRADE_COLORS[domain.grade || ''] ?? '#94a3b8') : '#94a3b8'
  const statusColor = domain.issue_count > 0 ? RAW.orange500 : hasScore ? RAW.green500 : '#64748b'
  const statusLabel = domain.issue_count > 0
    ? '\u9700\u8655\u7406'
    : hasScore
      ? '\u5df2\u8a55\u5206'
      : '\u7b49\u5f85\u8a55\u5206'
  return (
    <JellyCard delay={0.28} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div className="exp-card" style={{
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden', minHeight: 0, flex: 1, padding: 0,
      }}>
        {/* Header row */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          padding: '12px 16px', borderBottom: '1px solid var(--mui-palette-divider)',
        }}>
          <div style={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', mb: 0.5 }}>
              {t('external.detailHeader')}
            </Typography>
            <Typography sx={{ fontSize: 15, fontWeight: 700, fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {domain.domain}
            </Typography>
            <Chip
              label={domain.environment || 'production'}
              size="small"
              sx={{ height: 18, fontSize: 12, mt: 0.75 }}
            />
          </div>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Chip
              size="small"
              label={statusLabel}
              sx={{
                height: 22,
                borderRadius: 1,
                color: statusColor,
                fontWeight: 900,
                bgcolor: `color-mix(in srgb, ${statusColor} 12%, transparent)`,
              }}
            />
            <IconButton size="small" onClick={onClear} aria-label={t('posture.clearSelection')}>
              <X size={14} />
            </IconButton>
          </Box>
        </div>

        {/* Score block */}
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: 'auto minmax(0, 1fr)',
          gap: 1.5,
          alignItems: 'center',
          p: 1.5,
          borderBottom: '1px solid var(--mui-palette-divider)',
          bgcolor: 'background.default',
        }}>
          {hasScore
            ? <GradeCircle grade={grade} color={gc} size={56} />
            : (
              <Box sx={{
                width: 56,
                height: 56,
                borderRadius: 999,
                display: 'grid',
                placeItems: 'center',
                color: 'text.secondary',
                border: '1px solid var(--mui-palette-divider)',
                bgcolor: 'background.paper',
              }}>
                <Clock3 size={22} />
              </Box>
            )}
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 34, fontWeight: 900, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {hasScore ? displayScore(domain.score!) : '--'}
            </Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.5, fontWeight: 800 }}>
              {hasScore ? `${t('external.detailScore')} · ${grade}` : '\u5f8c\u7aef\u5c1a\u672a\u7522\u751f\u8a55\u5206'}
            </Typography>
          </Box>
        </Box>

        <Box sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 1,
          p: 1.5,
          borderBottom: '1px solid var(--mui-palette-divider)',
        }}>
          <DetailStatTile label={t('external.detailAssets')} value={domain.asset_count} tone="default" icon={<Database size={15} />} />
          <DetailStatTile label={t('external.detailIssues')} value={domain.issue_count} tone={domain.issue_count > 0 ? 'warn' : 'good'} icon={domain.issue_count > 0 ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />} />
        </Box>

        <Box sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          p: 1.5,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
        }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 950, display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Activity size={15} color="var(--exp-accent)" />
            {'\u8a3a\u65b7\u72c0\u614b'}
          </Typography>
          <DetailSignalRow
            label="Kernel"
            value={hasScore ? `${grade} / ${displayScore(domain.score!)}` : '\u7b49\u5f85\u5f8c\u7aef\u8a55\u5206'}
            good={hasScore}
          />
          <DetailSignalRow
            label="Assets"
            value={domain.asset_count > 0 ? '\u5df2\u5c0d\u61c9\u8cc7\u7522' : '\u5c1a\u672a\u5c0d\u61c9\u8cc7\u7522'}
            good={domain.asset_count > 0}
          />
          <DetailSignalRow
            label="Findings"
            value={domain.issue_count > 0 ? '\u6709\u958b\u555f\u554f\u984c' : '\u76ee\u524d\u7121\u958b\u555f findings'}
            good={domain.issue_count === 0}
          />
          <Box sx={{
            border: '1px solid var(--mui-palette-divider)',
            borderRadius: 1,
            p: 1.2,
            bgcolor: 'background.default',
          }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 850, display: 'block', mb: 0.5 }}>
              {'\u4e0b\u4e00\u6b65'}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 850, lineHeight: 1.55 }}>
              {hasScore
                ? domain.issue_count > 0
                  ? '\u9032\u5165 findings \u67e5\u770b\u6b77\u53f2\u3001Rolled Up ID \u8207\u4fee\u5fa9\u72c0\u614b\u3002'
                  : '\u5f8c\u7aef\u5df2\u8a55\u5206\uff0c\u76ee\u524d\u6c92\u6709\u958b\u555f\u554f\u984c\u3002'
                : '\u7b49\u5f85\u5f8c\u7aef kernel \u5beb\u5165\u8a55\u5206\uff1b\u524d\u7aef\u4e0d\u63a8\u6e2c\u6eff\u5206\u3002'}
            </Typography>
          </Box>
          <Box sx={{
            flex: 1,
            minHeight: 118,
            border: '1px solid var(--mui-palette-divider)',
            borderRadius: 1,
            p: 1.2,
            bgcolor: 'background.default',
            display: 'flex',
            flexDirection: 'column',
            gap: 0.8,
          }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 850 }}>
              {'\u8cc7\u6599\u7f3a\u53e3'}
            </Typography>
            <DataGapPill label="Kernel score" ready={hasScore} />
            <DataGapPill label="Asset mapping" ready={domain.asset_count > 0} />
            <DataGapPill label="No open findings" ready={domain.issue_count === 0} />
          </Box>
        </Box>

        {/* Actions */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 6,
          padding: '12px 16px',
          borderTop: '1px solid var(--mui-palette-divider)',
        }}>
          <Button
            size="small"
            variant="outlined"
            fullWidth
            onClick={() => onViewFindings()}
            endIcon={<Activity size={14} />}
            sx={{ justifyContent: 'space-between', textTransform: 'none', fontWeight: 900 }}
          >
            {t('external.detailViewFindings')}
          </Button>
        </div>
      </div>
    </JellyCard>
  )
}

function DetailStatTile({ label, value, tone, icon }: { label: string; value: number; tone: 'default' | 'warn' | 'good'; icon: ReactNode }) {
  const color = tone === 'warn' ? RAW.orange500 : tone === 'good' ? RAW.green500 : 'var(--mui-palette-text-primary)'
  return (
    <Box sx={{
      border: '1px solid var(--mui-palette-divider)',
      borderRadius: 1,
      px: 1.1,
      py: 1,
      minWidth: 0,
      bgcolor: 'background.default',
    }}>
      <Typography sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 0.6 }} noWrap>
        <Box component="span" sx={{ color, display: 'inline-flex' }}>{icon}</Box>
        {label}
      </Typography>
      <Typography sx={{ fontSize: 19, fontWeight: 950, color, fontVariantNumeric: 'tabular-nums', mt: 0.45 }}>
        {value > 0 ? value : '—'}
      </Typography>
    </Box>
  )
}

function DetailSignalRow({ label, value, good }: { label: string; value: string; good: boolean }) {
  const color = good ? RAW.green500 : '#64748b'
  return (
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: '84px minmax(0, 1fr)',
      gap: 1,
      alignItems: 'center',
      border: '1px solid var(--mui-palette-divider)',
      borderRadius: 1,
      px: 1.1,
      py: 0.95,
      bgcolor: 'background.default',
      boxShadow: `inset 2px 0 0 ${color}`,
    }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 850 }}>{label}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 900 }} noWrap title={value}>{value}</Typography>
    </Box>
  )
}

function DataGapPill({ label, ready }: { label: string; ready: boolean }) {
  const ok = ready
  const color = ok ? RAW.green500 : RAW.orange500
  return (
    <Box sx={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 1,
      px: 0.9,
      py: 0.7,
      borderRadius: 1,
      border: '1px solid var(--mui-palette-divider)',
      bgcolor: 'background.paper',
    }}>
      <Typography variant="caption" sx={{ fontWeight: 850 }} noWrap>{label}</Typography>
      <Chip
        size="small"
        label={ok ? 'OK' : 'MISSING'}
        sx={{
          height: 20,
          borderRadius: 0.8,
          color,
          bgcolor: `color-mix(in srgb, ${color} 12%, transparent)`,
          fontWeight: 950,
          fontSize: 10,
        }}
      />
    </Box>
  )
}
