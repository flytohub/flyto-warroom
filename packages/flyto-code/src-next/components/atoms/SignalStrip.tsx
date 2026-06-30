import { useState, type ReactNode } from 'react'
import { Popover, Stack } from '@mui/material'
import { SignalPill, type SignalTone } from './SignalPill'

// SignalStrip — limits the number of pills shown inline to keep the
// 3-second-scan promise, and pops the rest in a hover/click-out
// drawer. Without this, the CTEM picker row was 7+ pills per row;
// operators reported it as "looks busy, hard to triage".
//
// Default visible cap = 2. The most urgent signals (highest urgency
// rank) win the visible slots — see urgencyRank() below.
//
// Each signal is a self-describing object so the parent doesn't have
// to know about pill rendering. Pass `pulse: true` on the urgent
// few you really want to draw the eye (SLA breach, KEV).

export interface SignalSpec {
  tone: SignalTone
  label: string
  icon?: ReactNode
  tooltip?: string
  pulse?: boolean
}

export interface SignalStripProps {
  signals: SignalSpec[]
  /** Visible cap before the "+N" expand pill appears. Default 2. */
  visible?: number
}

// urgencyRank decides which signals get the limited visible slots.
// Lower number = more urgent = shown first. Tunable to match what
// operators say they care about; current order matches Gartner's
// CTEM prioritisation (active exploitation > business impact >
// state-of-the-work).
const TONE_URGENCY: Record<SignalTone, number> = {
  critical: 0, // breached SLA, KEV, threat actor
  threat:   0, // same urgency bucket — known-active campaign
  high:     1, // EPSS hot, edge-to-internal
  brand:    2, // assigned-to, internal lifecycle
  medium:   3,
  tech:     4, // descriptive (source/domain)
  success:  5, // verified fixed — not urgent, just state
  neutral:  6,
}

export function SignalStrip({ signals, visible = 2 }: SignalStripProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  if (!signals?.length) return null

  // Stable sort: pulse beats non-pulse, then urgency rank.
  const sorted = [...signals].sort((a, b) => {
    if (!!a.pulse !== !!b.pulse) return a.pulse ? -1 : 1
    return (TONE_URGENCY[a.tone] ?? 9) - (TONE_URGENCY[b.tone] ?? 9)
  })

  const shown = sorted.slice(0, visible)
  const overflow = sorted.slice(visible)

  return (
    <>
      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexWrap: 'nowrap' }}>
        {shown.map((s, i) => (
          <SignalPill key={`s-${i}-${s.label}`} {...s} />
        ))}
        {overflow.length > 0 && (
          <SignalPill
            tone="neutral"
            label={`+${overflow.length}`}
            tooltip="More signals — click to expand"
            onClick={(e?: unknown) => {
              // The onClick prop on MUI Chip receives a synthetic
              // MouseEvent — Atom's signature is `() => void` so we
              // capture currentTarget via document.activeElement
              // fallback. Use a wrapper button via Popover anchor.
              const evt = e as { currentTarget?: HTMLElement } | undefined
              if (evt?.currentTarget) setAnchor(evt.currentTarget)
              else if (document.activeElement instanceof HTMLElement) setAnchor(document.activeElement)
            }}
          />
        )}
      </Stack>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { p: 1.5, maxWidth: 320 } } }}
      >
        <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
          {overflow.map((s, i) => (
            <SignalPill key={`o-${i}-${s.label}`} {...s} />
          ))}
        </Stack>
      </Popover>
    </>
  )
}
