/**
 * LayoutTab — compose report layout with layered sections.
 *
 * Top: collapsible section layers (folder-like), each showing its widgets
 *      with per-layer add/delete/reorder. Smart layering: auto-creates
 *      new section when cols reach 12.
 * Bottom: component library (saved + presets, click [+] to add)
 */

import { useState, useCallback, useRef } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Chip from '@mui/material/Chip'
import Tooltip from '@mui/material/Tooltip'
import Collapse from '@mui/material/Collapse'
import InputBase from '@mui/material/InputBase'
import {
  Trash2, Layers, Plus, ChevronDown, ChevronRight,
  GripVertical, FolderOpen, FolderClosed, ArrowUp, ArrowDown,
} from 'lucide-react'
import { t, tOr } from '@lib/i18n';
import { DATA_SOURCE_MAP } from './datasources'
import { CHART_TYPE_MAP } from './chartTypes'
import { CHART_COLORS } from './utils'
import type { ReportTemplate, SavedComponent } from './types'

// Preset quick-add components (common patterns)
const PRESET_COMPONENTS: (SavedComponent & { nameKey?: string })[] = [
  // ── Health & Score ──
  { id: '_p_health_gauge', name: 'Health Gauge', nameKey: 'reports.preset.healthGauge', dataSourceId: 'health-summary', chartType: 'radialBar', labelField: 'project_type', valueField: 'cve_total', defaultCols: 4, createdAt: '' },
  { id: '_p_cve_kpi', name: 'CVE Count', nameKey: 'reports.preset.cveCount', dataSourceId: 'health-summary', chartType: 'kpi', valueField: 'cve_total', defaultCols: 4, createdAt: '' },
  { id: '_p_secret_kpi', name: 'Secret Count', nameKey: 'reports.preset.secretCount', dataSourceId: 'health-summary', chartType: 'kpi', valueField: 'secret_count', defaultCols: 4, createdAt: '' },
  { id: '_p_score_trend', name: 'Score Trend', nameKey: 'reports.preset.scoreTrend', dataSourceId: 'score-history', chartType: 'line', labelField: 'computed_at', valueField: 'overall_display', defaultCols: 12, createdAt: '' },
  { id: '_p_unified_score', name: 'Unified Score', nameKey: 'reports.preset.unifiedScore', dataSourceId: 'computed-score', chartType: 'kpi', valueField: 'display', defaultCols: 4, createdAt: '' },
  { id: '_p_score_by_category', name: 'Score by Category', nameKey: 'reports.preset.scoreByCategory', dataSourceId: 'computed-score', chartType: 'bar', labelField: 'label', valueField: 'raw', defaultCols: 6, createdAt: '' },
  { id: '_p_project_type', name: 'Project Types', nameKey: 'reports.preset.projectTypes', dataSourceId: 'health-summary', chartType: 'donut', labelField: 'project_type', defaultCols: 4, createdAt: '' },

  // ── Security ──
  { id: '_p_severity_donut', name: 'Severity Donut', nameKey: 'reports.preset.severityDonut', dataSourceId: 'issues', chartType: 'donut', labelField: 'severity', defaultCols: 4, createdAt: '' },
  { id: '_p_severity_bar', name: 'Severity Bar', nameKey: 'reports.preset.severityBar', dataSourceId: 'issues', chartType: 'bar', labelField: 'severity', defaultCols: 6, createdAt: '' },
  { id: '_p_issue_types', name: 'Issue Types', nameKey: 'reports.preset.issueTypes', dataSourceId: 'issues', chartType: 'donut', labelField: 'type', defaultCols: 6, createdAt: '' },
  { id: '_p_finding_table', name: 'Findings Table', nameKey: 'reports.preset.findingsTable', dataSourceId: 'pulse', chartType: 'table', defaultCols: 12, createdAt: '' },
  { id: '_p_issues_table', name: 'Issues Table', nameKey: 'reports.preset.issuesTable', dataSourceId: 'issues', chartType: 'table', defaultCols: 12, createdAt: '' },

  // ── Container ──
  { id: '_p_container_severity', name: 'Container by Severity', nameKey: 'reports.preset.containerSeverity', dataSourceId: 'containers', chartType: 'donut', labelField: 'severity', defaultCols: 4, createdAt: '' },
  { id: '_p_container_table', name: 'Container Findings', nameKey: 'reports.preset.containerFindings', dataSourceId: 'containers', chartType: 'table', defaultCols: 12, createdAt: '' },
  { id: '_p_container_kpi', name: 'Container Count', nameKey: 'reports.preset.containerCount', dataSourceId: 'containers', chartType: 'kpi', defaultCols: 4, createdAt: '' },

  // ── IaC ──
  { id: '_p_iac_severity', name: 'IaC by Severity', nameKey: 'reports.preset.iacSeverity', dataSourceId: 'iac', chartType: 'bar', labelField: 'severity', defaultCols: 6, createdAt: '' },
  { id: '_p_iac_framework', name: 'IaC by Framework', nameKey: 'reports.preset.iacFramework', dataSourceId: 'iac', chartType: 'donut', labelField: 'framework', defaultCols: 4, createdAt: '' },
  { id: '_p_iac_table', name: 'IaC Findings', nameKey: 'reports.preset.iacFindings', dataSourceId: 'iac', chartType: 'table', defaultCols: 12, createdAt: '' },

  // ── Dead Code ──
  { id: '_p_deadcode_type', name: 'Dead Code by Type', nameKey: 'reports.preset.deadCodeType', dataSourceId: 'dead-code', chartType: 'donut', labelField: 'type', defaultCols: 4, createdAt: '' },
  { id: '_p_deadcode_table', name: 'Dead Code Table', nameKey: 'reports.preset.deadCodeTable', dataSourceId: 'dead-code', chartType: 'table', defaultCols: 12, createdAt: '' },
  { id: '_p_deadcode_kpi', name: 'Dead Code Count', nameKey: 'reports.preset.deadCodeCount', dataSourceId: 'dead-code', chartType: 'kpi', defaultCols: 4, createdAt: '' },

  // ── Taint Flow ──
  { id: '_p_taint_severity', name: 'Taint by Severity', nameKey: 'reports.preset.taintSeverity', dataSourceId: 'taint-flows', chartType: 'bar', labelField: 'severity', defaultCols: 6, createdAt: '' },
  { id: '_p_taint_category', name: 'Taint by Category', nameKey: 'reports.preset.taintCategory', dataSourceId: 'taint-flows', chartType: 'donut', labelField: 'category', defaultCols: 4, createdAt: '' },
  { id: '_p_taint_table', name: 'Taint Flows', nameKey: 'reports.preset.taintFlows', dataSourceId: 'taint-flows', chartType: 'table', defaultCols: 12, createdAt: '' },

  // ── AutoFix ──
  { id: '_p_autofix_status', name: 'AutoFix by Status', nameKey: 'reports.preset.autofixStatus', dataSourceId: 'autofix', chartType: 'donut', labelField: 'patch_status', defaultCols: 4, createdAt: '' },
  { id: '_p_autofix_severity', name: 'AutoFix by Severity', nameKey: 'reports.preset.autofixSeverity', dataSourceId: 'autofix', chartType: 'bar', labelField: 'severity', defaultCols: 6, createdAt: '' },
  { id: '_p_autofix_table', name: 'AutoFix Candidates', nameKey: 'reports.preset.autofixCandidates', dataSourceId: 'autofix', chartType: 'table', defaultCols: 12, createdAt: '' },
  { id: '_p_autofix_kpi', name: 'AutoFix Count', nameKey: 'reports.preset.autofixCount', dataSourceId: 'autofix', chartType: 'kpi', defaultCols: 4, createdAt: '' },

  // ── Attack Surface ──
  { id: '_p_attack_type', name: 'Asset Types', nameKey: 'reports.preset.assetTypes', dataSourceId: 'attack-surface', chartType: 'donut', labelField: 'asset_type', defaultCols: 4, createdAt: '' },
  { id: '_p_attack_table', name: 'Attack Surface', nameKey: 'reports.preset.attackSurface', dataSourceId: 'attack-surface', chartType: 'table', defaultCols: 12, createdAt: '' },
  { id: '_p_attack_kpi', name: 'Asset Count', nameKey: 'reports.preset.assetCount', dataSourceId: 'attack-surface', chartType: 'kpi', defaultCols: 4, createdAt: '' },

  // ── Dependencies ──
  { id: '_p_dep_treemap', name: 'Dependency Treemap', nameKey: 'reports.preset.depTreemap', dataSourceId: 'dependencies', chartType: 'treemap', labelField: 'name', valueField: 'total_uses', defaultCols: 6, createdAt: '' },
  { id: '_p_dep_shared', name: 'Most Shared Deps', nameKey: 'reports.preset.depShared', dataSourceId: 'dependencies', chartType: 'bar', labelField: 'name', valueField: 'shared_count', defaultCols: 6, createdAt: '' },

  // ── License ──
  { id: '_p_license_donut', name: 'License Distribution', nameKey: 'reports.preset.licenseDistribution', dataSourceId: 'licenses', chartType: 'donut', labelField: 'license_name', defaultCols: 6, createdAt: '' },
  { id: '_p_license_risk', name: 'License Risk', nameKey: 'reports.preset.licenseRisk', dataSourceId: 'licenses', chartType: 'bar', labelField: 'risk_level', defaultCols: 6, createdAt: '' },
  { id: '_p_license_table', name: 'License Issues', nameKey: 'reports.preset.licenseIssues', dataSourceId: 'licenses', chartType: 'table', defaultCols: 12, createdAt: '' },

  // ── CI/CD ──
  { id: '_p_ci_donut', name: 'CI Pass/Fail', nameKey: 'reports.preset.ciPassFail', dataSourceId: 'ci-checks', chartType: 'donut', labelField: 'status', defaultCols: 4, createdAt: '' },
  { id: '_p_ci_table', name: 'CI History', nameKey: 'reports.preset.ciHistory', dataSourceId: 'ci-checks', chartType: 'table', defaultCols: 12, createdAt: '' },

  // ── Compliance ──
  { id: '_p_compliance', name: 'Compliance Matrix', nameKey: 'reports.preset.complianceMatrix', dataSourceId: 'compliance-matrix', chartType: 'bar', labelField: 'framework', valueField: 'score', defaultCols: 6, createdAt: '' },
  { id: '_p_compliance_table', name: 'Compliance Details', nameKey: 'reports.preset.complianceDetails', dataSourceId: 'compliance-matrix', chartType: 'table', defaultCols: 12, createdAt: '' },

  // ── Architecture ──
  { id: '_p_arch_type', name: 'Repo Types', nameKey: 'reports.preset.repoTypes', dataSourceId: 'arch-map', chartType: 'donut', labelField: 'project_type', defaultCols: 4, createdAt: '' },
  { id: '_p_arch_table', name: 'Architecture Map', nameKey: 'reports.preset.archMap', dataSourceId: 'arch-map', chartType: 'table', defaultCols: 12, createdAt: '' },

  // ── Malware ──
  { id: '_p_malware_table', name: 'Malware Scan', nameKey: 'reports.preset.malwareTable', dataSourceId: 'malware', chartType: 'table', defaultCols: 12, createdAt: '' },

  // ── CSPM ──
  { id: '_p_cspm_severity', name: 'CSPM by Severity', nameKey: 'reports.preset.cspmSeverity', dataSourceId: 'cspm', chartType: 'bar', labelField: 'severity', defaultCols: 6, createdAt: '' },
  { id: '_p_cspm_provider', name: 'CSPM by Provider', nameKey: 'reports.preset.cspmProvider', dataSourceId: 'cspm', chartType: 'donut', labelField: 'provider', defaultCols: 4, createdAt: '' },
  { id: '_p_cspm_table', name: 'CSPM Findings', nameKey: 'reports.preset.cspmFindings', dataSourceId: 'cspm', chartType: 'table', defaultCols: 12, createdAt: '' },

  // ── Runtime ──
  { id: '_p_runtime_type', name: 'Runtime by Type', nameKey: 'reports.preset.runtimeType', dataSourceId: 'runtime-events', chartType: 'donut', labelField: 'event_type', defaultCols: 4, createdAt: '' },
  { id: '_p_runtime_table', name: 'Runtime Events', nameKey: 'reports.preset.runtimeTable', dataSourceId: 'runtime-events', chartType: 'table', defaultCols: 12, createdAt: '' },

  // ── Pentest ──
  { id: '_p_pentest_type', name: 'Pentest by Type', nameKey: 'reports.preset.pentestType', dataSourceId: 'pentest-projects', chartType: 'donut', labelField: 'project_type', defaultCols: 4, createdAt: '' },
  { id: '_p_pentest_table', name: 'Pentest Projects', nameKey: 'reports.preset.pentestTable', dataSourceId: 'pentest-projects', chartType: 'table', defaultCols: 12, createdAt: '' },

  // ── AutoFix Runs ──
  { id: '_p_autofix_runs_table', name: 'AutoFix Run History', nameKey: 'reports.preset.autofixRunsTable', dataSourceId: 'autofix-runs', chartType: 'table', defaultCols: 12, createdAt: '' },

  // ── Scan Activity ──
  { id: '_p_scan_log_status', name: 'Scan by Status', nameKey: 'reports.preset.scanLogStatus', dataSourceId: 'scan-log', chartType: 'donut', labelField: 'status', defaultCols: 4, createdAt: '' },
  { id: '_p_scan_log_table', name: 'Scan Activity', nameKey: 'reports.preset.scanLogTable', dataSourceId: 'scan-log', chartType: 'table', defaultCols: 12, createdAt: '' },

  // ── Monitoring ──
  { id: '_p_monitoring_severity', name: 'Monitoring by Severity', nameKey: 'reports.preset.monitoringSeverity', dataSourceId: 'monitoring-events', chartType: 'bar', labelField: 'severity', defaultCols: 6, createdAt: '' },
  { id: '_p_monitoring_table', name: 'Monitoring Events', nameKey: 'reports.preset.monitoringTable', dataSourceId: 'monitoring-events', chartType: 'table', defaultCols: 12, createdAt: '' },

  // ── Score Events ──
  { id: '_p_score_events_table', name: 'Score Changes', nameKey: 'reports.preset.scoreEventsTable', dataSourceId: 'score-events', chartType: 'table', defaultCols: 12, createdAt: '' },

  // ── API Definitions ──
  { id: '_p_api_defs_table', name: 'API Routes', nameKey: 'reports.preset.apiDefsTable', dataSourceId: 'api-definitions', chartType: 'table', defaultCols: 12, createdAt: '' },

  // ── Text Blocks ──
  { id: '_p_text_info', name: 'Info Text Block', nameKey: 'reports.preset.textInfo', dataSourceId: '', chartType: 'text', defaultCols: 12, createdAt: '' },
  { id: '_p_text_warning', name: 'Warning Text Block', nameKey: 'reports.preset.textWarning', dataSourceId: '', chartType: 'text', defaultCols: 12, createdAt: '' },
]

interface Props {
  template: ReportTemplate
  components: SavedComponent[]
  onAddWidget: (comp: SavedComponent, targetSectionId?: string) => void
  onRemoveWidget: (widgetId: string) => void
  onResizeWidget: (widgetId: string, cols: number) => void
  onAddSection: () => void
  onRemoveSection: (sectionId: string) => void
  onRenameSection: (sectionId: string, name: string) => void
  onMoveWidget: (widgetId: string, fromSectionId: string, toSectionId: string, toIndex: number) => void
  onReorderSections: (fromIndex: number, toIndex: number) => void
  onDeleteComponent?: (id: string) => void
}

const COL_OPTIONS = [4, 6, 12] as const

export function LayoutTab({
  template, components,
  onAddWidget, onRemoveWidget, onResizeWidget,
  onAddSection, onRemoveSection, onRenameSection,
  onMoveWidget, onReorderSections,
  onDeleteComponent,
}: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [addTarget, setAddTarget] = useState<string | null>(null)
  const [editingName, setEditingName] = useState<string | null>(null)
  const dragItem = useRef<{ widgetId: string; sectionId: string } | null>(null)
  const sections = Array.isArray(template.sections) ? template.sections : []

  const totalWidgets = sections.reduce((sum, s) => sum + (Array.isArray(s.widgets) ? s.widgets.length : 0), 0)

  const toggleSection = useCallback((id: string) => {
    setCollapsed(prev => ({ ...prev, [id]: !prev[id] }))
  }, [])

  const handleDragStart = useCallback((widgetId: string, sectionId: string) => {
    dragItem.current = { widgetId, sectionId }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const handleDrop = useCallback((targetSectionId: string, targetIndex: number) => {
    if (!dragItem.current) return
    const { widgetId, sectionId } = dragItem.current
    onMoveWidget(widgetId, sectionId, targetSectionId, targetIndex)
    dragItem.current = null
  }, [onMoveWidget])

  // When user clicks [+] on a section, set it as add target and scroll to library
  const handleAddToSection = useCallback((sectionId: string) => {
    setAddTarget(sectionId)
  }, [])

  const handleAddFromLibrary = useCallback((comp: SavedComponent) => {
    onAddWidget(comp, addTarget ?? undefined)
    // Don't clear addTarget — user might want to add multiple widgets to the same section
  }, [onAddWidget, addTarget])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

      {/* ── Section layers (top) ── */}
      <Box sx={{
        display: 'flex', flexDirection: 'column',
        flex: '1 1 auto', minHeight: 120,
        overflow: 'auto',
        borderBottom: '2px solid', borderColor: 'divider',
      }}>
        {/* Header */}
        <Box sx={{ px: 2, py: 0.75, display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
          <Layers size={18} style={{ color: '#a78bfa' }} />
          <Typography variant="caption" fontWeight={700} sx={{ fontSize: 14, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.05em', flex: 1 }}>
            {t('reports.reportLayout')}
          </Typography>
          <Chip label={totalWidgets} size="small" sx={{ height: 22, fontSize: 12, fontWeight: 700 }} />
        </Box>

        {/* Section list */}
        <Box sx={{ flex: 1, overflow: 'auto', px: 0.5 }}>
          {sections.length === 0 ? (
            <Box sx={{ py: 2, textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 13 }}>
                {t('reports.emptyLayout')}
              </Typography>
            </Box>
          ) : (
            sections.map((section, sIdx) => {
              const sectionId = section.id || `section-${sIdx}`
              const widgets = Array.isArray(section.widgets) ? section.widgets : []
              const isCollapsed = !!collapsed[sectionId]
              const sectionCols = widgets.reduce((sum, w) => sum + (Number.isFinite(w.cols) ? w.cols : 0), 0)
              const sectionName = section.name || `Section ${sIdx + 1}`
              const isAddTarget = addTarget === sectionId

              return (
                <Box key={sectionId} sx={{
                  mb: 0.5, borderRadius: 1,
                  border: '1px solid',
                  borderColor: isAddTarget ? '#8b5cf6' : 'divider',
                  bgcolor: isAddTarget ? 'rgba(139,92,246,0.04)' : 'transparent',
                  transition: 'all 0.15s',
                }}>
                  {/* Section header */}
                  <Box
                    sx={{
                      display: 'flex', alignItems: 'center', gap: 0.5,
                      px: 0.75, py: 0.4, cursor: 'pointer',
                      '&:hover': { bgcolor: 'action.hover' },
                      borderRadius: '4px 4px 0 0',
                    }}
                    onClick={() => toggleSection(sectionId)}
                  >
                    {isCollapsed
                      ? <ChevronRight size={16} style={{ color: '#a78bfa', flexShrink: 0 }} />
                      : <ChevronDown size={16} style={{ color: '#a78bfa', flexShrink: 0 }} />
                    }
                    {isCollapsed
                      ? <FolderClosed size={16} style={{ color: '#a78bfa', flexShrink: 0 }} />
                      : <FolderOpen size={16} style={{ color: '#a78bfa', flexShrink: 0 }} />
                    }

                    {/* Editable section name */}
                    {editingName === sectionId ? (
                      <InputBase
                        autoFocus
                        value={sectionName}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => onRenameSection(sectionId, e.target.value)}
                        onBlur={() => setEditingName(null)}
                        onKeyDown={(e) => { if (e.key === 'Enter') setEditingName(null) }}
                        sx={{ flex: 1, fontSize: 14, fontWeight: 600, py: 0, px: 0.5, color: '#c4b5fd', '& input': { p: 0 } }}
                      />
                    ) : (
                      <Typography
                        variant="caption"
                        sx={{ flex: 1, fontSize: 14, fontWeight: 600, color: '#c4b5fd', cursor: 'text' }}
                        noWrap
                        onDoubleClick={(e) => { e.stopPropagation(); setEditingName(sectionId) }}
                      >
                        {sectionName}
                      </Typography>
                    )}

                    {/* Cols usage indicator */}
                    <Chip
                      label={`${sectionCols}/12`}
                      size="small"
                      sx={{
                        height: 20, fontSize: 13, fontWeight: 700, flexShrink: 0,
                        bgcolor: sectionCols >= 12 ? 'rgba(239,68,68,0.15)' : sectionCols > 0 ? 'rgba(139,92,246,0.15)' : 'transparent',
                        color: sectionCols >= 12 ? '#ef4444' : '#a78bfa',
                        border: '1px solid',
                        borderColor: sectionCols >= 12 ? 'rgba(239,68,68,0.3)' : 'rgba(139,92,246,0.2)',
                      }}
                    />

                    {/* Section actions */}
                    <Box sx={{ display: 'flex', gap: '2px', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                      {sIdx > 0 && (
                        <Tooltip title={t('reports.moveUp')}>
                          <IconButton
                            size="small"
                            onClick={() => onReorderSections(sIdx, sIdx - 1)}
                            aria-label={t('reports.moveUp')}
                            sx={{ p: 0.3, color: 'text.secondary', '&:hover': { color: '#a78bfa' } }}
                          >
                            <ArrowUp size={14} />
                          </IconButton>
                        </Tooltip>
                      )}
                      {sIdx < sections.length - 1 && (
                        <Tooltip title={t('reports.moveDown')}>
                          <IconButton
                            size="small"
                            onClick={() => onReorderSections(sIdx, sIdx + 1)}
                            aria-label={t('reports.moveDown')}
                            sx={{ p: 0.3, color: 'text.secondary', '&:hover': { color: '#a78bfa' } }}
                          >
                            <ArrowDown size={14} />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title={t('reports.addWidget')}>
                        <IconButton
                          size="small"
                          onClick={() => handleAddToSection(sectionId)}
                          aria-label={t('reports.addWidget')}
                          sx={{ p: 0.3, color: '#22c55e', '&:hover': { color: '#16a34a' } }}
                        >
                          <Plus size={14} />
                        </IconButton>
                      </Tooltip>
                      {sections.length > 1 && (
                        <Tooltip title={t('reports.deleteSection')}>
                          <IconButton
                            size="small"
                            onClick={() => onRemoveSection(sectionId)}
                            aria-label={t('reports.deleteSection')}
                            sx={{ p: 0.3, color: 'text.secondary', '&:hover': { color: '#ef4444' } }}
                          >
                            <Trash2 size={14} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </Box>

                  {/* Section widgets (collapsible) */}
                  <Collapse in={!isCollapsed}>
                    <Box
                      sx={{ px: 0.5, pb: 0.5 }}
                      onDragOver={handleDragOver}
                      onDrop={() => handleDrop(sectionId, widgets.length)}
                    >
                      {widgets.length === 0 ? (
                        <Box sx={{ py: 1, textAlign: 'center' }}>
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 13 }}>
                            {t('reports.emptySection')}
                          </Typography>
                        </Box>
                      ) : (
                        widgets.map((w, wIdx) => {
                          const wds = DATA_SOURCE_MAP[w.dataSourceId]
                          const wct = CHART_TYPE_MAP[w.chartType]
                          const Icon = wct?.icon ?? wds?.icon
                          const color = CHART_COLORS[w.chartType] ?? '#6b7280'
                          return (
                            <Box
                              key={w.id}
                              draggable
                              onDragStart={() => handleDragStart(w.id, sectionId)}
                              onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
                              onDrop={(e) => { e.stopPropagation(); handleDrop(sectionId, wIdx) }}
                              sx={{
                                display: 'flex', alignItems: 'center', gap: 0.5,
                                px: 0.5, py: 0.3, ml: 1, borderRadius: 1,
                                cursor: 'grab',
                                '&:hover': { bgcolor: 'action.hover' },
                                '&:active': { cursor: 'grabbing' },
                              }}
                            >
                              <GripVertical size={12} style={{ color: '#6b7280', flexShrink: 0 }} />
                              {Icon && <Icon size={14} style={{ color }} />}
                              <Typography variant="caption" sx={{ flex: 1, fontSize: 13, fontWeight: 500 }} noWrap>
                                {w.title ?? `${wds?.name} / ${wct?.name}`}
                              </Typography>
                              {/* Width toggle */}
                              <Box sx={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                                {COL_OPTIONS.map(c => (
                                  <Chip
                                    key={c}
                                    label={c === 4 ? '⅓' : c === 6 ? '½' : '1'}
                                    size="small"
                                    onClick={() => onResizeWidget(w.id, c)}
                                    sx={{
                                      height: 22, fontSize: 13, minWidth: 28, cursor: 'pointer',
                                      bgcolor: w.cols === c ? '#8b5cf6' : 'transparent',
                                      color: w.cols === c ? '#fff' : 'text.secondary',
                                      border: '1px solid', borderColor: w.cols === c ? '#8b5cf6' : 'divider',
                                      '&:hover': { borderColor: '#8b5cf6' },
                                    }}
                                  />
                                ))}
                              </Box>
                              <Tooltip title={t('common.delete')}>
                                <IconButton
                                  size="small"
                                  onClick={() => onRemoveWidget(w.id)}
                                  aria-label={t('common.delete')}
                                  sx={{ p: 0.3, color: 'text.secondary', '&:hover': { color: '#ef4444' } }}
                                >
                                  <Trash2 size={14} />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          )
                        })
                      )}
                    </Box>
                  </Collapse>
                </Box>
              )
            })
          )}

          {/* Add new section button */}
          <Box
            onClick={onAddSection}
            sx={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5,
              px: 1, py: 0.5, mx: 0.5, mb: 0.5, borderRadius: 1,
              border: '1px dashed', borderColor: 'divider',
              cursor: 'pointer', color: 'text.secondary',
              '&:hover': { borderColor: '#8b5cf6', color: '#a78bfa', bgcolor: 'rgba(139,92,246,0.04)' },
              transition: 'all 0.15s',
            }}
          >
            <Plus size={14} />
            <Typography variant="caption" sx={{ fontSize: 13, fontWeight: 600 }}>
              {t('reports.addSection')}
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* ── Component library (bottom, scrollable) ── */}
      <Box sx={{ flex: '0 1 auto', maxHeight: '45%', overflow: 'auto', px: 1.5, py: 1 }}>

        {/* Active target indicator */}
        {addTarget && (
          <Box sx={{
            mb: 1, px: 1, py: 0.4, borderRadius: 1,
            bgcolor: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <Typography variant="caption" sx={{ fontSize: 13, color: '#a78bfa' }}>
              {t('reports.addingTo')}: <b>{sections.find((s, idx) => (s.id || `section-${idx}`) === addTarget)?.name || 'Section'}</b>
            </Typography>
            <IconButton
              size="small"
              onClick={() => setAddTarget(null)}
              aria-label={t('reports.cancelAdding')}
              sx={{ p: 0.3, color: '#a78bfa' }}
            >
              <Trash2 size={12} />
            </IconButton>
          </Box>
        )}

        {/* My saved components */}
        {components.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" fontWeight={700} sx={{ color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.5, display: 'block' }}>
              {t('reports.myComponents')}
            </Typography>
            {components.map(c => (
              <ComponentRow key={c.id} comp={c} onAdd={() => handleAddFromLibrary(c)} onDelete={onDeleteComponent ? () => onDeleteComponent(c.id) : undefined} />
            ))}
          </Box>
        )}

        {/* Preset components */}
        <Typography variant="caption" fontWeight={700} sx={{ color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.5, display: 'block' }}>
          {t('reports.presets')}
        </Typography>
        {PRESET_COMPONENTS.map(c => (
          <ComponentRow key={c.id} comp={c} onAdd={() => handleAddFromLibrary(c)} />
        ))}
      </Box>
    </Box>
  )
}

function ComponentRow({ comp, onAdd, onDelete }: { comp: SavedComponent & { nameKey?: string }; onAdd: () => void; onDelete?: () => void }) {
  const ct = CHART_TYPE_MAP[comp.chartType]
  const color = CHART_COLORS[comp.chartType] ?? '#6b7280'

  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 0.75,
      px: 1, py: 0.5, mb: 0.25, borderRadius: 1,
      border: '1px solid', borderColor: 'transparent',
      '&:hover': { bgcolor: 'action.hover', borderColor: 'divider' },
      transition: 'all 0.15s',
    }}>
      {ct && <ct.icon size={16} style={{ color }} />}
      <Typography variant="caption" sx={{ flex: 1, fontSize: 13, fontWeight: 500 }} noWrap>
        {comp.nameKey ? tOr(comp.nameKey, comp.name) : comp.name}
      </Typography>
      <Chip label={`${comp.defaultCols}col`} size="small" sx={{ height: 20, fontSize: 13, flexShrink: 0 }} />
      <Tooltip title={t('reports.addToReport')}>
        <IconButton
          size="small"
          onClick={onAdd}
          aria-label={t('reports.addToReport')}
          sx={{ p: 0.3, color: '#22c55e', '&:hover': { color: '#16a34a' } }}
        >
          <Plus size={14} />
        </IconButton>
      </Tooltip>
      {onDelete && (
        <Tooltip title={t('common.delete')}>
          <IconButton
            size="small"
            onClick={onDelete}
            aria-label={t('common.delete')}
            sx={{ p: 0.3, color: 'text.secondary', '&:hover': { color: '#ef4444' } }}
          >
            <Trash2 size={14} />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  )
}
