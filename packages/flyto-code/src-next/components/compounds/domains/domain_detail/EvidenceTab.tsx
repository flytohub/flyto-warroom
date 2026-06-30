/**
 * EvidenceTab — surfaces the observation ledger for a single asset.
 *
 * Engine fetches: GET /api/v1/code/orgs/{id}/asset-evidence?asset_type=X&asset_key=Y
 * Returns: AssetState + chronological raw_observations + newest-first
 * asset_decisions + chain_intact verification.
 *
 * The Phase 4 / feedback-certainty contract: customers MUST be able
 * to drill from a finding to "which independent sources said what,
 * across how many rounds, with what cited evidence". This tab is
 * that drill-down. Without it, the engine's "only confirmed assets
 * surface as active" promise is invisible to the user.
 *
 * Loading model: enabled only when domain is known. Errors render
 * non-fatally (the engine endpoint 404s when never observed; that
 * surfaces as "not yet scanned" — not as a crash).
 */

import { useQuery } from '@tanstack/react-query'
import { ShieldCheck, ShieldQuestion, ShieldX, Hourglass, Link2, AlertCircle, Download, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { t as i18nT, tOr } from '@lib/i18n';
import {
  getAssetEvidence,
  downloadAuditExport,
  type AssetState,
  type AssetStateStatus,
} from '@lib/engine'
import { qk } from '@lib/queryKeys'

interface Props {
  orgId?: string
  /** The subdomain hostname (or asset key). e.g. "api.example.com" */
  assetKey?: string
  /** Defaults to "subdomain" — the only verifier registered today. */
  assetType?: string
}

const STATUS_TONE: Record<AssetStateStatus, { color: string; bg: string; Icon: typeof ShieldCheck; label: string }> = {
  confirmed: {
    color: 'text-emerald-300',
    bg: 'bg-emerald-500/10 border-emerald-500/30',
    Icon: ShieldCheck,
    label: 'Confirmed',
  },
  inconclusive: {
    color: 'text-amber-300',
    bg: 'bg-amber-500/10 border-amber-500/30',
    Icon: ShieldQuestion,
    label: 'Inconclusive',
  },
  refuted: {
    color: 'text-rose-300',
    bg: 'bg-rose-500/10 border-rose-500/30',
    Icon: ShieldX,
    label: 'Refuted',
  },
  pending: {
    color: 'text-slate-300',
    bg: 'bg-slate-500/10 border-slate-500/30',
    Icon: Hourglass,
    label: 'Pending',
  },
}

function StatusPill({ state }: { state: AssetState | null }) {
  if (!state) return null
  const t = STATUS_TONE[state.status] ?? STATUS_TONE.pending
  const conf = (state.confidence * 100).toFixed(0)
  return (
    <div className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 border ${t.bg}`}>
      <t.Icon size={14} className={t.color} />
      <span className={`text-xs font-medium ${t.color}`}>
        {tOr(`evidence.status.${state.status}`, t.label)}
      </span>
      <span className="text-[10px] text-text-tertiary">
        · {state.sourcesAgree}/{state.sourcesAgree + state.sourcesDisagree} {i18nT('evidence.sources')}
        · {conf}% {i18nT('evidence.confidence')}
      </span>
    </div>
  )
}

function verdictColor(v: string): string {
  if (v === 'pass') return 'text-emerald-300'
  if (v === 'fail') return 'text-rose-300'
  return 'text-amber-300'
}

export function EvidenceTab({ orgId, assetKey, assetType = 'subdomain' }: Props) {
  const [downloading, setDownloading] = useState(false)
  const [downloadResult, setDownloadResult] = useState<string | null>(null)

  const evidenceQuery = useQuery({
    queryKey: qk.domains.assetEvidence(orgId, assetType, assetKey),
    queryFn: () => getAssetEvidence(orgId!, assetType, assetKey!),
    enabled: !!orgId && !!assetKey,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  })

  if (!orgId || !assetKey) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-text-tertiary">
        <ShieldQuestion size={44} className="mb-4 opacity-20" />
        <div className="text-sm">{i18nT('evidence.noAsset')}</div>
      </div>
    )
  }

  if (evidenceQuery.isPending) {
    return (
      <div className="flex items-center justify-center py-14 text-text-tertiary">
        <Loader2 size={20} className="animate-spin mr-2" />
        <span className="text-sm">{i18nT('evidence.loading')}</span>
      </div>
    )
  }

  if (evidenceQuery.isError || !evidenceQuery.data) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-text-tertiary">
        <AlertCircle size={44} className="mb-4 opacity-20 text-rose-300" />
        <div className="text-sm">
          {i18nT('evidence.fetchFailed')}
        </div>
      </div>
    )
  }

  const d = evidenceQuery.data
  // The engine marshals nil Go slices as JSON `null`, so observations /
  // decisions can arrive null even though the type says []. Coalesce to []
  // before any .length / .map so a never-observed asset renders the empty /
  // "not scanned" path instead of crashing with "Cannot read properties of
  // null (reading 'length')".
  const state = d.state ?? null
  const observations = d.observations ?? []
  const decisions = d.decisions ?? []
  const { chain_intact, chain_count, chain_error } = d

  // Asset never observed — render the "not yet scanned" path explicitly,
  // not as an error. Per Phase 4 spec.
  if (!state && observations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-text-tertiary">
        <Hourglass size={44} className="mb-4 opacity-20" />
        <div className="text-sm">
          {i18nT('evidence.notObserved')}
        </div>
      </div>
    )
  }

  const handleDownload = async () => {
    if (!orgId) return
    setDownloading(true)
    setDownloadResult(null)
    try {
      const r = await downloadAuditExport(orgId, assetType)
      setDownloadResult(
        i18nT('evidence.downloadOk')
          .replace('{filename}', r.filename)
          .replace('{kb}', String(Math.round(r.bytes / 1024)))
          .replace('{hash}', r.bundleHash.slice(0, 12) + '…'),
      )
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'error'
      setDownloadResult(i18nT('evidence.downloadFail') + msg)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 px-1 py-2">
      {/* Header — state pill + chain integrity + download */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-2">
          <div className="text-xs text-text-tertiary">
            {i18nT('evidence.assetLabel')}: {assetType} · <code>{assetKey}</code>
          </div>
          <StatusPill state={state} />
          {state?.decidedAt && (
            <div className="text-[10px] text-text-tertiary">
              {i18nT('evidence.decidedAt')}: {new Date(state.decidedAt).toLocaleString()}
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <div
            className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded ${
              chain_intact ? 'text-emerald-300 bg-emerald-500/10' : 'text-rose-300 bg-rose-500/10'
            }`}
            title={chain_error || ''}
          >
            <Link2 size={12} />
            {chain_intact
              ? i18nT('evidence.chainOk').replace('{n}', String(chain_count))
              : i18nT('evidence.chainBroken').replace('{n}', String(chain_count))}
          </div>
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 text-[11px] text-text-secondary hover:text-text-primary disabled:opacity-40 px-2 py-1 rounded border border-border-subtle"
          >
            {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
            {i18nT('evidence.exportBtn')}
          </button>
          {downloadResult && (
            <div className="text-[10px] text-text-tertiary max-w-[260px] text-right">{downloadResult}</div>
          )}
        </div>
      </div>

      {/* Observations table — chronological */}
      <div>
        <div className="text-xs font-semibold text-text-secondary mb-2">
          {i18nT('evidence.observationsHeading')} ({observations.length})
        </div>
        {observations.length === 0 ? (
          <div className="text-xs text-text-tertiary italic">
            {i18nT('evidence.noObservations')}
          </div>
        ) : (
          <div className="rounded-md border border-border-subtle overflow-hidden">
            <table className="w-full text-[11px]">
              <thead className="bg-surface-subtle text-text-tertiary">
                <tr>
                  <th className="text-left px-3 py-1.5 font-medium">{i18nT('evidence.col.when')}</th>
                  <th className="text-left px-3 py-1.5 font-medium">{i18nT('evidence.col.source')}</th>
                  <th className="text-left px-3 py-1.5 font-medium">{i18nT('evidence.col.verdict')}</th>
                  <th className="text-left px-3 py-1.5 font-medium">{i18nT('evidence.col.detail')}</th>
                </tr>
              </thead>
              <tbody>
                {observations.map((o) => {
                  let detail: string
                  try {
                    const parsed = JSON.parse(o.rawResponse || '{}')
                    detail = parsed?.detail || parsed?.error || ''
                  } catch {
                    detail = o.rawResponse?.slice(0, 80) || ''
                  }
                  return (
                    <tr key={o.id} className="border-t border-border-subtle">
                      <td className="px-3 py-1.5 text-text-tertiary whitespace-nowrap">
                        {new Date(o.observedAt).toLocaleString()}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-text-secondary">{o.source}</td>
                      <td className={`px-3 py-1.5 font-medium ${verdictColor(o.verdict)}`}>
                        {o.verdict}
                      </td>
                      <td className="px-3 py-1.5 text-text-tertiary truncate max-w-[280px]" title={detail}>
                        {detail}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Decisions — newest first */}
      <div>
        <div className="text-xs font-semibold text-text-secondary mb-2">
          {i18nT('evidence.decisionsHeading')} ({decisions.length})
        </div>
        {decisions.length === 0 ? (
          <div className="text-xs text-text-tertiary italic">
            {i18nT('evidence.noDecisions')}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {decisions.map((d) => (
              <div key={d.id} className="rounded-md border border-border-subtle px-3 py-2 text-[11px]">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-text-secondary">
                    {d.fromStatus || '(initial)'} → <span className="text-text-primary">{d.toStatus}</span>
                    <span className="ml-2 text-text-tertiary">· {d.decisionType}</span>
                  </div>
                  <div className="text-text-tertiary text-[10px] whitespace-nowrap">
                    {new Date(d.decidedAt).toLocaleString()}
                  </div>
                </div>
                {d.reason && <div className="text-text-tertiary mt-1">{d.reason}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
