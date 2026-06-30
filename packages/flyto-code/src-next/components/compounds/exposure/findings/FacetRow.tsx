import { Box, Typography } from '@mui/material'

// Risk-vector facet row in the Findings sidebar. Extracted verbatim
// from FindingsView.tsx (behaviour-neutral split).

export function FacetRow({ label, count, active, onClick }: {
  label: string; count: number; active: boolean; onClick: () => void
}) {
  return (
    <Box
      onClick={onClick}
      sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        px: 2, py: 0.75,
        cursor: 'pointer',
        bgcolor: active ? 'action.selected' : 'transparent',
        '&:hover': { bgcolor: 'action.hover' },
        borderLeft: active ? '3px solid' : '3px solid transparent',
        borderLeftColor: active ? 'primary.main' : 'transparent',
      }}
    >
      <Typography sx={{ fontSize: 13, fontWeight: active ? 700 : 500, color: 'text.primary' }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: 12, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
        {count}
      </Typography>
    </Box>
  )
}
