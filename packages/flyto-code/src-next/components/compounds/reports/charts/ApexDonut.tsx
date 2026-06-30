import Chart from 'react-apexcharts'
import { CHART_PALETTE } from '../designTokens'

interface Props { labels: string[]; values: number[]; chartId?: string }

export default function ApexDonut({ labels, values, chartId }: Props) {
  return (
    <Chart
      type="donut"
      height={300}
      series={values}
      options={{
        labels,
        colors: [...CHART_PALETTE],
        chart: { id: chartId, background: 'transparent' },
        theme: { mode: 'dark' },
        legend: {
          position: 'bottom', fontSize: '12px',
          labels: { colors: '#9ca3af' },
          formatter: (seriesName: string, opts: any) => {
            const val = opts.w.globals.series[opts.seriesIndex]
            return `${seriesName}: ${val}`
          },
        },
        dataLabels: {
          enabled: true,
          style: { fontSize: '12px', fontWeight: 600 },
          formatter: (val: number) => {
            if (val < 5) return ''
            return `${val.toFixed(0)}%`
          },
        },
        plotOptions: { pie: { donut: { size: '60%' } } },
        stroke: { width: 0 },
      }}
    />
  )
}
