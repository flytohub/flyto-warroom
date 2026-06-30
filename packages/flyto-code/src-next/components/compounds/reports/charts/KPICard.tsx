/**
 * KPICard — renders a single numeric KPI from aggregated data.
 */

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { t } from '@lib/i18n';

interface Props { rows: any[]; valueField?: string; labelField?: string }

export default function KPICard({ rows, valueField }: Props) {
  if (!rows.length) return <Typography variant="caption" color="text.secondary">{t('reports.noData')}</Typography>

  // If valueField specified, aggregate it
  if (valueField) {
    // Check if the field is a string (not numeric) — show the text instead of aggregating
    const firstVal = rows[0]?.[valueField]
    if (typeof firstVal === 'string' && isNaN(Number(firstVal))) {
      return (
        <Box sx={{ py: 1 }}>
          <Typography variant="body2" color="text.primary" sx={{ lineHeight: 1.6 }}>
            {firstVal}
          </Typography>
        </Box>
      )
    }

    const total = rows.reduce((s, r) => s + (Number(r[valueField]) || 0), 0)
    const avg = Math.round(total / rows.length)
    const label = valueField.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, py: 2 }}>
        <Typography fontWeight={700} sx={{ color: 'text.primary', fontSize: 36 }}>
          {total.toLocaleString()}
        </Typography>
        <Typography variant="body2" color="text.secondary">{label}</Typography>
        <Typography variant="caption" color="text.secondary">
          {t('reports.avgLabel')}: {avg} | {rows.length} {t('common.items')}
        </Typography>
      </Box>
    )
  }

  // Just show row count
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, py: 2 }}>
      <Typography fontWeight={700} sx={{ color: 'text.primary', fontSize: 36 }}>
        {rows.length.toLocaleString()}
      </Typography>
      <Typography variant="body2" color="text.secondary">{t('reports.totalRecords')}</Typography>
    </Box>
  )
}
