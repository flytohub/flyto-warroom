import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSnackbar } from 'notistack'
import {
  Chip, Button, TextField, MenuItem, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material'
import {
  Shield, Plus, Trash2, Edit3, Save, X, ChevronRight, Sparkles,
  ShieldCheck, Activity, AlertTriangle, CheckCircle2, Clock,
} from 'lucide-react'
import { GatedButton, GatedIconButton } from '@atoms/GatedButton'
import { InlineErrorNotice } from '@atoms/InlineErrorNotice'
import { QueryError } from '@atoms/QueryError'
import { t, tOr } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import {
  listMitigations, upsertMitigation, deleteMitigation, verifyMitigation,
  listMitigationEvidence,
  getCTEMPriorities,
  type Mitigation, type MitigationControlType, type UpsertMitigationReq,
  type CTEMPriorityItem, type EvidenceTier, type MitigationEvidenceRow,
} from '@lib/engine'
import { colors, softBg } from '@/styles/designTokens'
import { SkeletonRows } from '@atoms/Skeleton'
import { Empty } from '../scanning/_shared'
import { JellyCard } from '@atoms/JellyCard'

// MitigationsView — operator-declared compensating controls that
// the priority engine consumes to lower effective severity. Lives
// in the Exposure section so it's near the findings the controls
// modify (CTEM Actions / Attack Paths consume from the same data).
//
// The catalog is intentionally narrow:
//   - control_type     (waf | edr | patch | segmentation | manual | scan)
//   - applies_to_tag   (`*`, `domain:api.acme.com`, `category:sqli`, `repo:foo/bar`)
//   - severity_reduction (0-1, clamped at 0.85 server-side)
//
// Multi-tag selectors are expressed as multiple rows. Resolver
// applies matching rows multiplicatively — two 30% controls leave
// 49% remaining, not 40%.

export interface MitigationsViewProps {
  orgId: string
}

const CONTROL_TYPES: { value: MitigationControlType; label: string; labelKey: string }[] = [
  { value: 'waf',          label: 'WAF rule', labelKey: 'mit.controlType.waf' },
  { value: 'edr',          label: 'EDR signature', labelKey: 'mit.controlType.edr' },
  { value: 'patch',        label: 'Patch baseline', labelKey: 'mit.controlType.patch' },
  { value: 'segmentation', label: 'Network segmentation', labelKey: 'mit.controlType.segmentation' },
  { value: 'scan',         label: 'Scan exclusion / verified', labelKey: 'mit.controlType.scan' },
  { value: 'manual',       label: 'Manual / runbook', labelKey: 'mit.controlType.manual' },
]

const EMPTY_FORM: UpsertMitigationReq = {
  control_type: 'waf',
  name: '',
  description: '',
  applies_to_tag: '*',
  severity_reduction: 0.3,
}

// mitigationCovers mirrors the backend's selector parser
// (internal/ctem/mitigation.go ResolveMitigations →
// TODO(backend-truth, B10): this selector parser duplicates the
// engine's mitigationApplies(). Schema drift (e.g. adding a
// "tier:" selector) would silently misrepresent coverage. Backend
// should serve `GET /mitigations/{id}/coverage` returning the
// matching priority items so the frontend renders the list, not
// the matcher. See FRONTEND_LOGIC_AUDIT_2026_05_24.md#B10
//
// Vocabulary kept in sync by hand for now:
//   "*"                                — all
//   "domain:api.acme.com"              — exact domain
//   "domain:*.acme.com"                — domain suffix wildcard
//   "category:sqli"                    — finding category
//   "repo:owner/name"                  — exact repo
function mitigationCovers(tag: string, item: CTEMPriorityItem): boolean {
  const t = tag.trim()
  if (t === '' || t === '*') return true
  const idx = t.indexOf(':')
  if (idx < 0) return false
  const key = t.slice(0, idx).toLowerCase()
  const val = t.slice(idx + 1).trim()
  switch (key) {
    case 'domain': {
      if (!item.domain) return false
      const d = item.domain.toLowerCase()
      if (val === d) return true
      if (val.startsWith('*.')) {
        const suffix = val.slice(2)
        return d === suffix || d.endsWith('.' + suffix)
      }
      return false
    }
    case 'repo':
      return (item.repo_id ?? '').toLowerCase() === val.toLowerCase()
    case 'category':
      return (item.category ?? '').toLowerCase() === val.toLowerCase()
  }
  return false
}

// EVIDENCE_TIER_TONE maps the backend-resolved evidence_tier to the
// chip palette. Keep these in lockstep with FreshnessFactor in
// internal/ctem/evidence.go — a mismatch means operators see green
// chips for controls the priority engine is treating as
// aspirational, which silently lies about the security posture.
const EVIDENCE_TIER_TONE: Record<EvidenceTier, { color: string; label: string; labelKey: string; hint: string; hintKey: string }> = {
  verified: {
    color: colors.semantic.success,
    label: 'Auto-verified', labelKey: 'mit.evidenceTier.verified.label',
    hint: 'Automated probe ≤24h ago confirms this control is live. Priority engine applies the full reduction.', hintKey: 'mit.evidenceTier.verified.hint',
  },
  fading: {
    color: colors.semantic.warning,
    label: 'Fading', labelKey: 'mit.evidenceTier.fading.label',
    hint: 'Last probe 1-7d ago. Priority engine applies 75% of the reduction. Refresh the evidence to restore full credit.', hintKey: 'mit.evidenceTier.fading.hint',
  },
  stale: {
    color: colors.semantic.warning,
    label: 'Stale', labelKey: 'mit.evidenceTier.stale.label',
    hint: 'Last probe 7-30d ago. Priority engine applies 50% of the reduction. Re-check the evidence URL.', hintKey: 'mit.evidenceTier.stale.hint',
  },
  aspirational: {
    color: colors.semantic.neutral,
    label: 'Aspirational', labelKey: 'mit.evidenceTier.aspirational.label',
    hint: 'No recent automated proof OR last probe failed — priority engine ignores this reduction. Add a probe-able evidence URL or attach a takedown ticket.', hintKey: 'mit.evidenceTier.aspirational.hint',
  },
}

function relativeAge(iso?: string): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diff = Date.now() - then
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`
  return `${Math.round(diff / 86_400_000)}d ago`
}

export function MitigationsView({ orgId }: MitigationsViewProps) {
  const qc = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState<UpsertMitigationReq>(EMPTY_FORM)
  const [isAdding, setIsAdding] = useState(false)
  const [verifyTarget, setVerifyTarget] = useState<Mitigation | null>(null)
  const [verifyEvidence, setVerifyEvidence] = useState('')
  const [evidenceTarget, setEvidenceTarget] = useState<Mitigation | null>(null)

  const q = useQuery({
    queryKey: qk.ctem.mitigations(orgId),
    queryFn: () => listMitigations(orgId),
    staleTime: 30_000,
  })

  // Coverage count — run each mitigation's applies_to_tag against
  // the current bench to show "N findings covered". Lets the
  // operator validate the selector (caught typos like
  // `category:slqi` immediately) + understand the actual ROI.
  const ctemQ = useQuery({
    queryKey: qk.ctem.priorities(orgId),
    queryFn: () => getCTEMPriorities(orgId),
    staleTime: 30_000,
  })
  const findingsByMit = useMemo(() => {
    const out = new Map<string, CTEMPriorityItem[]>()
    const items = (ctemQ.data?.items ?? []) as CTEMPriorityItem[]
    for (const m of q.data?.items ?? []) {
      out.set(m.id, items.filter(i => mitigationCovers(m.applies_to_tag, i)))
    }
    return out
  }, [q.data, ctemQ.data])

  const upsertMut = useMutation({
    mutationFn: (req: UpsertMitigationReq) => upsertMitigation(orgId, req),
    onSuccess: (_, req) => {
      qc.invalidateQueries({ queryKey: qk.ctem.mitigations(orgId) })
      // Also bust the priority list — adding / editing a mitigation
      // changes effective severity on every matching finding.
      qc.invalidateQueries({ queryKey: qk.ctem.priorities(orgId) })
      // Inline templates — tOr doesn't interpolate placeholders, so
      // assemble the dynamic mitigation name in JS with the static
      // verb prefix translated.
      const prefix = req.id
        ? t('mit.toastUpdatedPrefix')
        : t('mit.toastCreatedPrefix')
      enqueueSnackbar(`${prefix} "${req.name}"`, { variant: 'success' })
      setEditing(null)
      setIsAdding(false)
      setForm(EMPTY_FORM)
    },
    onError: (err) => enqueueSnackbar(String(err as Error), { variant: 'error' }),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteMitigation(orgId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.ctem.mitigations(orgId) })
      qc.invalidateQueries({ queryKey: qk.ctem.priorities(orgId) })
      enqueueSnackbar(t('mit.toastDeleted'), { variant: 'info' })
    },
    onError: (err) => enqueueSnackbar(String(err as Error), { variant: 'error' }),
  })

  const verifyMut = useMutation({
    mutationFn: ({ id, evidence }: { id: string; evidence: string }) =>
      verifyMitigation(orgId, id, evidence),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: qk.ctem.mitigations(orgId) })
      enqueueSnackbar(t('mit.toastVerified'),
        { variant: 'success' })
      setVerifyTarget(null)
      setVerifyEvidence('')
      void vars // satisfy linter
    },
    onError: (err) => enqueueSnackbar(String(err as Error), { variant: 'error' }),
  })

  const startEdit = (m: Mitigation) => {
    setEditing(m.id)
    setForm({
      id: m.id,
      control_type: m.control_type,
      name: m.name,
      description: m.description ?? '',
      applies_to_tag: m.applies_to_tag,
      severity_reduction: m.severity_reduction,
    })
    setIsAdding(false)
  }

  const cancelEdit = () => {
    setEditing(null)
    setIsAdding(false)
    setForm(EMPTY_FORM)
  }

  return (
    <div className="exp-root" style={{ '--exp-accent': '#22c55e', '--exp-accent-end': '#10b981' } as React.CSSProperties}>
      <div className="exp-header">
        <div className="exp-header-icon"><Shield size={20} /></div>
        <div>
          <div className="exp-header-title">{t('mit.title')}</div>
          <div className="exp-header-sub">
            {t('mit.lede')}
          </div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          {!isAdding && !editing && (
            <GatedButton
              action="finding:update"
              size="small"
              variant="contained"
              startIcon={<Plus size={14} />}
              onClick={() => { setIsAdding(true); setForm(EMPTY_FORM) }}
              sx={{
                bgcolor: '#22c55e', boxShadow: 'none', '&:hover': { bgcolor: '#16a34a', boxShadow: 'none' },
                textTransform: 'none', fontWeight: 600, fontSize: 12,
              }}
            >
              {t('mit.add')}
            </GatedButton>
          )}
        </div>
      </div>

      {(isAdding || editing) && (
        <div className="exp-card" style={{ borderLeft: '3px solid #22c55e' }}>
          <div className="exp-card-head">
            <Sparkles size={16} color="#22c55e" />
            <span>{editing ? t('mit.editTitle') : t('mit.newTitle')}</span>
          </div>
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12 }}>
              <TextField
                select
                label={t('mit.fieldType')}
                size="small"
                value={form.control_type}
                onChange={e => setForm({ ...form, control_type: e.target.value as MitigationControlType })}
              >
                {CONTROL_TYPES.map(t => (
                  <MenuItem key={t.value} value={t.value}>{tOr(t.labelKey, t.label)}</MenuItem>
                ))}
              </TextField>
              <TextField
                label={t('mit.fieldName')}
                size="small"
                fullWidth
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder={t('mit.placeholderName')}
              />
            </div>
            <TextField
              label={t('mit.fieldDesc')}
              size="small"
              fullWidth
              multiline
              minRows={2}
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 12 }}>
              <TextField
                label={t('mit.fieldSelector')}
                size="small"
                fullWidth
                value={form.applies_to_tag}
                onChange={e => setForm({ ...form, applies_to_tag: e.target.value })}
                placeholder="* | domain:*.acme.com | category:sqli | repo:foo/bar"
                helperText={t('mit.fieldSelectorHelp')}
              />
              <TextField
                label={t('mit.fieldReduction')}
                size="small"
                type="number"
                inputProps={{ step: 0.05, min: 0, max: 1 }}
                value={form.severity_reduction}
                onChange={e => setForm({ ...form, severity_reduction: Math.max(0, Math.min(1, Number(e.target.value))) })}
                helperText={t('mit.fieldReductionHelp')}
              />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <GatedButton
                action="finding:update"
                size="small"
                variant="contained"
                startIcon={<Save size={14} />}
                disabled={!form.name || upsertMut.isPending}
                onClick={() => upsertMut.mutate(form)}
                sx={{
                  bgcolor: '#22c55e', boxShadow: 'none', '&:hover': { bgcolor: '#16a34a', boxShadow: 'none' },
                  textTransform: 'none', fontWeight: 600, fontSize: 12,
                }}
              >
                {t('mit.save')}
              </GatedButton>
              <Button
                size="small"
                variant="outlined"
                startIcon={<X size={14} />}
                onClick={cancelEdit}
                sx={{
                  borderColor: 'rgba(148,163,184,0.35)',
                  color: 'var(--color-text-secondary)',
                  textTransform: 'none', fontSize: 12,
                }}
              >
                {t('mit.cancel')}
              </Button>
            </div>

            {upsertMut.isError && (
              <InlineErrorNotice error={upsertMut.error} />
            )}
          </div>
        </div>
      )}

      {q.isLoading && <SkeletonRows rows={3} rowHeight={56} gap={8} />}
      {q.isError && (
        <QueryError compact error={q.error} onRetry={() => { void q.refetch() }} label={t('mit.title')} />
      )}
      {!q.isLoading && (q.data?.items?.length ?? 0) === 0 && !isAdding && (
        <Empty
          icon={Shield}
          text={t('mit.emptyTitle')}
          description={t('mit.emptyDesc')}
        />
      )}

      {(q.data?.items?.length ?? 0) > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(q.data?.items ?? []).map((m, i) => (
            <JellyCard key={m.id} delay={i * 0.04}>
            <div className="exp-card" style={{ padding: 0 }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '120px 1fr 220px auto',
                gap: 12, alignItems: 'center', padding: '12px 14px',
              }}>
                <Chip
                  size="small"
                  label={m.control_type}
                  sx={{
                    height: 22, fontSize: 13, fontWeight: 600,
                    bgcolor: softBg(colors.semantic.success, 0.14),
                    color: colors.semantic.success,
                    textTransform: 'uppercase',
                  }}
                />
                <div>
                  <div style={{
                    fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
                    color: 'var(--mui-palette-text-primary, var(--color-text-primary))',
                  }}>
                    {m.name}
                    {m.verified_at ? (
                      <Tooltip title={
                        `${t('mit.verifiedByPrefix')} ${m.verified_by} ` +
                        `on ${new Date(m.verified_at).toLocaleDateString()}` +
                        (m.verification_evidence ? `\nEvidence: ${m.verification_evidence}` : '')
                      }>
                        <Chip
                          size="small"
                          icon={<ShieldCheck size={10} />}
                          label={t('mit.verifiedBadge')}
                          sx={{
                            height: 18, fontSize: 12, fontWeight: 700,
                            bgcolor: softBg(colors.semantic.success, 0.20),
                            color: colors.semantic.success,
                            '& .MuiChip-icon': { ml: 0.5, color: colors.semantic.success },
                          }}
                        />
                      </Tooltip>
                    ) : (
                      <Tooltip title={t('mit.claimedHint')}>
                        <Chip
                          size="small"
                          label={t('mit.claimedBadge')}
                          sx={{
                            height: 18, fontSize: 12, fontWeight: 700,
                            bgcolor: softBg(colors.semantic.warning, 0.18),
                            color: colors.semantic.warning,
                          }}
                        />
                      </Tooltip>
                    )}
                  </div>
                  {m.description && (
                    <div style={{
                      fontSize: 13,
                      color: 'var(--mui-palette-text-secondary, var(--color-text-tertiary))',
                      marginTop: 2,
                    }}>
                      {m.description}
                    </div>
                  )}
                </div>
                <Tooltip title={m.applies_to_tag}>
                  <div style={{
                    fontSize: 13, fontFamily: 'ui-monospace, monospace',
                    color: 'var(--mui-palette-text-secondary, var(--color-text-secondary))',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    <ChevronRight size={10} style={{ verticalAlign: -1 }} /> {m.applies_to_tag}
                  </div>
                </Tooltip>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'flex-end' }}>
                  {/* Evidence freshness chip — the live trust signal
                      the priority engine actually applies. Distinct
                      from the operator-attested Verified/Claimed
                      badge inside the name cell: that one says
                      "operator clicked Verify once"; this one says
                      "automated probe within the freshness window
                      proves the control is still live". */}
                  {(() => {
                    const tier = (m.evidence_tier ?? 'aspirational') as EvidenceTier
                    const tone = EVIDENCE_TIER_TONE[tier]
                    const label = tOr(tone.labelKey, tone.label)
                    const hint = tOr(tone.hintKey, tone.hint)
                    const age = relativeAge(m.latest_evidence?.checked_at)
                    return (
                      <Tooltip title={`${hint}${age ? ` ${t('mit.evidenceTier.lastCheck')} ${age}.` : ''}`}>
                        <Chip
                          size="small"
                          icon={<Activity size={11} />}
                          label={`${label}${age && tier !== 'aspirational' ? ` · ${age}` : ''}`}
                          onClick={() => setEvidenceTarget(m)}
                          sx={{
                            height: 22, fontSize: 12, fontWeight: 700,
                            bgcolor: softBg(tone.color, 0.16),
                            color: tone.color,
                            border: `1px solid ${softBg(tone.color, 0.32)}`,
                            cursor: 'pointer',
                            '& .MuiChip-icon': { ml: 0.5, color: tone.color },
                          }}
                        />
                      </Tooltip>
                    )
                  })()}
                  {/* Coverage badge — how many findings this
                      control actually matches on the current bench.
                      Validates the operator's applies_to_tag and
                      shows ROI without forcing them to context-
                      switch to CTEM Actions to count manually. */}
                  {(() => {
                    const covered = findingsByMit.get(m.id) ?? []
                    if (covered.length === 0) return (
                      <Tooltip title={t('mit.coverageEmpty')}>
                        <Chip
                          size="small"
                          label={t('mit.coverageZero')}
                          sx={{
                            height: 22, fontSize: 12, fontWeight: 600,
                            bgcolor: softBg(colors.semantic.warning, 0.14),
                            color: colors.semantic.warning,
                          }}
                        />
                      </Tooltip>
                    )
                    return (
                      <Tooltip title={tOr('mit.coverageTooltip',
                        `Covers ${covered.length} open findings on the current bench`)}>
                        <Chip
                          size="small"
                          label={`${covered.length} ${t('mit.covered')}`}
                          sx={{
                            height: 22, fontSize: 12, fontWeight: 700,
                            bgcolor: softBg(colors.brand, 0.16),
                            color: colors.brand,
                          }}
                        />
                      </Tooltip>
                    )
                  })()}
                  <Chip
                    size="small"
                    label={`-${Math.round(m.severity_reduction * 100)}%`}
                    sx={{
                      height: 22, fontSize: 13, fontWeight: 700,
                      bgcolor: softBg(colors.semantic.success, 0.18),
                      color: colors.semantic.success,
                    }}
                  />
                  {!m.verified_at && (
                    <Tooltip title={t('mit.verifyHint')}>
                      <GatedIconButton action="finding:update" size="small" onClick={() => { setVerifyTarget(m); setVerifyEvidence('') }}>
                        <ShieldCheck size={14} color={colors.semantic.success} />
                      </GatedIconButton>
                    </Tooltip>
                  )}
                  <GatedIconButton action="finding:update" size="small" onClick={() => startEdit(m)}>
                    <Edit3 size={14} />
                  </GatedIconButton>
                  <GatedIconButton
                    action="finding:update"
                    size="small"
                    disabled={deleteMut.isPending}
                    onClick={() => {
                      if (window.confirm(tOr('mit.confirmDelete', `Delete control "${m.name}"?`))) {
                        deleteMut.mutate(m.id)
                      }
                    }}
                  >
                    <Trash2 size={14} color={colors.semantic.danger} />
                  </GatedIconButton>
                </div>
              </div>
            </div>
            </JellyCard>
          ))}
        </div>
      )}

      {/* Verify-evidence dialog. Opens when operator clicks the
          ShieldCheck icon on an un-verified control. Evidence is a
          free-text field — URL, JIRA ticket, screenshot path. */}
      <Dialog
        open={!!verifyTarget}
        onClose={() => { if (!verifyMut.isPending) { setVerifyTarget(null); setVerifyEvidence('') } }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontSize: 16, fontWeight: 700 }}>
          {t('mit.verifyDialogTitle')}
        </DialogTitle>
        <DialogContent>
          <div style={{ fontSize: 12, color: 'var(--mui-palette-text-secondary)', marginBottom: 12 }}>
            {t('mit.verifyDialogDesc')}
          </div>
          {verifyTarget && (
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
              {verifyTarget.name}
            </div>
          )}
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={3}
            label={t('mit.verifyEvidenceLabel')}
            value={verifyEvidence}
            onChange={(e) => setVerifyEvidence(e.target.value)}
            disabled={verifyMut.isPending}
            placeholder="https://audit.example.com/4012 — WAF rule replayed 2026-05-17"
          />
          {verifyMut.isError && (
            <div style={{ marginTop: 8 }}>
              <InlineErrorNotice error={verifyMut.error} />
            </div>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => { setVerifyTarget(null); setVerifyEvidence('') }}
            disabled={verifyMut.isPending}
            sx={{ textTransform: 'none' }}
          >
            {t('mit.cancel')}
          </Button>
          <Button
            onClick={() => verifyTarget && verifyMut.mutate({ id: verifyTarget.id, evidence: verifyEvidence.trim() })}
            disabled={!verifyEvidence.trim() || verifyMut.isPending}
            variant="contained"
            sx={{
              bgcolor: colors.semantic.success,
              boxShadow: 'none',
              '&:hover': { bgcolor: '#16a34a', boxShadow: 'none' },
              textTransform: 'none',
            }}
          >
            {verifyMut.isPending
              ? t('mit.verifying')
              : t('mit.verifyConfirm')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Evidence ledger drawer — shows the append-only history of
          automated probes / operator attestations for one
          mitigation. Operators open this to see "why is my control
          showing as stale" and to spot fail rows that need
          investigation. */}
      <EvidenceHistoryDialog
        orgId={orgId}
        mitigation={evidenceTarget}
        onClose={() => setEvidenceTarget(null)}
      />
    </div>
  )
}

function EvidenceHistoryDialog({
  orgId,
  mitigation,
  onClose,
}: {
  orgId: string
  mitigation: Mitigation | null
  onClose: () => void
}) {
  const q = useQuery({
    queryKey: qk.ctem.mitigationEvidence(orgId, mitigation?.id),
    queryFn: () => listMitigationEvidence(orgId, mitigation!.id, 50),
    enabled: !!mitigation,
    staleTime: 15_000,
  })

  if (!mitigation) return null

  const items: MitigationEvidenceRow[] = q.data?.items ?? []
  const tier = (mitigation.evidence_tier ?? 'aspirational') as EvidenceTier
  const tone = EVIDENCE_TIER_TONE[tier]

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Activity size={16} color={tone.color} />
        {t('mit.evidenceDialogTitle')}
      </DialogTitle>
      <DialogContent>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
          {mitigation.name}
        </div>
        <div style={{ fontSize: 13, color: 'var(--mui-palette-text-secondary)', marginBottom: 12 }}>
          {tOr(tone.hintKey, tone.hint)}
        </div>
        {q.isLoading && <SkeletonRows rows={4} rowHeight={44} gap={6} />}
        {q.isError && (
          <QueryError compact error={q.error} onRetry={() => { void q.refetch() }} label={t('mit.evidenceDialogTitle')} />
        )}
        {!q.isLoading && items.length === 0 && (
          <div style={{
            padding: 18, textAlign: 'center', fontSize: 12,
            color: 'var(--mui-palette-text-secondary)',
            border: '1px dashed rgba(148,163,184,0.3)', borderRadius: 6,
          }}>
            {t('mit.evidenceEmpty')}
          </div>
        )}
        {items.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflow: 'auto' }}>
            {items.map(row => (
              <EvidenceRow key={row.id} row={row} />
            ))}
          </div>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ textTransform: 'none' }}>
          {t('mit.close')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function EvidenceRow({ row }: { row: MitigationEvidenceRow }) {
  const tone =
    row.outcome === 'pass'
      ? colors.semantic.success
      : row.outcome === 'fail'
        ? colors.semantic.danger
        : colors.semantic.warning
  const Icon =
    row.outcome === 'pass'
      ? CheckCircle2
      : row.outcome === 'fail'
        ? AlertTriangle
        : Clock
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '14px 70px 80px 1fr auto',
      gap: 10, alignItems: 'center',
      padding: '8px 10px',
      borderLeft: `3px solid ${tone}`,
      borderRadius: 4,
      background: softBg(tone, 0.06),
    }}>
      <Icon size={14} color={tone} />
      <Chip
        size="small"
        label={row.outcome}
        sx={{
          height: 18, fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
          bgcolor: softBg(tone, 0.18), color: tone,
        }}
      />
      <span style={{ fontSize: 12, fontFamily: 'ui-monospace, monospace', color: 'var(--mui-palette-text-secondary)' }}>
        {row.source}
      </span>
      <div style={{
        fontSize: 13, color: 'var(--mui-palette-text-primary)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {row.details || '—'}
      </div>
      <Tooltip title={row.checked_at}>
        <span style={{
          fontSize: 12, fontVariantNumeric: 'tabular-nums',
          color: 'var(--mui-palette-text-secondary)',
        }}>
          {relativeAge(row.checked_at)}
        </span>
      </Tooltip>
    </div>
  )
}
