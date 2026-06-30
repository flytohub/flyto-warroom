import Chart from 'react-apexcharts'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { t } from '@lib/i18n';
import { CHART_PALETTE } from '../designTokens'

interface Props { labels: string[]; values: number[]; gauge?: boolean; chartId?: string }

const COLORS = CHART_PALETTE.slice(0, 5)

export default function ApexRadialBar({ labels, values, gauge, chartId }: Props) {
  if (values.length === 0 || values.every(v => v === 0)) {
    return (
      <Box sx={{ py: 3, textAlign: 'center' }}>
        <Typography variant="caption" color="text.secondary">{t('reports.noData')}</Typography>
      </Box>
    )
  }

  const maxVal = Math.max(...values, 1)
  const pcts = values.map(v => Math.round((v / maxVal) * 100))
  const pctToVal = new Map<number, number>()
  pcts.forEach((p, i) => pctToVal.set(p, values[i]))

  return (
    <div>
      <Chart
        type="radialBar"
        height={gauge ? 200 : 240}
        series={pcts}
        options={{
          chart: { id: chartId, background: 'transparent' },
          theme: { mode: 'dark' },
          labels: labels,
          colors: [...COLORS],
          plotOptions: {
            radialBar: {
              hollow: { size: gauge ? '60%' : '30%' },
              track: { background: 'rgba(255,255,255,0.1)' },
              dataLabels: {
                name: { fontSize: '13px', color: '#9ca3af', show: true },
                value: {
                  fontSize: gauge ? '24px' : '14px',
                  fontWeight: 700,
                  color: '#fff',
                  show: true,
                  formatter: (val: number) => {
                    const orig = pctToVal.get(Math.round(val))
                    return orig !== undefined ? String(orig) : String(Math.round(val))
                  },
                },
                total: {
                  show: !gauge && labels.length > 1,
                  label: t('common.total'),
                  fontSize: '12px',
                  color: '#9ca3af',
                  formatter: () => String(values.reduce((s, v) => s + v, 0)),
                },
              },
            },
          },
          legend: { show: false },
        }}
      />
      {/* Legend table below chart — each color + label + value */}
      {!gauge && labels.length > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 4, padding: '0 8px' }}>
          {labels.map((label, i) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: COLORS[i % COLORS.length], flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--mui-palette-text-secondary)' }}>{label}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--mui-palette-text-primary)' }}>{values[i]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
