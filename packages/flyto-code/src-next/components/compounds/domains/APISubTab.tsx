import { useState, useMemo } from 'react'
import { Search, Server } from 'lucide-react'
import { t } from '@lib/i18n'
import { Pagination } from '@atoms/Pagination'
import { type AttackSurfaceAsset, type APIDefinition } from '@lib/engine'
import { VerifiedRoutes, type VerifiedData } from './VerifiedRoutes'

const ROUTE_PAGE = 15
const EP_PAGE = 10

const METHOD_COLORS: Record<string, string> = {
  get: '#22c55e', post: '#3b82f6', put: '#eab308', patch: '#f97316', delete: '#ef4444', head: '#94a3b8', options: '#64748b',
}

export function APISubTab({ codeAPIs, httpAssets, allAssets, page, setPage }: {
  codeAPIs: APIDefinition[]
  httpAssets: AttackSurfaceAsset[]
  allAssets: AttackSurfaceAsset[]
  page: number
  setPage: (p: number) => void
}) {
  // When `codeAPIs` is empty (e.g. domain detail page — no real
  // domain↔API mapping yet, so caller passes []), suppress the
  // Code-routes tab and default to whichever sub-tab actually has
  // domain-scoped data. Without this the user sees "Code routes (0)"
  // permanently — visual noise that suggests broken state.
  const showRoutesTab = codeAPIs.length > 0
  const [apiTab, setApiTab] = useState<'routes' | 'verified' | 'endpoints'>(
    showRoutesTab ? 'routes' : (httpAssets.length > 0 ? 'endpoints' : 'verified'),
  )
  const [expandedRoute, setExpandedRoute] = useState<number | null>(null)
  const [methodFilter, setMethodFilter] = useState('')
  const [apiSearch, setApiSearch] = useState('')

  const verifiedData = useMemo<VerifiedData | null>(() => {
    const asset = allAssets.find(a => a.asset_type === 'api_verify')
    if (!asset) return null
    try { return JSON.parse(asset.metadata) as VerifiedData } catch { return null }
  }, [allAssets])

  const filteredRoutes = useMemo(() => {
    let list = codeAPIs
    if (methodFilter) list = list.filter(a => (a.method || 'GET') === methodFilter)
    if (apiSearch) {
      const q = apiSearch.toLowerCase()
      list = list.filter(a => a.path.toLowerCase().includes(q) || (a.file ?? '').toLowerCase().includes(q))
    }
    return list
  }, [codeAPIs, methodFilter, apiSearch])

  const methods = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const a of codeAPIs) { counts[a.method || 'GET'] = (counts[a.method || 'GET'] || 0) + 1 }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [codeAPIs])

  const routePages = Math.max(1, Math.ceil(filteredRoutes.length / ROUTE_PAGE))
  const pagedRoutes = filteredRoutes.slice((page - 1) * ROUTE_PAGE, page * ROUTE_PAGE)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Fixed top: sub tabs + filters ── */}
      <div className="flex-shrink-0 flex flex-col gap-2 p-3 pb-0">
        {/* Sub tabs */}
        <div className="flex gap-1 border-b border-white/10 pb-1">
          {showRoutesTab && (
            <button className={`px-3 py-1.5 text-xs font-medium rounded-t transition-colors ${apiTab === 'routes' ? 'bg-white/10 text-text-primary' : 'text-text-tertiary hover:text-text-secondary'}`} onClick={() => { setApiTab('routes'); setPage(1) }}>
              {t('dast.codeRoutes')}<span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-white/10 text-[11px]">{codeAPIs.length}</span>
            </button>
          )}
          {verifiedData && (
            <button className={`px-3 py-1.5 text-xs font-medium rounded-t transition-colors ${apiTab === 'verified' ? 'bg-white/10 text-text-primary' : 'text-text-tertiary hover:text-text-secondary'}`} onClick={() => { setApiTab('verified'); setPage(1) }}>
              {t('dast.verified')}<span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-white/10 text-[11px]">{verifiedData.alive}/{verifiedData.total}</span>
            </button>
          )}
          <button className={`px-3 py-1.5 text-xs font-medium rounded-t transition-colors ${apiTab === 'endpoints' ? 'bg-white/10 text-text-primary' : 'text-text-tertiary hover:text-text-secondary'}`} onClick={() => { setApiTab('endpoints'); setPage(1) }}>
            {t('dast.httpEndpoints')}<span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-white/10 text-[11px]">{httpAssets.length}</span>
          </button>
        </div>

        {/* Filters (routes only) */}
        {apiTab === 'routes' && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1">
              <button className={`px-2 py-1 text-[12px] font-medium rounded ${!methodFilter ? 'bg-white/10 text-text-primary' : 'text-text-tertiary hover:text-text-secondary'}`} onClick={() => { setMethodFilter(''); setPage(1) }}>{t('common.all')} {codeAPIs.length}</button>
              {methods.map(([m, count]) => (
                <button key={m} className={`px-2 py-1 text-[12px] font-medium rounded ${methodFilter === m ? 'bg-white/10 text-text-primary' : 'text-text-tertiary hover:text-text-secondary'}`} style={{ color: methodFilter === m ? METHOD_COLORS[m.toLowerCase()] : undefined }} onClick={() => { setMethodFilter(m); setPage(1) }}>{m} {count}</button>
              ))}
            </div>
            <div className="relative flex-1 min-w-[180px]">
              <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <input className="w-full pl-7 pr-2 py-1.5 text-xs bg-white/5 border border-white/10 rounded-md text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-white/20" placeholder={t('common.searchRoutes')} value={apiSearch} onChange={(e) => { setApiSearch(e.target.value); setPage(1) }} />
            </div>
          </div>
        )}
      </div>

      {/* ── Scrollable list area ── */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3">
        {/* Routes */}
        {apiTab === 'routes' && (
          <div className="flex flex-col">
            <div className="grid grid-cols-[80px_1fr_1fr] gap-2 px-2 py-1.5 text-[12px] font-semibold text-text-tertiary uppercase sticky top-0 bg-[var(--color-surface)] z-10"><div>{t('common.method')}</div><div>{t('common.route')}</div><div>{t('common.file')}</div></div>
            {pagedRoutes.map((api, idx) => {
              const gIdx = (page - 1) * ROUTE_PAGE + idx
              const isOpen = expandedRoute === gIdx
              const methodColor = METHOD_COLORS[(api.method || 'GET').toLowerCase()] ?? '#94a3b8'
              return (
                <div key={idx}>
                  <div
                    className={`grid grid-cols-[80px_1fr_1fr] gap-2 px-2 py-1.5 text-xs cursor-pointer rounded transition-colors ${isOpen ? 'bg-white/10' : 'hover:bg-white/5'}`}
                    onClick={() => setExpandedRoute(isOpen ? null : gIdx)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedRoute(isOpen ? null : gIdx) } }}
                    role="button"
                    tabIndex={0}
                    aria-expanded={isOpen}
                    aria-label={`${api.method || 'GET'} ${api.path}`}
                  >
                    <div><span className="px-1.5 py-0.5 rounded text-[11px] font-bold" style={{ color: methodColor, background: `${methodColor}18` }}>{api.method || 'GET'}</span></div>
                    <div className="font-mono text-text-secondary truncate">{api.path}</div>
                    <div className="text-text-tertiary truncate">{api.file ?? ''}</div>
                  </div>
                  {isOpen && (
                    <div className="mx-2 mb-2 p-3 rounded-lg bg-white/5 border border-white/10">
                      <div className="grid grid-cols-2 gap-3">
                        <div><span className="text-[11px] font-medium text-text-tertiary block mb-0.5">{t('common.method')}</span><span className="px-1.5 py-0.5 rounded text-[11px] font-bold" style={{ color: methodColor, background: `${methodColor}18` }}>{api.method || 'GET'}</span></div>
                        <div><span className="text-[11px] font-medium text-text-tertiary block mb-0.5">{t('common.route')}</span><span className="font-mono text-xs text-text-secondary">{api.path}</span></div>
                        <div><span className="text-[11px] font-medium text-text-tertiary block mb-0.5">{t('common.file')}</span><span className="font-mono text-xs text-text-secondary">{api.file || '--'}</span></div>
                        <div><span className="text-[11px] font-medium text-text-tertiary block mb-0.5">{t('common.status')}</span><span className="text-text-tertiary text-xs">{t('dast.notVerified')}</span></div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Verified */}
        {apiTab === 'verified' && verifiedData && <VerifiedRoutes data={verifiedData} pageSize={ROUTE_PAGE} page={page} setPage={setPage} />}

        {/* Endpoints */}
        {apiTab === 'endpoints' && (() => {
          const pagedEP = httpAssets.slice((page - 1) * EP_PAGE, page * EP_PAGE)
          return (
            <div className="flex flex-col gap-2">
              {pagedEP.map((a) => {
                let meta: { headers?: Record<string, string>; status?: number } = {}
                try { meta = JSON.parse(a.metadata) } catch { /* invalid JSON */ }
                return (
                  <div key={a.id} className="rounded-lg border border-white/10 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${(meta.status ?? 0) < 400 ? 'text-green-400 bg-green-400/10' : 'text-red-400 bg-red-400/10'}`}>{meta.status}</span>
                      <span className="text-xs text-text-secondary font-mono truncate">{a.value}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {Object.entries(meta.headers ?? {}).map(([k, v]) => (
                        <div key={k} className="flex gap-2 text-[12px]"><span className="text-text-tertiary font-medium shrink-0">{k}</span><span className="text-text-secondary truncate">{v}</span></div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })()}

        {codeAPIs.length === 0 && httpAssets.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-text-tertiary">
            <Server size={40} className="mb-3 opacity-20" />
            <div className="text-sm">{t('dast.noApiEndpoints')}</div>
          </div>
        )}
      </div>

      {/* ── Fixed bottom: pagination ── */}
      <div className="flex-shrink-0 border-t border-white/10 px-3 py-1.5">
        {apiTab === 'routes' && (
          <Pagination page={page} totalPages={routePages} total={filteredRoutes.length} pageSize={ROUTE_PAGE} onPageChange={setPage} />
        )}
        {apiTab === 'endpoints' && (
          <Pagination page={page} totalPages={Math.max(1, Math.ceil(httpAssets.length / EP_PAGE))} total={httpAssets.length} pageSize={EP_PAGE} onPageChange={setPage} />
        )}
        {apiTab === 'verified' && verifiedData && (
          <Pagination page={page} totalPages={Math.max(1, Math.ceil(verifiedData.total / ROUTE_PAGE))} total={verifiedData.total} pageSize={ROUTE_PAGE} onPageChange={setPage} />
        )}
      </div>
    </div>
  )
}
