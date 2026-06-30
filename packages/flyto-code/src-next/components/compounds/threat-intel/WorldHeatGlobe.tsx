/**
 * WorldHeatGlobe — interactive 3D globe with animated attack arcs.
 *
 * Operator feedback 2026-05-22: "他這還有動畫欸 你設計好醜 就一個
 * 地圖 連3d 都沒有". This replaces the flat react-simple-maps
 * choropleth with a globe rendered via react-globe.gl (three.js
 * under the hood).
 *
 * Visual elements:
 *   - Dark navy ocean surface (texture image, cached)
 *   - Glowing hex bins per attacker-origin country, scaled by count
 *   - Animated arcs from each attacker country → the operator's
 *     HQ (TW default). Arc dash flows, then fades + restarts.
 *   - Pulse rings on the top 10 origin countries
 *   - Auto-rotation, paused on hover/drag
 *
 * Lazy-loaded from SensorMapView so the three.js + globe.gl
 * payload (~270KB gzipped) doesn't ship with the workspace.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import Globe from 'react-globe.gl'
import { Box, Typography, Paper, useTheme } from '@mui/material'
import { t } from '@lib/i18n';
import { RAW } from '@lib/tokens/severity'
import { COUNTRY_CENTROIDS, type CountryCentroid } from './countryCentroids'

// Operator HQ — default Taiwan. If/when we add a per-org HQ
// setting the prop replaces this constant.
const DEFAULT_HQ: CountryCentroid = COUNTRY_CENTROIDS.TW

// Globe textures — three-globe ships several. Operator 2026-05-22:
// "地球會不會太黑了一點" — swapped earth-dark.jpg (nearly all
// black, continents barely visible) for earth-blue-marble.jpg
// (NASA blue marble, vivid ocean + land detail). Topology bump
// stays the same. Both URLs are browser-cached aggressively.
const GLOBE_IMG_DARK = 'https://unpkg.com/three-globe@2.42.4/example/img/earth-blue-marble.jpg'
const GLOBE_IMG_LIGHT = 'https://unpkg.com/three-globe@2.42.4/example/img/earth-day.jpg'
const BUMP_IMG = 'https://unpkg.com/three-globe@2.42.4/example/img/earth-topology.png'

interface Props {
  byCountry: Record<string, number>
  hq?: CountryCentroid
}

interface ArcDatum {
  startLat: number
  startLng: number
  endLat: number
  endLng: number
  color: string
  count: number
  name: string
}

interface HexDatum {
  lat: number
  lng: number
  weight: number
  iso: string
  name: string
  count: number
}

export function WorldHeatGlobe({ byCountry, hq = DEFAULT_HQ }: Props) {
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const globeRef = useRef<any>(null)
  const [size, setSize] = useState({ w: 800, h: 480 })
  const containerRef = useRef<HTMLDivElement>(null)

  // Match the parent container's width so the globe doesn't blow
  // out of the card on small windows.
  useEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current
    const observer = new ResizeObserver(entries => {
      for (const e of entries) {
        const w = e.contentRect.width
        // Maintain a 2:1 aspect inside the card.
        setSize({ w, h: Math.max(360, Math.round(w * 0.55)) })
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Kick off auto-rotation once the globe controls are ready.
  // react-globe.gl exposes the underlying OrbitControls via
  // `globeRef.current.controls()`.
  useEffect(() => {
    if (!globeRef.current) return
    try {
      const controls = globeRef.current.controls()
      if (controls) {
        controls.autoRotate = true
        controls.autoRotateSpeed = 0.4
        controls.enableZoom = true
      }
    } catch { /* ignore — controls may not be initialised yet */ }
  }, [size])

  const max = useMemo(() => Math.max(0, ...Object.values(byCountry)), [byCountry])

  const arcs = useMemo<ArcDatum[]>(() => {
    const out: ArcDatum[] = []
    for (const [iso, count] of Object.entries(byCountry)) {
      const c = COUNTRY_CENTROIDS[iso]
      if (!c) continue
      if (count === 0) continue
      const intensity = max > 0 ? count / max : 0
      // Hue shifts red as intensity climbs — soft amber for low,
      // crimson for top hitters.
      const hue = Math.round(20 - intensity * 20)
      out.push({
        startLat: c.lat,
        startLng: c.lng,
        endLat: hq.lat,
        endLng: hq.lng,
        color: `hsl(${hue}, 95%, ${50 + intensity * 10}%)`,
        count,
        name: c.name,
      })
    }
    // Cap to top 50 origins so the globe stays readable.
    out.sort((a, b) => b.count - a.count)
    return out.slice(0, 50)
  }, [byCountry, hq, max])

  const hexBins = useMemo<HexDatum[]>(() => {
    const out: HexDatum[] = []
    for (const [iso, count] of Object.entries(byCountry)) {
      const c = COUNTRY_CENTROIDS[iso]
      if (!c) continue
      if (count === 0) continue
      out.push({
        lat: c.lat,
        lng: c.lng,
        weight: max > 0 ? count / max : 0,
        iso,
        name: c.name,
        count,
      })
    }
    return out
  }, [byCountry, max])

  // HQ + top-3 rings — pulse animation comes for free via globe.gl's
  // ringsData (it animates a ring expanding + fading on a loop).
  const rings = useMemo(() => {
    const top = [...hexBins].sort((a, b) => b.count - a.count).slice(0, 3)
    return [
      { lat: hq.lat, lng: hq.lng, maxR: 6, propagationSpeed: 3, repeatPeriod: 1800, color: RAW.green500 },
      ...top.map(b => ({
        lat: b.lat, lng: b.lng,
        maxR: 4 + b.weight * 4,
        propagationSpeed: 2,
        repeatPeriod: 1400,
        color: RAW.red500,
      })),
    ]
  }, [hexBins, hq])

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography sx={{
          fontSize: 12, fontWeight: 700, color: 'text.secondary',
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          {t('threatIntel.globeTitle')}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12 }}>
          {arcs.length} {t('threatIntel.activeOrigins')} → {hq.name}
        </Typography>
      </Box>

      <Box
        ref={containerRef}
        sx={{
          width: '100%', minHeight: 360,
          borderRadius: 1, overflow: 'hidden',
          // Theme-aware backdrop — dark mode keeps the deep-space
          // navy that makes the atmosphere halo pop; light mode uses
          // a soft slate gradient so the globe doesn't sit in a
          // jarring black rectangle on a white page.
          background: isDark
            ? 'radial-gradient(ellipse at center, #0b1220 0%, #050810 100%)'
            : 'radial-gradient(ellipse at center, #e2e8f0 0%, #cbd5e1 100%)',
        }}
      >
        <Globe
          ref={globeRef}
          width={size.w}
          height={size.h}
          // Brighter blue-marble texture in dark mode (richer detail
          // than earth-dark.jpg). Earth-day for light mode — same
          // landmass detail but lighter ocean so it matches the
          // slate-gray surround.
          globeImageUrl={isDark ? GLOBE_IMG_DARK : GLOBE_IMG_LIGHT}
          bumpImageUrl={BUMP_IMG}
          backgroundColor="rgba(0,0,0,0)"
          // Atmosphere halo — softer blue in light mode so it doesn't
          // bloom against the lighter slate backdrop.
          atmosphereColor={isDark ? '#3b82f6' : '#60a5fa'}
          atmosphereAltitude={isDark ? 0.18 : 0.14}
          // Hex bins per attacker country, weight = intensity.
          hexBinPointsData={hexBins}
          hexBinPointWeight={(d: object) => (d as HexDatum).weight * 10}
          hexBinResolution={3}
          hexAltitude={(d: object) => 0.005 + (d as { sumWeight: number }).sumWeight * 0.03}
          hexTopColor={(d: object) => {
            const w = (d as { sumWeight: number }).sumWeight ?? 0
            const hue = Math.round(20 - Math.min(1, w) * 20)
            return `hsla(${hue}, 95%, 55%, 0.85)`
          }}
          hexSideColor={() => 'rgba(239,68,68,0.4)'}
          // Animated arcs.
          arcsData={arcs}
          arcStartLat="startLat"
          arcStartLng="startLng"
          arcEndLat="endLat"
          arcEndLng="endLng"
          arcColor="color"
          arcStroke={0.6}
          arcDashLength={0.3}
          arcDashGap={1}
          arcDashAnimateTime={2000}
          arcAltitudeAutoScale={0.35}
          // Pulse rings on HQ + top 3 origins.
          ringsData={rings}
          ringColor="color"
          ringMaxRadius="maxR"
          ringPropagationSpeed="propagationSpeed"
          ringRepeatPeriod="repeatPeriod"
        />
      </Box>

      {/* Legend */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1.5, fontSize: 12, flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: RAW.green500 }} />
          <Typography variant="caption" sx={{ fontSize: 12 }}>{t('threatIntel.hq')}</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: RAW.red500 }} />
          <Typography variant="caption" sx={{ fontSize: 12 }}>{t('threatIntel.attacker')}</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 24, height: 2, bgcolor: '#fbbf24' }} />
          <Typography variant="caption" sx={{ fontSize: 12 }}>{t('threatIntel.attackArc')}</Typography>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12, ml: 'auto' }}>
          {t('threatIntel.dragHint')}
        </Typography>
      </Box>
    </Paper>
  )
}
