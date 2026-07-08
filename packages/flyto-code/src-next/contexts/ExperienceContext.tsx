/**
 * ExperienceContext — global "manager vs engineer" experience mode.
 *
 * The workspace serves two audiences from the same data: a manager
 * who wants narrative + KPIs + trend, and an engineer who wants the
 * dense tables + evidence drilldowns that already exist today. Rather
 * than fork routes, every page can render a <ModeView/> picking the
 * right surface for the current mode.
 *
 * Resolution priority (highest wins):
 *   1. URL  `?mode=manager|engineer`
 *   2. localStorage('flyto.experienceMode')
 *   3. role default — derived from capabilities: if the user holds any
 *      "action-ish" capability (e.g. `pentest:run`, `org:delete`) they
 *      are treated as a hands-on operator → 'engineer'; otherwise
 *      'manager'.
 *
 * The resolved mode is persisted to localStorage and reflected back
 * into the URL query (replace, no navigation) so a shared link keeps
 * the chosen mode.
 *
 * Usage:
 *
 *   const { mode, setMode } = useExperience()
 *   <ModeView manager={<XManagerView/>} engineer={<XEngineerView/>}/>
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  type ReactNode,
} from 'react'
import { useLocation, useParams, useSearchParams } from 'react-router-dom'
import { useCapabilities } from '@hooks/useCapabilities'
import { useProjectCapabilities } from '@hooks/useProjectCapabilities'
import { isDualModeWorkspacePath } from '@code/modules'

export type ExperienceMode = 'manager' | 'engineer'

const STORAGE_KEY = 'flyto.experienceMode'

/** Capabilities that mark a hands-on operator. Holding ANY of these
 *  defaults the experience to 'engineer'. Kept intentionally small —
 *  these are write/run actions a viewer-role manager won't have. */
const ENGINEER_SIGNAL_CAPS = [
  'pentest:run',
  'org:delete',
  'autofix:open_pr',
  'scan:trigger',
  'repo:connect',
]

function isMode(v: string | null | undefined): v is ExperienceMode {
  return v === 'manager' || v === 'engineer'
}

function readStored(): ExperienceMode | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return isMode(v) ? v : null
  } catch {
    return null
  }
}

interface ExperienceContextValue {
  mode: ExperienceMode
  setMode: (m: ExperienceMode) => void
  /** True once the role-default has been resolved from capabilities.
   *  Consumers rarely need this; the mode is always usable. */
  resolved: boolean
}

const ExperienceContext = createContext<ExperienceContextValue | null>(null)

export function ExperienceProvider({ children }: { children: ReactNode }) {
  const { orgId } = useParams<{ orgId: string }>()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const cap = useCapabilities(orgId)
  const projectCap = useProjectCapabilities(orgId)
  const base = orgId ? `/projects/${orgId}` : ''
  const subPath = base && location.pathname.startsWith(base)
    ? location.pathname.slice(base.length) || '/dashboard'
    : location.pathname
  const routeSupportsDualMode = isDualModeWorkspacePath(subPath)

  // Role default — only meaningful once capabilities are ready.
  const roleDefault: ExperienceMode = useMemo(() => {
    if (!cap.ready || !projectCap.ready) return 'manager'
    const isEngineer = ENGINEER_SIGNAL_CAPS.some((c) => cap.canDoAction(c) && projectCap.canUseAction(c))
    return isEngineer ? 'engineer' : 'manager'
  }, [cap, projectCap])

  // Initial mode from the two explicit (sticky) sources. We seed state
  // synchronously so the very first render already has the right mode
  // when the user picked one before; role-default fills in later.
  const urlMode = searchParams.get('mode')
  const [mode, setModeState] = useState<ExperienceMode>(() => {
    if (isMode(urlMode)) return urlMode
    return readStored() ?? 'manager'
  })

  // Track whether the user (or URL/storage) has made an explicit
  // choice. If not, we let the role-default win once it resolves.
  const [explicit, setExplicit] = useState<boolean>(
    () => isMode(urlMode) || readStored() != null,
  )

  // Apply role-default once capabilities resolve, but never override an
  // explicit choice.
  useEffect(() => {
    if (!cap.ready || explicit) return
    setModeState(roleDefault)
  }, [cap.ready, explicit, roleDefault])

  // React to a URL change driven externally (e.g. a shared link opened
  // mid-session). URL is the highest-priority source, but only on
  // routes that actually expose a manager/engineer switch.
  useEffect(() => {
    if (!routeSupportsDualMode) return
    if (isMode(urlMode) && urlMode !== mode) {
      setModeState(urlMode)
      setExplicit(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlMode, routeSupportsDualMode])

  const setMode = useCallback(
    (m: ExperienceMode) => {
      setModeState(m)
      setExplicit(true)
      try {
        localStorage.setItem(STORAGE_KEY, m)
      } catch {
        /* private mode / storage disabled — non-fatal */
      }
    },
    [],
  )

  // Reflect the resolved mode into the URL query (replace, no nav) and
  // keep localStorage in sync so the choice persists across reloads.
  //
  // Non-dual-mode pages are always engineer-mode surfaces. They may be
  // reached after a manager page, so normalize the URL there instead of
  // showing a stale "?mode=manager" that the page cannot honor.
  useEffect(() => {
    if (!routeSupportsDualMode) {
      if (searchParams.get('mode') !== 'engineer') {
        const next = new URLSearchParams(searchParams)
        next.set('mode', 'engineer')
        setSearchParams(next, { replace: true })
      }
      return
    }

    try {
      localStorage.setItem(STORAGE_KEY, mode)
    } catch {
      /* non-fatal */
    }
    if (searchParams.get('mode') !== mode) {
      const next = new URLSearchParams(searchParams)
      next.set('mode', mode)
      setSearchParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, routeSupportsDualMode, subPath])

  const effectiveMode: ExperienceMode = routeSupportsDualMode ? mode : 'engineer'

  const value = useMemo<ExperienceContextValue>(
    () => ({ mode: effectiveMode, setMode, resolved: cap.ready }),
    [effectiveMode, setMode, cap.ready],
  )

  return (
    <ExperienceContext.Provider value={value}>
      {children}
    </ExperienceContext.Provider>
  )
}

/** Default for consumers rendered outside a provider (isolated tests,
 *  storybook, or a not-yet-wrapped subtree). 'manager' is the documented
 *  default mode and setMode is an inert no-op, so a component never crashes
 *  for lack of the provider — production always mounts it at the workspace
 *  root and waits for capabilities before resolving operator mode. */
const FALLBACK_EXPERIENCE: ExperienceContextValue = {
  mode: 'manager',
  setMode: () => {},
  resolved: false,
}

export function useExperience(): ExperienceContextValue {
  return useContext(ExperienceContext) ?? FALLBACK_EXPERIENCE
}
