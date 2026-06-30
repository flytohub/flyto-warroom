/**
 * TrendChart — thin themed Apex area/line timeseries wrapper.
 * Severity-aware: pass `severity` per series to color it from tokens.
 */

import Chart from 'react-apexcharts'
import type { ApexOptions } from 'apexcharts'
import { baseChartOptions, AXIS_STYLE, CHART_PALETTE, severityColor } from './chartTheme'
import type { Severity } from '@lib/tokens/severity'

export interface TrendSeries {
  name: string
  data: number[]
  /** Optional — color this series from the severity token table. */
  severity?: Severity
}

export interface TrendChartProps {
  categories: (string | number)[]
  series: TrendSeries[]
  /** Render as filled area (default) or plain line. */
  area?: boolean
  height?: number
  /** Cap the y axis (e.g. 100 for a 0–100 score). */
  yMax?: number
  yMin?: number
}

export function TrendChart({
  categories,
  series,
  area = true,
  height = 260,
  yMax,
  yMin,
}: TrendChartProps) {
  const colors = series.map((s, i) =>
    s.severity ? severityColor(s.severity) : CHART_PALETTE[i % CHART_PALETTE.length],
  )

  const options: ApexOptions = {
    ...baseChartOptions(),
    colors,
    xaxis: {
      categories,
      labels: { style: AXIS_STYLE, rotate: -30, rotateAlways: false },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: { labels: { style: AXIS_STYLE }, max: yMax, min: yMin },
    fill: area
      ? { type: 'gradient', gradient: { opacityFrom: 0.35, opacityTo: 0.03 } }
      : { type: 'solid', opacity: 0 },
    markers: { size: 0, hover: { size: 5 } },
  }

  return (
    <Chart
      type={area ? 'area' : 'line'}
      height={height}
      series={series.map((s) => ({ name: s.name, data: s.data }))}
      options={options}
    />
  )
}
