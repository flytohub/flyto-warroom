/**
 * CustomBuilder — right panel with two tabs:
 *
 * [Data Designer] — when active, CENTER area becomes the JOIN canvas
 * [Layout]        — when active, CENTER area shows report preview
 *
 * This component controls both the right panel content AND tells
 * the parent (ReportsView) which mode is active via onModeChange.
 */

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import ButtonBase from '@mui/material/ButtonBase'
import { GitMerge, LayoutGrid } from 'lucide-react'
import { t } from '@lib/i18n';
import { loadComponents } from './utils'
import { JoinSidebar } from './JoinSidebar'
import { LayoutTab } from './LayoutTab'
import { useJoinDesigner } from './useJoinDesigner'
import { DATA_SOURCE_MAP } from './datasources'
import type { ReportTemplate, SavedComponent } from './types'

export type BuilderMode = 'designer' | 'layout'

interface Props {
  template: ReportTemplate
  mode: BuilderMode
  onModeChange: (mode: BuilderMode) => void
  onAddWidget: (comp: SavedComponent, targetSectionId?: string) => void
  onRemoveWidget: (widgetId: string) => void
  onResizeWidget: (widgetId: string, cols: number) => void
  onAddSection: () => void
  onRemoveSection: (sectionId: string) => void
  onRenameSection: (sectionId: string, name: string) => void
  onMoveWidget: (widgetId: string, fromSectionId: string, toSectionId: string, toIndex: number) => void
  onReorderSections: (fromIndex: number, toIndex: number) => void
  onSaveComponent: (comp: SavedComponent) => void
  onDeleteComponent: (id: string) => void
  components: SavedComponent[]
  /** Expose join designer state for the center canvas */
  joinDesigner: ReturnType<typeof useJoinDesigner>
  fetchedData: Map<string, any[]>
}

export function CustomBuilder({
  template, mode, onModeChange,
  onAddWidget, onRemoveWidget, onResizeWidget,
  onAddSection, onRemoveSection, onRenameSection,
  onMoveWidget, onReorderSections,
  onSaveComponent, onDeleteComponent, components,
  joinDesigner, fetchedData,
}: Props) {
  return (
    <Box sx={{
      width: 300, flexShrink: 0, minWidth: 260,
      borderLeft: '1px solid', borderColor: 'divider',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* ── Tab bar ── */}
      <Box sx={{ display: 'flex', flexShrink: 0, borderBottom: '2px solid', borderColor: 'divider' }}>
        <TabButton
          active={mode === 'layout'}
          icon={LayoutGrid}
          label={t('reports.layout')}
          onClick={() => onModeChange('layout')}
        />
        <TabButton
          active={mode === 'designer'}
          icon={GitMerge}
          label={t('reports.dataDesigner')}
          onClick={() => onModeChange('designer')}
        />
      </Box>

      {/* ── Tab content ── */}
      {mode === 'designer' && (
        <JoinSidebar
          nodes={joinDesigner.nodes}
          edges={joinDesigner.edges}
          fetchedData={fetchedData}
          onAddSource={(sourceId) => {
            const ds = DATA_SOURCE_MAP[sourceId]
            if (ds) joinDesigner.addNode(sourceId, ds.fields.map(f => f.key))
          }}
          onSave={onSaveComponent}
        />
      )}
      {mode === 'layout' && (
        <LayoutTab
          template={template}
          components={components}
          onAddWidget={onAddWidget}
          onRemoveWidget={onRemoveWidget}
          onResizeWidget={onResizeWidget}
          onAddSection={onAddSection}
          onRemoveSection={onRemoveSection}
          onRenameSection={onRenameSection}
          onMoveWidget={onMoveWidget}
          onReorderSections={onReorderSections}
          onDeleteComponent={onDeleteComponent}
        />
      )}
    </Box>
  )
}

function TabButton({ active, icon: Icon, label, onClick }: {
  active: boolean; icon: typeof GitMerge; label: string; onClick: () => void
}) {
  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        flex: 1, py: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75,
        borderBottom: '2px solid', borderColor: active ? '#8b5cf6' : 'transparent',
        mb: '-2px',
        color: active ? '#c4b5fd' : 'text.secondary',
        transition: 'all 0.15s',
        '&:hover': { color: active ? '#c4b5fd' : 'text.secondary' },
      }}
    >
      <Icon size={14} />
      <Typography variant="caption" fontWeight={active ? 700 : 500} sx={{ fontSize: 13 }}>
        {label}
      </Typography>
    </ButtonBase>
  )
}

// Re-export for convenience
export { loadComponents }
