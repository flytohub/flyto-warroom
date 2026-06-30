/**
 * BubbleChart — thin themed Apex bubble (x, y, z=radius). Each series
 * can carry a severity so bubbles color from severity tokens. Useful
 * for likelihood×impact (z = asset count) risk plots.
 */

import Chart from 'react-apexcharts'
import type { ApexOptions } from 'apexcharts'
import { baseChartOptions, AXIS_STYLE, CHART_PALETTE, severityColor } from './chartTheme'
import type { Severity } from '@lib/tokens/severity'

export interface BubblePoint {
  x: number
  y: number
  /** Bubble radius weight. */
  z: number
}

export interface BubbleSeries {
  name: string
  data: BubblePoint[]
  /** Optional — color this series from the severity token table. */
  severity?: Severity
}

export interface BubbleChartProps {
  series: BubbleSeries[]
  height?: number
  xTitle?: string
  yTitle?: string
  xMax?: number
  yMax?: number
}

export function BubbleChart({
  series,
  height = 280,
  xTitle,
  yTitle,
  xMax,
  yMax,
}: BubbleChartProps) {
  const colors = series.map((s, i) =>
    s.severity ? severityColor(s.severity) : CHART_PALETTE[i % CHART_PALETTE.length],
  )

  const options: ApexOptions = {
    ...baseChartOptions(),
    colors,
    fill: { opacity: 0.7 },
    xaxis: {
      type: 'numeric',
      max: xMax,
      title: xTitle ? { text: xTitle, style: { color: AXIS_STYLE.colors } } : undefined,
      labels: { style: AXIS_STYLE },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      max: yMax,
      title: yTitle ? { text: yTitle, style: { color: AXIS_STYLE.colors } } : undefined,
      labels: { style: AXIS_STYLE },
    },
    legend: { position: 'top', labels: { colors: AXIS_STYLE.colors }, fontSize: '12px' },
  }

  return (
    <Chart
      type="bubble"
      height={height}
      series={series.map((s) => ({ name: s.name, data: s.data }))}
      options={options}
    />
  )
}
