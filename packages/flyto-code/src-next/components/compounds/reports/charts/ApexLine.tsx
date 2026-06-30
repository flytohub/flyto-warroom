import Chart from 'react-apexcharts'
import { CHART_PALETTE, FONT } from '../designTokens'

interface Props { labels: string[]; values: number[]; title?: string; area?: boolean; chartId?: string }

export default function ApexLine({ labels, values, title, area, chartId }: Props) {
  return (
    <Chart
      type={area ? 'area' : 'line'}
      height={280}
      series={[{ name: title || 'Value', data: values }]}
      options={{
        chart: { id: chartId, background: 'transparent', toolbar: { show: false }, zoom: { enabled: false } },
        theme: { mode: 'dark' },
        xaxis: { categories: labels, labels: { style: { fontSize: '12px', colors: '#9ca3af' }, rotate: -45 } },
        yaxis: { labels: { style: { colors: '#9ca3af' } } },
        colors: [CHART_PALETTE[0]],
        stroke: { curve: 'smooth', width: 2.5 },
        fill: area ? { type: 'gradient', gradient: { opacityFrom: 0.4, opacityTo: 0.05 } } : {},
        dataLabels: { enabled: true, style: { fontSize: `${FONT.caption.size}px` }, background: { enabled: true, borderRadius: 2, padding: 6, opacity: 0.8 } },
        grid: { borderColor: 'rgba(255,255,255,0.06)' },
        markers: { size: 5 },
      }}
    />
  )
}
