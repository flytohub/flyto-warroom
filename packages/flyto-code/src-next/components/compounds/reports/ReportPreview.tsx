/**
 * ReportPreview — renders a report template with real data.
 *
 * Screen: dark theme. PDF: .pdf-capture toggles white bg.
 * Uses DataWidget for data-driven widgets, falls back to
 * old WidgetRenderer for legacy widget configs.
 */

import { forwardRef, useMemo } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import { Trash2 } from 'lucide-react'
import { t, tOr } from '@lib/i18n';
import { DataWidget } from './DataWidget'
import type { ReportTemplate, DataWidgetConfig } from './types'
import type { ReportAIPolishResponse } from '@lib/engine'

interface Props {
  template: ReportTemplate
  orgId: string
  editable?: boolean
  onRemoveWidget?: (widgetId: string) => void
  polishData?: ReportAIPolishResponse | null
}

export const ReportPreview = forwardRef<HTMLDivElement, Props>(
  function ReportPreview({ template, orgId, editable, onRemoveWidget, polishData }, ref) {
    const sections = Array.isArray(template.sections) ? template.sections : []
    const visiblePolishData = polishData && polishData.status !== 'unavailable' ? polishData : null
    const polishedByTitle = useMemo(() => {
      const byTitle = new Map<string, string>()
      for (const section of visiblePolishData?.sections ?? []) {
        const title = section.widget_title?.trim()
        const insight = section.insight?.trim()
        if (title && insight) byTitle.set(title, insight)
      }
      return byTitle
    }, [visiblePolishData])

    return (
      <Box
        ref={ref}
        className="report-preview"
        sx={{
          p: { xs: 2, md: 4 },
          width: '100%',
          maxWidth: 960,
          mx: 'auto',
          minHeight: '100%',
          minWidth: 0,
          overflowX: 'hidden',
          '&.pdf-capture': {
            bgcolor: '#ffffff !important',
            color: '#1a1a1a !important',
            maxWidth: 'none !important',
            overflow: 'visible !important',
            '& .MuiTypography-root': { color: '#1a1a1a !important' },
            '& .MuiPaper-root': { bgcolor: '#f8f9fa !important', borderColor: '#e5e7eb !important' },
            '& .report-header': { borderColor: '#e5e7eb !important' },
            '& .widget-delete': { display: 'none !important' },
            '& .apexcharts-canvas': { background: '#ffffff !important' },
            // Expand table containers for PDF capture (no scroll clipping).
            '& .report-table-container': { overflow: 'visible !important', maxHeight: 'none !important' },
            '& .report-table': { width: '100% !important', maxWidth: 'none !important' },
            '& .report-table td': { maxWidth: 'none !important', overflow: 'visible !important', textOverflow: 'clip !important' },
          },
        }}
      >
        {/* Report header */}
        <Box className="report-header" sx={{ mb: 4, pb: 2, borderBottom: '2px solid', borderColor: 'divider' }}>
          <Typography variant="h5" fontWeight={700}>
            {template.nameKey ? tOr(template.nameKey, template.name) : template.name}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {template.descKey ? tOr(template.descKey, template.description) : template.description}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            {t('reports.generated')}: {new Date().toLocaleDateString()}
          </Typography>
        </Box>

        {visiblePolishData && (visiblePolishData.executive_summary || visiblePolishData.recommendations.length > 0) && (
          <Box
            data-testid="report-ai-polish-summary"
            sx={{
              mb: 3,
              p: 2,
              borderLeft: '3px solid',
              borderColor: 'primary.main',
              bgcolor: 'action.hover',
            }}
          >
            {visiblePolishData.executive_summary && (
              <Typography variant="body2" sx={{ mb: visiblePolishData.recommendations.length > 0 ? 1.5 : 0 }}>
                {visiblePolishData.executive_summary}
              </Typography>
            )}
            {visiblePolishData.recommendations.length > 0 && (
              <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                {visiblePolishData.recommendations.map((recommendation, idx) => (
                  <Typography key={`${recommendation}-${idx}`} component="li" variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                    {recommendation}
                  </Typography>
                ))}
              </Box>
            )}
          </Box>
        )}

        {/* Sections with grid layout */}
        {sections.map((section, sectionIdx) => {
          const sectionId = section.id || `section-${sectionIdx}`
          const widgets = Array.isArray(section.widgets) ? section.widgets : []
          const hasTable = widgets.some(w => w.chartType === 'table')
          return (
              <Box
                key={sectionId}
                data-section-id={sectionId}
                data-has-table={hasTable ? '1' : '0'}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
                  gap: 2, mb: 3, minWidth: 0,
                }}
              >
                {widgets.map((widget, widgetIdx) => {
                  const widgetId = widget.id || `${sectionId}-widget-${widgetIdx}`
                  const cols = Number.isFinite(widget.cols) ? widget.cols : 12
                  const widgetTitle = widget.titleKey ? tOr(widget.titleKey, widget.title ?? '') : (widget.title ?? '')
                  const polishedInsight = widgetTitle ? polishedByTitle.get(widgetTitle) : undefined
                  return (
                    <Box
                      key={widgetId}
                      sx={{
                        gridColumn: { xs: 'span 12', md: `span ${cols}` },
                        position: 'relative',
                        minWidth: 0,
                        '&:hover .widget-delete': { opacity: 1 },
                      }}
                    >
                      <DataWidget config={{ ...widget, id: widgetId, cols } as DataWidgetConfig} orgId={orgId} />
                      {polishedInsight && (
                        <Typography
                          data-testid={`report-ai-polish-insight-${widgetId}`}
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: 'block', mt: 1, lineHeight: 1.5 }}
                        >
                          {polishedInsight}
                        </Typography>
                      )}

                      {editable && onRemoveWidget && (
                        <Tooltip title={t('common.delete')}>
                          <IconButton
                            className="widget-delete"
                            size="small"
                            onClick={() => onRemoveWidget(widgetId)}
                            aria-label={t('common.delete')}
                            sx={{
                              position: 'absolute', top: 4, right: 4,
                              opacity: 0, transition: 'opacity 0.15s',
                              bgcolor: 'rgba(239,68,68,0.9)',
                              color: '#fff',
                              '&:hover': { bgcolor: '#ef4444' },
                              width: 22, height: 22,
                            }}
                          >
                            <Trash2 size={12} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  )
                })}

                {editable && widgets.length === 0 && (
                  <Box sx={{
                    gridColumn: 'span 12',
                    py: 4, textAlign: 'center',
                    border: '2px dashed', borderColor: 'divider', borderRadius: 2,
                  }}>
                    <Typography variant="body2" color="text.secondary">
                      {t('reports.emptySection')}
                    </Typography>
                  </Box>
                )}
              </Box>
          )
        })}

      </Box>
    )
  }
)
