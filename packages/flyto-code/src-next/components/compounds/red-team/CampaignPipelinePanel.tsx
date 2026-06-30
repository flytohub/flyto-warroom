/**
 * CampaignPipelinePanel — 5-phase timeline view.
 *
 * Renders one card per phase (Baseline → Probe → Verify → Recheck →
 * Report) with status, summary, evidence count, tokens. When the
 * Report phase completes, the markdown executive summary renders
 * inline so operators see the headline finding without leaving the
 * page.
 */
import { useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Paper from '@mui/material/Paper'
import Chip from '@mui/material/Chip'
import Button from '@mui/material/Button'
import {
  Activity, AlertTriangle, CheckCircle2, Circle, Eye, FileText, Loader2,
  RefreshCw, ShieldAlert, ShieldCheck,
} from 'lucide-react'
import type { Phase } from '@lib/cloud/phases'
import type { PhaseState, CampaignStatus } from '@hooks/useCampaignPipeline'
import { openPipelineReportInNewTab, regenerateCampaignReport, type CampaignReportResponse } from '@lib/engine/pipelineLog'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import IconButton from '@mui/material/IconButton'
import { Sparkles, Download, X } from 'lucide-react'
import { t } from '@lib/i18n';

interface Props {
  status: CampaignStatus
  phases: PhaseState[]
  currentPhase: Phase | null
  report: { riskLevel?: string; executiveSummary?: string; priorities?: Array<{ class: string; endpoint: string; rationale: string; businessImpact: string; fixBucket: string }> ; totals?: Record<string, number> } | null
  totalTokens: { input: number; output: number }
  runId?: string | null
  /** Campaign / pentest-project id — needed for the "Regenerate AI
   *  summary" button which posts to /campaigns/{id}/report. Optional
   *  because the panel can render in read-only mode without it. */
  campaignId?: string | null
  onRetest?: () => Promise<unknown>
}

const phaseLabel = (p: Phase): string => {
  switch (p) {
    case 'baseline': return t('warroom.pipelinePhaseBaseline')
    case 'probe':    return t('warroom.pipelinePhaseProbe')
    case 'verify':   return t('warroom.pipelinePhaseVerify')
    case 'recheck':  return t('warroom.pipelinePhaseRecheck')
    case 'report':   return t('warroom.pipelinePhaseReport')
  }
}

const phaseDesc = (p: Phase): string => {
  switch (p) {
    case 'baseline': return t('warroom.pipelineDescBaseline')
    case 'probe':    return t('warroom.pipelineDescProbe')
    case 'verify':   return t('warroom.pipelineDescVerify')
    case 'recheck':  return t('warroom.pipelineDescRecheck')
    case 'report':   return t('warroom.pipelineDescReport')
  }
}

function statusIcon(s: PhaseState['status']) {
  switch (s) {
    case 'running':  return <Loader2 size={14} className="animate-spin" style={{ color: '#a78bfa' }} />
    case 'done':     return <CheckCircle2 size={14} style={{ color: '#22c55e' }} />
    case 'skipped':  return <Circle size={14} style={{ color: '#64748b' }} />
    case 'error':    return <AlertTriangle size={14} style={{ color: '#ef4444' }} />
    default:         return <Circle size={14} style={{ color: '#475569' }} />
  }
}

function riskBadge(level?: string) {
  if (!level) return null
  // canonical SEVERITY_TONE — was MEDIUM #fbbf24, LOW #fde047 yellow.
  // CLEAN stays green: it means "no risk", not a low-severity finding.
  const colorMap: Record<string, string> = {
    CRITICAL: '#ef4444',
    HIGH: '#f97316',
    MEDIUM: '#eab308',
    LOW: '#64748b',
    CLEAN: '#22c55e',
  }
  const color = colorMap[level] ?? '#94a3b8'
  return (
    <Chip
      label={level}
      size="small"
      sx={{ bgcolor: color, color: '#0f172a', fontWeight: 700, fontSize: 13, height: 20 }}
    />
  )
}

export function CampaignPipelinePanel({ status, phases, currentPhase, report, totalTokens, runId, campaignId, onRetest }: Props) {
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)
  const [retestPending, setRetestPending] = useState(false)
  // AI-regenerate state. dialogOpen controls the markdown preview;
  // freshReport holds the latest /campaigns/{id}/report response so
  // the dialog can show it and Download can serialise it without
  // re-fetching.
  const [regenPending, setRegenPending] = useState(false)
  const [regenError, setRegenError] = useState<string | null>(null)
  const [freshReport, setFreshReport] = useState<CampaignReportResponse | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const regenerateSummary = async () => {
    if (!campaignId) return
    setRegenPending(true)
    setRegenError(null)
    try {
      const res = await regenerateCampaignReport(campaignId)
      if (!res.ok) {
        setRegenError(res.error || 'regenerate failed')
        return
      }
      setFreshReport(res)
      setDialogOpen(true)
    } catch (e) {
      setRegenError(e instanceof Error ? e.message : String(e))
    } finally {
      setRegenPending(false)
    }
  }

  const downloadMarkdown = () => {
    if (!freshReport?.markdown) return
    const blob = new Blob([freshReport.markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `campaign-report-${campaignId ?? 'unknown'}-${new Date().toISOString().slice(0, 10)}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const openReport = async () => {
    if (!runId) return
    setReportLoading(true)
    setReportError(null)
    try {
      await openPipelineReportInNewTab(runId)
    } catch (e) {
      setReportError(e instanceof Error ? e.message : String(e))
    } finally {
      setReportLoading(false)
    }
  }

  const triggerRetest = async () => {
    if (!onRetest) return
    setRetestPending(true)
    try {
      await onRetest()
    } catch (e) {
      if (import.meta.env.DEV) {
        console.warn('[pipeline] retest failed:', e)
      }
    } finally {
      setRetestPending(false)
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Activity size={14} style={{ opacity: 0.7 }} />
        <Typography variant="caption" fontWeight={700} sx={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {t('warroom.pipelineTitle')}
        </Typography>
        {currentPhase && (
          <Typography variant="body2" color="text.secondary">
            · {t('warroom.pipelineCurrent')}: <b>{phaseLabel(currentPhase)}</b>
          </Typography>
        )}
        <Box sx={{ flex: 1 }} />
        <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: 13 }}>
          {totalTokens.input + totalTokens.output} {t('warroom.pipelineTokens')}
        </Typography>
      </Box>

      {/* Phase list */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {phases.map((p, i) => {
          const isCurrent = p.phase === currentPhase && p.status === 'running'
          return (
            <Paper
              key={p.phase}
              elevation={0}
              sx={{
                display: 'flex', alignItems: 'flex-start', gap: 1.5,
                p: 1.5, borderRadius: 2,
                border: 1, borderColor: isCurrent ? 'primary.main' : 'divider',
                bgcolor: isCurrent ? 'action.selected' : 'transparent',
                opacity: p.status === 'pending' ? 0.6 : 1,
                transition: 'all 0.2s',
              }}
            >
              <Box sx={{
                width: 24, height: 24, borderRadius: '50%', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                bgcolor: 'action.hover', fontSize: 13, fontWeight: 700, flexShrink: 0,
              }}>
                {i + 1}
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  {statusIcon(p.status)}
                  <Typography variant="body2" fontWeight={600}>{phaseLabel(p.phase)}</Typography>
                  {p.tokensUsed.input + p.tokensUsed.output > 0 && (
                    <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: 13 }}>
                      {p.tokensUsed.input}i / {p.tokensUsed.output}o
                    </Typography>
                  )}
                  {p.durationMs > 0 && (
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: 13 }}>
                      {(p.durationMs / 1000).toFixed(1)}s
                    </Typography>
                  )}
                  {p.evidence.length > 0 && (
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: 'text.secondary', fontSize: 13 }}>
                      <Eye size={11} /> {p.evidence.length}
                    </Box>
                  )}
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                  {p.summary || (p.status === 'pending' ? phaseDesc(p.phase) : null)}
                </Typography>
                {p.error && (
                  <Typography variant="caption" sx={{ color: '#ef4444', mt: 0.5, display: 'block' }}>
                    {p.error}
                  </Typography>
                )}
              </Box>
            </Paper>
          )
        })}
      </Box>

      {/* Final report */}
      {report && (
        <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: 1, borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
            {(report.riskLevel === 'CRITICAL' || report.riskLevel === 'HIGH')
              ? <ShieldAlert size={16} style={{ color: '#ef4444' }} />
              : <ShieldCheck size={16} style={{ color: report.riskLevel === 'CLEAN' ? '#22c55e' : '#fbbf24' }} />}
            <Typography variant="caption" fontWeight={700} sx={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {t('warroom.pipelineExecSummary')}
            </Typography>
            {riskBadge(report.riskLevel)}
            {report.totals && (
              <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                · {t('warroom.pipelineProvenLabel')} {report.totals.proven ?? 0}
                {' / '}
                {t('warroom.pipelineFlakyLabel')} {report.totals.flaky ?? 0}
              </Typography>
            )}
            <Box sx={{ flex: 1 }} />
            {runId && status === 'complete' && (
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={reportLoading ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
                  onClick={openReport}
                  disabled={reportLoading}
                  sx={{ textTransform: 'none', fontSize: 12 }}
                >
                  {t('warroom.pipelineOpenReport')}
                </Button>
                {campaignId && (
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={regenPending ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                    onClick={regenerateSummary}
                    disabled={regenPending}
                    sx={{ textTransform: 'none', fontSize: 12 }}
                  >
                    {t('warroom.pipelineRegenSummary')}
                  </Button>
                )}
                {onRetest && (report.totals?.proven ?? 0) > 0 && (
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={retestPending ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                    onClick={triggerRetest}
                    disabled={retestPending}
                    sx={{ textTransform: 'none', fontSize: 12 }}
                  >
                    {t('warroom.pipelineRetest')}
                  </Button>
                )}
              </Box>
            )}
          </Box>
          {reportError && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#ef4444', mb: 1, fontSize: 12 }}>
              <AlertTriangle size={12} /> {reportError}
            </Box>
          )}
          {regenError && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#ef4444', mb: 1, fontSize: 12 }}>
              <AlertTriangle size={12} /> {regenError}
            </Box>
          )}
          <Typography
            component="pre"
            variant="body2"
            sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 13, opacity: 0.85, lineHeight: 1.6 }}
          >
            {report.executiveSummary ?? t('warroom.pipelineNoSummary')}
          </Typography>

          {report.priorities && report.priorities.length > 0 && (
            <Box component="ol" sx={{ listStyle: 'none', p: 0, m: 0, mt: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {report.priorities.map((p, i) => (
                <Box component="li" key={i} sx={{ pl: 2, borderLeft: 2, borderColor: 'divider' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Chip label={p.class} size="small" sx={{ fontSize: 13, height: 22, fontWeight: 600 }} />
                    <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{p.endpoint}</Typography>
                    <Chip label={p.fixBucket.replace('_', ' ')} size="small" variant="outlined" sx={{ fontSize: 12, height: 22 }} />
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                    {p.rationale}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ opacity: 0.7, display: 'block' }}>
                    {p.businessImpact}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
        </Paper>
      )}

      {status === 'idle' && (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3, opacity: 0.7 }}>
          {t('warroom.pipelineIdleHint')}
        </Typography>
      )}

      {/* Fresh AI summary dialog. Opens after regenerateSummary()
          succeeds. Operator can review markdown then download as .md
          to paste into a customer report or share via Slack. */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Sparkles size={18} style={{ color: '#a78bfa' }} />
          {t('warroom.pipelineRegenDialogTitle')}
          {freshReport?.risk_level && (
            <Chip
              size="small"
              label={freshReport.risk_level.toUpperCase()}
              sx={{ ml: 1, height: 22, fontSize: 13, fontWeight: 700 }}
              color={
                freshReport.risk_level === 'critical' || freshReport.risk_level === 'high'
                  ? 'error'
                  : freshReport.risk_level === 'medium'
                    ? 'warning'
                    : 'default'
              }
            />
          )}
          <Box sx={{ ml: 'auto' }} />
          <IconButton
            size="small"
            onClick={() => setDialogOpen(false)}
            aria-label={t('common.close')}
            title={t('common.close')}
          >
            <X size={16} />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {freshReport?.generated_at && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              {t('warroom.pipelineRegenAt')}: {new Date(freshReport.generated_at).toLocaleString()}
            </Typography>
          )}
          <Box
            component="pre"
            sx={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontFamily: 'monospace',
              fontSize: 13,
              lineHeight: 1.6,
              p: 2,
              borderRadius: 1,
              bgcolor: 'action.hover',
              border: '1px solid',
              borderColor: 'divider',
              maxHeight: '60vh',
              overflowY: 'auto',
            }}
          >
            {freshReport?.markdown ?? ''}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} sx={{ textTransform: 'none' }}>
            {t('common.close')}
          </Button>
          <Button
            variant="contained"
            startIcon={<Download size={14} />}
            onClick={downloadMarkdown}
            disabled={!freshReport?.markdown}
            sx={{ textTransform: 'none' }}
          >
            {t('common.downloadMd')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
