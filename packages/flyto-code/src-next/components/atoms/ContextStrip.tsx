/**
 * ContextStrip — terse one-line cross-dimension context for a finding.
 *
 * Renders below the finding's title in IssueRow / DepRow / etc. The
 * point: every finding is a single SAST/CVE/IaC fact, but the *value*
 * comes from the cross-dim signal (open PR touching the same file,
 * taint adjacency, AutoFix eligibility, pentest already reaching this
 * path). One row to summarise all of it; the engine's correlate
 * package supplies the data via `?enrich=true` on existing endpoints.
 *
 * Render rules:
 *   - Dot-separated, monochrome on dark UI; coloured icon per type.
 *   - Skip any segment whose data is missing — never show "--" or
 *     "(no data)" placeholders, that's clutter not context.
 *   - Cap at 4 segments. The 5th becomes "+ N more" so the row stays
 *     a single line at default font.
 *   - Click-through: each segment is a button -> opens the relevant
 *     drawer / view. Optional via onSegmentClick prop.
 */
import { AlertTriangle, GitPullRequest, ShieldAlert, Target, Wand2 } from 'lucide-react'
import { Box, ButtonBase, Typography } from '@mui/material'
import { t } from '@lib/i18n';
import { colors } from '@/styles/designTokens'

export interface PRRef {
  number: number
  title?: string
  url?: string
  head_branch?: string
  is_draft?: boolean
  opened_at?: string
}

export interface TaintRef {
  categories?: string[]
  unsanitized_count?: number
}

export interface PentestRef {
  project_id: string
  target_url?: string
  last_scan_at?: string
  critical_count?: number
}

export interface ContextSignals {
  open_prs_touching?: PRRef[]
  taint_adjacency?: TaintRef | null
  autofix_eligible?: boolean
  pentest_verdict?: PentestRef | null
  blast_radius?: number
  /** ISO timestamp the finding was last seen — overrides created_at when present. */
  last_seen?: string
}

interface ContextStripProps {
  signals: ContextSignals
  /**
   * Optional click router. The strip is purely visual by default;
   * pass this to make it interactive (open the related drawer).
   */
  onSegmentClick?: (kind: 'pr' | 'taint' | 'autofix' | 'pentest', ref: unknown) => void
}

export function ContextStrip({ signals, onSegmentClick }: ContextStripProps) {
  const segments: Array<{
    key: string
    icon: typeof GitPullRequest
    color: string
    label: string
    title?: string
    onClick?: () => void
  }> = []

  // Open PR(s) touching the file — most actionable signal: "fix
  // before this ships". Draft PRs are flagged louder because that's
  // exactly the window for a fix to land safely.
  if (signals.open_prs_touching && signals.open_prs_touching.length > 0) {
    const prs = signals.open_prs_touching
    const draftCount = prs.filter(p => p.is_draft).length
    const total = prs.length
    const label = draftCount > 0
      ? t('context.openPRsDraft')
        .replace('{n}', String(total))
      : t('context.openPRs').replace('{n}', String(total))
    const titleParts = prs.slice(0, 5)
      .map(p => `#${p.number}${p.is_draft ? ' (draft)' : ''}: ${p.title ?? p.head_branch ?? ''}`)
      .filter(Boolean)
    segments.push({
      key: 'pr',
      icon: GitPullRequest,
      color: draftCount > 0 ? colors.section.history : colors.brand,
      label,
      title: titleParts.join('\n'),
      onClick: onSegmentClick ? () => onSegmentClick('pr', prs) : undefined,
    })
  }

  // Taint adjacency — the finding's file is on a known data flow.
  // Render the categories (sqli/xss) so the operator knows WHICH
  // class without expanding the row.
  if (signals.taint_adjacency) {
    const ta = signals.taint_adjacency
    const cats = (ta.categories ?? []).slice(0, 3).join(', ')
    const label = cats
      ? t('context.taintFlow').replace('{cats}', cats)
      : t('context.taintFlowGeneric')
    segments.push({
      key: 'taint',
      icon: ShieldAlert,
      color: colors.semantic.danger,
      label,
      title: ta.unsanitized_count
        ? `${ta.unsanitized_count} unsanitized flow${ta.unsanitized_count === 1 ? '' : 's'} on this file`
        : undefined,
      onClick: onSegmentClick ? () => onSegmentClick('taint', ta) : undefined,
    })
  }

  // AutoFix eligibility — small green nudge that there's a Tier 1
  // rule waiting. Less urgent than the others; goes near the end.
  if (signals.autofix_eligible) {
    segments.push({
      key: 'autofix',
      icon: Wand2,
      color: colors.semantic.success,
      label: t('context.autofixEligible'),
      onClick: onSegmentClick ? () => onSegmentClick('autofix', null) : undefined,
    })
  }

  // Pentest verdict — same repo's most recent pentest scan. Critical
  // count drives both the colour and the label tone.
  if (signals.pentest_verdict) {
    const p = signals.pentest_verdict
    const crit = p.critical_count ?? 0
    const label = crit > 0
      ? t('context.pentestVerified').replace('{n}', String(crit))
      : t('context.pentestRan')
    segments.push({
      key: 'pentest',
      icon: Target,
      color: crit > 0 ? colors.semantic.danger : colors.semantic.neutral,
      label,
      title: p.target_url,
      onClick: onSegmentClick ? () => onSegmentClick('pentest', p) : undefined,
    })
  }

  if (segments.length === 0) return null

  // Cap at 4 — anything more becomes "+N more". A 5th segment in a
  // single-line strip starts wrapping on narrow workspaces.
  const visible = segments.slice(0, 4)
  const overflow = segments.length - visible.length

  return (
    <Box className="flex items-center gap-3 flex-wrap" sx={{ mt: 0.5 }}>
      {visible.map((seg, i) => {
        const Icon = seg.icon
        const inner = (
          <>
            <Icon size={11} style={{ color: seg.color, flexShrink: 0 }} />
            <Typography component="span" variant="caption" sx={{ color: seg.color, fontSize: 12 }}>
              {seg.label}
            </Typography>
          </>
        )
        const sep = i > 0 ? (
          <Typography component="span" variant="caption" color="text.secondary" sx={{ fontSize: 12 }}>
            ·
          </Typography>
        ) : null

        return (
          <Box key={seg.key} className="inline-flex items-center gap-3">
            {sep}
            {seg.onClick ? (
              <ButtonBase
                onClick={seg.onClick}
                title={seg.title}
                sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, p: 0 }}
              >
                {inner}
              </ButtonBase>
            ) : (
              <Box
                component="span"
                title={seg.title}
                className="inline-flex items-center"
                sx={{ gap: 0.5 }}
              >
                {inner}
              </Box>
            )}
          </Box>
        )
      })}
      {overflow > 0 && (
        <Typography component="span" variant="caption" color="text.secondary" sx={{ fontSize: 12 }}>
          +{overflow} {t('context.more')}
        </Typography>
      )}
      {typeof signals.blast_radius === 'number' && signals.blast_radius >= 60 && (
        <Box
          component="span"
          title={t('context.blastTip')}
          className="inline-flex items-center"
          sx={{
            gap: 0.375,
            color: signals.blast_radius >= 80 ? 'error.main' : 'warning.main',
            fontSize: 12,
          }}
        >
          <AlertTriangle size={11} />
          {signals.blast_radius}
        </Box>
      )}
    </Box>
  )
}
