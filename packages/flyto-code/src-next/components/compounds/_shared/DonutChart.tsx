/**
 * DonutChart — thin themed Apex donut. Each slice can carry a severity
 * so the ring colors from severity tokens (critical/high/medium/low).
 */

import Chart from 'react-apexcharts'
import type { ApexOptions } from 'apexcharts'
import { baseChartOptions, AXIS_STYLE, CHART_PALETTE, severityColor } from './chartTheme'
import type { Severity } from '@lib/tokens/severity'

export interface DonutDatum {
  label: string
  value: number
  /** Optional — color this slice from the severity token table. */
  severity?: Severity
}

export interface DonutChartProps {
  data: DonutDatum[]
  height?: number
  /** Center total label (e.g. 'Findings'). Omit to hide the total. */
  totalLabel?: string
}

export function DonutChart({ data, height = 260, totalLabel }: DonutChartProps) {
  const colors = data.map((d, i) =>
    d.severity ? severityColor(d.severity) : CHART_PALETTE[i % CHART_PALETTE.length],
  )

  const options: ApexOptions = {
    ...baseChartOptions(),
    labels: data.map((d) => d.label),
    colors,
    stroke: { width: 0 },
    legend: { position: 'bottom', labels: { colors: AXIS_STYLE.colors }, fontSize: '12px' },
    plotOptions: {
      pie: {
        donut: {
          size: '68%',
          labels: totalLabel
            ? {
                show: true,
                total: { show: true, label: totalLabel, color: AXIS_STYLE.colors },
              }
            : { show: false },
        },
      },
    },
  }

  return (
    <Chart type="donut" height={height} series={data.map((d) => d.value)} options={options} />
  )
}
