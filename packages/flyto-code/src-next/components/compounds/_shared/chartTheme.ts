/**
 * chartTheme — shared ApexCharts theming + severity→color mapping for
 * the _shared chart wrappers. Keeps each wrapper thin and consistent
 * (transparent bg, no toolbar, sane font colors, severity-token
 * palette). NEVER inline hex in a wrapper — derive from tokens here.
 */

import type { ApexOptions } from 'apexcharts'
import { SEVERITY_TONE, GRADE_TONE, RAW, type Severity } from '@lib/tokens/severity'

/** Default ordered palette for non-severity series — derived from the
 *  token RAW anchors so a brand recolor stays mechanical. */
export const CHART_PALETTE: string[] = [
  RAW.blue500,
  RAW.green500,
  RAW.orange500,
  RAW.violet500,
  RAW.yellow500,
  RAW.slate500,
]

const AXIS_COLOR = 'rgba(148,163,184,0.85)' // slate-400-ish, theme-neutral
const GRID_COLOR = 'rgba(148,163,184,0.14)'

/** Map a list of severities to their token `tone` hex (filled). */
export function severityColors(severities: Severity[]): string[] {
  return severities.map((s) => SEVERITY_TONE[s]?.tone ?? SEVERITY_TONE[''].tone)
}

/** Map a single severity to its token hex. */
export function severityColor(s: Severity): string {
  return SEVERITY_TONE[s]?.tone ?? SEVERITY_TONE[''].tone
}

/** Map a grade string to its token hex (safe fallback to neutral). */
export function gradeColor(g: string): string {
  const key = (g?.toLowerCase?.() ?? '') as keyof typeof GRADE_TONE
  return GRADE_TONE[key]?.tone ?? GRADE_TONE[''].tone
}

/** Base options shared by every wrapper. Spread first, then override. */
export function baseChartOptions(): ApexOptions {
  return {
    chart: {
      background: 'transparent',
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { enabled: true, speed: 400 },
      fontFamily: 'inherit',
    },
    theme: { mode: 'dark' },
    grid: { borderColor: GRID_COLOR, strokeDashArray: 3 },
    dataLabels: { enabled: false },
    legend: { labels: { colors: AXIS_COLOR }, fontSize: '12px' },
    tooltip: { theme: 'dark' },
    stroke: { curve: 'smooth', width: 2.5 },
  }
}

export const AXIS_STYLE = { colors: AXIS_COLOR, fontSize: '12px' }
