/**
 * ReportsView — data-first report center.
 *
 * Left: report catalog (preset + saved custom)
 * Center: report preview (layout mode) OR JOIN canvas (designer mode)
 * Right: (custom mode) Data Designer tab / Layout tab
 *
 * Persistence: engine API (report-templates + report-components)
 * with localStorage fallback when API is unavailable.
 */

import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient, useQueries } from '@tanstack/react-query'
import { ModeView } from '@compounds/_shared'
import { useExperience } from '@/contexts/ExperienceContext'
import { ReportsManagerView, REPORTS_OPEN_TEMPLATE_EVENT } from './ReportsManagerView'
import { useSnackbar } from 'notistack'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import { FileText, AlertTriangle } from 'lucide-react'
import { t, tOr } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { FlytoPageHeader } from '@atoms/FlytoPageHeader'
import { useOrg } from '@hooks/useOrg'
import { useCapabilities } from '@hooks/useCapabilities'
import { useProjectCapabilities } from '@hooks/useProjectCapabilities'
import {
  listReportTemplates, createReportTemplate, updateReportTemplate, deleteReportTemplate,
  listReportComponents, createReportComponent, deleteReportComponent,
  polishReport,
} from '@lib/engine'
import type { ReportAIPolishResponse, ReportTemplateConfig } from '@lib/engine'
import { downloadBuiltReport } from '@lib/engine'
import { partitionWidgetsBySupport, widgetToSection, computeWidgetExportData, type BackendReportSection } from './buildSections'
import { fetchWidgetRows } from './exportData'
import { ReportCatalog } from './ReportCatalog'
import { ReportPreview } from './ReportPreview'
import { ReportToolbar } from './ReportToolbar'
import { CustomBuilder, type BuilderMode } from './CustomBuilder'
import { JoinCanvas } from './JoinCanvas'
import { useJoinDesigner } from './useJoinDesigner'
import { DATA_SOURCE_MAP, canUseDataSource } from './datasources'
import { REPORT_TEMPLATES } from './templates'
import {
  getNestedValue, makeEmptyTemplate,
  loadComponents, persistComponents,
  loadSavedIndex, persistSavedIndex,
  loadSavedReport, persistSavedReport,
  countReportWidgets, normalizeReportSections,
} from './utils'
import type { ReportTemplate, ReportSection, DataWidgetConfig, SavedComponent } from './types'

// Module-level mailbox for the manager→engineer deep-link. Because
// ModeView uses AnimatePresence mode="wait", the engineer view mounts
// ~one exit-animation later than the click, so a fire-and-forget event
// can race ahead of the listener. The engineer view drains this on
// mount AND listens for the live event (covers the case where it was
// already mounted), so the target template is never lost.
let pendingOpenTemplateId: string | null = null

/**
 * ReportsView — dual-mode wrapper.
 *
 * manager  = audience-aware Report Center (ReportsManagerView)
 * engineer = the existing section/widget editor + raw template catalog
 *            (ReportsEngineerView, unchanged behavior)
 *
 * Cross-mode deep-link: the manager view's "Open in editor" flips the
 * experience to engineer mode, stashes the target template id, and
 * broadcasts REPORTS_OPEN_TEMPLATE_EVENT; the engineer view selects
 * that template directly (on mount from the mailbox, or live via the
 * event if already mounted).
 */
export function ReportsView() {
  const { setMode } = useExperience()

  const handleOpenInEditor = useCallback((templateId: string) => {
    pendingOpenTemplateId = templateId
    setMode('engineer')
    window.dispatchEvent(
      new CustomEvent(REPORTS_OPEN_TEMPLATE_EVENT, { detail: { templateId } }),
    )
  }, [setMode])

  return (
    <ModeView
      manager={<ReportsManagerView onOpenInEditor={handleOpenInEditor} />}
      engineer={<ReportsEngineerView />}
    />
  )
}

function ReportsEngineerView() {
  const { org } = useOrg()
  const orgId = org?.id ?? ''
  const caps = useCapabilities(orgId)
  const projectCaps = useProjectCapabilities(orgId)
  const previewRef = useRef<HTMLDivElement>(null)
  const { enqueueSnackbar } = useSnackbar()
  const qc = useQueryClient()

  const [selectedId, setSelectedId] = useState<string | null>('security-audit')
  const [customTemplate, setCustomTemplate] = useState<ReportTemplate>(makeEmptyTemplate)
  const [builderMode, setBuilderMode] = useState<BuilderMode>('layout')

  // ── Fetch saved reports from API (fallback to localStorage) ──
  // `isPlaceholderData` is true while the API has not returned real data
  // (down / 5xx / report_templates table missing from engine migrations).
  // In that state the catalog is showing the localStorage mirror only, so
  // the saved list is NOT server-backed — surfaced as a visible banner
  // below instead of silently looking persisted (REPORTS_AUDIT_2026_06_01 §3).
  const { data: savedReportsData, isPlaceholderData: savedReportsLocalOnly } = useQuery({
    queryKey: qk.reports.templates(orgId),
    queryFn: () => listReportTemplates(orgId),
    enabled: !!orgId,
    staleTime: 30_000,
    // If API fails, use localStorage
    placeholderData: { templates: loadSavedIndex().map(r => ({
      id: r.id, org_id: orgId, name: r.name, category: 'custom',
      config: null, created_at: r.savedAt, updated_at: r.savedAt,
    })) } as any,
  })
  const savedReports = (savedReportsData?.templates ?? []).map(t => ({
    id: t.id, name: t.name, savedAt: t.updated_at ?? t.created_at,
  }))

  // ── Fetch components from API (fallback to localStorage) ──
  const { data: componentsData } = useQuery({
    queryKey: qk.reports.components(orgId),
    queryFn: () => listReportComponents(orgId),
    enabled: !!orgId,
    staleTime: 30_000,
    placeholderData: { components: loadComponents().map(c => ({
      ...c, org_id: orgId, created_at: c.createdAt,
    })) } as any,
  })
  const components: SavedComponent[] = (componentsData?.components ?? []).map(c => ({
    id: c.id,
    name: c.name,
    dataSourceId: c.data_source_id,
    chartType: c.chart_type as any,
    labelField: c.label_field,
    valueField: c.value_field,
    defaultCols: c.default_cols,
    createdAt: c.created_at,
  }))

  // Custom mode signals — three valid sources:
  //   '__new_custom__' — operator clicked "+ New Custom" (not saved yet)
  //   selectedId starts 'custom_' — legacy localStorage IDs (makeEmptyTemplate format)
  //   selectedId matches a savedReports row — backend-issued UUID from createReportTemplate
  //
  // Earlier code only checked the first two, so loading a backend-saved
  // template silently fell through to the first preset and the operator's
  // PDF export carried the wrong content (operator-reported 2026-05-24).
  // The savedReports lookup closes that gap without per-id format rules.
  const isCustom = !!selectedId && (
    selectedId === '__new_custom__'
    || selectedId.startsWith('custom_')
    || savedReports.some(r => r.id === selectedId)
  )
  const selectedTemplate = isCustom
    ? customTemplate
    : REPORT_TEMPLATES.find(t => t.id === selectedId) ?? REPORT_TEMPLATES[0]
  const activeTemplate = useMemo<ReportTemplate>(() => ({
    ...selectedTemplate,
    sections: normalizeReportSections(selectedTemplate.sections),
  }), [selectedTemplate])

  // JOIN designer
  const joinDesigner = useJoinDesigner()
  const joinQueries = useQueries({
    queries: joinDesigner.nodes.map(n => {
      const ds = DATA_SOURCE_MAP[n.sourceId]
      return {
        queryKey: qk.reports.dataSource(n.sourceId, orgId),
        queryFn: () => ds?.fetcher(orgId),
        enabled: !!ds && canUseDataSource(ds, caps) && !!orgId,
        staleTime: 2 * 60_000,
      }
    }),
  })
  const fetchedData = useMemo(() => {
    const map = new Map<string, any[]>()
    joinDesigner.nodes.forEach((n, i) => {
      const ds = DATA_SOURCE_MAP[n.sourceId]
      const data = joinQueries[i]?.data
      if (data && ds) {
        const rows = ds.rowsPath ? getNestedValue(data, ds.rowsPath) ?? [] : [data]
        map.set(n.sourceId, Array.isArray(rows) ? rows : [rows])
      }
    })
    return map
  }, [joinDesigner.nodes, joinQueries])

  // ── Mutations ──

  const createTemplateMut = useMutation({
    mutationFn: (body: { name: string; config: ReportTemplateConfig }) =>
      createReportTemplate(orgId, { name: body.name, category: 'custom', config: body.config }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: qk.reports.templates(orgId) })
      // Re-key the in-memory custom template to the backend's UUID so
      // the NEXT save hits the update path (not duplicate-create).
      // We deliberately do NOT change selectedId here — flipping it
      // to the new UUID before the savedReports refetch lands makes
      // isCustom briefly resolve false (UUID is not in savedReports
      // yet, doesn't match '__new_custom__', no 'custom_' prefix),
      // which would flicker the preview to the first preset for a
      // tick. Keeping selectedId at '__new_custom__' is stable until
      // the operator clicks the new entry in the catalog.
      if (created?.id) {
        setCustomTemplate(prev => {
          const updated = { ...prev, id: created.id, sections: normalizeReportSections(prev.sections) }
          // Belt-and-braces: also persist the full template to
          // localStorage so reloading still finds the design even
          // when a future API call hits a 5xx (the report_templates
          // table is missing from migrations, so the API surface
          // is currently best-effort).
          persistSavedReport(updated)
          const idx = loadSavedIndex().filter(r => r.id !== created.id)
          persistSavedIndex([
            { id: created.id, name: updated.name, savedAt: new Date().toISOString() },
            ...idx,
          ])
          return updated
        })
      }
      enqueueSnackbar(t('reports.reportSaved'), { variant: 'success' })
    },
    onError: (_err, vars) => {
      // API failed — most likely because report_templates table is
      // absent from any migration. Persist locally so the operator's
      // draft doesn't evaporate on reload; the catalog will pick it
      // up via the placeholderData path on next render.
      const localId = customTemplate.id?.startsWith('custom_')
        ? customTemplate.id
        : `custom_${Date.now()}`
      const tpl = {
        ...customTemplate,
        id: localId,
        name: vars.name,
        sections: normalizeReportSections(
          (vars.config as { sections?: ReportSection[] }).sections ?? customTemplate.sections,
        ),
      }
      persistSavedReport(tpl)
      const idx = loadSavedIndex().filter(r => r.id !== localId)
      persistSavedIndex([
        { id: localId, name: tpl.name, savedAt: new Date().toISOString() },
        ...idx,
      ])
      setCustomTemplate(tpl)
      qc.invalidateQueries({ queryKey: qk.reports.templates(orgId) })
      enqueueSnackbar(
        t('reports.savedLocallyOnly'),
        { variant: 'warning' },
      )
    },
  })

  const updateTemplateMut = useMutation({
    mutationFn: (vars: { id: string; name: string; config: ReportTemplateConfig }) =>
      updateReportTemplate(vars.id, { name: vars.name, config: vars.config }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: qk.reports.templates(orgId) })
      // Mirror to localStorage so the durable copy stays current —
      // protects against future API regressions wiping the draft.
      const sections = normalizeReportSections((vars.config as { sections?: ReportSection[] }).sections)
      if (sections.length > 0) {
        persistSavedReport({ ...customTemplate, id: vars.id, name: vars.name, sections })
        const idx = loadSavedIndex().filter(r => r.id !== vars.id)
        persistSavedIndex([
          { id: vars.id, name: vars.name, savedAt: new Date().toISOString() },
          ...idx,
        ])
      }
      enqueueSnackbar(t('reports.reportSaved'), { variant: 'success' })
    },
    onError: (_err, vars) => {
      // Same fallback as create — API unreachable, persist locally
      // and refresh the catalog so the operator's edit isn't lost.
      const sections = normalizeReportSections((vars.config as { sections?: ReportSection[] }).sections)
      const tpl = {
        ...customTemplate, id: vars.id, name: vars.name,
        sections,
      }
      persistSavedReport(tpl)
      const idx = loadSavedIndex().filter(r => r.id !== vars.id)
      persistSavedIndex([
        { id: vars.id, name: vars.name, savedAt: new Date().toISOString() },
        ...idx,
      ])
      qc.invalidateQueries({ queryKey: qk.reports.templates(orgId) })
      enqueueSnackbar(
        t('reports.savedLocallyOnly'),
        { variant: 'warning' },
      )
    },
  })

  const deleteTemplateMut = useMutation({
    mutationFn: (id: string) => deleteReportTemplate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.reports.templates(orgId) })
      enqueueSnackbar(t('reports.reportDeleted'), { variant: 'info' })
    },
    onError: () => enqueueSnackbar(t('reports.saveError'), { variant: 'error' }),
  })

  const createComponentMut = useMutation({
    // join_config is intentionally NOT sent. Backend's report_components
    // table has no JOIN column today AND the handler uses
    // DisallowUnknownFields, so including the field produces a 400
    // ("json: unknown field"). JOIN configs are still persisted via
    // localStorage by the saved-index path, so the design survives
    // a reload without backend support.
    mutationFn: (comp: SavedComponent) =>
      createReportComponent(orgId, {
        name: comp.name,
        data_source_id: comp.dataSourceId,
        chart_type: comp.chartType,
        label_field: comp.labelField,
        value_field: comp.valueField,
        default_cols: comp.defaultCols,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.reports.components(orgId) })
      enqueueSnackbar(t('reports.savedSuccess'), { variant: 'success' })
    },
    onError: (err) => {
      // Surface the actual backend message (request() throws
      // Error(msg) where msg is the unpacked backend payload, so
      // operators see e.g. "name and chart_type required" or
      // "json: unknown field \"X\"" instead of a generic banner).
      // localStorage fallback is handled by the saved-index path
      // upstream; this banner is the diagnostic surface only.
      const msg = err instanceof Error ? err.message : ''
      enqueueSnackbar(
        msg
          ? tOr('reports.saveErrorDetailed', `Save failed: ${msg}`)
          : t('reports.saveError'),
        { variant: 'warning' },
      )
    },
  })

  const deleteComponentMut = useMutation({
    mutationFn: (id: string) => deleteReportComponent(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.reports.components(orgId) })
      enqueueSnackbar(t('reports.deletedSuccess'), { variant: 'info' })
    },
    onError: () => enqueueSnackbar(t('reports.saveError'), { variant: 'error' }),
  })

  // ── Handlers ──

  const handleSelect = useCallback((id: string) => { setSelectedId(id); setBuilderMode('layout') }, [])
  const handleCustomNew = useCallback(() => { setCustomTemplate(makeEmptyTemplate()); setSelectedId('__new_custom__') }, [])

  const handleCustomLoad = useCallback((id: string) => {
    // Two-tier lookup:
    //   1. API cache — tpl.config is the canonical source when the API is
    //      live (backend table exists + the row was saved successfully).
    //   2. localStorage — when the API endpoint failed (table missing,
    //      offline, 5xx) the useQuery `placeholderData` only carries the
    //      id+name, NOT the config. Without this fallback, clicking a
    //      saved report from the localStorage list silently did nothing
    //      (operator-reported 2026-05-24). loadSavedReport reads the
    //      separately-persisted full template blob.
    const tpl = savedReportsData?.templates?.find(t => t.id === id)
    let cfgSections: ReportSection[] | undefined
    let tplName = ''
    if (tpl?.config) {
      cfgSections = (tpl.config as { sections?: ReportSection[] }).sections
      tplName = tpl.name
    } else {
      const local = loadSavedReport(id)
      if (local) {
        cfgSections = local.sections
        tplName = local.name
      }
    }
    if (cfgSections === undefined) return
    const sections = normalizeReportSections(cfgSections)
    setCustomTemplate({
      id, name: tplName || t('reports.untitled'),
      description: '', category: 'custom', icon: FileText,
      sections,
    })
    setSelectedId(id)
  }, [savedReportsData])

  const handleCustomDelete = useCallback((id: string) => {
    deleteTemplateMut.mutate(id)
    if (selectedId === id) setSelectedId('security-audit')
  }, [selectedId, deleteTemplateMut])

  const handleAddWidget = useCallback((comp: SavedComponent, targetSectionId?: string) => {
    setCustomTemplate(prev => {
      const w: DataWidgetConfig = {
        id: `w_${Date.now()}`, dataSourceId: comp.dataSourceId, chartType: comp.chartType,
        labelField: comp.labelField, valueField: comp.valueField,
        cols: comp.defaultCols, title: comp.name,
        // Carry the JOIN definition into the layout widget so multi-source
        // saved components render with their full join at preview/PDF
        // time (not just the first table).
        joinConfig: comp.joinConfig,
      }
      // Smart layering: if target section's cols would exceed 12, create a new section
      const target = targetSectionId
        ? prev.sections.find(s => s.id === targetSectionId)
        : prev.sections[prev.sections.length - 1]
      if (!target) return prev
      const currentCols = target.widgets.reduce((sum, ww) => sum + ww.cols, 0)
      if (currentCols + w.cols > 12) {
        // Auto-create new section and place widget there
        const newSection = { id: `s_${Date.now()}`, name: `Section ${prev.sections.length + 1}`, widgets: [w] }
        const idx = prev.sections.findIndex(s => s.id === target.id)
        const sections = [...prev.sections]
        sections.splice(idx + 1, 0, newSection)
        return { ...prev, sections }
      }
      return { ...prev, sections: prev.sections.map(s =>
        s.id === target.id ? { ...s, widgets: [...s.widgets, w] } : s
      )}
    })
  }, [])

  const handleRemoveWidget = useCallback((widgetId: string) => {
    setCustomTemplate(prev => ({
      ...prev, sections: prev.sections.map(s => ({
        ...s, widgets: s.widgets.filter(w => w.id !== widgetId),
      })),
    }))
  }, [])

  const handleResizeWidget = useCallback((widgetId: string, cols: number) => {
    setCustomTemplate(prev => ({
      ...prev, sections: prev.sections.map(s => ({
        ...s, widgets: s.widgets.map(w => w.id === widgetId ? { ...w, cols } : w),
      })),
    }))
  }, [])

  const handleAddSection = useCallback(() => {
    setCustomTemplate(prev => ({
      ...prev,
      sections: [...prev.sections, {
        id: `s_${Date.now()}`,
        name: `Section ${prev.sections.length + 1}`,
        widgets: [],
      }],
    }))
  }, [])

  const handleRemoveSection = useCallback((sectionId: string) => {
    setCustomTemplate(prev => ({
      ...prev,
      sections: prev.sections.filter(s => s.id !== sectionId),
    }))
  }, [])

  const handleRenameSection = useCallback((sectionId: string, name: string) => {
    setCustomTemplate(prev => ({
      ...prev,
      sections: prev.sections.map(s =>
        s.id === sectionId ? { ...s, name } : s
      ),
    }))
  }, [])

  const handleMoveWidget = useCallback((widgetId: string, fromSectionId: string, toSectionId: string, toIndex: number) => {
    setCustomTemplate(prev => {
      const fromSection = prev.sections.find(s => s.id === fromSectionId)
      if (!fromSection) return prev
      const widget = fromSection.widgets.find(w => w.id === widgetId)
      if (!widget) return prev
      return {
        ...prev,
        sections: prev.sections.map(s => {
          if (s.id === fromSectionId && s.id === toSectionId) {
            // Reorder within same section
            const filtered = s.widgets.filter(w => w.id !== widgetId)
            filtered.splice(toIndex, 0, widget)
            return { ...s, widgets: filtered }
          }
          if (s.id === fromSectionId) return { ...s, widgets: s.widgets.filter(w => w.id !== widgetId) }
          if (s.id === toSectionId) {
            const ws = [...s.widgets]
            ws.splice(toIndex, 0, widget)
            return { ...s, widgets: ws }
          }
          return s
        }),
      }
    })
  }, [])

  const handleReorderSections = useCallback((fromIndex: number, toIndex: number) => {
    setCustomTemplate(prev => {
      const sections = [...prev.sections]
      const [moved] = sections.splice(fromIndex, 1)
      sections.splice(toIndex, 0, moved)
      return { ...prev, sections }
    })
  }, [])

  const handleSaveComponent = useCallback((comp: SavedComponent) => {
    createComponentMut.mutate(comp)
    // Also persist to localStorage as backup
    const updated = [...components, comp]
    persistComponents(updated)
  }, [components, createComponentMut])

  const handleDeleteComponent = useCallback((id: string) => {
    deleteComponentMut.mutate(id)
    // Also remove from localStorage
    const updated = components.filter(c => c.id !== id)
    persistComponents(updated)
  }, [components, deleteComponentMut])

  const handleSave = useCallback(() => {
    if (!customTemplate.name?.trim()) {
      enqueueSnackbar(t('reports.nameRequired'), { variant: 'error' })
      return
    }
    const sections = normalizeReportSections(customTemplate.sections)
    const widgetCount = countReportWidgets(sections)
    if (widgetCount === 0) {
      enqueueSnackbar(t('reports.emptyReportError'), { variant: 'warning' })
      return
    }
    const config = { sections }
    const exists = savedReports.find(r => r.id === customTemplate.id)
    if (exists) {
      updateTemplateMut.mutate({ id: customTemplate.id, name: customTemplate.name, config })
    } else {
      createTemplateMut.mutate({ name: customTemplate.name, config })
    }
  }, [customTemplate, savedReports, createTemplateMut, updateTemplateMut, enqueueSnackbar])

  // ── AI Polish ──
  const [polishData, setPolishData] = useState<ReportAIPolishResponse | null>(null)
  const [polishing, setPolishing] = useState(false)
  const aiReportAccess = caps.actionAccess('ai.report')
  const projectAiReportAccess = projectCaps.actionAccess('ai.report')
  const orgCanAiPolish = aiReportAccess ? aiReportAccess.state === 'allowed' : false
  const projectCanAiPolish = projectAiReportAccess ? projectAiReportAccess.state === 'allowed' : false
  const canAiPolish = orgCanAiPolish && projectCanAiPolish
  const aiPolishReason = (!orgCanAiPolish ? aiReportAccess?.reason : projectAiReportAccess?.reason) || t('reports.aiPolishLocked')

  // Cross-mode deep-link: when the manager Report Center fires
  // "Open in editor", select the requested preset template here so the
  // operator lands on its layout/preview directly. Drains the mailbox
  // on mount (manager→engineer transition just mounted us) AND listens
  // live (we were already in engineer mode).
  useEffect(() => {
    const openTemplate = (id: string) => {
      setSelectedId(id)
      setBuilderMode('layout')
      setPolishData(null)
    }
    if (pendingOpenTemplateId) {
      openTemplate(pendingOpenTemplateId)
      pendingOpenTemplateId = null
    }
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent<{ templateId?: string }>).detail?.templateId
      if (!id) return
      pendingOpenTemplateId = null
      openTemplate(id)
    }
    window.addEventListener(REPORTS_OPEN_TEMPLATE_EVENT, onOpen)
    return () => window.removeEventListener(REPORTS_OPEN_TEMPLATE_EVENT, onOpen)
  }, [])

  const handleAiPolish = useCallback(async () => {
    if (polishing) return
    if (!canAiPolish) {
      const lockedState = !orgCanAiPolish ? aiReportAccess?.state : projectAiReportAccess?.state
      enqueueSnackbar(aiPolishReason, { variant: lockedState === 'payment_required' ? 'warning' : 'error' })
      return
    }
    setPolishing(true)
    try {
      // Collect widget data summaries from the DOM
      const widgetEls = previewRef.current?.querySelectorAll('[data-widget-id]') ?? []
      const widgets: { title: string; chart_type: string; data_summary: string }[] = []
      widgetEls.forEach(el => {
        const htmlEl = el as HTMLElement
        const title = htmlEl.dataset.widgetTitle ?? ''
        const chartType = htmlEl.dataset.chartType ?? ''
        // Extract visible text content as data summary (tables, KPIs, labels)
        const textContent = htmlEl.innerText?.slice(0, 500) ?? ''
        widgets.push({ title, chart_type: chartType, data_summary: textContent })
      })
      if (widgets.length === 0) {
        enqueueSnackbar(t('reports.noWidgetsToPolish'), { variant: 'warning' })
        return
      }
      const result = await polishReport(orgId, {
        report_name: activeTemplate.nameKey ? tOr(activeTemplate.nameKey, activeTemplate.name) : activeTemplate.name,
        category: activeTemplate.category ?? 'general',
        widgets,
      })
      if (result.status === 'unavailable') {
        setPolishData(null)
        enqueueSnackbar(result.reason || t('reports.aiPolishUnavailable'), { variant: 'warning' })
        return
      }
      setPolishData(result)
      enqueueSnackbar(t('reports.aiPolishDone'), { variant: 'success' })
    } catch {
      setPolishData(null)
      enqueueSnackbar(t('reports.aiPolishError'), { variant: 'error' })
    } finally {
      setPolishing(false)
    }
  }, [polishing, canAiPolish, orgCanAiPolish, aiPolishReason, aiReportAccess?.state, projectAiReportAccess?.state, orgId, activeTemplate, enqueueSnackbar])

  const handleClearPolish = useCallback(() => { setPolishData(null) }, [])

  // Clear polish data when switching reports
  const handleSelectWrapped = useCallback((id: string) => {
    handleSelect(id)
    setPolishData(null)
  }, [handleSelect])

  // ── PDF Export — POST /reports/build with section descriptors ──
  //
  // Custom reports relay the data they already have back to the backend
  // (restored 2026-05-29 after the 2026-05-24 registry-only flow broke
  // every widget whose data_source the backend didn't register):
  //   - text widgets   → inline content
  //   - chart widgets  → captured PNG embedded verbatim (image-only)
  //   - kpi / table    → the rows/value the on-screen widget is showing,
  //                       fetched here (cache-served) and sent inline so
  //                       the backend renders them without a registry
  //                       lookup. Covers pulse / issues / JOINs / etc.
  // The backend skips the per-source access gate for inline sections —
  // safe because this data already came through authorized read
  // endpoints to populate the widget. The blocking dialog now only
  // fires for a genuinely unrenderable chart type (effectively never).
  const [exporting, setExporting] = useState(false)
  const [unsupportedExport, setUnsupportedExport] = useState<ReturnType<typeof partitionWidgetsBySupport>['unsupported'] | null>(null)
  const reportExportAccess = caps.actionAccess('report.export') ?? caps.actionAccess('report:export')
  const projectReportExportAccess = projectCaps.actionAccess('report.export') ?? projectCaps.actionAccess('report:export')
  const orgCanExportReport = reportExportAccess ? reportExportAccess.state === 'allowed' : caps.canDoAction('report:export')
  const projectCanExportReport = projectReportExportAccess
    ? projectReportExportAccess.state === 'allowed'
    : projectCaps.canUseAction('report.export') || projectCaps.canUseAction('report:export')
  const canExportReport = orgCanExportReport && projectCanExportReport
  const reportExportReason = (!orgCanExportReport ? reportExportAccess?.reason : projectReportExportAccess?.reason) || t('reports.exportLocked')

  const handleExportPdf = useCallback(async () => {
    if (exporting) return
    if (!canExportReport) {
      const lockedState = !orgCanExportReport ? reportExportAccess?.state : projectReportExportAccess?.state
      enqueueSnackbar(reportExportReason, { variant: lockedState === 'payment_required' ? 'warning' : 'error' })
      return
    }

    // 1. Partition widgets BEFORE doing any chart capture work. If any
    //    widget can't be exported faithfully, surface the blocker dialog
    //    and bail. Cheaper than running ApexCharts.exec for nothing.
    const { supported, unsupported } = partitionWidgetsBySupport(activeTemplate)
    if (unsupported.length > 0) {
      setUnsupportedExport(unsupported)
      return
    }
    if (supported.length === 0) {
      enqueueSnackbar(t('reports.noWidgetsToPolish'), { variant: 'warning' })
      return
    }

    setExporting(true)
    let restoreTheme: (() => Promise<void>) | null = null
    try {
      // 2. Switch charts to white bg for clean screenshots.
      const CHART_SET = new Set(['donut', 'bar', 'stacked-bar', 'line', 'area', 'radar', 'treemap', 'heatmap', 'radialBar', 'gauge'])
      const ApexCharts = (await import('apexcharts')).default
      const chartIds: string[] = supported
        .filter(w => CHART_SET.has(w.chartType))
        .map(w => w.id)
      if (chartIds.length > 0) {
        await Promise.allSettled(chartIds.map(id =>
          ApexCharts.exec(id, 'updateOptions', { chart: { background: '#ffffff', animations: { enabled: false } }, theme: { mode: 'light' } }, false, true)
        ))
        restoreTheme = async () => {
          await Promise.allSettled(chartIds.map(id =>
            ApexCharts.exec(id, 'updateOptions', { chart: { background: 'transparent', animations: { enabled: true } }, theme: { mode: 'dark' } }, false, false)
          ))
        }
      }

      // 3. Capture each chart widget's PNG (parallel).
      const chartImages = new Map<string, string>()
      await Promise.allSettled(chartIds.map(async id => {
        try {
          const r = await ApexCharts.exec(id, 'dataURI', { scale: 2 })
          if (r?.imgURI) chartImages.set(id, r.imgURI as string)
        } catch { /* leave unset → backend gets section with no image */ }
      }))

      // 4. Restore dark theme.
      if (restoreTheme) { await restoreTheme(); restoreTheme = null }

      // 5. Build backend section descriptors. Title resolved via i18n
      //    here (not in the adapter) since adapter shouldn't depend on
      //    React state. Section walking respects template order. For
      //    table/kpi widgets we fetch the rows the widget is showing
      //    (cache-served via fetchWidgetRows) and relay them inline.
      const sections: BackendReportSection[] = []
      for (const section of activeTemplate.sections) {
        for (const widget of section.widgets) {
          if (!supported.includes(widget)) continue
          const title = widget.titleKey ? tOr(widget.titleKey, widget.title ?? '') : (widget.title ?? '')
          if (widget.chartType === 'table' || widget.chartType === 'kpi') {
            try {
              const rows = await fetchWidgetRows(qc, widget, orgId, ds => canUseDataSource(ds, caps))
              sections.push(widgetToSection(widget, title, computeWidgetExportData(widget, rows)))
            } catch {
              // Data fetch failed — emit the section with empty inline
              // data rather than dropping it; the backend renders an
              // empty table/kpi and the rest of the report still ships.
              sections.push(widgetToSection(widget, title, {}))
            }
          } else {
            sections.push(widgetToSection(widget, title, { chartImage: chartImages.get(widget.id) }))
          }
        }
      }

      const reportName = activeTemplate.nameKey
        ? tOr(activeTemplate.nameKey, activeTemplate.name)
        : activeTemplate.name
      const orgName = org?.name ?? org?.id ?? ''
      const stamp = new Date().toISOString().slice(0, 10)
      const slug = reportName.replace(/\s+/g, '-').toLowerCase()

      // 6. POST /reports/build → backend renders HTML → headless Chromium → PDF blob.
      await downloadBuiltReport(
        orgId,
        {
          sections,
          settings: {
            report_name: reportName,
            description: activeTemplate.description,
            classification: 'CONFIDENTIAL',
            include_cover: true,
          },
        },
        `${slug}-${orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${stamp}`,
      )
      enqueueSnackbar(t('reports.proReportGenerated'), { variant: 'success' })
    } catch (err) {
      console.error('PDF export failed:', err)
      const msg = err instanceof Error ? err.message : ''
      enqueueSnackbar(
        msg
          ? tOr('reports.proReportErrorDetailed', `PDF export failed: ${msg}`)
          : t('reports.proReportError'),
        { variant: 'error' },
      )
    } finally {
      if (restoreTheme) await restoreTheme().catch(() => {})
      setExporting(false)
    }
  }, [exporting, canExportReport, orgCanExportReport, reportExportReason, reportExportAccess?.state, projectReportExportAccess?.state, activeTemplate, orgId, org, enqueueSnackbar, qc, caps])

  if (!orgId) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Typography color="text.secondary">{t('reports.selectOrg')}</Typography>
      </Box>
    )
  }

  const isDesignerMode = isCustom && builderMode === 'designer'

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Box sx={{ px: 3, pt: 3, pb: 1, flexShrink: 0 }}>
        <FlytoPageHeader
          title={t('reports.title')}
          subtitle={t('reports.subtitle')}
          bottomGap={4}
        />
        {savedReportsLocalOnly && (
          <Box
            data-testid="reports-local-draft-banner"
            sx={{
              display: 'flex', alignItems: 'center', gap: 1,
              mt: 1, px: 1.5, py: 1, borderRadius: 1,
              bgcolor: 'warning.50', color: 'warning.dark',
              border: '1px solid', borderColor: 'warning.light',
            }}
          >
            <AlertTriangle size={16} />
            <Typography variant="caption">
              {t('reports.localDraftWarning')}
            </Typography>
          </Box>
        )}
      </Box>
      <ReportToolbar
        reportName={activeTemplate.nameKey ? tOr(activeTemplate.nameKey, activeTemplate.name) : activeTemplate.name}
        onExportPdf={handleExportPdf}
        showSave={isCustom}
        onSave={handleSave}
        exporting={exporting}
        exportDisabled={!caps.ready || !projectCaps.ready || !canExportReport}
        exportDisabledReason={!caps.ready || !projectCaps.ready ? t('reports.capabilitiesLoading') : reportExportReason}
        onAiPolish={handleAiPolish}
        polishing={polishing}
        aiPolishDisabled={!caps.ready || !projectCaps.ready || !canAiPolish}
        aiPolishDisabledReason={!caps.ready || !projectCaps.ready ? t('reports.capabilitiesLoading') : aiPolishReason}
        hasPolishData={!!polishData}
        onClearPolish={handleClearPolish}
      />
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <ReportCatalog
          selected={selectedId}
          onSelect={handleSelectWrapped}
          onCustomNew={handleCustomNew}
          onCustomLoad={handleCustomLoad}
          onCustomDelete={handleCustomDelete}
          savedReports={savedReports}
        />
        {isDesignerMode ? (
          <JoinCanvas
            nodes={joinDesigner.nodes} edges={joinDesigner.edges}
            pan={joinDesigner.pan} panning={joinDesigner.panning}
            dragging={joinDesigner.dragging} drawingEdge={joinDesigner.drawingEdge}
            onCanvasMouseDown={joinDesigner.startPan}
            onMouseMove={joinDesigner.onMouseMove} onMouseUp={joinDesigner.onMouseUp}
            onNodeMouseDown={joinDesigner.startNodeDrag} onRemoveNode={joinDesigner.removeNode}
            onToggleField={joinDesigner.toggleField}
            onPortMouseDown={joinDesigner.startEdgeDraw} onPortMouseUp={joinDesigner.completeEdge}
            onEdgeClick={joinDesigner.toggleJoinType} onRemoveEdge={joinDesigner.removeEdge}
          />
        ) : (
          <Box sx={{ flex: 1, overflow: 'auto', bgcolor: 'background.default' }}>
            <ReportPreview
              ref={previewRef} template={activeTemplate} orgId={orgId}
              editable={isCustom} onRemoveWidget={isCustom ? handleRemoveWidget : undefined}
              polishData={polishData}
            />
          </Box>
        )}
        {isCustom && (
          <CustomBuilder
            template={customTemplate} mode={builderMode} onModeChange={setBuilderMode}
            onAddWidget={handleAddWidget} onRemoveWidget={handleRemoveWidget}
            onResizeWidget={handleResizeWidget}
            onAddSection={handleAddSection} onRemoveSection={handleRemoveSection}
            onRenameSection={handleRenameSection} onMoveWidget={handleMoveWidget}
            onReorderSections={handleReorderSections}
            onSaveComponent={handleSaveComponent} onDeleteComponent={handleDeleteComponent}
            components={components} joinDesigner={joinDesigner} fetchedData={fetchedData}
          />
        )}
      </Box>

      {/* Blocking dialog for unsupported-export. Renders when at least
          one widget in the active template cannot be faithfully sent
          to /reports/build — replaces the previous "click → silent
          404" experience. Lists the widget title + reason so the
          operator can either remove the widget OR wait for backend
          to add the corresponding data source. */}
      <Dialog
        open={unsupportedExport !== null}
        onClose={() => setUnsupportedExport(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontWeight: 700, fontSize: 16 }}>
          <AlertTriangle size={20} style={{ color: 'var(--flyto-warning, #f97316)' }} />
          {t('reports.exportBlockedTitle')}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6, mb: 2 }}>
            {t('reports.exportBlockedDesc')}
          </Typography>
          <Box component="ul" sx={{ pl: 2, m: 0, fontSize: 13 }}>
            {(unsupportedExport ?? []).map((u, i) => (
              <Box component="li" key={`${u.sectionId}-${u.widget.id}-${i}`} sx={{ mb: 0.75 }}>
                <Box component="strong" sx={{ fontWeight: 700 }}>{u.title || u.widget.id}</Box>
                <Box component="span" sx={{ color: 'text.secondary', ml: 1 }}>
                  ({u.reason === 'unsupported-source'
                    ? tOr('reports.exportBlockedSource', `data source "${u.detail}" not registered on backend`)
                    : u.reason === 'join-not-supported'
                      ? t('reports.exportBlockedJoin')
                      : tOr('reports.exportBlockedUnknown', `unknown widget type "${u.detail}"`)})
                </Box>
              </Box>
            ))}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            variant="contained"
            size="small"
            onClick={() => setUnsupportedExport(null)}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            {t('common.close')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
