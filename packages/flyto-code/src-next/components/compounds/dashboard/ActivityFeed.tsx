import { Search, GitPullRequest } from 'lucide-react'
import { t } from '@lib/i18n'
import { GRADE_COLORS, formatTimeAgo, displayScore, type ScanActivityItem } from './types'
import type { PRSummary } from '@hooks/usePRActivity'

export function ActivityFeed({ scanActivity, prActivity }: {
  scanActivity: ScanActivityItem[]
  prActivity?: PRSummary
}) {
  // Merge scan events and PR events into one timeline
  const items: Array<{ type: string; title: string; sub: string; time: string; color: string; icon: 'scan' | 'pr_merged' | 'pr_opened' }> = []

  scanActivity.forEach(s => {
    items.push({
      type: 'scan',
      title: `${s.title} ${t('dashboard.scannedEvent')}`,
      sub: `${s.grade} (${displayScore(s.score)})`,
      time: s.time,
      color: GRADE_COLORS[s.grade] ?? '#666',
      icon: 'scan',
    })
  })

  // Add PR activity if available
  if (prActivity) {
    prActivity.openPRs.slice(0, 5).forEach(pr => {
      items.push({
        type: 'pr_opened',
        title: pr.title,
        sub: `${pr.author} -- ${pr.repo}`,
        time: pr.createdAt,
        color: '#38bdf8',
        icon: 'pr_opened',
      })
    })
  }

  // Sort by time descending, take last 8
  items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
  const display = items.slice(0, 8)

  if (display.length === 0) {
    return <div className="text-center text-xs text-text-tertiary py-4">{t('dashboard.noData')}</div>
  }

  return (
    <div className="flex flex-col gap-1">
      {display.map((item, i) => (
        <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/5 transition-colors">
          <span className="flex items-center justify-center w-5 h-5 rounded-full shrink-0" style={{ background: `${item.color}18`, color: item.color }}>
            {item.icon === 'scan' ? <Search size={11} /> : <GitPullRequest size={11} />}
          </span>
          <span className="flex-1 text-sm truncate" style={{ color: 'var(--mui-palette-text-primary, var(--color-text-secondary))' }}>
            <strong>{item.title}</strong> {item.sub && <span style={{ color: 'var(--mui-palette-text-secondary, var(--color-text-tertiary))' }}>{` -- ${item.sub}`}</span>}
          </span>
          <span className="text-xs whitespace-nowrap shrink-0" style={{ color: 'var(--mui-palette-text-secondary, var(--color-text-tertiary))' }}>{formatTimeAgo(item.time)}</span>
        </div>
      ))}
    </div>
  )
}
