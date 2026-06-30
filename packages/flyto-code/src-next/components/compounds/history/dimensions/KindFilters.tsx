import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import type { FeedKind } from '@lib/engine'
import { KIND_COLOR } from './shared'

// KindFilters — toggle row of kind chips. The toolbar uses this to
// let the user narrow the timeline to a subset of kinds. The default
// active set lives in the parent (CTEMHistoryView vs VAHistoryView).

export function KindFilters({
  kinds, active, onChange,
}: {
  kinds: FeedKind[]
  active: FeedKind[]
  onChange: (v: FeedKind[]) => void
}) {
  const toggle = (k: FeedKind) => {
    onChange(active.includes(k) ? active.filter(x => x !== k) : [...active, k])
  }
  return (
    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
      {kinds.map(k => (
        <Chip
          key={k}
          label={k}
          size="small"
          variant={active.includes(k) ? 'filled' : 'outlined'}
          onClick={() => toggle(k)}
          sx={{
            textTransform: 'capitalize',
            height: 26,
            cursor: 'pointer',
            bgcolor: active.includes(k) ? KIND_COLOR[k] + '22' : undefined,
            color: active.includes(k) ? KIND_COLOR[k] : undefined,
            borderColor: KIND_COLOR[k] + '66',
          }}
        />
      ))}
    </Box>
  )
}
