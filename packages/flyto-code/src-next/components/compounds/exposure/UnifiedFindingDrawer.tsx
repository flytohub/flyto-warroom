/**
 * UnifiedFindingDrawer — the cross-source per-finding drilldown.
 *
 * P0 coverage gap closed: GET /findings/{fingerprint} previously had
 * ZERO callers. This drawer is the first consumer — it renders the
 * unified view of one finding across every source:
 *   • cross-repo locations (which repos / files / lines it appears in)
 *   • autofix patch status + open autofix PRs
 *   • verification verdicts (exploitable / sanitized / unreachable)
 *   • open PRs touching the finding's files
 *   • blast radius (with the per-alert blast force-graph when an
 *     alert id is supplied)
 *
 * Built on the EvidenceDrawer shell from the _shared barrel; the
 * blast force-graph reuses the existing BlastGraphSVG renderer fed by
 * GET /alerts/{id}/blast-graph.
 *
 * Client functions imported by DIRECT FILE PATH per the decoupling
 * rule (findingUnified + blastGraph), NOT via @lib/engine.
 */

import { type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Box, Typography, Chip, Skeleton, Link as MuiLink, Divider, Tooltip,
} from '@mui/material'
import {
  GitPullRequest, FileCode2, ShieldCheck, Wand2, Radius,
  ExternalLink, GitBranch, AlertTriangle,
} from 'lucide-react'

import { EvidenceDrawer } from '@compounds/_shared'
import { SEVERITY_TONE, type Severity } from '@lib/tokens/severity'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'

import {
  getUnifiedFinding,
  type FindingLocation,
  type AutofixPatchInfo,
  type VerificationInfo,
  type PRInfo,
} from '@lib/engine/ctem/findingUnified'
import { getBlastGraph } from '@lib/engine/ctem/blastGraph'
import { BlastGraphSVG } from './BlastGraphSVG'

export interface UnifiedFindingDrawerProps {
  open: boolean
  onClose: () => void
  orgId: string
  /** The dedup key — drives GET /findings/{fingerprint}. */
  fingerprint: string | null
  /** Display title / domain shown in the header before the fetch lands. */
  title?: string
  subtitle?: string
  /** Optional alert id to fetch + render the per-alert blast force-graph. */
  alertId?: string | null
}

function sevOf(s?: string): Severity {
  const v = (s ?? '').toLowerCase()
  if (v === 'critical' || v === 'high' || v === 'medium' || v === 'low') return v
  return ''
}

function verdictTone(verdict?: string): Severity {
  switch ((verdict ?? '').toLowerCase()) {
    case 'exploitable': return 'critical'
    case 'sanitized': return 'low'
    case 'unreachable': return ''
    default: return ''
  }
}

export function UnifiedFindingDrawer({
  open, onClose, orgId, fingerprint, title, subtitle, alertId,
}: UnifiedFindingDrawerProps) {
  const findingQ = useQuery({
    queryKey: qk.security.unifiedFinding(orgId, fingerprint),
    queryFn: () => getUnifiedFinding(orgId, fingerprint!),
    enabled: open && !!orgId && !!fingerprint,
    staleTime: 30_000,
    retry: false,
  })

  // Blast force-graph — only when we have an alert id. Reuses the
  // existing BlastGraphSVG renderer (radial layout). Separate query
  // because the alert id is distinct from the fingerprint key.
  const blastQ = useQuery({
    queryKey: qk.security.alertBlastGraph(alertId),
    queryFn: () => getBlastGraph(alertId!),
    enabled: open && !!alertId,
    staleTime: 60_000,
    retry: false,
  })

  const f = findingQ.data
  const sevTone = SEVERITY_TONE[sevOf(f?.severity)].tone

  const headerTitle = f?.title || title || t('finding.unified.title')
  const headerSub = subtitle || f?.category || (fingerprint ? fingerprint.slice(0, 16) + '…' : '')

  return (
    <EvidenceDrawer
      open={open}
      onClose={onClose}
      width={560}
      title={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography sx={{ fontSize: 16, fontWeight: 700 }}>{headerTitle}</Typography>
          {f?.severity && (
            <Chip
              size="small"
              label={f.severity}
              sx={{
                fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
                bgcolor: SEVERITY_TONE[sevOf(f.severity)].soft, color: sevTone,
              }}
            />
          )}
        </Box>
      }
      subtitle={
        <Typography sx={{ fontSize: 12, fontFamily: 'monospace', color: 'text.secondary' }}>
          {headerSub}
        </Typography>
      }
    >
      {findingQ.isLoading && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} variant="rectangular" height={48} />
          ))}
        </Box>
      )}

      {findingQ.isError && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary', py: 2 }}>
          <AlertTriangle size={16} />
          <Typography sx={{ fontSize: 13 }}>
            {t('finding.unified.notFound')}
          </Typography>
        </Box>
      )}

      {f && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {f.description && (
            <Typography sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.5 }}>
              {f.description}
            </Typography>
          )}

          {/* Status strip — status, alert status, blast radius, verdict */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            <Chip size="small" label={`${t('finding.unified.status')}: ${f.status}`} sx={{ fontSize: 12 }} />
            {f.alert_status && (
              <Chip size="small" variant="outlined" label={`${t('finding.unified.alert')}: ${f.alert_status}`} sx={{ fontSize: 12 }} />
            )}
            {f.latest_verdict && (
              <Chip
                size="small"
                icon={<ShieldCheck size={12} />}
                label={f.latest_verdict}
                sx={{
                  fontSize: 12, fontWeight: 700, textTransform: 'capitalize',
                  bgcolor: SEVERITY_TONE[verdictTone(f.latest_verdict)].soft,
                  color: SEVERITY_TONE[verdictTone(f.latest_verdict)].tone,
                }}
              />
            )}
            {f.blast_radius != null && f.blast_radius > 0 && (
              <Tooltip arrow title={t('finding.unified.blastTip')}>
                <Chip
                  size="small"
                  icon={<Radius size={12} />}
                  label={`${t('finding.unified.blast')} ${f.blast_radius}`}
                  sx={{ fontSize: 12, fontWeight: 700 }}
                />
              </Tooltip>
            )}
          </Box>

          {/* Cross-repo locations */}
          <Section
            icon={<FileCode2 size={14} />}
            title={`${t('finding.unified.locations')} (${f.locations?.length ?? 0})`}
          >
            {(!f.locations || f.locations.length === 0) ? (
              <Empty text={t('finding.unified.noLocations')} />
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                {f.locations.map((loc, i) => <LocationRow key={i} loc={loc} />)}
              </Box>
            )}
          </Section>

          {/* Autofix patches */}
          {f.autofix_available && f.autofix_patches && f.autofix_patches.length > 0 && (
            <Section
              icon={<Wand2 size={14} />}
              title={`${t('finding.unified.autofix')} (${f.autofix_patches.length})`}
            >
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                {f.autofix_patches.map((p, i) => <AutofixRow key={i} patch={p} />)}
              </Box>
            </Section>
          )}

          {/* Verification verdicts */}
          {f.verifications && f.verifications.length > 0 && (
            <Section
              icon={<ShieldCheck size={14} />}
              title={`${t('finding.unified.verifications')} (${f.verifications.length})`}
            >
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                {f.verifications.map((v, i) => <VerificationRow key={i} v={v} />)}
              </Box>
            </Section>
          )}

          {/* Open PRs */}
          {f.open_prs && f.open_prs.length > 0 && (
            <Section
              icon={<GitPullRequest size={14} />}
              title={`${t('finding.unified.openPrs')} (${f.open_prs.length})`}
            >
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                {f.open_prs.map((pr, i) => <PRRow key={i} pr={pr} />)}
              </Box>
            </Section>
          )}

          {/* Blast force-graph (per-alert) */}
          {alertId && (
            <Section
              icon={<Radius size={14} />}
              title={t('finding.unified.blastGraph')}
            >
              {blastQ.isLoading && <Skeleton variant="rectangular" height={300} />}
              {blastQ.isError && (
                <Empty text={t('finding.unified.blastGraphErr')} />
              )}
              {blastQ.data && (
                <Box sx={{ borderRadius: 1, overflow: 'hidden' }}>
                  <BlastGraphSVG graph={blastQ.data} width={520} height={320} />
                  {blastQ.data.summary && (
                    <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 1 }}>
                      {blastQ.data.summary}
                    </Typography>
                  )}
                </Box>
              )}
            </Section>
          )}
        </Box>
      )}
    </EvidenceDrawer>
  )
}

// ── building blocks ──────────────────────────────────────────────

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
        <Box sx={{ color: 'text.secondary', display: 'flex' }}>{icon}</Box>
        <Typography sx={{
          fontSize: 12, fontWeight: 700, letterSpacing: '0.06em',
          color: 'text.secondary', textTransform: 'uppercase',
        }}>
          {title}
        </Typography>
      </Box>
      {children}
      <Divider sx={{ mt: 2 }} />
    </Box>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <Typography sx={{ fontSize: 12, color: 'text.secondary', fontStyle: 'italic' }}>
      {text}
    </Typography>
  )
}

function LocationRow({ loc }: { loc: FindingLocation }) {
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 1,
      px: 1.25, py: 0.75, borderRadius: 1, bgcolor: 'action.hover',
    }}>
      <GitBranch size={12} style={{ flexShrink: 0, opacity: 0.6 }} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {loc.repo_name || loc.repo_id || '—'}
        </Typography>
        {loc.file_path && (
          <Typography sx={{ fontSize: 12, fontFamily: 'monospace', color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {loc.file_path}{loc.line ? `:${loc.line}` : ''}
          </Typography>
        )}
      </Box>
    </Box>
  )
}

function AutofixRow({ patch }: { patch: AutofixPatchInfo }) {
  const ok = patch.verify_passed
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 1,
      px: 1.25, py: 0.75, borderRadius: 1, bgcolor: 'action.hover',
    }}>
      <Wand2 size={12} style={{ flexShrink: 0, opacity: 0.7 }} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 600 }}>{patch.rule_id || patch.finding_id}</Typography>
        <Box sx={{ display: 'flex', gap: 0.5, mt: 0.25, alignItems: 'center' }}>
          <Chip size="small" label={patch.patch_status} sx={{ fontSize: 12, height: 18 }} />
          <Chip
            size="small"
            label={ok ? t('finding.unified.verifyPass') : t('finding.unified.verifyPending')}
            sx={{
              fontSize: 12, height: 18,
              bgcolor: ok ? SEVERITY_TONE['low'].soft : SEVERITY_TONE[''].soft,
              color: ok ? SEVERITY_TONE['low'].tone : SEVERITY_TONE[''].tone,
            }}
          />
        </Box>
      </Box>
      {patch.pr_url && (
        <MuiLink href={patch.pr_url} target="_blank" rel="noopener" sx={{ display: 'flex', alignItems: 'center', gap: 0.25, fontSize: 12 }}>
          #{patch.pr_number || ''}<ExternalLink size={11} />
        </MuiLink>
      )}
    </Box>
  )
}

function VerificationRow({ v }: { v: VerificationInfo }) {
  const tone = SEVERITY_TONE[verdictTone(v.verdict)]
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 1,
      px: 1.25, py: 0.75, borderRadius: 1, bgcolor: 'action.hover',
    }}>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
          <Typography sx={{ fontSize: 12, fontWeight: 600 }}>{v.status}</Typography>
          {v.verdict && (
            <Chip size="small" label={v.verdict} sx={{ fontSize: 12, height: 18, bgcolor: tone.soft, color: tone.tone, textTransform: 'capitalize' }} />
          )}
        </Box>
        <Typography sx={{ fontSize: 12, color: 'text.secondary', fontFamily: 'monospace' }}>
          {v.created_at}
        </Typography>
      </Box>
      {v.evidence_url && (
        <MuiLink href={v.evidence_url} target="_blank" rel="noopener" sx={{ display: 'flex', alignItems: 'center', fontSize: 12 }}>
          <ExternalLink size={12} />
        </MuiLink>
      )}
    </Box>
  )
}

function PRRow({ pr }: { pr: PRInfo }) {
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 1,
      px: 1.25, py: 0.75, borderRadius: 1, bgcolor: 'action.hover',
    }}>
      <GitPullRequest size={12} style={{ flexShrink: 0, opacity: 0.7 }} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {pr.title}
        </Typography>
        <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
          #{pr.number} · {pr.author}{pr.is_draft ? ` · ${t('finding.unified.draft')}` : ''}
        </Typography>
      </Box>
      {pr.url && (
        <MuiLink href={pr.url} target="_blank" rel="noopener" sx={{ display: 'flex', alignItems: 'center', fontSize: 12 }}>
          <ExternalLink size={12} />
        </MuiLink>
      )}
    </Box>
  )
}
