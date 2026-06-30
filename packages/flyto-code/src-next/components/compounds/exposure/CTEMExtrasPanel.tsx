import { useState } from 'react'
import { Button, LinearProgress, Chip } from '@mui/material'
import { ArrowUpRight, FileText, Sparkles, Network } from 'lucide-react'
import { InlineErrorNotice } from '@atoms/InlineErrorNotice'
import {
  getBlastGraph,
  generateFixForAlert,
  downloadEvidenceBinder,
  type BlastGraph,
  type FixProposal,
  type ComplianceFramework,
} from '@lib/engine'
import { BlastGraphSVG } from './BlastGraphSVG'
import { HistoryTimeline } from '../security/HistoryTimeline'
import { History } from 'lucide-react'
import { t } from '@lib/i18n';

// CTEMExtrasPanel — three war-room actions that ride on the new
// flyto-engine endpoints (blast-graph + generate-fix + compliance
// evidence binder). Drop this card into any alert detail surface and
// it gives reviewers: "see the network", "generate a fix", "export
// audit evidence" — without leaving the war room.
//
// MUI-only. The workspace layout doesn't host a MantineProvider, so
// any Mantine import here crashes the page — see the matching
// CTEMActionsView rewrite for the same reason.

export interface CTEMExtrasPanelProps {
  alertId: string
  orgId: string
}

export function CTEMExtrasPanel({ alertId, orgId }: CTEMExtrasPanelProps) {
  return (
    <div className="exp-card">
      <div className="exp-card-head">
        <Sparkles size={16} />
        <span>{t('ctemExtras.warroomActions')}</span>
        <Chip
          size="small"
          label="CTEM"
          sx={{ ml: 'auto', height: 20, fontSize: 12,
                bgcolor: 'rgba(139,92,246,0.12)', color: '#a78bfa' }}
        />
      </div>

      <BlastGraphAction alertId={alertId} />
      <GenerateFixAction alertId={alertId} />
      <AlertHistoryAction alertId={alertId} />
      <ComplianceExportAction orgId={orgId} />
    </div>
  )
}

// ── Alert history ────────────────────────────────────────────────

function AlertHistoryAction({ alertId }: { alertId: string }) {
  return (
    <div className="exp-subcard">
      <div className="exp-subcard-head">
        <History size={14} />
        <span>{t('ctemExtras.alertHistory')}</span>
      </div>
      <div className="exp-subcard-body" style={{ paddingTop: 8 }}>
        <HistoryTimeline kind="alert" alertId={alertId} limit={50}
          emptyHint="No state changes recorded yet — this finding is fresh." />
      </div>
    </div>
  )
}

// ── Blast graph ─────────────────────────────────────────────────

function blastTint(v: number) {
  if (v >= 70) return '#ef4444'
  if (v >= 40) return '#f97316'
  return '#94a3b8'
}

function BlastGraphAction({ alertId }: { alertId: string }) {
  const [loading, setLoading] = useState(false)
  const [graph, setGraph] = useState<BlastGraph | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setErr(null)
    try {
      const g = await getBlastGraph(alertId)
      setGraph(g)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const tint = graph ? blastTint(graph.blast_radius) : '#94a3b8'

  return (
    <div className="exp-subcard">
      <div className="exp-subcard-head">
        <Network size={14} />
        <span>{t('ctemExtras.blastGraph')}</span>
        <Button
          size="small"
          variant="outlined"
          onClick={load}
          disabled={loading}
          sx={{ ml: 'auto', textTransform: 'none', height: 24,
                fontSize: 12, borderRadius: 1.5,
                borderColor: 'divider' }}
        >
	          {loading ? '...' : graph ? t('hardcoded.refresh.compute.8d88c5ed') : t('item.compute')}
        </Button>
      </div>
      {err && (
        <div style={{ marginTop: 8 }}>
          <InlineErrorNotice error={err} />
        </div>
      )}
      {graph && (
        <div className="exp-subcard-body">
          <div className="exp-blast-row">
            <span className="exp-blast-label">{t('ctemExtras.blastRadius')}</span>
            <span className="exp-blast-value" style={{ color: tint }}>
              {graph.blast_radius}/100
            </span>
          </div>
          <LinearProgress
            variant="determinate"
            value={graph.blast_radius}
            sx={{
              height: 6, borderRadius: 3, mt: 0.5,
              bgcolor: 'rgba(148,163,184,0.15)',
              '& .MuiLinearProgress-bar': { bgcolor: tint },
            }}
          />
          <p className="exp-blast-summary">{graph.summary}</p>
          <p className="exp-blast-meta">
            {graph.nodes.length} nodes · {graph.edges.length} edges
          </p>
          <div style={{ marginTop: 8 }}>
            <BlastGraphSVG graph={graph} width={500} height={340} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Generate fix ────────────────────────────────────────────────

function GenerateFixAction({ alertId }: { alertId: string }) {
  const [loading, setLoading] = useState(false)
  const [proposal, setProposal] = useState<FixProposal | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const generate = async () => {
    setLoading(true)
    setErr(null)
    try {
      const p = await generateFixForAlert(alertId)
      setProposal(p)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="exp-subcard">
      <div className="exp-subcard-head">
        <Sparkles size={14} />
        <span>{t('ctemExtras.aiFix')}</span>
        <Button
          size="small"
          variant="contained"
          onClick={generate}
          disabled={loading}
          sx={{ ml: 'auto', textTransform: 'none', height: 24,
                fontSize: 12, borderRadius: 1.5,
                bgcolor: '#7c3aed',
                boxShadow: 'none',
                '&:hover': { bgcolor: '#6d28d9', boxShadow: 'none' } }}
        >
          {loading ? '...' : 'Generate'}
        </Button>
      </div>
      {err && (
        <div style={{ marginTop: 8 }}>
          <InlineErrorNotice error={err} />
        </div>
      )}
      {proposal && (
        <div className="exp-subcard-body">
          <div className="exp-blast-row">
            <Chip
              size="small"
	              label={proposal.verify_status === 'verified' ? t('hardcoded.verified.needs.verification.ccf13486') : t('hardcoded.needs.verification.89858182')}
              sx={{
                height: 20, fontSize: 12, fontWeight: 600,
                bgcolor: proposal.verify_status === 'verified'
                  ? 'rgba(34,197,94,0.12)' : 'rgba(234,179,8,0.12)',
                color: proposal.verify_status === 'verified' ? '#22c55e' : '#eab308',
              }}
            />
            <span className="exp-blast-meta">
              confidence {(proposal.confidence * 100).toFixed(0)}%
            </span>
          </div>
          <p className="exp-blast-summary">{proposal.summary}</p>
          <pre className="exp-fix-diff">{proposal.diff}</pre>
        </div>
      )}
    </div>
  )
}

// ── Compliance export ───────────────────────────────────────────

const FRAMEWORKS: { value: ComplianceFramework; label: string }[] = [
  { value: 'soc2',     label: t('reports.tmpl.soc2') },
  { value: 'iso27001', label: t('hardcoded.iso.27001.a871bde8') },
  { value: 'pci',      label: t('hardcoded.pci.dss.9487fef3') },
  { value: 'nist',     label: t('hardcoded.nist.csf.5f8e7dab') },
  { value: 'owasp',    label: t('reports.tmpl.owasp') },
  { value: 'gdpr',     label: 'GDPR' },
  { value: 'hipaa',    label: 'HIPAA' },
]

function ComplianceExportAction({ orgId }: { orgId: string }) {
  const [downloading, setDownloading] = useState<ComplianceFramework | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  async function download(framework: ComplianceFramework) {
    setDownloading(framework)
    setDownloadError(null)
    try {
      await downloadEvidenceBinder(orgId, framework)
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : String(err))
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="exp-subcard">
      <div className="exp-subcard-head">
        <FileText size={14} />
        <span>{t('ctemExtras.complianceBinder')}</span>
      </div>
      <p className="exp-blast-summary" style={{ margin: '8px 0' }}>
        Audit-ready markdown export. Each control bound to the scan that
        proves it, SHA-256 hashed and chained to the audit log.
      </p>
      <div className="exp-framework-grid">
        {FRAMEWORKS.map((f) => (
          <button
            key={f.value}
            type="button"
            className="exp-link"
            onClick={() => void download(f.value)}
            disabled={downloading !== null}
          >
            {downloading === f.value ? t('common.working') : f.label}
            <ArrowUpRight size={10} />
          </button>
        ))}
      </div>
      {downloadError && (
        <div style={{ marginTop: 8 }}>
          <InlineErrorNotice error={downloadError} />
        </div>
      )}
    </div>
  )
}
