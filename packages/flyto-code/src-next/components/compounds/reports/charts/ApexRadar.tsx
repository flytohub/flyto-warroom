import Chart from 'react-apexcharts'
import { CHART_PALETTE, FONT } from '../designTokens'

interface Props { labels: string[]; values: number[]; chartId?: string }

export default function ApexRadar({ labels, values, chartId }: Props) {
  return (
    <Chart
      type="radar"
      height={300}
      series={[{ name: 'Score', data: values }]}
      options={{
        chart: { id: chartId, background: 'transparent' },
        theme: { mode: 'dark' },
        xaxis: { categories: labels },
        colors: [CHART_PALETTE[0]],
        fill: { opacity: 0.3 },
        stroke: { width: 2 },
        markers: { size: 5 },
        dataLabels: { enabled: true, style: { fontSize: `${FONT.body.size}px` }, background: { enabled: true, borderRadius: 2, padding: 6 } },
        yaxis: { show: false },
      }}
    />
  )
}
