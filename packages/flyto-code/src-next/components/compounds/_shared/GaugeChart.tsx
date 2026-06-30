/**
 * GaugeChart — thin themed Apex radialBar gauge. Colors from the grade
 * token table based on the resolved grade, or an explicit severity.
 */

import Chart from 'react-apexcharts'
import type { ApexOptions } from 'apexcharts'
import { baseChartOptions, gradeColor, severityColor } from './chartTheme'
import type { Severity } from '@lib/tokens/severity'

export interface GaugeChartProps {
  /** Value 0–100 (or 0–`max`). */
  value: number
  max?: number
  label?: string
  height?: number
  /** Color by grade string (bad/warn/fair/neutral/good) … */
  grade?: string
  /** … or by an explicit severity. `grade` wins if both set. */
  severity?: Severity
}

export function GaugeChart({
  value,
  max = 100,
  label,
  height = 260,
  grade,
  severity,
}: GaugeChartProps) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  const color = grade ? gradeColor(grade) : severity ? severityColor(severity) : '#3b82f6'

  const options: ApexOptions = {
    ...baseChartOptions(),
    colors: [color],
    labels: label ? [label] : undefined,
    plotOptions: {
      radialBar: {
        hollow: { size: '62%' },
        track: { background: 'rgba(148,163,184,0.14)' },
        dataLabels: {
          name: { fontSize: '13px', color: 'rgba(148,163,184,0.85)' },
          value: {
            fontSize: '26px',
            fontWeight: 700,
            color: color,
            formatter: () => String(Math.round(value)),
          },
        },
      },
    },
    fill: { type: 'solid' },
    stroke: { lineCap: 'round' },
  }

  return <Chart type="radialBar" height={height} series={[pct]} options={options} />
}
