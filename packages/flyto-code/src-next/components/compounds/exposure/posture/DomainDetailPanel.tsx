import { Box, Typography, Chip, Button, IconButton } from '@mui/material'
import { Globe2, X } from 'lucide-react'
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
  domain: { domain: string; environment?: string; asset_count: number; issue_count: number; score: number; grade: string } | null
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
  const gc = GRADE_COLORS[domain.grade] ?? '#94a3b8'
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
          <IconButton size="small" onClick={onClear} aria-label={t('posture.clearSelection')}>
            <X size={14} />
          </IconButton>
        </div>

        {/* Score block */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16,
          padding: '18px 16px',
          borderBottom: '1px solid var(--mui-palette-divider)',
        }}>
          <GradeCircle grade={domain.grade} color={gc} size={56} />
          <div>
            <Typography sx={{ fontSize: 32, fontWeight: 600, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {displayScore(domain.score)}
            </Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.5 }}>
              {t('external.detailScore')} · {domain.grade.toUpperCase()}
            </Typography>
          </div>
        </div>

        {/* Stat rows */}
        <Box sx={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', minHeight: 0 }}>
          <DetailStatRow
            label={t('external.detailAssets')}
            value={domain.asset_count}
            tone="default"
          />
          <DetailStatRow
            label={t('external.detailIssues')}
            value={domain.issue_count}
            tone={domain.issue_count > 0 ? 'warn' : 'good'}
          />
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
            sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
          >
            {t('external.detailViewFindings')}
          </Button>
        </div>
      </div>
    </JellyCard>
  )
}

function DetailStatRow({ label, value, tone }: { label: string; value: number; tone: 'default' | 'warn' | 'good' }) {
  const color = tone === 'warn' ? RAW.orange500 : tone === 'good' ? RAW.green500 : 'var(--mui-palette-text-primary)'
  return (
    <Box sx={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      px: 2, py: 1.25,
      borderBottom: '1px solid var(--mui-palette-divider)',
      '&:last-of-type': { borderBottom: 'none' },
    }}>
      <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{label}</Typography>
      <Typography sx={{ fontSize: 14, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
        {value > 0 ? value : '—'}
      </Typography>
    </Box>
  )
}
