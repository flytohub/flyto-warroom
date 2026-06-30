/**
 * AutofixPreviewModal — diff viewer for one AutoFix finding.
 * Shows the cached preview if present; lazy-generates on mount if the
 * finding is in `no_preview` state. Renders a per-file unified diff
 * with hunk grouping, GitHub deep-link, "Copy fixed file" pill, and a
 * Regenerate button.
 */

import { useEffect, useMemo, useState } from 'react'
import { computeLineDiff } from '@lib/autofix/diff'
import { computeConfidence, CONFIDENCE_COLORS, type ConfidenceVerdict } from '@lib/autofix/confidence'
import { autofixStatusCopy } from '@lib/autofix/statusReason'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Alert from '@mui/material/Alert'
import Tooltip from '@mui/material/Tooltip'
import {
  Sparkles, ChevronDown, ChevronRight, ExternalLink, Copy, Check,
  RefreshCw, Loader2, AlertTriangle, GitPullRequest, BarChart3, Download,
  X, CheckCircle2, XCircle, Circle, MinusCircle, FileCode, GitCommit,
} from 'lucide-react'
import { t, tOr } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import {
  getAutofixFinding, generateAutofixPreview, openAutofixFindingPR,
  type AutofixFindingDetail, type AutofixFileChange, type AutofixGate,
} from '@lib/engine'
import { colors as flytoColors } from '@/styles/designTokens'
import { flytoTextStyles } from '@/styles/visualSystem'

const AUTOFIX_ACCENT = flytoColors.brandDeep
const AUTOFIX_SUCCESS = flytoColors.semantic.success
const AUTOFIX_DANGER = flytoColors.semantic.danger
const AUTOFIX_MUTED = flytoColors.semantic.neutral

interface Props {
  orgId: string
  findingId: string
  onClose: () => void
}

export function AutofixPreviewModal({ orgId, findingId, onClose }: Props) {
  const qc = useQueryClient()

  const detailQ = useQuery({
    queryKey: qk.autofix.finding(orgId, findingId),
    queryFn: () => getAutofixFinding(orgId, findingId),
    staleTime: 30_000,
  })

  const previewMut = useMutation({
    mutationFn: (vars?: { force?: boolean }) => generateAutofixPreview(orgId, findingId, !!vars?.force),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.autofix.finding(orgId, findingId) })
      qc.invalidateQueries({ queryKey: qk.autofix.findings(orgId) })
    },
  })

  const prMut = useMutation({
    mutationFn: () => openAutofixFindingPR(orgId, findingId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.autofix.finding(orgId, findingId) })
      qc.invalidateQueries({ queryKey: qk.autofix.findings(orgId) })
    },
  })

  useEffect(() => {
    if (!detailQ.data) return
    const status = detailQ.data.patch_status
    if (status === 'no_preview' && !previewMut.isPending && !previewMut.isError) {
      previewMut.mutate(undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailQ.data?.patch_status])

  const detail = detailQ.data
    ? {
        ...detailQ.data,
        patch_changes: detailQ.data.patch_changes ?? [],
        verify_gates:  detailQ.data.verify_gates ?? [],
      }
    : detailQ.data
  const isLoading = detailQ.isLoading || previewMut.isPending

  function downloadPatch() {
    const changes = detail?.patch_changes ?? []
    if (!detail || changes.length === 0) return
    let patch = ''
    for (const c of changes) {
      patch += `--- a/${c.path}\n+++ b/${c.path}\n`
      const before = (c.before ?? '').split('\n')
      const after = (c.after ?? '').split('\n')
      const maxLen = Math.max(before.length, after.length)
      for (let i = 0; i < maxLen; i++) {
        if (i < before.length && i < after.length && before[i] === after[i]) {
          patch += ` ${before[i]}\n`
        } else {
          if (i < before.length) patch += `-${before[i]}\n`
          if (i < after.length) patch += `+${after[i]}\n`
        }
      }
      patch += '\n'
    }
    const blob = new Blob([patch], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `flyto-fix-${detail.rule_id}-${findingId.slice(0, 8)}.patch`
    a.click()
    URL.revokeObjectURL(url)
  }

  const isOutdated = detail?.patch_status === 'outdated'
  const verifyPassed = detail?.verify_passed ?? false
  const hasFetchError = detailQ.isError && !detail
  const statusCopy = detail ? autofixStatusCopy(detail) : null
  const outdatedPillLabel = statusCopy?.label ?? t('autofix.outdatedPill')

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth={false}
      fullWidth
      PaperProps={{ sx: { maxWidth: '80rem', borderRadius: 3 } }}
      slotProps={{ backdrop: { sx: { backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' } } }}
    >
      {/* Header */}
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
        <Sparkles size={18} style={{ color: AUTOFIX_ACCENT }} />
        <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>
          {t('autofix.previewTitle')}
        </Typography>
        {isOutdated && (
          <Chip label={outdatedPillLabel} size="small" color="success" sx={{ fontSize: 13 }} />
        )}
        <ConfidencePill detail={detail} />
        <IconButton
          size="small"
          onClick={onClose}
          aria-label={t('common.close')}
          title={t('common.close')}
          sx={{ ml: 1 }}
        >
          <X size={18} />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 3 }}>
        {/* Issue + confidence + rationale header — gives the operator
            the *story* before they look at any diff. Renders even
            while loading so the context is up while gates run. */}
        {detail && <FixStoryHeader detail={detail} />}

        {/* SAST disclaimer — kept since SAST patches really do need
            human review beyond what the gates check. */}
        {detail?.rule_category === 'sast' && (
          <Alert severity="info" icon={<Sparkles size={16} style={{ color: AUTOFIX_ACCENT }} />} sx={{ fontSize: 13 }}>
            {t('autofix.disclaimerSAST')}
          </Alert>
        )}

        {/* Progressive loading — replaces the previous static
            "running detect+transform, executing verify gates…" with
            a step-by-step checklist that progresses with elapsed
            time. Honest about what's still pending vs in-flight. */}
        {isLoading && <PreviewProgress isRunning={previewMut.isPending} />}

        {/* Fetch error — actionable. The previous version showed the
            "re-run scan often clears this" message with no button,
            forcing the operator to leave the modal and navigate to
            the repo. Now: Retry button re-fires the same fetch (cheap
            transient retry), Close button gets them out, and the
            actual engine error sits under the message so they know
            what went wrong without F12. Operator 2026-05-23. */}
        {!isLoading && hasFetchError && (
          <Alert
            severity="error"
            icon={<AlertTriangle size={16} />}
            action={
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<RefreshCw size={14} />}
                  onClick={() => detailQ.refetch()}
                  disabled={detailQ.isFetching}
                >
                  {t('autofix.fetchErrorRetry')}
                </Button>
                <Button
                  size="small"
                  variant="text"
                  onClick={onClose}
                >
                  {t('common.close')}
                </Button>
              </Box>
            }
          >
            <Box sx={{ fontWeight: 600, fontSize: 14, mb: 0.25 }}>
              {t('autofix.fetchErrorTitle')}
            </Box>
            <Box sx={{ fontSize: 13, color: 'text.secondary' }}>
              {t('autofix.fetchError')}
            </Box>
            {detailQ.error instanceof Error && detailQ.error.message && (
              <Box sx={{
                ...flytoTextStyles.codeSmall,
                mt: 1,
                color: 'text.disabled', opacity: 0.8,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {detailQ.error.message}
              </Box>
            )}
          </Alert>
        )}

        {/* Permanently no_preview — retry cap (3) hit */}
        {!isLoading && detail && detail.patch_status === 'permanently_no_preview' && (
          <Alert
            severity={statusCopy?.tone === 'info' ? 'info' : statusCopy?.tone === 'success' ? 'success' : statusCopy?.tone === 'warning' ? 'warning' : 'error'}
            icon={<AlertTriangle size={16} />}
            action={
              <Button
                size="small"
                variant="outlined"
                onClick={() => previewMut.mutate({ force: true })}
                disabled={previewMut.isPending}
              >
                {t('autofix.forceRetry')}
              </Button>
            }
          >
            <Box>
              <Box sx={{ fontWeight: 600, fontSize: 14 }}>
                {statusCopy?.title ?? t('autofix.permanentlyNoPreview')}
              </Box>
              <Box sx={{ fontSize: 13, color: 'text.secondary', mt: 0.5 }}>
                {statusCopy?.body ?? t('autofix.permanentlyNoPreview.detail')}
              </Box>
            </Box>
          </Alert>
        )}

        {/* Empty diff (still trying — retry_count < 3) */}
        {!isLoading && detail && detail.patch_status === 'no_preview' && detail.patch_changes.length === 0 && (
          <Alert
            severity={statusCopy?.tone === 'error' ? 'error' : statusCopy?.tone === 'info' ? 'info' : 'warning'}
            icon={<AlertTriangle size={16} />}
            action={
              <Button
                size="small"
                variant="outlined"
                onClick={() => previewMut.mutate({ force: true })}
                disabled={previewMut.isPending}
              >
                {statusCopy?.actionLabel ?? t('autofix.retryNow')}
              </Button>
            }
          >
            <Box>
              <Box sx={{ fontWeight: 600, fontSize: 14 }}>
                {statusCopy?.title ?? t('autofix.noPreviewTitle')}
              </Box>
              <Box sx={{ fontSize: 13, color: 'text.secondary', mt: 0.5 }}>
                {statusCopy?.body ?? t('autofix.noPreview')}
              </Box>
              {typeof detail.retry_count === 'number' && detail.retry_count > 0 && (
                <Box sx={{ fontSize: 12, color: 'text.secondary', mt: 0.5 }}>
                  {t('autofix.retryProgress')} {detail.retry_count}/3
                  {detail.cached && ' · '}{detail.cached && t('autofix.cachedHint')}
                </Box>
              )}
            </Box>
          </Alert>
        )}

        {/* Fallback for legacy rows / outdated state */}
        {!isLoading && detail && detail.patch_status !== 'permanently_no_preview' && detail.patch_status !== 'no_preview' && detail.patch_changes.length === 0 && (
          <Alert severity={statusCopy?.tone ?? 'warning'} icon={<AlertTriangle size={16} />}>
            <Box sx={{ fontWeight: 600, fontSize: 14 }}>
              {statusCopy?.title ?? t('autofix.noPreviewTitle')}
            </Box>
            <Box sx={{ fontSize: 13, color: 'text.secondary', mt: 0.5 }}>
              {statusCopy?.body ?? t('autofix.noPreview')}
            </Box>
          </Alert>
        )}

        {/* Diff content */}
        {!isLoading && detail && detail.patch_changes.length > 0 && (
          <>
            {/* Verify gates as step list — replaces the previous
                row of status chips so the gate name, message AND
                duration are all visible without hovering. Failure
                reasons surface inline next to the failed step. */}
            {detail.verify_gates.length > 0 && <VerifyGateSteps gates={detail.verify_gates} />}

            {/* Per-file diff cards */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {detail.patch_changes.map((c, i) => (
                <DiffFileCard
                  key={`${c.path}-${i}`}
                  change={c}
                  finding={detail}
                  isOutdated={isOutdated}
                  outdatedLabel={outdatedPillLabel}
                />
              ))}
            </Box>
          </>
        )}

        {/* Sticky footer */}
        {!isLoading && detail && detail.patch_changes.length > 0 && (
          <Paper
            elevation={0}
            sx={{ p: 2, borderRadius: 2, border: 1, borderColor: 'divider', bgcolor: 'action.hover' }}
          >
            {/* Blocked reason */}
            {!verifyPassed && detail.patch_status !== 'pr_opened' && (() => {
              const failed = detail.verify_gates.filter(g => g.status === 'fail' || g.status === 'error')
              const skipped = detail.verify_gates.filter(g => g.status === 'skipped')
              return (
                <Alert severity="warning" sx={{ mb: 2, fontSize: 13 }} icon={<AlertTriangle size={14} />}>
                  {failed.length > 0
                    ? t('autofix.prBlockedFail')
                        .replace('{gate}', failed[0].name)
                        .replace('{status}', failed[0].status)
                        .replace('{msg}', failed[0].message ?? t('autofix.noGateMessage'))
                    : t('autofix.prBlockedSkipped')
                        .replace('{list}', skipped.map(g => g.name).join(', ') || t('autofix.allGates'))}
                </Alert>
              )
            })()}

            {/* PR title preview — show what the operator will see in
                GitHub before they commit by clicking the button. */}
            {detail.patch_status !== 'pr_opened' && (detail.patch_title || detail.title) && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" sx={{ fontSize: 13, color: 'text.secondary', display: 'block', mb: 0.5 }}>
                  {t('autofix.prPreviewLabel')}
                </Typography>
                <Box sx={{
                  display: 'flex', alignItems: 'flex-start', gap: 1, p: 1.5,
                  bgcolor: 'background.paper', borderRadius: 1.5,
                  border: 1, borderColor: 'divider',
                }}>
                  <GitCommit size={14} style={{ marginTop: 3, color: AUTOFIX_ACCENT, flexShrink: 0 }} />
                  <Typography variant="body2" sx={{ ...flytoTextStyles.codeSmall, wordBreak: 'break-word' }}>
                    {detail.patch_title || detail.title}
                  </Typography>
                </Box>
              </Box>
            )}

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              {detail.patch_status === 'pr_opened' && detail.pr_url ? (
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<GitPullRequest size={14} />}
                  endIcon={<ExternalLink size={12} />}
                  href={detail.pr_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  component="a"
                  sx={{ textTransform: 'none' }}
                >
                  {t('autofix.prPillFooter')
                    .replace('{n}', String(detail.pr_number ?? ''))}
                </Button>
              ) : (
                <Tooltip title={!verifyPassed
                  ? t('autofix.prDisabledTip')
                  : ''}>
                  <span>
                    <Button
                      variant="contained"
                      size="small"
                      startIcon={prMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <GitPullRequest size={14} />}
                      disabled={!verifyPassed || prMut.isPending}
                      onClick={() => prMut.mutate()}
                      sx={{ textTransform: 'none' }}
                    >
                      {prMut.isPending
                        ? t('autofix.prOpening')
                        : t('autofix.openPR')}
                    </Button>
                  </span>
                </Tooltip>
              )}

              {detail.patch_changes.length > 0 && (
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<Download size={14} />}
                  onClick={downloadPatch}
                  sx={{ textTransform: 'none' }}
                >
                  {t('autofix.downloadPatch')}
                </Button>
              )}

              <Button
                variant="outlined"
                size="small"
                startIcon={previewMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                disabled={previewMut.isPending}
                onClick={() => previewMut.mutate(undefined)}
                sx={{ textTransform: 'none' }}
              >
                {previewMut.isPending
                  ? t('autofix.regenerating')
                  : t('autofix.regenerate')}
              </Button>
            </Box>

            {prMut.isError && (
              <Alert severity="error" sx={{ mt: 1.5, fontSize: 13 }}>
                {(prMut.error as Error).message}
              </Alert>
            )}
            {previewMut.isError && (
              <Alert severity="error" sx={{ mt: 1.5, fontSize: 13 }}>
                {(previewMut.error as Error).message}
              </Alert>
            )}
          </Paper>
        )}
      </DialogContent>
    </Dialog>
  )
}

// Confidence computation
// TODO(backend-truth, B6+B7): the entire confidence derivation
// (TIER1 allow-list, gate counting, label/reason synthesis)
// duplicates engine knowledge. Backend should expose
// `AutofixFindingDetail.confidence_level: 'high'|'medium'|'low'`
// + reason key + tier so the frontend only renders. Until then
// keep this in sync with backend's tier definition by hand. See
// flyto-engine/docs/FRONTEND_LOGIC_AUDIT_2026_05_24.md#B6

function ConfidencePill({ detail }: { detail: AutofixFindingDetail | undefined }) {
  const v = computeConfidence(detail)
  if (!v) return null
  const color = CONFIDENCE_COLORS[v.level]
  return (
    <Tooltip title={v.reason}>
      <Chip
        icon={<BarChart3 size={12} />}
        label={v.label}
        size="small"
        sx={{
          fontWeight: 600, fontSize: 13,
          color, borderColor: color,
          '& .MuiChip-icon': { color },
        }}
        variant="outlined"
      />
    </Tooltip>
  )
}

// ── Story header ──────────────────────────────────────────────────────
// "What's the issue and what did we do about it" — the section that
// makes the modal feel like a guided fix instead of a raw diff drop.

const SEV_COLORS: Record<string, { bg: string; fg: string }> = {
  CRITICAL: { bg: 'rgba(239,68,68,0.12)', fg: AUTOFIX_DANGER },
  HIGH:     { bg: 'rgba(249,115,22,0.12)', fg: '#f97316' },
  MEDIUM:   { bg: 'rgba(56,189,248,0.12)', fg: '#38bdf8' },
  LOW:      { bg: 'rgba(34,197,94,0.12)', fg: AUTOFIX_SUCCESS },
}

function severityLabel(severity: string): string {
  switch (severity) {
    case 'CRITICAL': return t('severity.critical')
    case 'HIGH': return t('severity.high')
    case 'MEDIUM': return t('severity.medium')
    case 'LOW': return t('severity.low')
    default: return severity
  }
}

function FixStoryHeader({ detail }: { detail: AutofixFindingDetail }) {
  const confidence = computeConfidence(detail)
  const sev = SEV_COLORS[detail.severity] ?? { bg: 'rgba(148,163,184,0.12)', fg: '#94a3b8' }
  // Avoid showing two identical lines if the rule title doubles as
  // the patch description (some Tier-1 rules emit both fields the
  // same way).
  const rawDescription = detail.patch_description && detail.patch_description !== detail.title
    ? detail.patch_description
    : detail.description
  // Pull out the "_Severity downgraded: ..._" marker that cve-bump
  // appends so we can render the body cleanly and surface the
  // adjustment reason as its own caption — leaving the marker in
  // the body looks like leaked debug text.
  const { description, severityNote } = splitSeverityNote(rawDescription)

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2, borderRadius: 2, border: 1, borderColor: 'divider',
        display: 'flex', flexDirection: 'column', gap: 1.5,
      }}
    >
      {/* Row 1 — Issue identity */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, flexWrap: 'wrap' }}>
        <Chip
          label={severityLabel(detail.severity)}
          size="small"
          sx={{
            fontWeight: 700, fontSize: 12, letterSpacing: 0.4,
            bgcolor: sev.bg, color: sev.fg,
            height: 22, borderRadius: 1,
          }}
        />
        <Typography variant="body2" sx={{ fontWeight: 700, fontSize: 14, flex: 1, minWidth: 200 }}>
          {detail.title}
        </Typography>
      </Box>

      {/* Row 2 — Coordinates: rule, repo, file:line */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', color: 'text.secondary', fontSize: 13 }}>
        {detail.rule_id && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="caption" sx={{ fontSize: 13, color: 'text.secondary' }}>
              {t('autofix.ruleLabel')}
            </Typography>
            <Typography variant="caption" sx={flytoTextStyles.codeValue}>
              {detail.rule_id}
            </Typography>
          </Box>
        )}
        {detail.repo_name && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="caption" sx={{ fontSize: 13, color: 'text.secondary' }}>·</Typography>
            <Typography variant="caption" sx={flytoTextStyles.codeSmall}>
              {detail.repo_name}
            </Typography>
          </Box>
        )}
        {detail.file_path && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="caption" sx={{ fontSize: 13, color: 'text.secondary' }}>·</Typography>
            <FileCode size={12} style={{ opacity: 0.6 }} />
            <Typography variant="caption" sx={flytoTextStyles.codeSmall}>
              {detail.file_path}{detail.line_number > 0 ? `:${detail.line_number}` : ''}
            </Typography>
          </Box>
        )}
      </Box>

      {/* Row 3 — What this fix does */}
      {description && (
        <Box>
          <Typography variant="caption" sx={{ fontSize: 13, color: 'text.secondary', display: 'block', mb: 0.5, textTransform: 'uppercase', letterSpacing: 0.4 }}>
            {t('autofix.whatThisFixDoes')}
          </Typography>
          <Typography variant="body2" sx={{ fontSize: 13, color: 'text.primary' }}>
            {description}
          </Typography>
        </Box>
      )}

      {/* Row 3b — Severity adjustment note when policy rewrote the
          original OSV severity. Tells the operator WHY the chip shows
          Low when GHSA says Medium, so they can override if needed. */}
      {severityNote && (
        <Box sx={{
          display: 'flex', alignItems: 'flex-start', gap: 1,
          fontSize: 13, color: 'text.secondary', fontStyle: 'italic',
          px: 1.25, py: 0.75,
          bgcolor: 'action.hover', borderRadius: 1,
        }}>
          <BarChart3 size={13} style={{ marginTop: 2, flexShrink: 0, opacity: 0.6 }} />
          <Box>
            <Box component="span" sx={{ fontWeight: 600 }}>
              {t('autofix.severityAdjustedLabel')}
            </Box>{' '}
            {severityNote}
          </Box>
        </Box>
      )}

      {/* Row 4 — Confidence banner */}
      {confidence && <ConfidenceBanner verdict={confidence} />}
    </Paper>
  )
}

// splitSeverityNote pulls out the "_Severity downgraded: …_" marker
// our cve-bump rule appends to the description when the dev-only
// + local-only-exploit policy rewrote the OSV severity. Returns the
// cleaned-up description (with the marker stripped) and the reason
// text, both empty/null when there's no marker.
function splitSeverityNote(raw?: string): { description: string; severityNote: string | null } {
  if (!raw) return { description: '', severityNote: null }
  const match = raw.match(/\s*_Severity downgraded:\s*([^_]+?)\._?\s*$/i)
  if (!match) return { description: raw, severityNote: null }
  return {
    description: raw.slice(0, match.index).trim(),
    severityNote: match[1].trim(),
  }
}

function ConfidenceBanner({ verdict }: { verdict: ConfidenceVerdict }) {
  const color = CONFIDENCE_COLORS[verdict.level]
  return (
    <Box sx={{
      display: 'flex', alignItems: 'flex-start', gap: 1.5,
      p: 1.5, borderRadius: 1.5,
      bgcolor: `${color}14`,
      borderLeft: `3px solid ${color}`,
    }}>
      <BarChart3 size={16} style={{ color, marginTop: 2, flexShrink: 0 }} />
      <Box>
        <Typography variant="body2" sx={{ fontSize: 13, fontWeight: 700, color, lineHeight: 1.3 }}>
          {verdict.label}
        </Typography>
        <Typography variant="caption" sx={{ fontSize: 13, color: 'text.secondary', display: 'block', mt: 0.25 }}>
          {verdict.reason}
        </Typography>
      </Box>
    </Box>
  )
}

// ── Progressive loading ──────────────────────────────────────────────
// The backend preview job runs sequentially: clone → detect → transform
// → verify → persist. We don't have SSE for it yet, so this widget
// drives the indicator off elapsed time only. Steps don't claim to be
// "complete" prematurely — the spinner moves down the list while
// later steps stay pending. Once the mutation resolves the modal
// re-renders into the gate-step list with real per-gate timings.

interface PreviewStep {
  key: string
  label: string
  startsAt: number // seconds elapsed before this step is "likely current"
}

const PREVIEW_STEPS: PreviewStep[] = [
  { key: 'clone',     label: t('autofix.previewStep.clone'),  startsAt: 0 },
  { key: 'detect',    label: t('autofix.previewStep.detect'),  startsAt: 4 },
  { key: 'transform', label: t('autofix.previewStep.transform'),                            startsAt: 10 },
  { key: 'verify',    label: t('autofix.previewStep.verify'),         startsAt: 22 },
  { key: 'persist',   label: t('autofix.previewStep.persist'), startsAt: 45 },
]

function PreviewProgress({ isRunning }: { isRunning: boolean }) {
  const [elapsedSec, setElapsedSec] = useState(0)
  useEffect(() => {
    if (!isRunning) return
    const t0 = Date.now()
    const interval = setInterval(() => setElapsedSec(Math.floor((Date.now() - t0) / 1000)), 500)
    return () => clearInterval(interval)
  }, [isRunning])

  // The "currently in flight" step is the LAST one whose startsAt
  // has elapsed. Earlier steps look provisionally done; later ones
  // stay pending.
  const currentIdx = PREVIEW_STEPS.reduce((acc, step, i) => (elapsedSec >= step.startsAt ? i : acc), 0)

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5, borderRadius: 2, border: 1, borderColor: 'divider',
        display: 'flex', flexDirection: 'column', gap: 1.25,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <Loader2 size={16} className="animate-spin" style={{ color: AUTOFIX_ACCENT }} />
        <Typography variant="body2" sx={{ fontWeight: 700, fontSize: 13 }}>
          {t('autofix.previewGeneratingTitle')}
        </Typography>
        <Typography variant="caption" sx={{ fontSize: 13, color: 'text.secondary', ml: 'auto' }}>
          {elapsedSec}s
        </Typography>
      </Box>
      {PREVIEW_STEPS.map((step, i) => {
        const state: 'done' | 'current' | 'pending' =
          i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'pending'
        const Icon = state === 'done' ? CheckCircle2 : state === 'current' ? Loader2 : Circle
        const color =
          state === 'done' ? AUTOFIX_SUCCESS :
          state === 'current' ? AUTOFIX_ACCENT :
          'text.disabled'
        return (
          <Box key={step.key} sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <Icon
              size={14}
              className={state === 'current' ? 'animate-spin' : undefined}
              style={{
                color: typeof color === 'string' && color.startsWith('#') ? color : undefined,
                opacity: state === 'pending' ? 0.35 : 1,
                flexShrink: 0,
              }}
            />
            <Typography
              variant="body2"
              sx={{
                fontSize: 13,
                color: state === 'pending' ? 'text.secondary' : state === 'current' ? 'text.primary' : 'text.secondary',
                fontWeight: state === 'current' ? 600 : 400,
              }}
            >
              {tOr(`autofix.previewStep.${step.key}`, step.label)}
            </Typography>
          </Box>
        )
      })}
    </Paper>
  )
}

// ── Verify gate step list ────────────────────────────────────────────
// Replaces the previous row of small status chips. Each gate is one
// row showing icon + name + duration + message, with the failure
// message rendered inline (not hidden in a hover-tooltip).

function VerifyGateSteps({ gates }: { gates: AutofixGate[] }) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2, borderRadius: 2, border: 1, borderColor: 'divider',
        display: 'flex', flexDirection: 'column', gap: 1,
      }}
    >
      <Typography variant="caption" sx={{
        fontSize: 13, color: 'text.secondary',
        textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 700,
      }}>
        {t('autofix.verifyGatesLabel')}
      </Typography>
      {gates.map(g => <VerifyGateRow key={g.name} gate={g} />)}
    </Paper>
  )
}

function VerifyGateRow({ gate }: { gate: AutofixGate }) {
  const meta = gateMeta(gate.status)
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25 }}>
      <meta.Icon size={16} style={{ color: meta.color, marginTop: 2, flexShrink: 0 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="body2" sx={flytoTextStyles.codeValue}>
            {gate.name}
          </Typography>
          <Typography variant="caption" sx={{ fontSize: 13, color: meta.color, fontWeight: 600 }}>
            {meta.label}
          </Typography>
          {typeof gate.took_ms === 'number' && gate.took_ms > 0 && (
            <Typography variant="caption" sx={{ fontSize: 13, color: 'text.secondary', ml: 'auto' }}>
              {formatDuration(gate.took_ms)}
            </Typography>
          )}
        </Box>
        {gate.message && (
          <Typography
            variant="caption"
            sx={{
              fontSize: 13,
              color: gate.status === 'fail' || gate.status === 'error' ? AUTOFIX_DANGER : 'text.secondary',
              display: 'block',
              mt: 0.25,
              wordBreak: 'break-word',
            }}
          >
            {gate.message}
          </Typography>
        )}
      </Box>
    </Box>
  )
}

function gateMeta(status: AutofixGate['status']): { Icon: typeof CheckCircle2; color: string; label: string } {
  switch (status) {
    case 'pass':    return { Icon: CheckCircle2, color: AUTOFIX_SUCCESS, label: t('autofix.gatePass') }
    case 'fail':    return { Icon: XCircle,      color: AUTOFIX_DANGER, label: t('autofix.gateFail') }
    case 'error':   return { Icon: XCircle,      color: AUTOFIX_DANGER, label: t('autofix.gateError') }
    case 'skipped': return { Icon: MinusCircle,  color: AUTOFIX_MUTED, label: t('autofix.gateSkipped') }
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`
}

// ── Per-file diff card ────────────────────────────────────────────────

function DiffFileCard({ change, finding, isOutdated, outdatedLabel }: {
  change: AutofixFileChange
  finding: AutofixFindingDetail
  isOutdated: boolean
  outdatedLabel?: string
}) {
  const [expanded, setExpanded] = useState(true)
  const [copied, setCopied] = useState(false)

  const githubUrl = useMemo(() => {
    if (!finding.repo_name || !change.path) return ''
    return `https://github.com/${finding.repo_name}/blob/main/${change.path}`
      + (finding.line_number > 0 ? `#L${finding.line_number}` : '')
  }, [finding.repo_name, change.path, finding.line_number])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(change.after ?? '')
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* ignore */
    }
  }

  return (
    <Paper elevation={0} sx={{ borderRadius: 2, border: 1, borderColor: 'divider', overflow: 'hidden' }}>
      {/* File header */}
      <Box
        onClick={() => setExpanded(v => !v)}
        sx={{
          display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1,
          cursor: 'pointer', bgcolor: 'action.hover',
          '&:hover': { bgcolor: 'action.selected' },
          transition: 'background 0.15s',
        }}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Typography variant="body2" sx={{ ...flytoTextStyles.codeValue, flex: 1 }}>
          {change.path}
        </Typography>
        {isOutdated && (
          <Chip label={outdatedLabel ?? t('autofix.outdatedPill')} size="small" color="success" sx={{ fontSize: 12, height: 22 }} />
        )}
        <Chip label={changeStatusLabel(change.status)} size="small" variant="outlined" sx={{ fontSize: 12, height: 22 }} />
        <Box sx={{ display: 'flex', gap: 0.5 }} onClick={e => e.stopPropagation()}>
          {githubUrl && (
            <IconButton
              size="small"
              component="a"
              href={githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('autofix.viewOnGitHub')}
              title={t('autofix.viewOnGitHub')}
            >
              <ExternalLink size={13} />
            </IconButton>
          )}
          <IconButton
            size="small"
            onClick={handleCopy}
            aria-label={t('autofix.copyFixed')}
            title={t('autofix.copyFixed')}
          >
            {copied ? <Check size={13} style={{ color: AUTOFIX_SUCCESS }} /> : <Copy size={13} />}
          </IconButton>
        </Box>
      </Box>
      {expanded && (
        <DiffBody before={change.before ?? ''} after={change.after ?? ''} />
      )}
    </Paper>
  )
}

function changeStatusLabel(status: AutofixFileChange['status']): string {
  switch (status) {
    case 'added': return t('autofix.changeStatus.added')
    case 'modified': return t('autofix.changeStatus.modified')
    case 'removed': return t('autofix.changeStatus.removed')
  }
}

// ── Line-level diff renderer ──────────────────────────────────────────

const DIFF_LINE_COLORS: Record<string, { bg: string; marker: string }> = {
  add: { bg: 'rgba(34,197,94,0.08)', marker: AUTOFIX_SUCCESS },
  del: { bg: 'rgba(239,68,68,0.08)', marker: AUTOFIX_DANGER },
  context: { bg: 'transparent', marker: 'text.secondary' },
  hunk: { bg: 'transparent', marker: 'text.secondary' },
}

function DiffBody({ before, after }: { before: string; after: string }) {
  const hunks = useMemo(() => computeLineDiff(before, after), [before, after])

  if (hunks.length === 0) {
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          {t('autofix.noChange')}
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ ...flytoTextStyles.codeSmall, overflowX: 'auto' }}>
      {hunks.map((h, hi) => (
        <Box key={hi}>
          <Box sx={{ px: 2, py: 0.5, bgcolor: 'action.hover', color: 'text.secondary', fontSize: 13 }}>
            @@ -{h.oldStart},{h.oldCount} +{h.newStart},{h.newCount} @@
          </Box>
          {h.lines.map((ln, li) => {
            const colors = DIFF_LINE_COLORS[ln.type] ?? DIFF_LINE_COLORS.context
            return (
              <Box
                key={li}
                sx={{
                  display: 'flex',
                  bgcolor: colors.bg,
                  '&:hover': { bgcolor: 'action.hover' },
                  lineHeight: 1.6,
                }}
              >
                <Box component="span" sx={{
                  width: 40, textAlign: 'right', pr: 1,
                  color: 'text.secondary', opacity: 0.5,
                  userSelect: 'none', flexShrink: 0,
                }}>
                  {ln.oldNo ?? ''}
                </Box>
                <Box component="span" sx={{
                  width: 40, textAlign: 'right', pr: 1,
                  color: 'text.secondary', opacity: 0.5,
                  userSelect: 'none', flexShrink: 0,
                }}>
                  {ln.newNo ?? ''}
                </Box>
                <Box component="span" sx={{
                  width: 16, textAlign: 'center',
                  color: colors.marker,
                  fontWeight: 700, userSelect: 'none', flexShrink: 0,
                }}>
                  {ln.type === 'add' ? '+' : ln.type === 'del' ? '-' : ' '}
                </Box>
                <Box component="span" sx={{ flex: 1, whiteSpace: 'pre', pl: 1 }}>
                  {ln.text || ' '}
                </Box>
              </Box>
            )
          })}
        </Box>
      ))}
    </Box>
  )
}
