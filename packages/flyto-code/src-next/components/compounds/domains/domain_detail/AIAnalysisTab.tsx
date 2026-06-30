import { useQuery } from '@tanstack/react-query'
import { Brain, Check, Loader2, X, ShieldCheck } from 'lucide-react'
import { t, tOr } from '@lib/i18n';
import { analyzeDomain } from '@lib/engine'
import { qk } from '@lib/queryKeys'
import { gradeColor } from './_shared'

export function AIAnalysisTab({ projectId }: { projectId?: string }) {
  const analyzeQuery = useQuery({
    queryKey: qk.domains.analysis(projectId),
    queryFn: () => analyzeDomain(projectId!),
    enabled: !!projectId,
    staleTime: 60 * 60_000,
    gcTime: 60 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  })

  if (!projectId) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-text-tertiary">
        <Brain size={44} className="mb-4 opacity-20" />
        <div className="text-sm">{t('dast.aiNoProject')}</div>
      </div>
    )
  }

  if (analyzeQuery.isPending) {
    return (
      <div className="flex flex-col items-center justify-center py-14 gap-3">
        <Loader2 size={32} className="animate-spin" style={{ color: '#a78bfa' }} />
        <div className="text-sm text-text-tertiary">{t('ai.running')}</div>
        <div className="text-xs text-text-tertiary opacity-60">
          {t('dast.aiRunningHint')}
        </div>
      </div>
    )
  }

  if (analyzeQuery.isError) {
    return (
      <div className="flex flex-col items-center justify-center py-14 gap-3">
        <div className="text-sm" style={{ color: 'var(--flyto-error)' }}>
          {t('ai.failed', { error: (analyzeQuery.error as Error).message })}
        </div>
        <div className="text-xs text-text-tertiary">
          {t('ai.reopenToRetry')}
        </div>
      </div>
    )
  }

  const sc = analyzeQuery.data?.scorecard
  const insights = analyzeQuery.data?.insights
  if (!sc) return null

  const failedRulesCount = sc.categories.reduce((n, c) => n + c.rules.filter(r => !r.pass).length, 0)
  const passedRulesCount = sc.categories.reduce((n, c) => n + c.rules.filter(r => r.pass).length, 0)

  return (
    <div className="flex flex-col gap-0 h-full overflow-y-auto">

      {/* ── Top summary bar: grade + counts inline ── */}
      <div className="flex items-center gap-4 px-4 py-3 border-b border-white/8" style={{ background: 'rgba(255,255,255,0.02)' }}>
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} style={{ color: gradeColor(sc.overall_grade), opacity: 0.8 }} />
          <span className="text-2xl font-extrabold" style={{ color: gradeColor(sc.overall_grade) }}>{sc.overall_grade}</span>
          <span className="text-sm text-text-tertiary font-medium tabular-nums">{sc.overall_score}/100</span>
        </div>
        <div className="h-4 w-px bg-white/10" />
        {failedRulesCount > 0 && (
          <div className="flex items-center gap-1 text-xs font-semibold" style={{ color: '#ef4444' }}>
            <X size={13} /> {failedRulesCount} {t('dast.failed')}
          </div>
        )}
        <div className="flex items-center gap-1 text-xs font-semibold" style={{ color: '#22c55e' }}>
          <Check size={13} /> {passedRulesCount} {t('dast.passed')}
        </div>
        <div className="flex-1" />
        <span className="text-xs text-text-tertiary uppercase tracking-wider font-semibold">
          {t('dast.hardRulesTitle')}
        </span>
      </div>

      {/* ── Category cards ── */}
      <div className="grid gap-3 p-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
        {sc.categories.map((cat, i) => {
          const failed = cat.rules.filter(r => !r.pass)
          const passed = cat.rules.filter(r => r.pass)
          const gc = gradeColor(cat.grade)
          return (
            <div key={i} className="rounded-xl border border-white/6 overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)' }}>
              {/* Category header */}
              <div className="flex items-center gap-3 px-4 py-2.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <span className="text-lg font-bold" style={{ color: gc, minWidth: 24, textAlign: 'center' }}>{cat.grade}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-text-primary">
                    {cat.id ? tOr(`dast.cat.${cat.id}`, cat.name) : cat.name}
                  </div>
                  <div className="text-xs text-text-tertiary">
                    {cat.passed}/{cat.total} · {t('dast.weight')} {cat.weight}%
                  </div>
                </div>
                {failed.length > 0 && (
                  <span className="text-xs font-semibold px-1.5 py-0.5 rounded" style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)' }}>
                    {failed.length} {t('dast.issues')}
                  </span>
                )}
              </div>

              {/* Rules */}
              <div className="px-4 py-2 flex flex-col gap-0.5">
                {failed.map((rule, j) => (
                  <div key={`f${j}`} className="flex items-start gap-2 py-1 px-2 rounded" style={{ background: 'rgba(239,68,68,0.05)' }}>
                    <X size={14} style={{ color: '#ef4444', flexShrink: 0, marginTop: 2 }} />
                    <span className="text-sm" style={{ color: '#ef4444' }}>
                      {rule.id ? tOr(`dast.rule.${rule.id}`, rule.name) : rule.name}
                    </span>
                    {rule.detail && <span className="text-xs text-text-tertiary ml-auto flex-shrink-0">{rule.detail}</span>}
                  </div>
                ))}
                {passed.map((rule, j) => (
                  <div key={`p${j}`} className="flex items-center gap-2 py-0.5 px-2">
                    <Check size={13} style={{ color: '#22c55e', opacity: 0.6, flexShrink: 0 }} />
                    <span className="text-xs text-text-tertiary">
                      {rule.id ? tOr(`dast.rule.${rule.id}`, rule.name) : rule.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── AI Insights ── */}
      {insights && insights.items && insights.items.length > 0 && (
        <>
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/8" style={{ background: 'rgba(167,139,250,0.03)' }}>
            <Brain size={16} style={{ color: '#a78bfa' }} />
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#a78bfa' }}>
              {t('dast.aiInsightsTitle')}
            </span>
            <span className="text-xs text-text-tertiary">
              {t('dast.aiInsightsNote')}
            </span>
          </div>

          <div className="grid gap-3 p-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
            {insights.items.map((insight, i) => {
              const cc = insight.confidence === 'high' ? '#22c55e' : insight.confidence === 'medium' ? '#eab308' : '#94a3b8'
              return (
                <div key={i} className="rounded-xl border border-white/6 p-4" style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[11px] font-semibold uppercase px-1.5 py-0.5 rounded" style={{ background: 'rgba(167,139,250,0.1)', color: '#a78bfa' }}>
                      {insight.type.replace('_', ' ')}
                    </span>
                    <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded" style={{ background: `${cc}18`, color: cc }}>
                      {insight.confidence}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-text-primary mb-1">{insight.title}</div>
                  <div className="text-sm text-text-secondary leading-relaxed">{insight.content}</div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
