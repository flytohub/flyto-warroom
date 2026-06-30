/**
 * StackedBarChart — thin themed Apex stacked bar. Each series can carry
 * a severity so stacks color from severity tokens.
 */

import Chart from 'react-apexcharts'
import type { ApexOptions } from 'apexcharts'
import { baseChartOptions, AXIS_STYLE, CHART_PALETTE, severityColor } from './chartTheme'
import type { Severity } from '@lib/tokens/severity'

export interface BarSeries {
  name: string
  data: number[]
  /** Optional — color this series from the severity token table. */
  severity?: Severity
}

export interface StackedBarChartProps {
  categories: (string | number)[]
  series: BarSeries[]
  height?: number
  horizontal?: boolean
  /** Set false for grouped (side-by-side) bars. Default true (stacked). */
  stacked?: boolean
}

export function StackedBarChart({
  categories,
  series,
  height = 260,
  horizontal = false,
  stacked = true,
}: StackedBarChartProps) {
  const colors = series.map((s, i) =>
    s.severity ? severityColor(s.severity) : CHART_PALETTE[i % CHART_PALETTE.length],
  )

  const options: ApexOptions = {
    ...baseChartOptions(),
    chart: { ...baseChartOptions().chart, stacked },
    colors,
    plotOptions: { bar: { horizontal, borderRadius: 3, columnWidth: '55%' } },
    xaxis: {
      categories,
      labels: { style: AXIS_STYLE },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: { labels: { style: AXIS_STYLE } },
    legend: { position: 'top', labels: { colors: AXIS_STYLE.colors }, fontSize: '12px' },
  }

  return (
    <Chart
      type="bar"
      height={height}
      series={series.map((s) => ({ name: s.name, data: s.data }))}
      options={options}
    />
  )
}
