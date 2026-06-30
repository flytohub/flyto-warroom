import Chart from 'react-apexcharts'
import { CHART_PALETTE, FONT } from '../designTokens'

interface Props { labels: string[]; values: number[]; chartId?: string }

export default function ApexTreemap({ labels, values, chartId }: Props) {
  const data = labels.map((l, i) => ({ x: l, y: values[i] }))
  return (
    <Chart
      type="treemap"
      height={300}
      series={[{ data }]}
      options={{
        chart: { id: chartId, background: 'transparent', toolbar: { show: false } },
        theme: { mode: 'dark' },
        colors: [...CHART_PALETTE.slice(0, 8)],
        plotOptions: {
          treemap: { distributed: true, enableShades: true, shadeIntensity: 0.3 },
        },
        dataLabels: {
          enabled: true,
          style: { fontSize: `${FONT.body.size}px`, fontWeight: 600 },
          formatter: (text: string, opts: any) => {
            // Only show value if the block is big enough
            const total = data.reduce((s, d) => s + d.y, 0)
            const pct = (opts.value / total) * 100
            return pct > 5 ? `${text}\n${opts.value}` : text
          },
        },
      }}
    />
  )
}
