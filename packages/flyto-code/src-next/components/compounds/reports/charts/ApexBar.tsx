import Chart from 'react-apexcharts'
import { t } from '@lib/i18n';
import { CHART_PALETTE, FONT } from '../designTokens'

interface Props { labels: string[]; values: number[]; title?: string; chartId?: string }

export default function ApexBar({ labels: rawLabels, values: rawValues, title, chartId }: Props) {
  // Cap at 15 items — too many bars is unreadable
  const max = 15
  const labels = rawLabels.slice(0, max)
  const values = rawValues.slice(0, max)
  // Auto height based on item count
  const height = labels.length > 10 ? 320 : 280

  return (
    <Chart
      type="bar"
      height={height}
      series={[{ name: title || t('common.count'), data: values }]}
      options={{
        chart: { id: chartId, background: 'transparent', toolbar: { show: false } },
        theme: { mode: 'dark' },
        xaxis: {
          categories: labels.map(l => l.length > 12 ? l.slice(0, 10) + '..' : l),
          labels: { style: { fontSize: labels.length > 12 ? `${FONT.micro.size}px` : `${FONT.caption.size}px`, colors: '#9ca3af' }, rotate: -45, maxHeight: 80 },
          tickAmount: Math.min(labels.length, 15),
        },
        yaxis: { labels: { style: { colors: '#9ca3af' } } },
        colors: [CHART_PALETTE[0]],
        plotOptions: { bar: { borderRadius: 4, columnWidth: '60%' } },
        dataLabels: { enabled: labels.length <= 10, style: { fontSize: `${FONT.body.size}px`, fontWeight: 600 }, offsetY: -4 },
        grid: { borderColor: 'rgba(255,255,255,0.1)' },
      }}
    />
  )
}
