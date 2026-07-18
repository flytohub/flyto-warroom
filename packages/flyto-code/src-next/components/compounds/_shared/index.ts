/**
 * _shared — the manager/engineer dual-mode design-system primitives.
 *
 * One import surface for all the cross-domain UI building blocks:
 * KPI tiles, themed Apex charts, severity chip, dense data table,
 * evidence drawer, manager dashboard layout, and the mode helpers.
 *
 * Domain agents import primitives from here:
 *   import { KpiCard, TrendChart, ModeView } from '@compounds/_shared'
 *
 * All charts map severity→token colors; no inline hex anywhere.
 */

export { KpiCard, type KpiCardProps } from './KpiCard'
export { SeverityChip, type SeverityChipProps } from './SeverityChip'

export { TrendChart, type TrendChartProps, type TrendSeries } from './TrendChart'
export { DonutChart, type DonutChartProps, type DonutDatum } from './DonutChart'
export {
  StackedBarChart,
  type StackedBarChartProps,
  type BarSeries,
} from './StackedBarChart'
export { GaugeChart, type GaugeChartProps } from './GaugeChart'
export {
  BubbleChart,
  type BubbleChartProps,
  type BubbleSeries,
  type BubblePoint,
} from './BubbleChart'

export {
  DataTable,
  type DataTableProps,
  type MRT_ColumnDef,
  type MRT_RowData,
} from './DataTable'
export {
  EvidenceDrawer,
  type EvidenceDrawerProps,
  type EvidenceSection,
} from './EvidenceDrawer'
export {
  ManagerDashboard,
  ChartCard,
  ManagerAccentContext,
  useManagerAccent,
  type ManagerDashboardProps,
  type ManagerLayout,
} from './ManagerDashboard'
export {
  ManagerHero,
  HeroStat,
  type ManagerHeroProps,
  type ManagerHeroHeadline,
} from './ManagerHero'
export {
  ManagerActionList,
  type ManagerActionItem,
  type ManagerActionListProps,
} from './ManagerActionList'

export { ModeView, type ModeViewProps } from './ModeView'
export { ExperienceToggle } from './ExperienceToggle'
export { RatingAuthorityBadge, type RatingAuthorityBadgeProps } from './RatingAuthorityBadge'

// Cross-surface display-scoring primitives.
export { GRADE_COLORS, displayScore, gradeFor } from './scoring'

export { type OrgWarRoomData } from './warroom'

// Chart theming helpers — exported for advanced custom charts.
export {
  CHART_PALETTE,
  baseChartOptions,
  severityColor,
  severityColors,
  gradeColor,
} from './chartTheme'
