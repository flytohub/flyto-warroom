import { useMemo } from 'react'
import Chart from 'react-apexcharts'
import { FONT } from '../designTokens'

interface Props { rows: any[]; labelField: string; valueField: string; chartId?: string }

export default function ApexHeatmap({ rows, labelField, valueField, chartId }: Props) {
  const series = useMemo(() => {
    // Group rows by labelField, create a heatmap row per unique label
    const groups = new Map<string, Map<string, number>>()
    for (const row of rows) {
      const label = String(row[labelField] ?? '')
      if (!groups.has(label)) groups.set(label, new Map())
    }
    // Simplified: severity x label matrix
    return [...groups.keys()].slice(0, 10).map(label => ({
      name: label,
      data: rows
        .filter(r => r[labelField] === label)
        .slice(0, 20)
        .map((r, i) => ({ x: String(i + 1), y: Number(r[valueField] ?? 0) })),
    }))
  }, [rows, labelField, valueField])

  return (
    <Chart
      type="heatmap"
      height={300}
      series={series}
      options={{
        chart: { id: chartId, background: 'transparent', toolbar: { show: false } },
        theme: { mode: 'dark' },
        colors: ['#ef4444'],
        dataLabels: { enabled: true, style: { fontSize: `${FONT.caption.size}px`, fontWeight: 600 } },
        xaxis: { labels: { style: { colors: '#9ca3af', fontSize: '12px' } } },
        yaxis: { labels: { style: { colors: '#9ca3af', fontSize: '12px' } } },
      }}
    />
  )
}
