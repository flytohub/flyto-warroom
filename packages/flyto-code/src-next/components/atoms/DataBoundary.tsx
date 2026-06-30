import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import LinearProgress from '@mui/material/LinearProgress'
import type { SxProps, Theme } from '@mui/material/styles'
import { Inbox } from 'lucide-react'
import EmptyStateGuide from './EmptyStateGuide'
import { LoadingState, type LoadingStateProps } from './LoadingState'
import { QueryError } from './QueryError'

export interface DataBoundaryProps {
  children: ReactNode
  isLoading?: boolean
  isFetching?: boolean
  isError?: boolean
  error?: unknown
  onRetry?: () => void
  hasData?: boolean
  empty?: boolean
  label?: string
  emptyTitle?: string
  emptyDescription?: string
  emptyIcon?: ReactNode
  emptyState?: ReactNode
  loadingState?: ReactNode
  errorState?: ReactNode
  loadingVariant?: LoadingStateProps['variant']
  loadingRows?: number
  compactError?: boolean
  refreshingPlacement?: 'top' | 'none'
  containerSx?: SxProps<Theme>
}

export function DataBoundary({
  children,
  isLoading = false,
  isFetching = false,
  isError = false,
  error,
  onRetry,
  hasData,
  empty,
  label,
  emptyTitle = 'No data yet',
  emptyDescription = 'There is no data to show for this view yet.',
  emptyIcon,
  emptyState,
  loadingState,
  errorState,
  loadingVariant = 'rows',
  loadingRows = 6,
  compactError = false,
  refreshingPlacement = 'top',
  containerSx,
}: DataBoundaryProps) {
  const hasExplicitDataState = typeof hasData === 'boolean' || typeof empty === 'boolean'
  const hasUsableData = typeof hasData === 'boolean' ? hasData : empty === true ? false : true
  const blockingLoading = isLoading && (!hasExplicitDataState || !hasUsableData)
  const blockingError = (isError || !!error) && (!hasExplicitDataState || !hasUsableData)
  const blockingEmpty = hasExplicitDataState && !isLoading && !blockingError && !hasUsableData
  const showRefresh = refreshingPlacement === 'top' && isFetching && hasUsableData && !blockingLoading

  if (blockingLoading) {
    return loadingState ?? <LoadingState variant={loadingVariant} rows={loadingRows} />
  }

  if (blockingError) {
    return errorState ?? <QueryError error={error} onRetry={onRetry} compact={compactError} label={label} />
  }

  if (blockingEmpty) {
    return emptyState ?? (
      <EmptyStateGuide
        icon={emptyIcon ?? <Inbox size={28} />}
        title={emptyTitle}
        description={emptyDescription}
      />
    )
  }

  return (
    <Box sx={[
      { position: 'relative', minWidth: 0 },
      ...(Array.isArray(containerSx) ? containerSx : containerSx ? [containerSx] : []),
    ]}>
      {showRefresh && <LinearProgress sx={{ position: 'absolute', inset: '0 0 auto 0', zIndex: 1 }} />}
      {children}
    </Box>
  )
}

export default DataBoundary
