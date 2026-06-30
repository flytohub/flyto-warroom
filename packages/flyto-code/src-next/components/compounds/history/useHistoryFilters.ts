import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getHistoryFeed, type FeedKind, type HistoryFeedResponse } from '@lib/engine'
import { qk } from '@lib/queryKeys'
import { periodPair, type AuditPeriod, type PeriodWindow } from './periodHelpers'

// useHistoryFilters — shared state for the History view.
//
// State knobs persist to localStorage so the auditor's last filter
// set survives a tab close. Two pillars (audit/code) get separate
// stores because the kinds they default to diverge.
//
// 2026-05-17: extended with `period` (week/month/quarter/year)
// which auto-fills from/to to the calendar-aligned window AND fires
// a parallel query for the previous period so KPI pills can render
// "vs prev period" deltas. Pure `since` / `customRange` modes keep
// working — selecting a period clears them and vice-versa.

export type HistoryVariant = 'audit' | 'code'

const DEFAULT_KINDS: Record<HistoryVariant, FeedKind[]> = {
  audit: ['sla_breach', 'asset', 'pentest', 'score'],
  code:  ['scan', 'alert', 'score'],
}

interface PersistedState {
  since: string
  from: string
  to: string
  kinds: FeedKind[]
  domain: string
  q: string
  /** When set, overrides `since` and `from/to`. */
  period?: AuditPeriod | ''
}

const STORAGE_PREFIX = 'flyto.history.filters.'

function readStored(variant: HistoryVariant): Partial<PersistedState> | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + variant)
    if (!raw) return null
    return JSON.parse(raw) as Partial<PersistedState>
  } catch {
    return null
  }
}

function writeStored(variant: HistoryVariant, state: PersistedState) {
  try {
    localStorage.setItem(STORAGE_PREFIX + variant, JSON.stringify(state))
  } catch {
    // localStorage can throw (private mode, full disk) — fail silent.
  }
}

export function useHistoryFilters(variant: HistoryVariant, orgId: string) {
  // Hydrate once. `period` defaults to empty so first-time users
  // land on the existing 7d behaviour.
  const initial = (() => {
    const stored = readStored(variant)
    return {
      since: stored?.since ?? '7d',
      from: stored?.from ?? '',
      to: stored?.to ?? '',
      kinds: stored?.kinds ?? DEFAULT_KINDS[variant],
      domain: stored?.domain ?? '',
      q: stored?.q ?? '',
      period: (stored?.period ?? '') as AuditPeriod | '',
    }
  })()

  const [since, setSince] = useState(initial.since)
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [kinds, setKinds] = useState<FeedKind[]>(initial.kinds)
  const [domain, setDomain] = useState(initial.domain)
  const [q, setQ] = useState(initial.q)
  const [period, setPeriod] = useState<AuditPeriod | ''>(initial.period)

  // Persist on every change.
  useEffect(() => {
    writeStored(variant, { since, from, to, kinds, domain, q, period })
  }, [variant, since, from, to, kinds, domain, q, period])

  // Resolve the effective window. Precedence: period > customRange > since.
  const customRange = !!(from && to)
  const periodWindows = period ? periodPair(period) : null

  // Effective request window for the current-period query.
  const currentWindow: { fromISO?: string; toISO?: string; since?: string } = (() => {
    if (periodWindows) {
      return { fromISO: periodWindows.current.startISO, toISO: periodWindows.current.endISO }
    }
    if (customRange) {
      return { fromISO: from, toISO: to }
    }
    return { since }
  })()

  const query = useQuery<HistoryFeedResponse>({
    queryKey: qk.history.feed(orgId, since, from, to, period, kinds.join(','), domain, q),
    queryFn: () => getHistoryFeed(orgId, {
      since: currentWindow.since,
      from: currentWindow.fromISO,
      to:   currentWindow.toISO,
      kinds,
      domain: domain || undefined,
      q: q || undefined,
      limit: 300,
    }),
    staleTime: 30_000,
  })

  // Previous-period query — only fires when `period` is set. The KPI
  // pills show "vs prev" deltas off this; without a period the
  // comparison data is undefined and pills skip the delta line.
  const previousQuery = useQuery<HistoryFeedResponse>({
    queryKey: qk.history.previousFeed(orgId, period, kinds.join(','), domain, q),
    queryFn: () => getHistoryFeed(orgId, {
      from: periodWindows!.previous.startISO,
      to:   periodWindows!.previous.endISO,
      kinds,
      domain: domain || undefined,
      q: q || undefined,
      limit: 300,
    }),
    staleTime: 30_000,
    enabled: !!period && !!periodWindows,
  })

  // Setters that enforce the precedence rules. Selecting a period
  // clears since/from/to so the UI doesn't carry stale state.
  const selectPeriod = (p: AuditPeriod) => {
    setPeriod(p)
    setFrom('')
    setTo('')
  }
  const selectSince = (s: string) => {
    setSince(s)
    setPeriod('')
    setFrom('')
    setTo('')
  }
  const selectCustomRange = (f: string, t: string) => {
    setFrom(f)
    setTo(t)
    setPeriod('')
  }

  const windowLabel = (() => {
    if (periodWindows) return periodWindows.current.label
    if (customRange) return `${from} → ${to}`
    return since
  })()

  return {
    variant,
    since, setSince: selectSince,
    from, to, setFrom, setTo, setCustomRange: selectCustomRange,
    kinds, setKinds,
    domain, setDomain,
    q, setQ,
    period, setPeriod: selectPeriod,
    clearPeriod: () => setPeriod(''),
    customRange,
    windowLabel,
    periodWindows: periodWindows as { current: PeriodWindow; previous: PeriodWindow } | null,
    query,
    previousQuery,
    defaultKinds: DEFAULT_KINDS[variant],
  }
}

/** Map a feed kind to which variant's Timeline owns it. */
export function variantForKind(kind: string): HistoryVariant | null {
  if (kind === 'pentest' || kind === 'asset' || kind === 'sla_breach') return 'audit'
  if (kind === 'scan' || kind === 'alert') return 'code'
  return null
}

/** Section ID per variant + view. Used by cross-pillar nav events. */
export function sectionIdFor(variant: HistoryVariant, view: 'timeline' | 'insights'): string {
  if (variant === 'audit') return view === 'timeline' ? 'history-ctem' : 'history-ctem-insights'
  return view === 'timeline' ? 'history-va' : 'history-va-insights'
}
