import { useState, useMemo } from 'react'
import { ShieldAlert } from 'lucide-react'
import { t } from '@lib/i18n'
import { Pagination } from '@atoms/Pagination'

interface VerifiedRoute {
  method: string; path: string; file: string; status: number; alive: boolean
  response_ms: number; content_type?: string; auth_needed: boolean
  headers?: Record<string, string>; security?: string[]
}

export interface VerifiedData {
  routes: VerifiedRoute[]
  total: number
  alive: number
  dead: number
}

const METHOD_COLORS: Record<string, string> = {
  get: '#22c55e', post: '#3b82f6', put: '#eab308', patch: '#f97316', delete: '#ef4444', head: '#94a3b8', options: '#64748b',
}

export function VerifiedRoutes({ data, pageSize, page, setPage }: {
  data: VerifiedData
  pageSize: number
  page: number
  setPage: (p: number) => void
}) {
  const [expanded, setExpanded] = useState<number | null>(null)
  const [showAlive, setShowAlive] = useState<'all' | 'alive' | 'dead'>('all')

  const filtered = useMemo(() => {
    if (showAlive === 'alive') return data.routes.filter(r => r.alive)
    if (showAlive === 'dead') return data.routes.filter(r => !r.alive)
    return data.routes
  }, [data.routes, showAlive])

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize)

  return (
    <>
      <div className="flex gap-1 mb-2">
        <button className={`px-2 py-1 text-[11px] font-medium rounded ${showAlive === 'all' ? 'bg-white/10 text-text-primary' : 'text-text-tertiary hover:text-text-secondary'}`} onClick={() => { setShowAlive('all'); setPage(1) }}>
          {t('common.all')} {data.total}
        </button>
        <button className={`px-2 py-1 text-[11px] font-medium rounded ${showAlive === 'alive' ? 'bg-white/10 text-text-primary' : 'text-text-tertiary hover:text-text-secondary'}`} onClick={() => { setShowAlive('alive'); setPage(1) }} style={{ color: showAlive === 'alive' ? '#22c55e' : undefined }}>
          {t('dast.alive')} {data.alive}
        </button>
        <button className={`px-2 py-1 text-[11px] font-medium rounded ${showAlive === 'dead' ? 'bg-white/10 text-text-primary' : 'text-text-tertiary hover:text-text-secondary'}`} onClick={() => { setShowAlive('dead'); setPage(1) }} style={{ color: showAlive === 'dead' ? '#ef4444' : undefined }}>
          {t('dast.dead')} {data.dead}
        </button>
      </div>
      <div className="flex flex-col">
        <div className="grid grid-cols-[80px_1fr_60px_60px] gap-2 px-2 py-1.5 text-[11px] font-semibold text-text-tertiary uppercase">
          <div>{t('common.method')}</div>
          <div>{t('common.route')}</div>
          <div>{t('common.status')}</div>
          <div>{t('common.time')}</div>
        </div>
        {paged.map((r, idx) => {
          const globalIdx = (page - 1) * pageSize + idx
          const isOpen = expanded === globalIdx
          const methodColor = METHOD_COLORS[r.method.toLowerCase()] ?? '#94a3b8'
          return (
            <div key={globalIdx}>
              <div
                className={`grid grid-cols-[80px_1fr_60px_60px] gap-2 px-2 py-1.5 text-xs cursor-pointer rounded transition-colors ${!r.alive ? 'opacity-50' : ''} ${isOpen ? 'bg-white/10' : 'hover:bg-white/5'}`}
                onClick={() => setExpanded(isOpen ? null : globalIdx)}
              >
                <div><span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ color: methodColor, background: `${methodColor}18` }}>{r.method}</span></div>
                <div className="font-mono text-text-secondary truncate flex items-center gap-1">
                  {r.path}
                  {r.auth_needed && <span className="px-1 py-0.5 text-[9px] font-semibold rounded bg-yellow-500/15 text-yellow-400" style={{ marginLeft: 6 }}>{t('common.auth')}</span>}
                  {(r.security ?? []).length > 0 && <ShieldAlert size={12} style={{ color: 'var(--color-high)', marginLeft: 4 }} />}
                </div>
                <div>
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${r.alive ? 'text-green-400 bg-green-400/10' : 'text-red-400 bg-red-400/10'}`}>
                    {r.status || 'ERR'}
                  </span>
                </div>
                <div className="text-text-tertiary tabular-nums">{r.response_ms}ms</div>
              </div>
              {isOpen && (
                <div className="mx-2 mb-2 p-3 rounded-lg bg-white/5 border border-white/10">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-[10px] font-medium text-text-tertiary block mb-0.5">{t('common.file')}</span>
                      <span className="font-mono text-xs text-text-secondary">{r.file || '--'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-medium text-text-tertiary block mb-0.5">{t('common.contentType')}</span>
                      <span className="text-xs text-text-secondary">{r.content_type || '--'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-medium text-text-tertiary block mb-0.5">{t('common.auth')}</span>
                      <span style={{ color: r.auth_needed ? '#22c55e' : '#f97316' }} className="text-xs">
                        {r.auth_needed ? t('common.authRequired') : t('common.authNotRequired')}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-medium text-text-tertiary block mb-0.5">{t('common.response')}</span>
                      <span className="text-xs" style={{ color: r.response_ms > 3000 ? '#ef4444' : r.response_ms > 1000 ? '#eab308' : '#22c55e' }}>
                        {r.response_ms}ms
                      </span>
                    </div>
                  </div>
                  {Object.keys(r.headers ?? {}).length > 0 && (
                    <div className="mt-3">
                      <span className="text-[10px] font-medium text-text-tertiary block mb-1">{t('common.headers')}</span>
                      {Object.entries(r.headers!).map(([k, v]) => (
                        <div key={k} className="flex gap-2 text-[11px]">
                          <span className="text-text-tertiary font-medium shrink-0">{k}</span>
                          <span className="text-text-secondary truncate">{v}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {(r.security ?? []).length > 0 && (
                    <div className="mt-3">
                      <span className="text-[10px] font-medium text-text-tertiary block mb-1">{t('common.security')}</span>
                      <div className="flex gap-1 flex-wrap">
                        {r.security!.map((s, i) => (
                          <span key={i} className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-red-400/10 text-red-400">{s}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <Pagination page={page} totalPages={pages} total={filtered.length} pageSize={pageSize} onPageChange={setPage} />
    </>
  )
}
