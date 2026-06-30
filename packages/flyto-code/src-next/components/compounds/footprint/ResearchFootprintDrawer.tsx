import { useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import LinearProgress from '@mui/material/LinearProgress'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { CheckCircle2, ClipboardCheck, Download, ExternalLink, FileText, GitBranch, Link2, RefreshCw, Send, XCircle } from 'lucide-react'

import { EvidenceDrawer } from '@compounds/_shared'
import { invalidateFootprintClosure } from '@lib/footprintLoop'
import { qk } from '@lib/queryKeys'
import { downloadBuiltReport } from '@lib/engine/reports/vaReport'
import {
  attachPentestEvidenceToValidationTask,
  completeBOYValidationTask,
  createBOYMissingEvidenceTask,
  createBOYValidationTask,
  exportResearchFootprintBundle,
  getResearchFootprint,
  recompileBOYBreakthroughPaths,
  researchFootprintSelectorKey,
  type ResearchFootprintCitationIndexItem,
  type ResearchFootprintDecisionEntry,
  type ResearchFootprintSelector,
  type ResearchFootprintValidationTask,
} from '@lib/engine/code/footprintSurface'
import { buildResearchFootprintReportSections, researchFootprintReportFilename } from './researchFootprintReport'
import { t, tOr } from '@lib/i18n';
import { footprintText } from '@/styles/footprintVisual'

interface ResearchFootprintDrawerProps {
  orgId: string
  open: boolean
  selector: ResearchFootprintSelector | null
  onClose: () => void
}

type ToastState = { open: boolean; severity: 'success' | 'error' | 'info'; msg: string }

const completionOptions = [
  { value: 'validated_exploitable', label: 'Record result: exploitable', labelKey: 'footprint.research.result.validated_exploitable' },
  { value: 'validated_not_exploitable', label: 'Record result: not exploitable', labelKey: 'footprint.research.result.validated_not_exploitable' },
  { value: 'remediated', label: 'Record result: remediated', labelKey: 'footprint.research.result.remediated' },
  { value: 'accepted_risk', label: 'Record result: accepted risk', labelKey: 'footprint.research.result.accepted_risk' },
] as const

function humanize(value?: string): string {
  const text = (value || 'unknown').replace(/_/g, ' ')
  return text.replace(/\b\w/g, c => c.toUpperCase())
}

function safeText(value?: string | number | null, fallback?: string): string {
  const empty = fallback ?? t('common.notAvailable')
  if (value == null) return empty
  const text = String(value).trim()
  return text && text !== 'NaN' && text !== 'undefined' && text !== 'null' ? text : empty
}

function fmtDate(value?: string | null): string {
  if (!value) return t('common.notAvailable')
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return t('common.notAvailable')
  return date.toLocaleString()
}

function toneForState(state?: string): 'success' | 'warning' | 'error' | 'info' | 'default' {
  switch (state) {
    case 'validated':
    case 'satisfied':
    case 'validated_exploitable':
      return state === 'validated_exploitable' ? 'info' : 'success'
    case 'needs_validation':
    case 'missing':
    case 'queued_for_validation':
      return 'warning'
    case 'accepted_risk':
      return 'error'
    case 'remediated':
    case 'task_queued':
      return 'info'
    default:
      return 'default'
  }
}

function activeTask(tasks: ResearchFootprintValidationTask[]): ResearchFootprintValidationTask | undefined {
  return tasks.find(t => t.status === 'queued_for_validation' && !t.completed_at)
}

function latestDecisionEntry(entries: ResearchFootprintDecisionEntry[]): ResearchFootprintDecisionEntry | undefined {
  return [...entries].sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))[0]
}

function CitationChips({
  ids,
  citationMap,
  onSelect,
}: {
  ids: string[]
  citationMap?: Map<string, ResearchFootprintCitationIndexItem>
  onSelect?: (item: ResearchFootprintCitationIndexItem) => void
}) {
  const visible = citationMap ? ids.filter(id => citationMap.has(id)) : ids
  if (!visible.length) return null
  return (
    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
      {visible.map(id => {
        const item = citationMap?.get(id)
        return (
        <Chip
          key={id}
          size="small"
          variant="outlined"
          label={id}
          onClick={item && onSelect ? () => onSelect(item) : undefined}
          sx={{ maxWidth: 220, '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }}
        />
        )
      })}
    </Stack>
  )
}

type PentestEvidenceRef = {
  projectId: string
  scanId: string
  findingId: string
}

function metadataValue(item: ResearchFootprintCitationIndexItem | null, key: string): string {
  const value = item?.metadata_summary?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function pentestEvidenceRef(item: ResearchFootprintCitationIndexItem | null): PentestEvidenceRef | null {
  if (!item) return null
  if (item.kind !== 'pentest_finding' && item.source_type !== 'pentest') return null
  const projectId = metadataValue(item, 'project_id')
  const scanId = metadataValue(item, 'scan_id')
  const findingId = metadataValue(item, 'finding_id')
  return projectId && scanId && findingId ? { projectId, scanId, findingId } : null
}

function openPentestEvidence(orgId: string, ref: PentestEvidenceRef) {
  const params = new URLSearchParams({ mode: 'engineer', project: ref.projectId, scan: ref.scanId })
  window.location.assign(`/projects/${encodeURIComponent(orgId)}/pentest?${params.toString()}`)
}

function Metric({ label, value, tone = 'default' }: { label: string; value: string | number; tone?: 'default' | 'success' | 'warning' | 'error' | 'info' }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.25, minWidth: 0 }}>
      <Typography sx={{ ...footprintText.metricValue, fontSize: 20, fontWeight: 800, lineHeight: 1.1 }}>
        {safeText(value, '0')}
      </Typography>
      <Typography sx={{ ...footprintText.smallStrong, color: tone === 'default' ? 'text.secondary' : `${tone}.main`, fontWeight: 700 }}>
        {label}
      </Typography>
    </Paper>
  )
}

export function ResearchFootprintDrawer({ orgId, open, selector, onClose }: ResearchFootprintDrawerProps) {
  const qc = useQueryClient()
  const selectorKey = researchFootprintSelectorKey(selector)
  const [toast, setToast] = useState<ToastState>({ open: false, severity: 'info', msg: '' })
  const [completion, setCompletion] = useState<ResearchFootprintValidationTask | null>(null)
  const [selectedCitation, setSelectedCitation] = useState<ResearchFootprintCitationIndexItem | null>(null)
  const [completeStatus, setCompleteStatus] = useState<(typeof completionOptions)[number]['value']>('validated_exploitable')
  const [completeResult, setCompleteResult] = useState('')
  const [completeNotes, setCompleteNotes] = useState('')

  const q = useQuery({
    queryKey: qk.footprint.researchFootprint(orgId, selectorKey),
    queryFn: () => getResearchFootprint(orgId, selector as ResearchFootprintSelector),
    enabled: open && !!orgId && !!selector,
    staleTime: 30_000,
  })

  const data = q.data
  const active = useMemo(() => activeTask(data?.validation_tasks ?? []), [data?.validation_tasks])
  const firstMissingGap = useMemo(() => (data?.missing_evidence ?? []).find(g => g.status === 'missing'), [data?.missing_evidence])
  const latestDecision = useMemo(() => latestDecisionEntry(data?.decision_log ?? []), [data?.decision_log])
  const citationMap = useMemo(() => new Map((data?.citation_index ?? []).map(item => [item.id, item])), [data?.citation_index])
  const hypothesisID = data?.candidate?.id || data?.path?.hypothesis_id || data?.subject.hypothesis_id || ''
  const selectedPentestRef = useMemo(() => pentestEvidenceRef(selectedCitation), [selectedCitation])
  const activeVerifierLabel = active?.verifier || data?.summary.recommended_verifier
    ? humanize(active?.verifier || data?.summary.recommended_verifier)
    : t('footprint.research.value.notAssigned')

  const recompileMut = useMutation({
    mutationFn: () => recompileBOYBreakthroughPaths(orgId),
    onSuccess: async () => {
      invalidateFootprintClosure(qc, orgId)
      await q.refetch()
      setToast({ open: true, severity: 'success', msg: t('footprint.research.toast.recompiled') })
    },
    onError: (err) => setToast({ open: true, severity: 'error', msg: (err as Error).message }),
  })

  const validationMut = useMutation({
    mutationFn: () => createBOYValidationTask(orgId, {
      hypothesis_id: hypothesisID,
      verifier: data?.summary.recommended_verifier,
      notes: t('footprint.research.validationQueuedNote'),
    }),
    onSuccess: async () => {
      invalidateFootprintClosure(qc, orgId)
      await q.refetch()
      setToast({ open: true, severity: 'success', msg: t('footprint.research.toast.validationQueued') })
    },
    onError: (err) => setToast({ open: true, severity: 'error', msg: (err as Error).message }),
  })

  const gapMut = useMutation({
    mutationFn: () => {
      if (!firstMissingGap) throw new Error(t('footprint.research.error.noMissingEvidenceGapSelected'))
      return createBOYMissingEvidenceTask(orgId, firstMissingGap.id)
    },
    onSuccess: async () => {
      invalidateFootprintClosure(qc, orgId)
      await q.refetch()
      setToast({ open: true, severity: 'success', msg: t('footprint.research.toast.missingEvidenceQueued') })
    },
    onError: (err) => setToast({ open: true, severity: 'error', msg: (err as Error).message }),
  })

  const completeMut = useMutation({
    mutationFn: () => {
      if (!completion) throw new Error(t('footprint.research.error.noValidationTaskSelected'))
      return completeBOYValidationTask(orgId, completion.id, {
        status: completeStatus,
        result: completeResult || completeStatus,
        notes: completeNotes,
      })
    },
    onSuccess: async () => {
      setCompletion(null)
      setCompleteResult('')
      setCompleteNotes('')
      invalidateFootprintClosure(qc, orgId)
      await q.refetch()
      setToast({ open: true, severity: 'success', msg: t('footprint.research.toast.validationSaved') })
    },
    onError: (err) => setToast({ open: true, severity: 'error', msg: (err as Error).message }),
  })

  const attachPentestMut = useMutation({
    mutationFn: () => {
      if (!active) throw new Error(t('footprint.research.error.noActiveValidationTask'))
      if (!selectedPentestRef) throw new Error(t('footprint.research.error.selectedCitationNotPentest'))
      return attachPentestEvidenceToValidationTask(orgId, active.id, {
        project_id: selectedPentestRef.projectId,
        scan_id: selectedPentestRef.scanId,
        finding_ids: [selectedPentestRef.findingId],
      })
    },
    onSuccess: async () => {
      setSelectedCitation(null)
      invalidateFootprintClosure(qc, orgId)
      await q.refetch()
      setToast({ open: true, severity: 'success', msg: t('footprint.research.toast.pentestAttached') })
    },
    onError: (err) => setToast({ open: true, severity: 'error', msg: (err as Error).message }),
  })

  const reportMut = useMutation({
    // @closure download-only
    mutationFn: () => {
      if (!data) throw new Error(t('footprint.research.error.notLoaded'))
      return downloadBuiltReport(
        orgId,
        {
          sections: buildResearchFootprintReportSections(data),
          settings: {
            report_name: t('footprint.research.reportName', { subject: data.subject.value }),
            description: data.summary.description,
            classification: 'CONFIDENTIAL',
            include_cover: true,
            include_toc: true,
          },
        },
        researchFootprintReportFilename(data),
      )
    },
    onSuccess: () => setToast({ open: true, severity: 'success', msg: t('footprint.research.toast.reportStarted') }),
    onError: (err) => setToast({ open: true, severity: 'error', msg: (err as Error).message }),
  })

  const bundleMut = useMutation({
    // @closure download-only
    mutationFn: () => {
      if (!selector) throw new Error(t('footprint.research.error.selectorUnavailable'))
      return exportResearchFootprintBundle(orgId, selector)
    },
    onSuccess: (result) => {
      const suffix = result.bundleHash ? ` · SHA-256 ${result.bundleHash.slice(0, 12)}` : ''
      setToast({ open: true, severity: 'success', msg: t('footprint.research.toast.bundleExported', { filename: `${result.filename}${suffix}` }) })
    },
    onError: (err) => setToast({ open: true, severity: 'error', msg: (err as Error).message }),
  })

  const title = data?.subject.value || t('footprint.research.title')
  const subtitle = data
    ? `${humanize(data.subject.selector_type)} · ${humanize(data.subject.state)} · ${t('footprint.research.citedEvidenceTrail')}`
    : t('footprint.research.citedEvidenceTrailTitle')
  const isEmpty = data && !data.path && !data.candidate && data.observations.length === 0

  return (
    <>
      <EvidenceDrawer open={open} onClose={onClose} title={title} subtitle={subtitle} width={1040}>
        <Stack spacing={2}>
          {q.isLoading && (
            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <CircularProgress size={18} />
                <Typography sx={{ ...footprintText.panelSubtitle }}>
                  {t('footprint.research.loading')}
                </Typography>
              </Stack>
              <LinearProgress sx={{ mt: 1.5 }} />
            </Paper>
          )}

          {q.error && (
            <Alert
              severity="error"
              action={<Button size="small" color="inherit" onClick={() => q.refetch()}>{t('common.retry')}</Button>}
            >
              {t('footprint.research.unavailable')}: {(q.error as Error).message}
            </Alert>
          )}

          {isEmpty && (
            <Alert severity="info">
              {t('footprint.research.empty')}
            </Alert>
          )}

          {data && (
            <>
              <Paper variant="outlined" sx={{ p: 1.5 }}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between">
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="overline" sx={{ ...footprintText.sectionOverline }}>
                      {t('footprint.research.summaryHeading')}
                    </Typography>
                    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mb: 0.75 }}>
                      <Chip size="small" color={toneForState(data.summary.state)} label={humanize(data.summary.state)} />
                      {data.summary.kind && <Chip size="small" variant="outlined" label={humanize(data.summary.kind)} />}
                      {data.summary.recommended_verifier && (
                        <Chip size="small" variant="outlined" color="info" label={humanize(data.summary.recommended_verifier)} />
                      )}
                    </Stack>
                    <Typography sx={{ ...footprintText.panelTitle, fontSize: 17, overflowWrap: 'anywhere' }}>
                      {safeText(data.summary.title, t('footprint.research.summaryFallback'))}
                    </Typography>
                    <Typography sx={{ ...footprintText.panelSubtitle, mt: 0.5, overflowWrap: 'anywhere' }}>
                      {safeText(data.summary.description)}
                    </Typography>
                    <Typography sx={{ ...footprintText.smallMuted, mt: 0.75 }}>
                      {safeText(data.summary.positioning)}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ alignContent: 'flex-start' }}>
                    <Button size="small" variant="outlined" startIcon={<RefreshCw size={14} />} onClick={() => q.refetch()}>
                      {t('footprint.research.refresh')}
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={recompileMut.isPending ? <CircularProgress size={14} /> : <GitBranch size={14} />}
                      disabled={recompileMut.isPending}
                      onClick={() => recompileMut.mutate()}
                    >
                      {t('footprint.research.recompile')}
                    </Button>
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={bundleMut.isPending ? <CircularProgress size={14} /> : <Download size={14} />}
                      disabled={bundleMut.isPending}
                      onClick={() => bundleMut.mutate()}
                    >
                      {t('footprint.research.exportBundle')}
                    </Button>
                    <Button
                      size="small"
                      variant="contained"
                      color="secondary"
                      startIcon={reportMut.isPending ? <CircularProgress size={14} /> : <FileText size={14} />}
                      disabled={reportMut.isPending}
                      onClick={() => reportMut.mutate()}
                    >
                      {t('footprint.research.exportReport')}
                    </Button>
                  </Stack>
                </Stack>
              </Paper>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(6, minmax(0, 1fr))' }, gap: 1 }}>
                <Metric label={t('footprint.research.metric.priority')} value={data.summary.priority_score} tone={data.summary.priority_score >= 70 ? 'warning' : 'default'} />
                <Metric label={t('footprint.research.metric.confidence')} value={data.summary.confidence_score ?? data.summary.source_count} />
                <Metric label={t('footprint.research.metric.impact')} value={data.summary.impact_score || data.summary.missing_evidence_count} />
                <Metric label={t('footprint.research.metric.sources')} value={data.summary.source_count} />
                <Metric label={t('footprint.research.metric.evidence')} value={data.summary.observation_count} />
                <Metric label={t('footprint.research.metric.tasks')} value={data.summary.validation_task_count} tone={active ? 'warning' : 'default'} />
              </Box>

              <Section title={t('footprint.research.section.validationOperations')}>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1.25 }}>
                  <StatusCell label={t('footprint.research.field.decisionState')} value={humanize(data.decision_states.current_state || data.summary.state)} tone={toneForState(data.decision_states.current_state || data.summary.state)} />
                  <StatusCell label={t('footprint.research.field.activeVerifier')} value={activeVerifierLabel} tone={active ? 'warning' : 'default'} />
                  <StatusCell label={t('footprint.research.field.nextEvidenceGap')} value={firstMissingGap?.title || t('footprint.research.value.noOpenMissingEvidenceGap')} tone={firstMissingGap ? 'warning' : 'success'} />
                  <StatusCell label={t('footprint.research.field.latestDecision')} value={latestDecision ? `${humanize(latestDecision.state)} · ${fmtDate(latestDecision.timestamp)}` : t('footprint.research.value.noDecisionLogged')} tone={toneForState(latestDecision?.state || data.summary.state)} />
                </Box>
              </Section>

              {data.verification_summary && (
                <Section title={t('footprint.research.section.pentestValidation')}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))', lg: 'repeat(6, minmax(0, 1fr))' }, gap: 1.25 }}>
                    <StatusCell label={t('footprint.research.field.verificationLevel')} value={humanize(data.verification_summary.level)} tone={toneForState(data.verification_summary.level)} />
                    <StatusCell label={t('footprint.research.field.pentestObservations')} value={String(data.verification_summary.pentest_observation_count)} />
                    <StatusCell label={t('footprint.research.field.pentestFindings')} value={String(data.verification_summary.pentest_finding_count)} tone={data.verification_summary.pentest_finding_count > 0 ? 'success' : 'default'} />
                    <StatusCell label={t('footprint.research.field.redTeamObservations')} value={String(data.verification_summary.redteam_observation_count ?? 0)} />
                    <StatusCell label={t('footprint.research.field.redTeamCampaigns')} value={String(data.verification_summary.redteam_campaign_count ?? 0)} />
                    <StatusCell label={t('footprint.research.field.lastEmpiricalValidation')} value={fmtDate(data.verification_summary.last_empirical_validation_at)} />
                  </Box>
                  {data.verification_summary.linked_validation_task_ids.length > 0 && (
                    <Box sx={{ mt: 1 }}>
                      <Typography sx={{ ...footprintText.smallMuted, mb: 0.5 }}>{t('footprint.research.linkedValidationTasks')}</Typography>
                      <CitationChips ids={data.verification_summary.linked_validation_task_ids} citationMap={citationMap} onSelect={setSelectedCitation} />
                    </Box>
                  )}
                </Section>
              )}

              <Section title={t('footprint.research.section.auditIntegrity')}>
                <Stack spacing={1}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1.25 }}>
                    <StatusCell label={t('footprint.research.field.bundleSha256')} value={data.audit_integrity.bundle_sha256 || t('footprint.research.value.pending')} />
                    <StatusCell label={t('footprint.research.field.citations')} value={String(data.audit_integrity.citation_count)} />
                    <StatusCell label={t('footprint.research.field.resolved')} value={String(data.audit_integrity.resolved_citation_count ?? 0)} />
                    <StatusCell label={t('footprint.research.field.unresolved')} value={String(data.audit_integrity.unresolved_citation_count ?? 0)} tone={(data.audit_integrity.unresolved_citation_count ?? 0) > 0 ? 'error' : 'success'} />
                    <StatusCell label={t('footprint.research.field.uncitedClaims')} value={String(data.audit_integrity.uncited_claim_count)} tone={data.audit_integrity.uncited_claim_count > 0 ? 'error' : 'success'} />
                    <StatusCell label={t('footprint.research.field.redactionApplied')} value={data.audit_integrity.redaction_applied ? t('common.yes') : t('common.no')} tone={data.audit_integrity.redaction_applied ? 'success' : 'error'} />
                  </Box>
                  <Typography sx={{ ...footprintText.smallMuted, overflowWrap: 'anywhere' }}>
                    {t('footprint.research.hashRecipe')}: {safeText(data.audit_integrity.hash_recipe)}
                  </Typography>
                  {data.audit_integrity.integrity_warnings.length > 0 ? (
                    <Alert severity="warning">
                      {data.audit_integrity.integrity_warnings.join('; ')}
                    </Alert>
                  ) : (
                    <Typography sx={{ ...footprintText.smallMuted }}>
                      {t('footprint.research.noAuditWarnings')}
                    </Typography>
                  )}
                </Stack>
              </Section>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.15fr 1fr 1fr' }, gap: 1.5, alignItems: 'start' }}>
                <Stack spacing={1.5}>
                  <Section title={t('footprint.research.section.narrative')}>
                    <Stack spacing={1}>
                      {data.narrative.claims.filter(c => c.citations.length > 0).length > 0 ? (
                        data.narrative.claims.filter(c => c.citations.length > 0).map(claim => (
                          <Paper key={claim.id} variant="outlined" sx={{ p: 1 }}>
                            <Typography sx={{ ...footprintText.panelButton, fontWeight: 700 }}>{humanize(claim.kind)}</Typography>
                            <Typography sx={{ ...footprintText.panelSubtitle, mt: 0.25 }}>{claim.text}</Typography>
                            <Box sx={{ mt: 0.75 }}><CitationChips ids={claim.citations} citationMap={citationMap} onSelect={setSelectedCitation} /></Box>
                          </Paper>
                        ))
                      ) : (
                        <Typography sx={{ ...footprintText.panelSubtitle }}>{t('footprint.research.noNarrativeClaims')}</Typography>
                      )}
                    </Stack>
                  </Section>

                  <Section title={t('footprint.research.section.evidenceTimeline')}>
                    <Stack spacing={1}>
                      {data.evidence_timeline.length > 0 ? data.evidence_timeline.map(item => (
                        <Paper key={item.id} variant="outlined" sx={{ p: 1 }}>
                          <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="baseline">
                            <Typography sx={{ ...footprintText.panelButton, fontWeight: 800 }}>{safeText(item.title)}</Typography>
                            <Typography sx={{ ...footprintText.smallMuted, whiteSpace: 'nowrap' }}>{fmtDate(item.timestamp)}</Typography>
                          </Stack>
                          <Typography sx={{ ...footprintText.smallMuted, mt: 0.25, overflowWrap: 'anywhere' }}>{safeText(item.detail)}</Typography>
                          <Box sx={{ mt: 0.75 }}><CitationChips ids={item.citations} citationMap={citationMap} onSelect={setSelectedCitation} /></Box>
                        </Paper>
                      )) : (
                        <Typography sx={{ ...footprintText.panelSubtitle }}>{t('footprint.research.noTimelineEvents')}</Typography>
                      )}
                    </Stack>
                  </Section>
                </Stack>

                <Stack spacing={1.5}>
                  <Section title={t('footprint.research.section.evidenceQuality')}>
                    <Stack spacing={1}>
                      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                        <Metric label={t('footprint.research.field.weightedConfidence')} value={data.evidence_quality.weighted_confidence} tone={data.evidence_quality.weighted_confidence >= 85 ? 'success' : 'default'} />
                        <Metric label={t('footprint.research.field.reliability')} value={humanize(data.evidence_quality.reliability_band)} tone={data.evidence_quality.reliability_band === 'contested' ? 'warning' : 'default'} />
                        <Metric label={t('footprint.research.field.corroboration')} value={data.evidence_quality.corroboration_count} />
                        <Metric label={t('footprint.research.field.conflicts')} value={data.evidence_quality.conflict_count} tone={data.evidence_quality.conflict_count > 0 ? 'warning' : 'default'} />
                        <Metric label={t('footprint.research.field.staleSources')} value={data.evidence_quality.stale_source_count} tone={data.evidence_quality.stale_source_count > 0 ? 'warning' : 'default'} />
                        <Metric label={t('footprint.research.field.topSources')} value={data.evidence_quality.top_source_ids.length} />
                      </Box>
                      {data.evidence_quality.top_source_ids.length > 0 && (
                        <Box>
                          <Typography sx={{ ...footprintText.smallMuted, mb: 0.5 }}>{t('footprint.research.topSourceIds')}</Typography>
                          <CitationChips ids={data.evidence_quality.top_source_ids} citationMap={citationMap} onSelect={setSelectedCitation} />
                        </Box>
                      )}
                      {(data.evidence_quality.support_relation_ids.length > 0 || data.evidence_quality.conflict_relation_ids.length > 0) && (
                        <Box>
                          <Typography sx={{ ...footprintText.smallMuted, mb: 0.5 }}>{t('footprint.research.relationCitations')}</Typography>
                          <CitationChips ids={[...data.evidence_quality.support_relation_ids, ...data.evidence_quality.conflict_relation_ids]} citationMap={citationMap} onSelect={setSelectedCitation} />
                        </Box>
                      )}
                    </Stack>
                  </Section>

                  <Section title={t('footprint.research.section.sourceLedger')}>
                    <Stack spacing={1}>
                      {data.source_ledger.length > 0 ? data.source_ledger.map(source => (
                        <Paper key={source.id} variant="outlined" sx={{ p: 1 }}>
                          <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center">
                            <Box sx={{ minWidth: 0 }}>
                              <Typography sx={{ ...footprintText.panelButton, fontWeight: 800, overflowWrap: 'anywhere' }}>
                                {humanize(source.source_type)} / {safeText(source.source_name, t('common.unknown'))}
                              </Typography>
                              <Typography sx={{ ...footprintText.smallMuted }}>
                                {t('footprint.research.sourceSummary', { count: source.observation_count, reliability: source.source_reliability })}
                              </Typography>
                            </Box>
                            <Chip size="small" color={toneForState(source.max_severity)} variant="outlined" label={humanize(source.max_severity)} />
                          </Stack>
                          <Box sx={{ mt: 0.75 }}><CitationChips ids={source.observation_ids} citationMap={citationMap} onSelect={setSelectedCitation} /></Box>
                        </Paper>
                      )) : (
                        <Typography sx={{ ...footprintText.panelSubtitle }}>{t('footprint.research.noSources')}</Typography>
                      )}
                    </Stack>
                  </Section>

                  <Section title={t('footprint.research.section.relations')}>
                    <Stack spacing={1}>
                      {data.relations.length > 0 ? data.relations.map(rel => (
                        <Paper key={rel.id} variant="outlined" sx={{ p: 1 }}>
                          <Typography sx={{ ...footprintText.panelButton, fontWeight: 800 }}>
                            {t('footprint.research.relationConfidence', { relation: humanize(rel.relation_kind), confidence: rel.confidence })}
                          </Typography>
                          <Typography sx={{ ...footprintText.smallMuted, overflowWrap: 'anywhere' }}>
                            {rel.from_observation_id} -&gt; {rel.to_observation_id}
                          </Typography>
                          <Box sx={{ mt: 0.75 }}><CitationChips ids={[rel.id]} citationMap={citationMap} onSelect={setSelectedCitation} /></Box>
                        </Paper>
                      )) : (
                        <Typography sx={{ ...footprintText.panelSubtitle }}>{t('footprint.research.noRelations')}</Typography>
                      )}
                    </Stack>
                  </Section>
                </Stack>

                <Stack spacing={1.5}>
                  <Section title={t('footprint.research.section.pathGraph')}>
                    <Stack spacing={1}>
                      {data.route_nodes.length > 0 ? data.route_nodes.map((node, idx) => (
                        <Paper key={node.id} variant="outlined" sx={{ p: 1 }}>
                          <Typography sx={{ ...footprintText.panelButton, fontWeight: 800, overflowWrap: 'anywhere' }}>
                            {idx + 1}. {safeText(node.value || node.label)}
                          </Typography>
                          <Typography sx={{ ...footprintText.smallMuted }}>
                            {humanize(node.node_type)}
                          </Typography>
                          <Box sx={{ mt: 0.75 }}><CitationChips ids={node.citations} citationMap={citationMap} onSelect={setSelectedCitation} /></Box>
                        </Paper>
                      )) : (
                        <Typography sx={{ ...footprintText.panelSubtitle }}>{t('footprint.research.noRouteNodes')}</Typography>
                      )}
                    </Stack>
                    {data.route_edges.length > 0 && <Divider sx={{ my: 1 }} />}
                    <Stack spacing={0.75}>
                      {data.route_edges.map(edge => (
                        <Box key={edge.id}>
                          <Typography sx={{ ...footprintText.smallMuted, overflowWrap: 'anywhere' }}>
                            {t('footprint.research.routeEdgeSummary', { relation: humanize(edge.relation_kind), from: edge.from_node_id, to: edge.to_node_id })}
                          </Typography>
                          <Box sx={{ mt: 0.5 }}><CitationChips ids={edge.citations} citationMap={citationMap} onSelect={setSelectedCitation} /></Box>
                        </Box>
                      ))}
                    </Stack>
                  </Section>

                  <Section title={t('footprint.research.section.missingEvidence')}>
                    <Stack spacing={1}>
                      {data.missing_evidence.length > 0 ? data.missing_evidence.map(gap => (
                        <Paper key={gap.id} variant="outlined" sx={{ p: 1 }}>
                          <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center">
                            <Typography sx={{ ...footprintText.panelButton, fontWeight: 800, overflowWrap: 'anywhere' }}>{gap.title}</Typography>
                            <Chip size="small" color={toneForState(gap.status)} label={humanize(gap.status)} />
                          </Stack>
                          <Typography sx={{ ...footprintText.smallMuted, mt: 0.25 }}>{safeText(gap.recommended_action)}</Typography>
                          <Box sx={{ mt: 0.75 }}><CitationChips ids={[gap.id]} citationMap={citationMap} onSelect={setSelectedCitation} /></Box>
                        </Paper>
                      )) : (
                        <Typography sx={{ ...footprintText.panelSubtitle }}>{t('footprint.research.noMissingEvidence')}</Typography>
                      )}
                      {firstMissingGap && (
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={gapMut.isPending ? <CircularProgress size={14} /> : <Send size={14} />}
                          disabled={gapMut.isPending}
                          onClick={() => gapMut.mutate()}
                        >
                          {t('footprint.research.queueMissingEvidenceTask')}
                        </Button>
                      )}
                    </Stack>
                  </Section>

                  <Section title={t('footprint.research.section.validationTasks')}>
                    <Stack spacing={1}>
                      {data.validation_tasks.length > 0 ? data.validation_tasks.map(task => (
                        <Paper key={task.id} variant="outlined" sx={{ p: 1 }}>
                          <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center">
                            <Typography sx={{ ...footprintText.panelButton, fontWeight: 800 }}>{humanize(task.status)}</Typography>
                            <Chip size="small" color={toneForState(task.status)} label={humanize(task.verifier)} />
                          </Stack>
                          <Typography sx={{ ...footprintText.smallMuted, mt: 0.25 }}>
                            {safeText(task.result || task.notes || task.id)}
                          </Typography>
                          <Box sx={{ mt: 0.75 }}><CitationChips ids={[task.id, ...task.evidence_ids]} citationMap={citationMap} onSelect={setSelectedCitation} /></Box>
                        </Paper>
                      )) : (
                        <Typography sx={{ ...footprintText.panelSubtitle }}>{t('footprint.research.noValidationTasks')}</Typography>
                      )}
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        {hypothesisID && !active && data.summary.state === 'needs_validation' && (
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={validationMut.isPending ? <CircularProgress size={14} /> : <Send size={14} />}
                            disabled={validationMut.isPending}
                            onClick={() => validationMut.mutate()}
                          >
                            {t('footprint.research.queueValidation')}
                          </Button>
                        )}
                        {active && (
                          <Button size="small" variant="contained" color="warning" startIcon={<ClipboardCheck size={14} />} onClick={() => setCompletion(active)}>
                            {t('footprint.research.completeValidation')}
                          </Button>
                        )}
                      </Stack>
                    </Stack>
                  </Section>

                  <Section title={t('footprint.research.section.decisionLog')}>
                    <Stack spacing={1}>
                      {data.decision_log.length > 0 ? data.decision_log.map(entry => (
                        <Paper key={entry.id} variant="outlined" sx={{ p: 1 }}>
                          <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center">
                            <Box sx={{ minWidth: 0 }}>
                              <Typography sx={{ ...footprintText.panelButton, fontWeight: 800, overflowWrap: 'anywhere' }}>
                                {safeText(entry.title)}
                              </Typography>
                              <Typography sx={{ ...footprintText.smallMuted }}>
                                {humanize(entry.kind)} · {fmtDate(entry.timestamp)}
                              </Typography>
                            </Box>
                            <Chip size="small" color={toneForState(entry.state)} label={humanize(entry.state)} />
                          </Stack>
                          <Typography sx={{ ...footprintText.smallMuted, mt: 0.25, overflowWrap: 'anywhere' }}>
                            {safeText(entry.detail || entry.result || entry.notes)}
                          </Typography>
                          {entry.actor && (
                            <Typography sx={{ ...footprintText.smallMuted, mt: 0.25, overflowWrap: 'anywhere' }}>
                              {t('footprint.research.actor')}: {entry.actor}
                            </Typography>
                          )}
                          <Box sx={{ mt: 0.75 }}><CitationChips ids={entry.citations} citationMap={citationMap} onSelect={setSelectedCitation} /></Box>
                        </Paper>
                      )) : (
                        <Typography sx={{ ...footprintText.panelSubtitle }}>{t('footprint.research.noDecisionEntries')}</Typography>
                      )}
                    </Stack>
                  </Section>
                </Stack>
              </Box>
            </>
          )}
        </Stack>
      </EvidenceDrawer>

      <Dialog open={!!completion} onClose={() => setCompletion(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('footprint.research.completeValidation')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField select size="small" label={t('footprint.research.validationResult')} value={completeStatus} onChange={(e) => setCompleteStatus(e.target.value as typeof completeStatus)} fullWidth>
              {completionOptions.map(opt => <MenuItem key={opt.value} value={opt.value}>{tOr(opt.labelKey, opt.label)}</MenuItem>)}
            </TextField>
            <TextField size="small" label={t('footprint.research.evidenceSummary')} value={completeResult} onChange={(e) => setCompleteResult(e.target.value)} fullWidth />
            <TextField size="small" label={t('common.notes')} value={completeNotes} onChange={(e) => setCompleteNotes(e.target.value)} minRows={3} multiline fullWidth />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCompletion(null)} startIcon={<XCircle size={16} />}>{t('common.cancel')}</Button>
          <Button
            variant="contained"
            startIcon={completeMut.isPending ? <CircularProgress size={14} /> : <CheckCircle2 size={16} />}
            disabled={completeMut.isPending}
            onClick={() => completeMut.mutate()}
          >
            {t('footprint.research.saveResult')}
          </Button>
        </DialogActions>
      </Dialog>

      <CitationInspectorDialog
        orgId={orgId}
        item={selectedCitation}
        activeTask={active}
        pentestRef={selectedPentestRef}
        attaching={attachPentestMut.isPending}
        onClose={() => setSelectedCitation(null)}
        onAttach={() => attachPentestMut.mutate()}
      />

      <Snackbar
        open={toast.open}
        autoHideDuration={5000}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity={toast.severity} variant="filled" onClose={() => setToast((t) => ({ ...t, open: false }))}>
          {toast.msg}
        </Alert>
      </Snackbar>
    </>
  )
}

function CitationInspectorDialog({
  orgId,
  item,
  activeTask,
  pentestRef,
  attaching,
  onClose,
  onAttach,
}: {
  orgId: string
  item: ResearchFootprintCitationIndexItem | null
  activeTask?: ResearchFootprintValidationTask
  pentestRef: PentestEvidenceRef | null
  attaching: boolean
  onClose: () => void
  onAttach: () => void
}) {
  const metadataRows = Object.entries(item?.metadata_summary ?? {})
    .filter(([, value]) => value != null && String(value).trim() !== '')
    .slice(0, 12)
  return (
    <Dialog open={!!item} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{t('footprint.research.citationInspector')}</DialogTitle>
      <DialogContent>
        {item && (
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Box>
              <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mb: 0.75 }}>
                <Chip size="small" label={humanize(item.kind)} />
                {item.source_type && <Chip size="small" variant="outlined" label={humanize(item.source_type)} />}
                {item.severity && <Chip size="small" variant="outlined" color={toneForState(item.severity)} label={humanize(item.severity)} />}
                {item.validation_status && <Chip size="small" variant="outlined" color={toneForState(item.validation_status)} label={humanize(item.validation_status)} />}
              </Stack>
              <Typography sx={{ ...footprintText.panelTitle, fontSize: 16, overflowWrap: 'anywhere' }}>
                {safeText(item.title, item.id)}
              </Typography>
              <Typography sx={{ ...footprintText.panelSubtitle, mt: 0.5, overflowWrap: 'anywhere' }}>
                {safeText(item.description)}
              </Typography>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1.25 }}>
              <StatusCell label={t('footprint.research.field.citationId')} value={item.id} />
              <StatusCell label={t('footprint.research.field.rawRef')} value={item.raw_ref || t('common.notAvailable')} />
              <StatusCell label={t('footprint.research.field.confidence')} value={item.confidence == null ? t('common.notAvailable') : String(item.confidence)} />
              <StatusCell label={t('footprint.research.field.reliability')} value={item.source_reliability == null ? t('common.notAvailable') : String(item.source_reliability)} />
              <StatusCell label={t('footprint.research.field.businessImpact')} value={item.business_impact == null ? t('common.notAvailable') : String(item.business_impact)} />
              <StatusCell label={t('footprint.research.field.subject')} value={item.subject_type && item.subject_value ? `${item.subject_type}:${item.subject_value}` : t('common.notAvailable')} />
              <StatusCell label={t('footprint.research.field.observed')} value={fmtDate(item.observed_at)} />
              <StatusCell label={t('footprint.research.field.source')} value={item.source_name || item.source_type || t('common.notAvailable')} />
            </Box>

            {item.related_ids.length > 0 && (
              <Box>
                <Typography sx={{ ...footprintText.smallMuted, mb: 0.5 }}>{t('footprint.research.relatedCitations')}</Typography>
                <CitationChips ids={item.related_ids} />
              </Box>
            )}

            {metadataRows.length > 0 && (
              <Box>
                <Typography sx={{ ...footprintText.smallMuted, mb: 0.5 }}>{t('footprint.research.redactedMetadata')}</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1 }}>
                  {metadataRows.map(([key, value]) => (
                    <StatusCell key={key} label={humanize(key)} value={safeText(String(value))} />
                  ))}
                </Box>
              </Box>
            )}

            {pentestRef && (
              <Alert severity="info">
                {t('footprint.research.attachPentestHint')}
              </Alert>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} startIcon={<XCircle size={16} />}>{t('common.close')}</Button>
        {pentestRef && (
          <Button variant="outlined" startIcon={<ExternalLink size={16} />} onClick={() => openPentestEvidence(orgId, pentestRef)}>
            {t('footprint.research.openInPentest')}
          </Button>
        )}
        {pentestRef && activeTask && (
          <Button
            variant="contained"
            startIcon={attaching ? <CircularProgress size={14} /> : <Link2 size={16} />}
            disabled={attaching}
            onClick={onAttach}
          >
            {t('footprint.research.attachPentestEvidence')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.25 }}>
      <Typography variant="overline" sx={{ ...footprintText.sectionOverline }}>
        {title}
      </Typography>
      <Box sx={{ mt: 0.75 }}>{children}</Box>
    </Paper>
  )
}

function StatusCell({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'success' | 'warning' | 'error' | 'info'
}) {
  const color = tone === 'default' ? 'text.secondary' : `${tone}.main`
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ ...footprintText.sectionOverline }}>
        {label}
      </Typography>
      <Typography sx={{ ...footprintText.panelButton, fontWeight: 750, color, overflowWrap: 'anywhere' }}>
        {safeText(value)}
      </Typography>
    </Box>
  )
}
