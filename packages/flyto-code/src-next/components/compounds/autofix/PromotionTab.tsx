import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSnackbar } from 'notistack'
import { CheckCircle2, Loader2, Sparkles, XCircle } from 'lucide-react'
import { useActionAllowed } from '@atoms/GatedButton'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import {
  decideAutofixPromotion, listAutofixPromotions,
  type AutofixPromotionCandidate,
  type AutofixPromotionCandidateWithStatus,
} from '@lib/engine'

// Tier 3 review queue — promote a recurring AI-patch shape so an
// engineer writes a Tier 1 deterministic rule for it. The new rule
// then runs across every repo in the org.
export function PromotionTab({ orgId }: { orgId: string | undefined }) {
  const qc = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()
  const q = useQuery({
    queryKey: qk.autofix.promotions(orgId),
    queryFn: () => listAutofixPromotions(orgId!),
    enabled: !!orgId,
    staleTime: 5 * 60_000,
    retry: false,
  })

  const decideMut = useMutation({
    mutationFn: ({ shape, status, finding_type }: {
      shape: string; status: 'approved' | 'rejected' | 'pending'; finding_type: string
    }) => decideAutofixPromotion(orgId!, shape, { status, finding_type }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.autofix.promotions(orgId) }),
    onError: (err) => enqueueSnackbar(
      t('autofix.warroom.promotionError') + ((err as Error).message || ''),
      { variant: 'error' },
    ),
  })

  if (q.isLoading) return <Loader2 size={16} className="animate-spin text-text-tertiary" />

  const candidates = q.data?.candidates ?? []
  const approved = q.data?.approved ?? []

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5">
        <Sparkles size={16} />
        <span style={{ fontSize: 16, fontWeight: 600 }}>
          {t('autofix.warroom.promotionTitle')}
        </span>
      </div>
      <p style={{ fontSize: 14, lineHeight: 1.7, maxWidth: 600, opacity: 0.7 }}>
        {t('autofix.warroom.promotionHint')}
      </p>
      {candidates.length === 0 && approved.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12">
          <div style={{ width: 80, height: 80, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(128,128,128,0.1)', marginBottom: 16 }}>
            <Sparkles size={36} style={{ opacity: 0.3 }} />
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            {t('autofix.warroom.promotionEmptyTitle')}
          </div>
          <div style={{ fontSize: 14, opacity: 0.6, textAlign: 'center', maxWidth: 400 }}>
            {t('autofix.warroom.promotionEmpty')}
          </div>
        </div>
      ) : (
        <>
          {candidates.length > 0 && (
            <ul className="flex flex-col gap-2">
              {candidates.map((c) => (
                <PromotionCard
                  key={c.ShapeHash}
                  candidate={c}
                  busy={decideMut.isPending}
                  onApprove={() => decideMut.mutate({
                    shape: c.ShapeHash, status: 'approved', finding_type: c.FindingType,
                  })}
                  onReject={() => decideMut.mutate({
                    shape: c.ShapeHash, status: 'rejected', finding_type: c.FindingType,
                  })}
                />
              ))}
            </ul>
          )}
          {approved.length > 0 && (
            <>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary mt-4 opacity-70">
                <CheckCircle2 size={12} style={{ color: '#22c55e' }} />
                {t('autofix.warroom.promotionApproved')}
                <span className="px-1.5 py-0.5 rounded-full bg-white/10 text-[12px] text-text-tertiary ml-2">{approved.length}</span>
              </div>
              <ul className="flex flex-col gap-2">
                {approved.map((c) => (
                  <PromotionCard
                    key={c.ShapeHash}
                    candidate={c}
                    busy={decideMut.isPending}
                    onUndo={() => decideMut.mutate({
                      shape: c.ShapeHash, status: 'pending', finding_type: c.FindingType,
                    })}
                  />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  )
}

function PromotionCard({ candidate: c, busy, onApprove, onReject, onUndo }: {
  candidate: AutofixPromotionCandidateWithStatus | AutofixPromotionCandidate
  busy: boolean
  onApprove?: () => void
  onReject?: () => void
  onUndo?: () => void
}) {
  const isApproved = 'status' in c && c.status === 'approved'
  // Promotion decide is admin-only on the backend (assertOrgAdmin → autofix:approve).
  const canDecide = useActionAllowed('autofix:approve')
  const denyTip = canDecide ? undefined : t('rbac.adminOnly')
  return (
    <li
      className="rounded-lg border p-3"
      style={isApproved ? { borderColor: 'rgba(34,197,94,0.35)', background: 'rgba(34,197,94,0.04)' } : {}}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <code className="font-mono text-[12px] text-text-secondary px-1.5 py-0.5 rounded bg-white/5">{c.FindingType}</code>
        <span className="text-[12px] text-text-tertiary font-mono">shape {c.ShapeHash.slice(0, 8)}</span>
        <span className="text-[12px] text-text-tertiary">
          {c.OccurrenceCount} times -- {c.DistinctRepos} repos
        </span>
        <div style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6 }}>
          {onApprove && (
            <button
              type="button"
              className="flex items-center gap-1 px-2 py-1 text-[12px] font-medium rounded border transition-colors hover:bg-white/5 disabled:opacity-40"
              disabled={busy || !canDecide}
              onClick={onApprove}
              style={{ borderColor: 'rgba(34,197,94,0.4)', color: '#22c55e' }}
              title={denyTip ?? t('autofix.warroom.promotionApproveTip')}
            >
              <CheckCircle2 size={11} />
              {t('autofix.warroom.promotionApprove')}
            </button>
          )}
          {onReject && (
            <button
              type="button"
              className="flex items-center gap-1 px-2 py-1 text-[12px] font-medium rounded border transition-colors hover:bg-white/5 disabled:opacity-40"
              disabled={busy || !canDecide}
              onClick={onReject}
              style={{ borderColor: 'rgba(239,68,68,0.35)', color: '#ef4444' }}
              title={denyTip ?? t('autofix.warroom.promotionRejectTip')}
            >
              <XCircle size={11} />
              {t('autofix.warroom.promotionReject')}
            </button>
          )}
          {onUndo && (
            <button
              type="button"
              className="flex items-center gap-1 px-2 py-1 text-[12px] font-medium rounded border border-white/20 text-text-tertiary transition-colors hover:bg-white/5 disabled:opacity-40"
              disabled={busy || !canDecide}
              onClick={onUndo}
              title={denyTip}
            >
              {t('autofix.warroom.promotionUndo')}
            </button>
          )}
        </div>
      </div>
      <div className="text-xs text-text-secondary mt-2 leading-relaxed">{c.Suggested}</div>
      {c.Examples && c.Examples.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {c.Examples.map(e => (
            <li key={e.ID} className="flex items-center gap-2">
              <code className="text-[12px] text-text-secondary font-mono">{e.FilePath}</code>
              {e.PRURL && (
                <a href={e.PRURL} target="_blank" rel="noopener noreferrer" className="text-[12px] text-violet-400 hover:underline" style={{ marginLeft: 8 }}>
                  PR
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
