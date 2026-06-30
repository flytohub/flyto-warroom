import { Box, CircularProgress } from '@mui/material'
import { SkeletonRows } from '@atoms/Skeleton'

// LoadingState — the single decision point for "what does loading look
// like". The convention (see docs/PAGE_CONVENTIONS.md):
//   • lists / tables  → skeleton rows (layout doesn't jump on arrival)
//   • a single block / background op → centered spinner
//
// Pages should stop reaching for a bare <CircularProgress> for list
// loading — pass variant="rows" here instead.

export interface LoadingStateProps {
  /** `rows` (default): skeleton list placeholder. `spinner`: centered
   *  CircularProgress for a single blocking fetch. */
  variant?: 'rows' | 'spinner'
  /** rows variant: how many skeleton rows. */
  rows?: number
  rowHeight?: number
  /** spinner variant: vertical padding around the spinner. */
  py?: number
}

export function LoadingState({ variant = 'rows', rows = 6, rowHeight = 28, py = 12 }: LoadingStateProps) {
  if (variant === 'spinner') {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py }}>
        <CircularProgress size={24} />
      </Box>
    )
  }
  return <SkeletonRows rows={rows} rowHeight={rowHeight} />
}
