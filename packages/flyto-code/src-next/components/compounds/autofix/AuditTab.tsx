import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, History, Loader2 } from 'lucide-react'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { getAutofixRunGates, listAutofixRuns } from '@lib/engine'

// Read-only ledger of every AutoFix run. Lists each run on the left,
// click one to inspect its per-gate verdicts on the right.
export function AuditTab({ orgId }: { orgId: string | undefined }) {
  const [selectedRun, setSelectedRun] = useState<string>('')
  const runsQ = useQuery({
    queryKey: qk.autofix.runs(orgId),
    queryFn: () => listAutofixRuns(orgId!),
    enabled: !!orgId,
    staleTime: 30_000,
  })
  const runs = runsQ.data?.runs ?? []
  const gatesQ = useQuery({
    queryKey: qk.autofix.gates(orgId, selectedRun),
    queryFn: () => getAutofixRunGates(orgId!, selectedRun),
    enabled: !!orgId && !!selectedRun,
    staleTime: 5 * 60_000,
  })
  const gates = gatesQ.data?.gates ?? []

  if (runsQ.isLoading) {
    return <Loader2 size={16} className="animate-spin text-text-tertiary" />
  }
  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-text-tertiary">
        <History size={40} style={{ opacity: 0.15 }} />
        <div className="text-sm mt-3">{t('autofix.warroom.auditEmpty')}</div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-[280px_1fr] gap-3 min-h-[400px]">
      <div className="flex flex-col border-r border-white/10 pr-3">
        <div className="text-xs font-semibold text-text-secondary mb-2 flex items-center gap-2">
          {t('autofix.warroom.auditRuns')}
          <span className="px-1.5 py-0.5 rounded-full bg-white/10 text-[12px] text-text-tertiary">{runs.length}</span>
        </div>
        <ul className="flex flex-col gap-1 overflow-auto">
          {runs.map(r => (
            <li
              key={r.ID}
              className={`rounded-md px-2 py-2 cursor-pointer transition-colors ${selectedRun === r.ID ? 'bg-white/10' : 'hover:bg-white/5'}`}
              onClick={() => setSelectedRun(r.ID)}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setSelectedRun(r.ID) }}
            >
              <div className="flex items-center gap-2">
                <code className="text-[12px] font-mono text-text-secondary">{r.ID.slice(0, 8)}</code>
                <span className="text-[12px] text-text-tertiary">{r.TriggeredBy}</span>
                <span className="text-[12px] text-text-tertiary ml-auto">{new Date(r.StartedAt).toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-3 mt-1 text-[12px]">
                <span style={{ color: '#22c55e' }}>{r.PatchesPassed} pass</span>
                <span style={{ color: r.PatchesFailed > 0 ? '#ef4444' : 'var(--color-text-tertiary)' }}>{r.PatchesFailed} fail</span>
                <span className="text-text-secondary">{r.PRsOpened} PRs</span>
                <span className="text-text-tertiary">{r.DurationMs}ms</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="overflow-auto">
        {!selectedRun ? (
          <div className="flex flex-col items-center justify-center py-8 text-text-tertiary">
            <ChevronRight size={32} style={{ opacity: 0.15 }} />
            <div className="text-xs mt-2">
              {t('autofix.warroom.auditPickRun')}
            </div>
          </div>
        ) : gatesQ.isLoading ? (
          <Loader2 size={16} className="animate-spin text-text-tertiary" />
        ) : gates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-text-tertiary">
            <div className="text-xs">
              {t('autofix.warroom.auditNoGates')}
            </div>
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left p-2 font-semibold text-text-tertiary">{t('autofix.warroom.gateRule')}</th>
                <th className="text-left p-2 font-semibold text-text-tertiary">{t('autofix.warroom.gateFile')}</th>
                <th className="text-left p-2 font-semibold text-text-tertiary">{t('autofix.warroom.gateGate')}</th>
                <th className="text-left p-2 font-semibold text-text-tertiary">{t('autofix.warroom.gateStatus')}</th>
                <th className="text-left p-2 font-semibold text-text-tertiary">{t('autofix.warroom.gateMessage')}</th>
                <th className="text-right p-2 font-semibold text-text-tertiary">{t('autofix.warroom.gateTook')}</th>
              </tr>
            </thead>
            <tbody>
              {gates.map(g => (
                <tr key={g.ID} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="p-2"><code className="font-mono text-[12px] text-text-secondary">{g.RuleID}</code></td>
                  <td className="p-2 font-mono text-[12px] text-text-secondary">
                    {g.FilePath ? `${g.FilePath}${g.LineNumber > 0 ? `:${g.LineNumber}` : ''}` : '\u2014'}
                  </td>
                  <td className="p-2 text-[12px] text-text-secondary">{g.GateName}</td>
                  <td className="p-2"><GateStatusPill status={g.GateStatus} /></td>
                  <td className="p-2 text-[12px] text-text-secondary max-w-[360px]">{g.GateMessage || '\u2014'}</td>
                  <td className="p-2 text-right text-[12px] text-text-tertiary tabular-nums">
                    {g.TookMs}ms
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function GateStatusPill({ status }: { status: string }) {
  let color = '#94a3b8', bg = 'rgba(148,163,184,0.14)'
  switch (status) {
    case 'pass':    color = '#22c55e'; bg = 'rgba(34,197,94,0.14)'; break
    case 'fail':    color = '#ef4444'; bg = 'rgba(239,68,68,0.14)'; break
    case 'error':   color = '#f97316'; bg = 'rgba(249,115,22,0.14)'; break
    case 'skipped': color = '#64748b'; bg = 'rgba(100,116,139,0.14)'; break
  }
  return (
    <span style={{
      fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 8,
      background: bg, color, textTransform: 'uppercase', letterSpacing: '0.04em',
    }}>{status}</span>
  )
}
