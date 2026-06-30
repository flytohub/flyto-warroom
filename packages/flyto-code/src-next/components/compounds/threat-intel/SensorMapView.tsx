/**
 * SensorMapView — country-level Sensor Intelligence map.
 *
 * Data source: provider-neutral threat_sensor_observations when the global
 * sensor feed is configured, with the legacy org IoC rollup preserved by the
 * backend's scope contract.
 *
 * Visualisation: ranked country list + horizontal bar chart. The
 * world-map svg is intentionally NOT shipped yet — operator-facing
 * value of "Top 10 countries by attack origin" is the same and
 * doesn't require an extra map library or fragile geojson load.
 */
import { lazy, Suspense, useMemo } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Box, Typography, Paper, Skeleton, Chip, Tooltip, Button } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { Map, AlertTriangle, Info, Compass, HelpCircle, Radar, Database } from 'lucide-react'
import { useOrg } from '@hooks/useOrg'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { getSensorMap, listSensorObservations } from '@lib/engine'
import { RAW } from '@lib/tokens/severity'
import { MONO, BRAND, techGrid, TechEyebrow } from '@atoms/techConsole'
import { QueryError } from '@atoms/QueryError'
import { colors } from '@/styles/designTokens'
import { ThreatIntelRefreshButton } from './ThreatIntelRefreshButton'

// Section accent (EXPOSURE / CTEM) — mirrors the manager view so the
// page reads as one surface across manager↔engineer mode toggles.
const ACCENT = colors.section.exposure

// World heat map — lazy-loaded so the three.js + globe.gl payload
// (~270KB gzipped) doesn't ship with the initial workspace bundle.
// Operators on slow connections see the ranked country bar chart
// immediately while the globe streams in. Upgraded from the
// flat react-simple-maps choropleth on 2026-05-22 — operator:
// "他這還有動畫欸 你設計好醜 就一個地圖 連3d 都沒有".
const WorldHeatGlobe = lazy(() =>
  import('./WorldHeatGlobe').then(m => ({ default: m.WorldHeatGlobe })),
)

const COUNTRY_NAME: Record<string, string> = {
  US: 'United States', CN: 'China', RU: 'Russia', DE: 'Germany',
  GB: 'United Kingdom', FR: 'France', JP: 'Japan', BR: 'Brazil',
  IN: 'India', KR: 'South Korea', NL: 'Netherlands', CA: 'Canada',
  TW: 'Taiwan', SG: 'Singapore', AU: 'Australia', IT: 'Italy',
  ES: 'Spain', UA: 'Ukraine', VN: 'Vietnam', ID: 'Indonesia',
  HK: 'Hong Kong', TR: 'Turkey', PL: 'Poland', IR: 'Iran',
}

const ZZ = 'ZZ'
type SensorMapResponse = {
  by_country: Record<string, number>
  org_by_country?: Record<string, number>
  global_by_country?: Record<string, number>
  scope?: 'org' | 'global' | 'both'
  empty_reason?: '' | 'no_attack_surface' | 'no_iocs'
}

export function SensorMapView() {
  const { org } = useOrg()
  const theme = useTheme()
  const dark = theme.palette.mode === 'dark'
  const orgId = org?.id
  const navigate = useNavigate()

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.threatIntel.sensorMap(orgId),
    queryFn: () => getSensorMap(orgId!) as Promise<SensorMapResponse>,
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  })
  const sensorLedgerQ = useQuery({
    queryKey: qk.threatIntel.sensorObservations(orgId, 6, 0),
    queryFn: () => listSensorObservations(orgId!, { limit: 6, offset: 0 }),
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  })

  const emptyReason = data?.empty_reason ?? ''

  // Split the unknown-origin bucket ("ZZ") out of the validated rows.
  // ZZ is rendered as an explicit "Unknown origin" tile and is NEVER
  // forwarded to the globe (which only plots validated ISO codes).
  const byCountry = data?.by_country ?? {}
  const validatedByCountry = useMemo(() => {
    const out: Record<string, number> = {}
    for (const [code, n] of Object.entries(byCountry)) {
      if (code === ZZ) continue
      out[code] = n
    }
    return out
  }, [byCountry])
  const unknownCount = byCountry[ZZ] ?? 0

  const ranked = useMemo(() => {
    const entries = Object.entries(validatedByCountry)
    entries.sort((a, b) => b[1] - a[1])
    return entries
  }, [validatedByCountry])

  // Total includes the unknown-origin bucket so the count stays honest;
  // only the geo plot/ranked list exclude it.
  const total = ranked.reduce((sum, [, n]) => sum + n, 0) + unknownCount
  const max = ranked[0]?.[1] ?? 0
  const hasAnyObservation = ranked.length > 0 || unknownCount > 0
  const sensorLedgerPanel = (
    <Paper variant="outlined" sx={{
      p: 2.5, mb: 3,
      display: 'flex', flexDirection: 'column', gap: 1.5,
      borderTop: `2px solid ${BRAND}`,
      ...techGrid(dark),
      '& > *': { position: 'relative', zIndex: 1 },
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Database size={15} style={{ color: BRAND }} />
        <Typography sx={{
          fontSize: 12, fontWeight: 700, color: 'text.secondary',
          textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: MONO,
        }}>
          {t('threatIntel.sensorLedger')}
        </Typography>
        <Typography sx={{ fontSize: 12, color: 'text.secondary', ml: 'auto' }}>
          {(sensorLedgerQ.data?.count ?? 0).toLocaleString()} {t('threatIntel.observations')}
        </Typography>
      </Box>
      <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
        {t('threatIntel.sensorLedgerLede')}
      </Typography>
      {sensorLedgerQ.isLoading && <Skeleton variant="rectangular" height={88} />}
      {!sensorLedgerQ.isLoading && (sensorLedgerQ.data?.observations?.length ?? 0) === 0 && (
        <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
          {t('threatIntel.sensorLedgerEmpty')}
        </Typography>
      )}
      {!sensorLedgerQ.isLoading && (sensorLedgerQ.data?.observations?.length ?? 0) > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {sensorLedgerQ.data!.observations.map((row) => (
            <Box
              key={row.id}
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'minmax(220px, 1fr) 130px 120px 120px' },
                gap: 1,
                alignItems: 'center',
                px: 1.25,
                py: 1,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                bgcolor: 'background.paper',
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 700, fontFamily: MONO, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.indicator}
                </Typography>
                <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                  {row.indicator_kind || 'indicator'} · {row.threat_category || t('common.category')}
                </Typography>
              </Box>
              <Typography sx={{ fontSize: 12, color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.source || 'sensor'}
              </Typography>
              <Typography sx={{ fontSize: 12, color: 'text.secondary', fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>
                {t('common.count')}: {Number(row.observed_count ?? 0).toLocaleString()}
              </Typography>
              <Typography sx={{ fontSize: 12, color: 'text.secondary', fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>
                {Math.round(Number(row.confidence ?? 0) * 100)}% · {row.last_seen_at ? new Date(row.last_seen_at).toLocaleDateString() : '—'}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Paper>
  )

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Compact header — was using text-3xl + ml-0.5 mt-1 large
          subtitle which pushed the globe entirely below the fold.
          Tightened to give the hero 3D viz the room it needs. */}
      <Box sx={{
        flexShrink: 0, px: { xs: 2, md: 4 }, pt: { xs: 1.5, md: 2 }, pb: 1.5,
        borderTop: `2px solid ${ACCENT}`,
        borderBottom: '1px solid', borderColor: 'divider',
        ...techGrid(dark),
        '& > *': { position: 'relative', zIndex: 1 },
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography component="h1" sx={{ fontSize: { xs: 20, md: 22 }, fontWeight: 700, lineHeight: 1.15 }}>
            {t('threatIntel.sensorMap')}
          </Typography>
          <TechEyebrow icon={<Radar size={12} />}>{t('hardcoded.sensor.grid.4b3739c3')}</TechEyebrow>
          <Box sx={{ ml: 'auto' }}>
            <ThreatIntelRefreshButton
              source="sensors"
              label={t('threatIntel.refreshSensors')}
            />
          </Box>
        </Box>
        <Typography sx={{ fontSize: 13, mt: 0.5, color: 'text.secondary' }}>
          {/* Fresh key (v2) — the old `sensorMapLede` value is corrupted in the
              locale bundle (a mis-escaped apostrophe truncates it to "…org\").
              The copy is now apostrophe-free so the escaping bug can't recur. */}
          {t('threatIntel.sensorMapLede2')}
        </Typography>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: { xs: 2, md: 4 }, py: 2 }}>
        {isError && <QueryError error={error} onRetry={refetch} label={t('threatIntel.sensorLoadError')} compact />}
        {isLoading && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} variant="rectangular" height={32} />)}
          </Box>
        )}
        {/* Honest empty states. The engine now tells us WHY the map is
            empty via empty_reason, so we never show a blank that reads
            like "no threats" when discovery simply hasn't run. */}
        {!isLoading && !isError && !hasAnyObservation && emptyReason === 'no_attack_surface' && (
          <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
            <Compass size={28} style={{ opacity: 0.6, marginBottom: 12 }} />
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {t('threatIntel.sensorNoSurface')}
            </Typography>
            <Button
              size="small"
              variant="outlined"
              startIcon={<Compass size={14} />}
              onClick={() => orgId && navigate(`/projects/${orgId}/domains`)}
            >
              {t('threatIntel.runDiscovery')}
            </Button>
          </Paper>
        )}
        {!isLoading && !isError && !hasAnyObservation && emptyReason !== 'no_attack_surface' && (
          <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
            <Map size={28} style={{ opacity: 0.5, marginBottom: 12 }} />
            <Typography variant="body2" color="text.secondary">
              {t('threatIntel.sensorEmpty')}
            </Typography>
          </Paper>
        )}
        {!isLoading && !isError && sensorLedgerPanel}
        {!isLoading && !isError && hasAnyObservation && (
          <>
            {/* Compact stat strip — 3 inline metrics in one row at
                ~52px tall instead of the previous 3-card grid that
                ate ~140px of above-the-fold real estate. Operator
                2026-05-23: "上面那一排太大". Globe is the hero now;
                stats are reference data below the title. */}
            <Paper variant="outlined" sx={{
              px: 2.5, py: 1.25, mb: 2,
              display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap',
              borderTop: `2px solid ${BRAND}`,
              ...techGrid(dark),
              '& > *': { position: 'relative', zIndex: 1 },
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <AlertTriangle size={14} style={{ color: RAW.red500 }} />
                <Typography sx={{ fontSize: 12, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: MONO }}>
                  {t('threatIntel.totalObservations')}
                </Typography>
                <Typography sx={{ fontSize: 16, fontWeight: 800, fontFamily: MONO, fontVariantNumeric: 'tabular-nums', ml: 0.5, color: RAW.red500 }}>
                  {total.toLocaleString()}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Map size={14} style={{ color: RAW.blue500 }} />
                <Typography sx={{ fontSize: 12, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: MONO }}>
                  {t('threatIntel.countries')}
                </Typography>
                <Typography sx={{ fontSize: 16, fontWeight: 800, fontFamily: MONO, fontVariantNumeric: 'tabular-nums', ml: 0.5, color: BRAND }}>
                  {ranked.length.toLocaleString()}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ fontSize: 12, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: MONO }}>
                  {t('threatIntel.topHosting')}
                </Typography>
                <Tooltip
                  title={t('threatIntel.geoIpNote')}
                  arrow
                >
                  <Info size={11} style={{ color: 'var(--mui-palette-text-secondary)', cursor: 'help' }} />
                </Tooltip>
                <Typography sx={{ fontSize: 16, fontWeight: 700, ml: 0.5 }}>
                  {COUNTRY_NAME[ranked[0]?.[0]] ?? ranked[0]?.[0] ?? '—'}
                </Typography>
                <Typography sx={{ fontSize: 12, color: 'text.secondary', fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>
                  ({ranked[0]?.[1]?.toLocaleString()})
                </Typography>
              </Box>
            </Paper>

            {/* 3D globe — animated attack arcs from origin countries
                → operator HQ + pulsing rings on top 3 hitters.
                Lazy-loaded; ranked bar chart below always renders
                even if globe fails or three.js can't initialise.
                Hero element — visible above the fold. */}
            <Box sx={{ mb: 3 }}>
              <Suspense fallback={<Skeleton variant="rectangular" height={520} />}>
                {/* Pass ONLY validated ISO codes — the "ZZ" unknown-origin
                    bucket must never be plotted as a real point. */}
                <WorldHeatGlobe byCountry={validatedByCountry} />
              </Suspense>
            </Box>

            {/* Unknown-origin bucket — observations the engine could not
                resolve to a valid ISO country code. Surfaced explicitly
                (never silently dropped, never plotted on the globe). */}
            {unknownCount > 0 && (
              <Paper variant="outlined" sx={{
                px: 2.5, py: 1.25, mb: 3,
                display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap',
                borderStyle: 'dashed',
              }}>
                <HelpCircle size={16} style={{ color: 'var(--mui-palette-text-secondary)' }} />
                <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
                  {t('threatIntel.unknownOrigin')}
                </Typography>
                <Typography sx={{ fontSize: 12, color: 'text.secondary', flex: 1 }}>
                  {t('threatIntel.unknownOriginNote')}
                </Typography>
                <Typography sx={{ fontSize: 16, fontWeight: 700, fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>
                  {unknownCount.toLocaleString()}
                </Typography>
              </Paper>
            )}

            {/* Ranked country bar chart */}
            <Paper variant="outlined" sx={{ p: 2.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 2 }}>
                <Box sx={{ width: 6, height: 6, borderRadius: '2px', bgcolor: BRAND, boxShadow: `0 0 6px ${BRAND}`, flexShrink: 0 }} />
                <Typography sx={{
                  fontSize: 12, fontWeight: 700, color: 'text.secondary',
                  textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: MONO,
                }}>
                  {t('threatIntel.hostingDistribution')}
                </Typography>
                <Tooltip
                  title={t('threatIntel.geoIpNote')}
                  arrow
                >
                  <Info size={11} style={{ color: 'var(--mui-palette-text-secondary)', cursor: 'help' }} />
                </Tooltip>
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {ranked.slice(0, 40).map(([code, count], i) => {
                  const pct = max > 0 ? (count / max) * 100 : 0
                  // Top-3 origins burn hot (red), the rest cool toward the
                  // brand violet — a heat ramp that reads at a glance.
                  const hot = i < 3
                  const barColor = hot ? RAW.red500 : i < 10 ? RAW.orange500 : BRAND
                  return (
                    <Box key={code} sx={{ display: 'grid', gridTemplateColumns: '28px 160px 1fr 84px', gap: 1.5, alignItems: 'center' }}>
                      <Typography sx={{
                        fontFamily: MONO, fontSize: 12, fontWeight: 700,
                        color: hot ? RAW.red500 : 'text.disabled', textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {i + 1}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, overflow: 'hidden' }}>
                        <Chip size="small" label={code} sx={{ fontSize: 12, height: 18, fontFamily: MONO, fontWeight: 700 }} variant="outlined" />
                        <Typography sx={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {COUNTRY_NAME[code] ?? code}
                        </Typography>
                      </Box>
                      <Box sx={{ position: 'relative', height: 16, bgcolor: 'action.hover', borderRadius: 1, overflow: 'hidden' }}>
                        <Box sx={{
                          position: 'absolute', top: 0, left: 0, bottom: 0,
                          width: `${Math.max(pct, 2)}%`,
                          borderRadius: 1,
                          background: `linear-gradient(90deg, ${barColor}99, ${barColor})`,
                          boxShadow: `0 0 8px ${barColor}66`,
                          transition: 'width 300ms cubic-bezier(0.16,1,0.3,1)',
                        }} />
                      </Box>
                      <Typography sx={{ fontSize: 13, fontWeight: 700, fontFamily: MONO, fontVariantNumeric: 'tabular-nums', textAlign: 'right', color: hot ? RAW.red500 : 'text.secondary' }}>
                        {count.toLocaleString()}
                      </Typography>
                    </Box>
                  )
                })}
              </Box>
            </Paper>
          </>
        )}
      </Box>
    </Box>
  )
}
