import { useMemo } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { FeedItem, FeedKind } from '@lib/engine'
import { t } from '@lib/i18n';
import { KIND_COLOR, SEV_BG } from './shared'

// CompositionBars — two stacked-segment cards side by side. Tells
// the user what their window is mostly *made of* (by kind, by
// severity). Severity card is hidden when no item carries severity.

export function CompositionBars({ items }: { items: FeedItem[] }) {
  const byKind = useMemo(() => {
    const c: Record<FeedKind, number> = { scan: 0, pentest: 0, score: 0, alert: 0, asset: 0, sla_breach: 0 }
    for (const i of items) c[i.kind]++
    return c
  }, [items])

  const bySev = useMemo(() => {
    const c: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
    for (const i of items) {
      if (i.severity) c[i.severity] = (c[i.severity] ?? 0) + 1
    }
    return c
  }, [items])

  const total = items.length
  const sevTotal = Object.values(bySev).reduce((a, b) => a + b, 0)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <CompositionBar
        label={t('history.byKind')}
        segments={(Object.keys(byKind) as FeedKind[]).map(k => ({
          label: k, value: byKind[k], color: KIND_COLOR[k],
        }))}
        total={total}
      />
      {sevTotal > 0 && (
        <CompositionBar
          label={t('history.bySeverity')}
          segments={Object.keys(bySev).map(s => ({
            label: s,
            value: bySev[s],
            color: SEV_BG[s]?.replace('20', '') || '#94a3b8',
          }))}
          total={sevTotal}
        />
      )}
    </Box>
  )
}

// CompositionBar — flat stacked bar + legend. Sits inside the parent's
// SectionCard; no self-card chrome.
function CompositionBar({
  label, segments, total,
}: {
  label: string
  segments: Array<{ label: string; value: number; color: string }>
  total: number
}) {
  const visible = segments.filter(s => s.value > 0)
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'baseline', mb: 0.75 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
          {label}
        </Typography>
        <Typography variant="caption" sx={{ ml: 'auto', color: 'text.secondary' }}>
          {total}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', height: 8, borderRadius: 1, overflow: 'hidden', bgcolor: 'rgba(148,163,184,0.12)' }}>
        {visible.map(s => (
          <Box key={s.label} sx={{ width: `${(s.value / total) * 100}%`, bgcolor: s.color }} />
        ))}
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 1.5, rowGap: 0.5, mt: 0.75 }}>
        {visible.map(s => (
          <Box key={s.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: s.color }} />
            <Typography variant="caption" sx={{ textTransform: 'capitalize', fontSize: 13 }}>{s.label}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 13 }}>{s.value}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
