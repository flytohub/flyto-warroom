// Audit-cycle period math — calendar-aligned start/end for the four
// cadences an auditor actually reports against. All boundaries are
// inclusive at start (00:00:00.000) and inclusive at end of the last
// day (23:59:59.999), matching what the history-feed endpoint
// expects from a `?to=YYYY-MM-DD` query (which the backend already
// bumps to end-of-day).
//
// Weeks are ISO-style: Monday → Sunday. That's the convention every
// enterprise compliance tool uses; resist the temptation to localise
// to Sunday-start because the auditor's spreadsheet is on Mon-Sun.
//
// Used by HistoryFeedView's audit-cycle selector + PDF report
// generation (weekly / monthly / quarterly / annual templates).

export type AuditPeriod = 'week' | 'month' | 'quarter' | 'year'

export interface PeriodWindow {
  start: Date
  end: Date
  /** Human label for the toolbar + PDF header. */
  label: string
  /** YYYY-MM-DD form for the engine's `from` / `to` query params. */
  startISO: string
  endISO: string
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function setStartOfDay(d: Date): Date {
  d.setHours(0, 0, 0, 0)
  return d
}

function setEndOfDay(d: Date): Date {
  d.setHours(23, 59, 59, 999)
  return d
}

/** ISO week start — Monday at 00:00 of the week containing `ref`. */
function startOfISOWeek(ref: Date): Date {
  const d = new Date(ref)
  const day = (d.getDay() + 6) % 7 // 0=Mon, 6=Sun
  d.setDate(d.getDate() - day)
  return setStartOfDay(d)
}

function quarterIndex(monthZeroBased: number): number {
  return Math.floor(monthZeroBased / 3) // 0=Q1, 1=Q2, 2=Q3, 3=Q4
}

function startOfQuarter(ref: Date): Date {
  const q = quarterIndex(ref.getMonth())
  return setStartOfDay(new Date(ref.getFullYear(), q * 3, 1))
}

export function periodWindow(period: AuditPeriod, ref: Date = new Date()): PeriodWindow {
  let start: Date
  let end: Date
  let label: string

  switch (period) {
    case 'week': {
      start = startOfISOWeek(ref)
      end = new Date(start)
      end.setDate(start.getDate() + 6)
      setEndOfDay(end)
      label = `Week of ${isoDate(start)}`
      break
    }
    case 'month': {
      start = setStartOfDay(new Date(ref.getFullYear(), ref.getMonth(), 1))
      end = setEndOfDay(new Date(ref.getFullYear(), ref.getMonth() + 1, 0))
      label = start.toLocaleString('en-US', { month: 'long', year: 'numeric' })
      break
    }
    case 'quarter': {
      start = startOfQuarter(ref)
      const qEnd = new Date(start)
      qEnd.setMonth(qEnd.getMonth() + 3)
      qEnd.setDate(0) // last day of last quarter month
      end = setEndOfDay(qEnd)
      const q = quarterIndex(start.getMonth()) + 1
      label = `Q${q} ${start.getFullYear()}`
      break
    }
    case 'year': {
      start = setStartOfDay(new Date(ref.getFullYear(), 0, 1))
      end = setEndOfDay(new Date(ref.getFullYear(), 11, 31))
      label = String(start.getFullYear())
      break
    }
  }

  return {
    start, end, label,
    startISO: isoDate(start),
    endISO: isoDate(end),
  }
}

/** The period immediately before the current one — last week, last
 *  month, last quarter, last year. Used for "delta vs prev" KPIs. */
export function previousPeriodWindow(period: AuditPeriod, ref: Date = new Date()): PeriodWindow {
  const current = periodWindow(period, ref)
  // Step back one period unit by anchoring to "the day before current.start".
  const prevRef = new Date(current.start)
  prevRef.setDate(prevRef.getDate() - 1)
  return periodWindow(period, prevRef)
}

/** Convenience — fetch both windows for comparison rendering. */
export function periodPair(period: AuditPeriod, ref: Date = new Date()) {
  return {
    current: periodWindow(period, ref),
    previous: previousPeriodWindow(period, ref),
  }
}
