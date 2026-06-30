import { Radar } from 'lucide-react'
import { t } from '@lib/i18n';
import { type AttackSurfaceAsset } from '@lib/engine'
import { DiscoveryEmptyState, psColor, psHint } from './_shared'

export function PageSpeedTab({
  assets, projectId, orgId, domain, resourceId,
}: {
  assets: AttackSurfaceAsset[]
  projectId?: string
  orgId: string
  domain?: string
  resourceId?: string
}) {
  const psAsset = assets.find(a => a.asset_type === 'pagespeed')
  if (!psAsset) {
    return <DiscoveryEmptyState icon={Radar} message={t('dast.noPageSpeed')} projectId={projectId} orgId={orgId} domain={domain} assetType="pagespeed" resourceId={resourceId} />
  }

  let data: { scores?: Record<string, number>; findings?: Array<{ id: string; title: string; score: number }> } = {}
  try { data = JSON.parse(psAsset.metadata) } catch { /* invalid JSON */ }
  const scores = data.scores ?? {}
  const findings = data.findings ?? []

  const categories = [
    { id: 'performance', label: t('dashboard.performance') },
    { id: 'accessibility', label: t('dashboard.accessibility') },
    { id: 'best-practices', label: t('dashboard.bestPractices') },
    { id: 'seo', label: t('dashboard.seo') },
  ]

  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
        {categories.map(cat => {
          const score = scores[cat.id] ?? 0
          const color = psColor(score)
          const circumference = 2 * Math.PI * 28
          const offset = circumference * (1 - score / 100)
          const hint = psHint(cat.id, score)
          return (
            <div key={cat.id} className="flex flex-col items-center gap-1.5">
              <svg width={76} height={76} viewBox="0 0 76 76">
                <circle cx={38} cy={38} r={28} fill="none" stroke="var(--color-card-border)" strokeWidth={4} />
                <circle cx={38} cy={38} r={28} fill="none" stroke={color} strokeWidth={4}
                  strokeDasharray={circumference} strokeDashoffset={offset}
                  strokeLinecap="round" transform="rotate(-90 38 38)" />
                <text x={38} y={42} textAnchor="middle" fill={color} fontSize={18} fontWeight={700} fontFamily="inherit">{score}</text>
              </svg>
              <div className="text-sm font-medium text-text-secondary">{cat.label}</div>
              {hint && <div className="text-xs text-text-tertiary" style={{ marginTop: 4, textAlign: 'center', lineHeight: 1.5 }}>{hint}</div>}
            </div>
          )
        })}
      </div>

      {findings.length > 0 && (
        <>
          <div className="text-sm font-semibold text-text-primary">{t('dast.improvements')} ({findings.length})</div>
          <div className="flex flex-col gap-1.5">
            {findings.map((f, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-1.5 rounded hover:bg-white/5">
                <span className="text-sm font-bold w-9 text-right shrink-0" style={{ color: psColor(f.score) }}>{f.score}</span>
                <span className="text-sm text-text-secondary">{f.title}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
