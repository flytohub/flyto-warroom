/**
 * FieldMapCanvas — the visual "smart mapping" surface for the BYO wizard.
 *
 * Two nodes, source → kernel, joined by typed bezier links — the same node-to-
 * node visual language as the custom-report Data Designer (we reuse the shared
 * `bezierPath` geometry). Left node = the fields the
 * probe / sample discovered; right node = the kernel target fields. Click a
 * source field to arm it, then click a kernel slot to connect; click a mapped
 * slot's ✕ to clear.
 *
 * Edges are measured from the live DOM (port element rects) every layout pass,
 * so they stay pixel-correct no matter how many fields scroll past — no
 * hardcoded row math, unlike the fixed-geometry JoinCanvas.
 */
import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { alpha, useTheme } from '@mui/material/styles'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import { Database, X, Sparkles, Check } from 'lucide-react'
import { t } from '@lib/i18n';
import { bezierPath } from '@compounds/_shared/joinGeometry'

export interface MapField { id: string; label: string; required?: boolean }
export interface SourceField { relative: string; type: string }

export interface FieldMapCanvasProps {
  sourceFields: SourceField[]
  kernelFields: MapField[]
  /** kernelId → source relative path. */
  mapping: Record<string, string>
  onConnect: (kernelId: string, sourceRelative: string) => void
  onDisconnect: (kernelId: string) => void
  /** Optional one-click auto-map (smart suggestions). */
  onAutoMap?: () => void
}

const TYPE_COLOR: Record<string, string> = {
  string: '#3b82f6', number: '#22c55e', boolean: '#a855f7',
  bool: '#a855f7', object: '#f97316', array: '#f97316', null: '#94a3b8',
}
const colorFor = (t: string) => TYPE_COLOR[t] ?? '#7c3aed'

interface Edge { id: string; x1: number; y1: number; x2: number; y2: number; color: string }

export function FieldMapCanvas({
  sourceFields, kernelFields, mapping, onConnect, onDisconnect, onAutoMap,
}: FieldMapCanvasProps) {
  const theme = useTheme()
  const brand = theme.palette.primary.main
  const containerRef = useRef<HTMLDivElement>(null)
  const ports = useRef<Map<string, HTMLElement>>(new Map())
  const [armed, setArmed] = useState<string | null>(null)
  const [edges, setEdges] = useState<Edge[]>([])
  const [, setTick] = useState(0)
  const bump = useCallback(() => setTick((t) => t + 1), [])

  const setPort = useCallback((key: string, el: HTMLElement | null) => {
    if (el) ports.current.set(key, el)
    else ports.current.delete(key)
  }, [])

  const typeOf = useCallback(
    (rel: string) => sourceFields.find((f) => f.relative === rel)?.type ?? 'string',
    [sourceFields],
  )

  // Measure edges from live port rects each layout pass.
  useLayoutEffect(() => {
    const cont = containerRef.current?.getBoundingClientRect()
    if (!cont) return
    const next: Edge[] = []
    for (const kf of kernelFields) {
      const rel = mapping[kf.id]
      if (!rel) continue
      const s = ports.current.get(`s:${rel}`)?.getBoundingClientRect()
      const k = ports.current.get(`k:${kf.id}`)?.getBoundingClientRect()
      if (!s || !k) continue
      next.push({
        id: kf.id,
        x1: s.left + s.width / 2 - cont.left, y1: s.top + s.height / 2 - cont.top,
        x2: k.left + k.width / 2 - cont.left, y2: k.top + k.height / 2 - cont.top,
        color: colorFor(typeOf(rel)),
      })
    }
    setEdges(next)
  }, [mapping, sourceFields, kernelFields, typeOf])

  // Recompute on container resize.
  useEffect(() => {
    const el = containerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => bump())
    ro.observe(el)
    return () => ro.disconnect()
  }, [bump])

  const pickSource = (rel: string) => setArmed((cur) => (cur === rel ? null : rel))
  const pickKernel = (kid: string) => {
    if (armed) { onConnect(kid, armed); setArmed(null) }
    else if (mapping[kid]) onDisconnect(kid)
  }

  const usedSources = new Set(Object.values(mapping))

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="caption" color="text.secondary" fontWeight={800} sx={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {t('integrations.smartMapping')}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mr: 'auto' }}>
          {armed
            ? t('integrations.mapPickTarget')
            : t('integrations.mapPickSource')}
        </Typography>
        {onAutoMap && (
          <Box component="button" onClick={onAutoMap}
            sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', border: '1px solid', borderColor: 'divider', bgcolor: 'transparent', color: 'primary.main', fontWeight: 700, fontSize: 12, borderRadius: 2, px: 1, py: 0.5, '&:hover': { borderColor: 'primary.main' } }}>
            <Sparkles size={13} /> {t('integrations.autoMap')}
          </Box>
        )}
      </Box>

      <Box
        ref={containerRef}
        sx={{
          position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6,
          p: 1.5, borderRadius: 2.5, border: '1px solid', borderColor: 'divider',
          bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(0,0,0,0.18)' : '#f8fafc'),
        }}
      >
        {/* Bezier edges overlay */}
        <Box component="svg" sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
          {edges.map((e) => (
            <g key={e.id}>
              <path d={bezierPath(e.x1, e.y1, e.x2, e.y2)} stroke={e.color} strokeWidth={4} fill="none" opacity={0.1} />
              <path d={bezierPath(e.x1, e.y1, e.x2, e.y2)} stroke={e.color} strokeWidth={1.75} fill="none" />
            </g>
          ))}
        </Box>

        {/* Source node */}
        <Box sx={{ minWidth: 0, position: 'relative', zIndex: 1 }}>
          <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ px: 0.5 }}>
            {t('integrations.sourceFields')} · {sourceFields.length}
          </Typography>
          <Box sx={{ mt: 0.5, maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0.5, pr: 0.5 }}
            onScroll={bump}>
            {sourceFields.map((f) => {
              const on = armed === f.relative
              const used = usedSources.has(f.relative)
              return (
                <Box key={f.relative} onClick={() => pickSource(f.relative)}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 0.75, cursor: 'pointer', userSelect: 'none',
                    px: 1, py: 0.6, borderRadius: 1.5, border: '1px solid',
                    borderColor: on ? 'primary.main' : 'divider', bgcolor: (t) => (on ? alpha(t.palette.primary.main, 0.1) : t.palette.background.paper),
                    opacity: used && !on ? 0.55 : 1, '&:hover': { borderColor: 'primary.main' },
                  }}>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 600, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {f.relative}
                  </Typography>
                  <Chip size="small" label={f.type} sx={{ height: 16, fontSize: 12, bgcolor: alpha(colorFor(f.type), 0.16), color: colorFor(f.type) }} />
                  {/* right port */}
                  <Box ref={(el: HTMLElement | null) => setPort(`s:${f.relative}`, el)}
                    sx={{ width: 9, height: 9, borderRadius: '50%', flexShrink: 0, border: '2px solid', borderColor: colorFor(f.type), bgcolor: used ? colorFor(f.type) : 'background.paper', boxShadow: on ? `0 0 7px ${colorFor(f.type)}` : 'none' }} />
                </Box>
              )
            })}
            {sourceFields.length === 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ p: 1, fontStyle: 'italic' }}>
                {t('integrations.noFieldsYet')}
              </Typography>
            )}
          </Box>
        </Box>

        {/* Kernel node */}
        <Box sx={{ minWidth: 0, position: 'relative', zIndex: 1 }}>
          <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ px: 0.5 }}>
            {t('integrations.kernelFields')}
          </Typography>
          <Box sx={{ mt: 0.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {kernelFields.map((kf) => {
              const rel = mapping[kf.id]
              const active = !!rel
              const ready = !!armed
              return (
                <Box key={kf.id} onClick={() => pickKernel(kf.id)}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 0.75, cursor: 'pointer', userSelect: 'none',
                    px: 1, py: 0.6, borderRadius: 1.5, border: '1px solid',
                    borderColor: (t) => (active ? t.palette.primary.main : ready ? alpha(t.palette.primary.main, 0.5) : t.palette.divider),
                    bgcolor: (t) => (active ? alpha(t.palette.primary.main, 0.08) : t.palette.background.paper),
                    ...(ready ? { animation: 'pulseBorder 1.4s ease-in-out infinite' } : {}),
                    '&:hover': { borderColor: 'primary.main' },
                    '@keyframes pulseBorder': { '0%,100%': { borderColor: (t) => alpha(t.palette.primary.main, 0.4) }, '50%': { borderColor: (t) => alpha(t.palette.primary.main, 0.9) } },
                  }}>
                  {/* left port */}
                  <Box ref={(el: HTMLElement | null) => setPort(`k:${kf.id}`, el)}
                    sx={{ width: 9, height: 9, borderRadius: '50%', flexShrink: 0, border: '2px solid', borderColor: active ? 'primary.main' : 'divider', bgcolor: active ? 'primary.main' : 'background.paper' }} />
                  <Database size={13} style={{ color: brand, flexShrink: 0 }} />
                  <Typography variant="caption" fontWeight={700} sx={{ minWidth: 0 }}>{kf.label}</Typography>
                  {kf.required && <Typography variant="caption" color="error.main">*</Typography>}
                  <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                    {active ? (
                      <>
                        <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 110 }}>{rel}</Typography>
                        <Box component="span" onClick={(e) => { e.stopPropagation(); onDisconnect(kf.id) }}
                          sx={{ display: 'inline-flex', cursor: 'pointer', color: 'text.secondary', '&:hover': { color: 'error.main' } }}>
                          <X size={13} />
                        </Box>
                      </>
                    ) : ready ? (
                      <Check size={13} style={{ color: brand, opacity: 0.7 }} />
                    ) : (
                      <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>{t('integrations.unmappedShort')}</Typography>
                    )}
                  </Box>
                </Box>
              )
            })}
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
