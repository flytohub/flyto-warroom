import { useRef, type ReactNode, type Key } from 'react'
import { Box } from '@mui/material'
import type { SxProps, Theme } from '@mui/material'
import { useVirtualizer } from '@tanstack/react-virtual'

// VirtualList — the single windowing primitive for long lists/tables.
//
// Wraps @tanstack/react-virtual (already used by ScoreTrendPage) so only
// the ~visible rows are in the DOM — a 2000-row table stays buttery and
// memory-flat. Rows may be variable-height (e.g. an expandable table row):
// `measureElement` re-measures each row after first paint, so you only need
// a rough `estimateSize`.
//
// Use it ONLY where lists get genuinely long (tens→thousands). For a
// fixed handful of rows it's pure overhead — render them directly.
//
// Tables: pass the column-header row via `header` (rendered sticky at the
// top of the same scroll container so columns stay aligned while the body
// scrolls). `renderItem` should render one full-width row.

export interface VirtualListProps<T> {
  items: T[]
  renderItem: (item: T, index: number) => ReactNode
  /** Rough starting row height in px (measured precisely after paint). */
  estimateSize?: number
  /** Extra rows rendered above/below the viewport (smoother fast scroll). */
  overscan?: number
  getKey?: (item: T, index: number) => Key
  /** Sticky header (e.g. a table column-label row). */
  header?: ReactNode
  /** sx for the scroll container. Give it a bounded height (flex:1 +
   *  minHeight:0 inside a flex column, or a fixed height). */
  sx?: SxProps<Theme>
}

export function VirtualList<T>({
  items, renderItem, estimateSize = 56, overscan = 10, getKey, header, sx,
}: VirtualListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
  })

  return (
    <Box ref={parentRef} sx={{ overflowY: 'auto', overflowX: 'hidden', ...sx }}>
      {header != null && (
        <Box sx={{ position: 'sticky', top: 0, zIndex: 2 }}>{header}</Box>
      )}
      <Box sx={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
        {virtualizer.getVirtualItems().map(vi => {
          const item = items[vi.index]
          if (item === undefined) return null
          return (
            <div
              key={getKey ? getKey(item, vi.index) : vi.key}
              data-index={vi.index}
              ref={virtualizer.measureElement}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vi.start}px)` }}
            >
              {renderItem(item, vi.index)}
            </div>
          )
        })}
      </Box>
    </Box>
  )
}
