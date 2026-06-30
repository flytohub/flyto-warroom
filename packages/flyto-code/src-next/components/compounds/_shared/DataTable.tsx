/**
 * DataTable — material-react-table wrapper with the workspace's dense
 * defaults: compact density, sorting on, sticky header, optional row
 * actions slot, and an onRowClick that engineer surfaces use to open
 * an EvidenceDrawer.
 *
 * Generic over the row shape; columns are MRT_ColumnDef<T>[]. This is
 * the engineer-mode table primitive — keep it thin so domain agents
 * supply their own columns + row click.
 */

import { useMemo } from 'react'
import {
  MaterialReactTable,
  useMaterialReactTable,
  type MRT_ColumnDef,
  type MRT_RowData,
} from 'material-react-table'
import { flytoLayout, flytoRadii } from '@/styles/visualSystem'

export interface DataTableProps<T extends MRT_RowData> {
  columns: MRT_ColumnDef<T>[]
  data: T[]
  /** Row click — typically opens an EvidenceDrawer for the row. */
  onRowClick?: (row: T) => void
  /** Per-row trailing action cell (icons/menu). */
  rowActions?: (row: T) => React.ReactNode
  isLoading?: boolean
  /** Cap the body height; header stays sticky above it. Default 520. */
  maxBodyHeight?: number
  /** Empty-state text. */
  emptyText?: string
}

export function DataTable<T extends MRT_RowData>({
  columns,
  data,
  onRowClick,
  rowActions,
  isLoading,
  maxBodyHeight = flytoLayout.tableMaxBodyHeight,
  emptyText,
}: DataTableProps<T>) {
  const table = useMaterialReactTable<T>({
    columns: useMemo(() => columns, [columns]),
    data,
    enableDensityToggle: false,
    initialState: { density: 'compact' },
    state: { isLoading: !!isLoading },
    enableSorting: true,
    enableStickyHeader: true,
    enableColumnActions: false,
    enableColumnFilters: false,
    enableFullScreenToggle: false,
    enableHiding: false,
    muiTableContainerProps: { sx: { maxHeight: maxBodyHeight } },
    muiTablePaperProps: { elevation: 0, sx: { borderRadius: flytoRadii.surface } },
    muiTableBodyRowProps: onRowClick
      ? ({ row }) => ({
          onClick: () => onRowClick(row.original),
          sx: { cursor: 'pointer' },
        })
      : undefined,
    enableRowActions: !!rowActions,
    renderRowActions: rowActions ? ({ row }) => rowActions(row.original) : undefined,
    positionActionsColumn: 'last',
    localization: emptyText ? { noRecordsToDisplay: emptyText } : undefined,
  })

  return <MaterialReactTable table={table} />
}

export type { MRT_ColumnDef, MRT_RowData }
