/**
 * RedTeamEmptyState — the shared empty-state block for every Red Team panel.
 *
 * The key fix of the neon-SOC redesign: instead of a lone grey line of text,
 * every empty panel gets a glowing token-tinted icon circle (.emptyRing) +
 * a Title + a Body + an optional violet CTA. Pure presentation, no fetch.
 *
 * Accent rule (enforced by callers, documented here):
 *   - cyan (--rt-recon)  → recon / awaiting / neutral "pick a target" states
 *   - violet (--rt-ready / brand) → actionable CTA states (PLAYBOOKS, AI)
 *   - red (--rt-breach)  → REAL breach only, never a generic empty state
 * The circle tint + glow are driven by the `accent` CSS var passed in.
 */

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import { Play, type LucideIcon } from 'lucide-react'
import styles from './RedTeamView.module.css'

export interface RedTeamEmptyStateProps {
  icon: LucideIcon
  /** A --rt-* token expression, e.g. 'var(--rt-recon)'. Drives ring + glow. */
  accent?: string
  title: string
  body?: string
  /** Optional violet CTA. Omit for purely informational empties. */
  cta?: { label: string; onClick: () => void; icon?: LucideIcon }
  /** Vertical padding — tighter inside small panels. */
  dense?: boolean
  size?: number
}

export function RedTeamEmptyState({
  icon: Icon,
  accent = 'var(--rt-recon)',
  title,
  body,
  cta,
  dense = false,
  size = 44,
}: RedTeamEmptyStateProps) {
  const CtaIcon = cta?.icon ?? Play
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 1.25,
        py: dense ? 3 : 5,
        px: 2,
        // Expose the chosen accent to the ring's color-mix expressions.
        ['--rt-accent' as string]: accent,
      }}
    >
      <Box
        className={styles.emptyRing}
        sx={{ width: size, height: size, color: accent, mb: 0.25 }}
      >
        <Icon size={Math.round(size * 0.45)} />
      </Box>
      <Typography
        variant="body2"
        sx={{
          fontWeight: 700,
          letterSpacing: 0.4,
          color: 'text.primary',
          fontFamily: 'var(--flyto-font-mono)',
          textTransform: 'uppercase',
        }}
      >
        {title}
      </Typography>
      {body && (
        <Typography
          variant="body2"
          sx={{ color: 'text.secondary', maxWidth: 260, lineHeight: 1.55 }}
        >
          {body}
        </Typography>
      )}
      {cta && (
        <Button
          size="small"
          variant="contained"
          onClick={cta.onClick}
          sx={{
            mt: 0.75,
            textTransform: 'none',
            fontWeight: 700,
            // Always white on the purple brand gradient (dark in both
            // modes). --flyto-text-inverse is dark navy → unreadable.
            color: '#fff',
            background: 'linear-gradient(135deg, var(--rt-ready), var(--color-brand-dark))',
            boxShadow: 'var(--rt-glow-ready)',
            '&:hover': {
              background: 'linear-gradient(135deg, var(--color-brand-dark), var(--rt-ready))',
              boxShadow: 'var(--rt-glow-ready)',
            },
          }}
        >
          <CtaIcon size={15} style={{ marginRight: 6 }} />
          {cta.label}
        </Button>
      )}
    </Box>
  )
}
