import React, { useState } from 'react'
import { Chip, Button, Stack, TextField, ButtonBase, Collapse, Tooltip, IconButton } from '@mui/material'
import { Code2, Globe, User, CheckCircle2, ShieldAlert, Sparkles, ChevronDown, Layers } from 'lucide-react'
import { t } from '@lib/i18n';
import { InlineErrorNotice } from '@atoms/InlineErrorNotice'
import { colors, softBg } from '@/styles/designTokens'
import { PriorityBreakdownBar } from '@atoms/PriorityBreakdownBar'
import { tierLabel, type CTEMPriorityItem } from '@lib/engine'

// CTEMActionsDetail.tsx — detail panel + remediation list + field
// primitive extracted from the 1300-line CTEMActionsView.tsx.
// Same three sub-components, same public behaviour; lives in a
// sibling file so the orchestrator stays scannable and these can
// evolve / re-render independently.
//
// The audit on 2026-05-17 flagged CTEMActionsView at 1323 LOC as
// the biggest cognitive load in the exposure section. After this
// split it sits at ~1000 (still big but no longer hiding 3 distinct
// components inside).

// ── Detail panel ──────────────────────────────────────────────────

export interface FindingDetailPanelProps {
  issue: CTEMPriorityItem
  kind: 'external' | 'code'
  onMarkFixed: () => void
  onFalsePositive: () => void
  onAssign: (assignee: string) => void
  onViewUnified?: () => void
  markFixedPending: boolean
  falsePosPending: boolean
  assignPending: boolean
  actionError: Error | null | unknown
}

// FindingDetailPanel renders for both external + code findings. The
// kind discriminates a few labels (Domain vs Repo) and routes
// Mark-Fixed/False-Positive through the right backend endpoint.
// Replaces the dual external + CTEMExtrasPanel split that 404'd
// when CTEMExtrasPanel tried to look up a synthetic /issues
// fingerprint in the dormant code_alerts table.
export function FindingDetailPanel({
  issue, kind, onMarkFixed, onFalsePositive, onAssign, onViewUnified,
  markFixedPending, falsePosPending, assignPending, actionError,
}: FindingDetailPanelProps) {
  const [assigneeDraft, setAssigneeDraft] = useState(issue.assigned_to ?? '')
  const sevColor = colors.severity[issue.effective_severity as keyof typeof colors.severity] ?? colors.semantic.neutral

  // Exploit signal classifier — feeds PriorityBreakdownBar's
  // "this is why the row is loud" segmentation.
  const exploitSignal: 'kev' | 'epss-high' | 'epss-low' | 'category' | 'none' =
    issue.kev_listed ? 'kev'
    : issue.epss_score > 0.5 ? 'epss-high'
    : issue.epss_score > 0.1 ? 'epss-low'
    : issue.category ? 'category'
    : 'none'

  // TODO(backend-truth, B5): re-implements the engine's
  // criticalityMultiplier() ladder. Drift risk if the engine ever
  // re-tunes (1.5/1.2/1.0/0.5).
  //
  // BLOCKED on backend projection: CTEMPriorityItem currently
  // ships priority_score + asset_tier but NOT a per-component
  // breakdown — the PriorityBreakdownBar atom needs
  // tier_multiplier_contribution / exploit_contribution /
  // mitigation_contribution from the engine before this constant
  // table can go. Keep the ladder in sync with backend's
  // criticalityMultiplier() by hand for now. See
  // flyto-engine/docs/FRONTEND_LOGIC_AUDIT_2026_05_24.md#B5
  const tierMul = issue.asset_tier === 'crown_jewel' ? 1.5
                : issue.asset_tier === 'customer_facing' ? 1.2
                : issue.asset_tier === 'sandbox' ? 0.5
                : 1.0

  const isCode = kind === 'code'
  const cardIcon = isCode ? <Code2 size={16} /> : <Globe size={16} />
  const cardTitle = isCode
    ? t('ctem.codeIssueTitle')
    : t('ctem.externalIssueTitle')
  const anchorLabel = isCode
    ? t('ctem.codeRepo')
    : t('ctem.externalDomain')
  const anchorValue = isCode ? (issue.repo_id || '—') : (issue.domain || '—')

  return (
    // Fills the grid cell (height:100%) with a fixed header + an
    // internally-scrolling body, so the panel never overflows the
    // viewport — the previous calc(100vh) version ignored the page
    // chrome above it and cut off Mark Fixed below the fold.
    <div
      className="exp-card"
      style={{
        height: '100%', minHeight: 0,
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div className="exp-card-head">
        {cardIcon}
        <span>{cardTitle}</span>
        <Chip
          size="small"
          label={issue.effective_severity}
          sx={{
            ml: 'auto', height: 20, fontSize: 13, fontWeight: 700,
            bgcolor: softBg(sevColor, 0.22),
            color: sevColor,
            textTransform: 'uppercase',
          }}
        />
        {onViewUnified && (
          <Tooltip title={t('ctem.viewUnified')}>
            <IconButton
              size="small"
              onClick={onViewUnified}
              aria-label={t('ctem.viewUnified')}
              sx={{ ml: 0.5, color: colors.brand }}
            >
              <Layers size={15} />
            </IconButton>
          </Tooltip>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <PriorityBreakdownBar
          baseSeverity={issue.severity}
          tierMultiplier={tierMul}
          exploitSignal={exploitSignal}
          exploitScore={issue.epss_score}
          mitigationFactor={issue.mitigation_factor}
          priorityScore={issue.priority_score}
        />

        <DetailField label={anchorLabel} mono value={anchorValue} />
        <DetailField label={t('ctem.externalCategory')} value={issue.category} />
        <DetailField label={t('ctem.externalDescription')} value={issue.description} />
        <DetailField label={t('ctem.assetTier')} value={tierLabel(issue.asset_tier)} />

        {issue.sla_breach_at && (
          <DetailField
            label={t('ctem.slaBreachAt')}
            value={issue.breached
              ? `${t('ctem.slaBreached')} ${new Date(issue.sla_breach_at).toLocaleDateString()}`
              : `${t('ctem.slaOk')} ${new Date(issue.sla_breach_at).toLocaleDateString()} (${issue.sla_hours}h SLA)`}
            tone={issue.breached ? 'danger' : 'muted'}
          />
        )}

        {/* Assignee editor — owner pill in the row, inline editor here. */}
        <div>
          <div style={fieldLabelStyle}>{t('ctem.fieldAssignee')}</div>
          <Stack direction="row" spacing={1}>
            <TextField
              size="small"
              fullWidth
              placeholder={t('ctem.assigneePlaceholder')}
              value={assigneeDraft}
              onChange={(e) => setAssigneeDraft(e.target.value)}
              disabled={assignPending}
            />
            <Button
              size="small"
              variant="outlined"
              startIcon={<User size={14} />}
              disabled={assigneeDraft === (issue.assigned_to ?? '') || assignPending}
              onClick={() => onAssign(assigneeDraft.trim())}
              sx={{ textTransform: 'none', fontSize: 12, minWidth: 96 }}
            >
              {assignPending ? t('ctem.assigning') : t('ctem.assignButton')}
            </Button>
          </Stack>
        </div>

        {/* Closed-loop actions */}
        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
          <Button
            size="small"
            variant="contained"
            startIcon={<CheckCircle2 size={14} />}
            disabled={issue.verification_state === 'pending_verify' || markFixedPending}
            onClick={onMarkFixed}
            sx={{
              bgcolor: colors.semantic.success,
              boxShadow: 'none',
              '&:hover': { bgcolor: '#16a34a', boxShadow: 'none' },
              textTransform: 'none', fontWeight: 600, fontSize: 12,
            }}
          >
            {issue.verification_state === 'pending_verify'
              ? t('ctem.awaitingVerify')
              : t('ctem.markFixed')}
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<ShieldAlert size={14} />}
            disabled={falsePosPending}
            onClick={onFalsePositive}
            sx={{
              borderColor: 'var(--mui-palette-divider, rgba(148,163,184,0.35))',
              color: 'var(--mui-palette-text-secondary, var(--color-text-secondary))',
              textTransform: 'none', fontSize: 12,
            }}
          >
            {t('ctem.markFalsePositive')}
          </Button>
        </Stack>

        {actionError != null && (
          <div style={{ marginTop: 8 }}>
            <InlineErrorNotice error={actionError} />
          </div>
        )}

        {/* Step-by-step remediation guide — populated by the
            backend's category/domain heuristic table (lifted from
            the retired ActionPlanView). External findings only;
            code findings show empty arrays so this block hides. */}
        {(issue.fix_steps?.length ?? 0) > 0 && (
          <RemediationSteps
            recommendation={issue.recommendation}
            steps={issue.fix_steps ?? []}
          />
        )}

        <div style={{
          marginTop: 4, fontSize: 13,
          color: 'var(--mui-palette-text-secondary, var(--color-text-tertiary))',
        }}>
          {isCode
            ? t('ctem.codeGuide')
            : t('ctem.externalGuide')}
        </div>
      </div>
    </div>
  )
}

// ── Remediation steps ────────────────────────────────────────────

// RemediationSteps — numbered list with purple bubble bullets,
// lifted from the retired ActionPlanView's "Step-by-step" panel.
// Collapsible so the detail panel stays compact for findings with
// long step lists; expanded by default because the steps ARE the
// reason most operators open the detail panel.
export function RemediationSteps({ recommendation, steps }: { recommendation?: string; steps: string[] }) {
  const [open, setOpen] = useState(true)
  return (
    <div style={{
      borderRadius: 10,
      background: softBg(colors.brand, 0.05),
      border: `1px solid ${softBg(colors.brand, 0.18)}`,
      overflow: 'hidden',
    }}>
      <ButtonBase
        onClick={() => setOpen(o => !o)}
        sx={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px', textAlign: 'left',
          '&:hover': { bgcolor: softBg(colors.brand, 0.10) },
        }}
        aria-expanded={open}
      >
        <Sparkles size={12} color={colors.brand} />
        <span style={{
          fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: 0.8, color: colors.brand,
        }}>
          {t('ctem.stepByStep')}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 13, color: colors.brand, opacity: 0.7 }}>
          {steps.length}
        </span>
        <ChevronDown size={12} style={{
          color: colors.brand,
          transition: 'transform 200ms',
          transform: open ? 'rotate(0)' : 'rotate(-90deg)',
        }} />
      </ButtonBase>

      <Collapse in={open}>
        <div style={{ padding: '6px 14px 14px' }}>
          {recommendation && (
            <p style={{
              margin: '0 0 10px',
              fontSize: 12, lineHeight: 1.5, fontWeight: 600,
              color: 'var(--mui-palette-text-primary, var(--color-text-primary))',
            }}>
              {recommendation}
            </p>
          )}
          {steps.map((step, i) => (
            <div
              key={i}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                fontSize: 12.5, lineHeight: 1.7, marginBottom: 6,
                color: 'var(--mui-palette-text-secondary, var(--color-text-secondary))',
              }}
            >
              <span style={{
                flexShrink: 0, marginTop: 2,
                width: 20, height: 20, borderRadius: '50%',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700,
                color: colors.brand,
                background: softBg(colors.brand, 0.14),
                border: `1px solid ${softBg(colors.brand, 0.25)}`,
              }}>
                {i + 1}
              </span>
              <span style={{
                wordBreak: 'break-word',
                // Command-line snippets sometimes appear inline; mono
                // for monospaced-looking text keeps copy-paste clean.
                fontFamily: /[`/\\:]|sudo |openssl |curl |npm |pip /.test(step)
                  ? 'ui-monospace, monospace'
                  : undefined,
                fontSize: /[`/\\:]|sudo |openssl |curl /.test(step) ? 11.5 : 12.5,
              }}>
                {step}
              </span>
            </div>
          ))}
        </div>
      </Collapse>
    </div>
  )
}

// ── Field primitive ──────────────────────────────────────────────

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8,
  color: 'var(--mui-palette-text-secondary, var(--color-text-tertiary))',
  fontWeight: 700, marginBottom: 4,
}

export function DetailField({
  label, value, mono, tone,
}: {
  label: string; value: string; mono?: boolean; tone?: 'muted' | 'danger'
}) {
  const color =
    tone === 'danger' ? colors.semantic.danger
    : tone === 'muted' ? 'var(--mui-palette-text-secondary, var(--color-text-secondary))'
    : 'var(--mui-palette-text-primary, var(--color-text-primary))'
  return (
    <div>
      <div style={fieldLabelStyle}>{label}</div>
      <div style={{
        fontSize: 13, lineHeight: 1.5, color,
        fontFamily: mono ? 'ui-monospace, monospace' : undefined,
        fontWeight: mono ? 600 : 400,
      }}>
        {value}
      </div>
    </div>
  )
}
