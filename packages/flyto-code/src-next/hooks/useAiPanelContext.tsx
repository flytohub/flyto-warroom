/**
 * useAiPanelContext — React context for the AI co-pilot sidebar.
 *
 * Derives page type, orgId, and repoId from the current route so
 * AiPanel sections can fetch context-aware data without prop drilling.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useLocation, useParams } from 'react-router'
import useMediaQuery from '@mui/material/useMediaQuery'

export type AiPanelPage =
  | 'dashboard' | 'issues' | 'pulse' | 'repos' | 'repo-detail'
  | 'domains' | 'pentest' | 'autofix' | 'warroom' | 'settings' | 'org' | 'unknown'

export interface AiPanelContextValue {
  page: AiPanelPage
  orgId: string | undefined
  repoId: string | undefined
  collapsed: boolean
  togglePanel: () => void
}

const STORAGE_KEY = 'flyto:ai-panel-collapsed'

const AiPanelCtx = createContext<AiPanelContextValue | null>(null)

function derivePage(subPath: string): AiPanelPage {
  if (subPath === '' || subPath === '/') return 'dashboard'
  if (subPath.startsWith('/dashboard')) return 'dashboard'
  if (subPath.startsWith('/issues')) return 'issues'
  if (subPath.startsWith('/pulse')) return 'pulse'
  if (subPath.match(/^\/repos\/[^/]+/)) return 'repo-detail'
  if (subPath.startsWith('/repos')) return 'repos'
  if (subPath.startsWith('/domains')) return 'domains'
  if (subPath.startsWith('/pentest')) return 'pentest'
  if (subPath.startsWith('/autofix')) return 'autofix'
  if (subPath.startsWith('/warroom')) return 'warroom'
  if (subPath.startsWith('/settings')) return 'settings'
  if (subPath.startsWith('/org')) return 'org'
  return 'unknown'
}

function extractRepoId(subPath: string): string | undefined {
  const m = subPath.match(/\/repos\/([^/]+)/)
  return m?.[1]
}

export function AiPanelProvider({ children }: { children: ReactNode }) {
  const { orgId } = useParams<{ orgId: string }>()
  const location = useLocation()
  const isNarrow = useMediaQuery('(max-width:1200px)')

  const [userCollapsed, setUserCollapsed] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === '1' }
    catch { return false }
  })

  const togglePanel = useCallback(() => {
    setUserCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0') } catch { /* private mode */ }
      return next
    })
  }, [])

  const base = `/projects/${orgId}`
  const subPath = location.pathname.replace(base, '')
  const page = derivePage(subPath)

  // The AI co-pilot panel adds value on pages where findings exist
  // (dashboard / pulse / issues / warroom / autofix / repo-detail).
  // It's pure noise on settings, the org chart canvas, and unknown
  // routes — same global "BRIEFING / HOT FINDINGS" payload regardless
  // of what the user is doing. Auto-collapse here. The user can still
  // expand manually; we just don't force them to fight the layout on
  // every navigation.
  const PANEL_NOT_USEFUL: AiPanelPage[] = ['settings', 'org', 'unknown']
  const autoCollapse = PANEL_NOT_USEFUL.includes(page)
  const collapsed = isNarrow || userCollapsed || autoCollapse

  const value = useMemo<AiPanelContextValue>(() => ({
    page,
    orgId,
    repoId: extractRepoId(subPath),
    collapsed,
    togglePanel,
  }), [page, subPath, orgId, collapsed, togglePanel])

  return <AiPanelCtx.Provider value={value}>{children}</AiPanelCtx.Provider>
}

export function useAiPanelContext(): AiPanelContextValue {
  const ctx = useContext(AiPanelCtx)
  if (!ctx) throw new Error('useAiPanelContext must be used within AiPanelProvider')
  return ctx
}
