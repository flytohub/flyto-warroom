import { type ReactNode } from 'react'
import { ButtonBase } from '@mui/material'

// QuickLinkChip — small CTA chips at the bottom of the overview that route
// operators to the workflow pages (CTEM Actions, Attack Paths, Mitigations,
// Brand Protection). Each is gated on a count when relevant. Extracted
// verbatim from PostureOverview.tsx (behaviour-neutral split).

export function QuickLinkChip({
  icon, label, count, onClick, tone, fullWidth = false,
}: {
  icon: ReactNode
  label: string
  count?: number
  onClick: () => void
  tone: string
  fullWidth?: boolean
}) {
  const hasCount = count !== undefined && count > 0
  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        display: 'inline-flex', alignItems: 'center', gap: 0.75,
        width: fullWidth ? '100%' : 'auto',
        justifyContent: fullWidth ? 'space-between' : 'flex-start',
        px: 1.5, py: 0.75, borderRadius: 2,
        bgcolor: 'var(--mui-palette-action-hover)',
        border: '1px solid var(--mui-palette-divider)',
        color: 'var(--mui-palette-text-primary)',
        fontSize: 12, fontWeight: 600,
        transition: 'background 150ms',
        '&:hover': { bgcolor: 'var(--mui-palette-action-selected)' },
        '& svg': { color: hasCount ? tone : 'var(--mui-palette-text-secondary)' },
      }}
    >
      {icon}
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {hasCount && (
        <span style={{
          marginLeft: 4, padding: '2px 7px', borderRadius: 999,
          background: tone, color: '#fff', fontSize: 12, fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
        }}>{count}</span>
      )}
    </ButtonBase>
  )
}
