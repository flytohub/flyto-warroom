/**
 * DomainDetail — action-oriented domain intelligence view.
 *
 * Design principle: user opens this to see WHAT's broken and HOW to fix it.
 * Header → compact signal strip → tabs (content maximized).
 */

import { useMemo, useState, type SyntheticEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Chip from '@mui/material/Chip'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import { ArrowLeft, ExternalLink, Trash2, Shield, Globe, Network, Code2, Zap, Gauge, AlertTriangle, CheckCircle, ShieldCheck, Layers, RefreshCw } from 'lucide-react'
import { UnifiedAssetDrawer } from '@compounds/unified-asset/UnifiedAssetDrawer'
import CircularProgress from '@mui/material/CircularProgress'
import { t } from '@lib/i18n';
import { getOrgAPIDefinitions, getEnrichedAttackSurface, type AttackSurfaceAsset } from '@lib/engine'
import { extractHostFromAssetValue } from '@compounds/_shared/externalPosture'
import { flattenAttackSurfaceAssets } from './buildDomainRows'
import { DomainAssetTierPicker } from '@atoms/DomainAssetTierPicker'
import { DomainComplianceScopePicker } from '@atoms/DomainComplianceScopePicker'
import { DomainBUAssignChip } from '@atoms/DomainBUAssignChip'
import { useDiscoveryStatus } from '@hooks/useDiscoveryStatus'
import { type DomainRow } from './types'
import { SecurityTab } from './domain_detail/SecurityTab'
import { NetworkTab } from './domain_detail/NetworkTab'
import { IntelligenceTab } from './domain_detail/IntelligenceTab'
import { APISubTab } from './APISubTab'
import { AIAnalysisTab } from './domain_detail/AIAnalysisTab'
import { PageSpeedTab } from './domain_detail/PageSpeedTab'
import { EvidenceTab } from './domain_detail/EvidenceTab'
import { gradeColor } from './domain_detail/_shared'
import { ErrorBoundary } from '@atoms/ErrorBoundary'
import { DataBoundary } from '@atoms/DataBoundary'
import { qk } from '@lib/queryKeys'
import { querySucceeded, queryUnresolved } from '@lib/queryState'

const DETAIL_TABS = ['security', 'network', 'intelligence', 'api', 'pagespeed', 'evidence', 'ai'] as const
type DetailTab = typeof DETAIL_TABS[number]

const TAB_ICONS = {
  security: Shield,
  network: Globe,
  intelligence: Network,
  api: Code2,
  pagespeed: Gauge,
  evidence: ShieldCheck,
  ai: Zap,
}

const TAB_LABELS: Record<DetailTab, () => string> = {
  security: () => t('dast.tab.security'),
  network: () => t('dast.tab.network'),
  intelligence: () => t('dast.tab.intelligence'),
  api: () => t('dast.tab.api'),
  pagespeed: () => t('dast.tab.pagespeed'),
  evidence: () => t('dast.tab.evidence'),
  ai: () => t('dast.tab.ai'),
}

// Metadata is a heterogeneous JSON blob whose shape varies by
// asset_type (SSL has days_left, ports has open_ports, etc.). The
// callers (buildSSLTile / buildPortsTile / …) know what to expect
// for their type. Keeping `any` here is deliberate — tightening to
// unknown forced ~6 type guards per consumer for no real win since
// the JSON is opaque at this layer anyway.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseMeta(asset?: { metadata: string }): Record<string, any> {
  if (!asset?.metadata) return {}
  try { return JSON.parse(asset.metadata) } catch { return {} }
}

type Tone = 'good' | 'warn' | 'bad' | 'muted'
const TONE_COLOR: Record<Tone, string> = {
  good: '#22c55e', warn: '#eab308', bad: '#ef4444', muted: '#64748b',
}

export function DomainDetail({ row, onBack, onDelete, orgId }: {
  row: DomainRow
  onBack: () => void
  onDelete: (id: string) => void
  orgId: string
}) {
  const [detailTab, setDetailTab] = useState<DetailTab>('security')
  const [unifiedOpen, setUnifiedOpen] = useState(false)
  const { isScanning } = useDiscoveryStatus()
  // M1: a project-less footprint domain now scans under a discovery whose
  // project_id == the kernel resource_id, so the live "Scanning…" state
  // keys on row.resourceId when there's no project.
  const projectScanning = row.project
    ? isScanning(row.project.id)
    : row.resourceId ? isScanning(row.resourceId) : false

  // Domain-scoped API list — backend joins connected_repos.homepage
  // against the current domain so this surface only shows routes
  // that actually ship here. Org-wide noise problem (every repo's
  // routes under every domain) was fixed by adding `?domain=` to
  // the /api-definitions endpoint on 2026-05-17.
  const apiEnabled = !!orgId && !!row.domain && detailTab === 'api'
  const apiQ = useQuery({
    queryKey: qk.repos.apiDefinitionsForDomain(orgId, row.domain),
    queryFn: () => getOrgAPIDefinitions(orgId, { domain: row.domain }),
    enabled: apiEnabled,
    staleTime: 60_000,
  })

  // Per-domain raw assets (SSL/DNS/port/headers/…). The Domains LIST no
  // longer fetches the org-wide attack-surface payload (it derives rows
  // from external-posture/kernel alone — single source, no flicker), so
  // a row opened from the confirmed list arrives with `assets` empty.
  // Hydrate them here, lazily, only when a detail is actually open:
  // fetch the (cached, org-shared) confirmed attack-surface once and
  // slice it to this host. When the list DID attach assets — candidates
  // mode, where the firehose is already loaded — reuse them as-is and
  // skip the fetch entirely.
  const needsHydration = row.assets.length === 0
  const surfaceEnabled = !!orgId && needsHydration
  const surfaceQ = useQuery({
    queryKey: qk.attackSurfaceVariant(orgId, 'confirmed'),
    queryFn: () => getEnrichedAttackSurface(orgId, false),
    enabled: surfaceEnabled,
    staleTime: 60_000,
  })
  const surfaceReady = !needsHydration || querySucceeded(surfaceQ, surfaceEnabled)
  const assets = useMemo(() => {
    if (!needsHydration) return row.assets
    if (!surfaceReady) return []
    const all = flattenAttackSurfaceAssets(surfaceQ.data?.assets ?? [])
    return all.filter(a => extractHostFromAssetValue(a.value) === row.domain)
  }, [needsHydration, row.assets, surfaceQ.data, surfaceReady, row.domain])
  // Row carrying the hydrated assets — passed to tabs that read
  // `row.assets` directly (NetworkTab dns_record/subdomain, IntelligenceTab
  // https endpoint) so they work whether assets came from the list or the
  // lazy fetch.
  const detailRow = useMemo(
    () => (needsHydration ? { ...row, assets } : row),
    [needsHydration, row, assets],
  )

  // Extract assets by type
  const sslAsset = assets.find(a => a.asset_type === 'ssl_cert')
  const dnsSecAsset = assets.find(a => a.asset_type === 'dns_security')
  const emailAsset = assets.find(a => a.asset_type === 'email_security')
  const httpAssets = assets.filter(a => a.asset_type === 'http_endpoint')
  const portAsset = assets.find(a => a.asset_type === 'port_scan')
  const wafAsset = assets.find(a => a.asset_type === 'waf')
  const techAsset = assets.find(a => a.asset_type === 'tech_stack')
  const whoisAsset = assets.find(a => a.asset_type === 'whois')
  const ipAsset = assets.find(a => a.asset_type === 'ip_intel')
  const sensitiveAsset = assets.find(a => a.asset_type === 'sensitive_files')
  const takeoverAsset = assets.find(a => a.asset_type === 'subdomain_takeover')

  // Per-check visualisation tiles (SSL days left, header presence,
  // email DKIM/SPF/DMARC, open ports, WAF, files). These are pure
  // displays of raw signals — they are NOT scored on the frontend.
  // See [[backend-score-canonical]].
  const scores = useMemo(() => buildScorecard(row, sslAsset, dnsSecAsset, httpAssets, portAsset, wafAsset, sensitiveAsset), [row, sslAsset, dnsSecAsset, httpAssets, portAsset, wafAsset, sensitiveAsset])

  // Headline grade/score: backend ONLY. Frontend used to recompute
  // and produced D 50 while Scoring Overview said A 89 — never again.
  // When backend hasn't returned a score yet (just-added domain,
  // first scan in flight) we render the "Pending" chip instead of
  // faking a number.
  const risk: { score: number; grade: string } | null =
    row.grade && typeof row.score === 'number'
      ? { score: row.score, grade: row.grade }
      : null
  const badCount = scores.filter(s => s.tone === 'bad').length
  const warnCount = scores.filter(s => s.tone === 'warn').length

  function handleTabChange(_: SyntheticEvent, value: number) {
    setDetailTab(DETAIL_TABS[value])
  }

  const gc = risk ? gradeColor(risk.grade) : '#94a3b8'
  const bannerColor = badCount > 0 ? '#ef4444' : warnCount > 0 ? '#eab308' : '#22c55e'

  return (
    <Box sx={{ height: '100%', minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', p: 3, gap: 2 }}>
      {/* Domain detail header — Fuse typography hierarchy.
          The 44x44 gradient icon box was dropped per the 2026-05-19
          alignment pass; the back arrow + bold domain title + risk-
          grade chip already give enough chrome that an extra gradient
          tile reads as visual noise. */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0, mb: 1 }}>
        <IconButton
          size="small"
          onClick={onBack}
          aria-label={t('common.back')}
          title={t('common.back')}
          sx={{ flexShrink: 0 }}
        >
          <ArrowLeft size={18} />
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography
              component="a" href={row.url} target="_blank" rel="noopener noreferrer"
              className="text-3xl leading-none font-semibold tracking-tight"
              sx={{ color: 'text.primary', textDecoration: 'none', '&:hover': { color: 'primary.main' }, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}
              noWrap
            >
              {row.domain}
            </Typography>
            <ExternalLink size={14} style={{ opacity: 0.4 }} />
            <Chip label={t(row.type)} size="small" variant="outlined" sx={{ fontSize: 13, height: 22, fontWeight: 600 }} />
            {risk ? (
              <Chip label={`${risk.grade} ${risk.score}`} size="small" sx={{
                height: 24, fontSize: 12, fontWeight: 800,
                bgcolor: gc + '18', color: gc, border: `1px solid ${gc}30`,
              }} />
            ) : (
              <Chip label={t('domains.scoringPending')} size="small" sx={{
                height: 24, fontSize: 12, fontWeight: 600,
                bgcolor: 'rgba(148,163,184,0.15)', color: 'text.secondary',
              }} />
            )}
            {/* CTEM asset-tier picker — operator sets the priority
                multiplier (crown_jewel / customer_facing / etc.) so
                findings on this domain get weighted accordingly in
                the picker / paths views. Resolved by domain via
                attack_surface query (cached per-org). */}
            {orgId && <DomainAssetTierPicker orgId={orgId} domain={row.domain} />}

            {/* Compliance scope tags — operator-declared regulatory
                surface (PII / PCI / HIPAA / SOX / GDPR). Surfaces
                next to the tier so the operator sees "is this
                domain in scope for X compliance?" at a glance. */}
            {orgId && <DomainComplianceScopePicker orgId={orgId} domain={row.domain} compact />}

            {/* Business unit assignment — per-team scoping. Hidden
                automatically when the org has no BUs declared (no
                point teasing a feature that needs upstream
                Settings → Business Units config). */}
            {orgId && <DomainBUAssignChip orgId={orgId} domain={row.domain} />}

            {/* Pending verification — backend's decision engine has
                seen a tier-2 score delta and is waiting for a 2nd
                confirming observation. Active score is unchanged;
                the chip tells the operator "we noticed, we're
                checking". See [[scoring-observation-pipeline]]. */}
            {typeof row.pending_score === 'number' && row.pending_grade && (
              <Chip
                icon={<RefreshCw size={11} />}
                label={`${t('domains.verifying')} → ${row.pending_grade} ${row.pending_score}`}
                size="small"
                sx={{
                  height: 22, fontSize: 13, fontWeight: 600,
                  bgcolor: 'rgba(234,179,8,0.12)', color: '#eab308',
                  border: '1px solid rgba(234,179,8,0.4)',
                }}
                title={t('domains.verifyingHint')}
              />
            )}
            {projectScanning && (
              <Chip icon={<CircularProgress size={12} />} label={t('domains.scanning')} size="small"
                sx={{ height: 22, fontSize: 13, fontWeight: 600, bgcolor: '#38bdf818', color: '#38bdf8' }} />
            )}
          </Box>
          {/* Action banner inline */}
          <Typography variant="body2" sx={{ color: bannerColor, fontWeight: 600, mt: 0.25, display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {badCount > 0 || warnCount > 0
              ? <><AlertTriangle size={13} /> {scores.filter(s => s.tone === 'bad' || s.tone === 'warn').map(s => `${s.label}: ${s.sub || s.value}`).join(' · ')}</>
              : <><CheckCircle size={13} /> {t('dast.allChecksPassed')}</>}
          </Typography>
        </Box>
        {/* Cross-dim drawer trigger — shows what every dimension
            (Footprint / CTEM / Pentest / Code / AutoFix) knows
            about this exact domain. Proves the platform is one
            product, not five silos. */}
        <IconButton
          size="small"
          onClick={() => setUnifiedOpen(true)}
          aria-label={t('unifiedAsset.openTip')}
          title={t('unifiedAsset.openTip')}
          sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main' } }}>
          <Layers size={16} />
        </IconButton>
        {row.project && (
          <IconButton
            size="small"
            onClick={() => onDelete(row.project!.id)}
            aria-label={t('common.delete')}
            title={t('common.delete')}
            sx={{ color: 'text.secondary', '&:hover': { color: 'error.main' } }}
          >
            <Trash2 size={16} />
          </IconButton>
        )}
      </Box>

      <UnifiedAssetDrawer
        domain={unifiedOpen ? row.domain : null}
        onClose={() => setUnifiedOpen(false)}
      />

      <DataBoundary
        isLoading={queryUnresolved(surfaceQ, surfaceEnabled)}
        isError={surfaceQ.isError}
        error={surfaceQ.error}
        hasData={surfaceReady}
        label={t('domains.detailSignals')}
        containerSx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
      >
        {/* ── Signal tiles: responsive grid (2→4→7 cols).
              The vertical dividers (borderRight) only render at the
              7-column md+ breakpoint where the row is a single line —
              at narrower widths wrapping would put a dangling border
              on whichever cell ends up on the right edge of each row,
              which looks broken. The borderTop colour stripe still
              carries each tile's tone at every breakpoint. */}
        <Paper elevation={1} className="rounded-xl" sx={{ flexShrink: 0, overflow: 'hidden', mb: 2 }}>
          <Box sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'repeat(2, minmax(0, 1fr))',
              sm: 'repeat(4, minmax(0, 1fr))',
              md: 'repeat(7, minmax(0, 1fr))',
            },
            gap: 0,
          }}>
            {scores.map((s, i) => (
              <Box key={i} sx={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75,
                py: 2, px: 1,
                borderRight: { xs: 'none', md: i < 6 ? '1px solid' : 'none' },
                borderBottom: { xs: '1px solid', md: 'none' },
                borderColor: 'divider',
                borderTop: `3px solid ${TONE_COLOR[s.tone]}`,
                background: `linear-gradient(180deg, ${TONE_COLOR[s.tone]}10 0%, transparent 60%)`,
              }}>
                <MiniRing tone={s.tone} ratio={s.ratio} />
                <Typography sx={{ fontSize: 18, fontWeight: 800, color: TONE_COLOR[s.tone], lineHeight: 1 }}>{s.value}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1 }}>{s.label}</Typography>
                {s.sub && <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1 }}>{s.sub}</Typography>}
              </Box>
            ))}
          </Box>
        </Paper>

        {/* ── Tab bar — inside a Paper card ── */}
        <Paper elevation={1} className="rounded-xl" sx={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Tabs
          value={DETAIL_TABS.indexOf(detailTab)}
          onChange={handleTabChange}
          variant="fullWidth"
          sx={{
            minHeight: 42, flexShrink: 0,
            borderBottom: '1px solid', borderColor: 'divider',
            '& .MuiTab-root': { textTransform: 'none', fontWeight: 600, fontSize: 13, minHeight: 42, py: 0.5 },
          }}
        >
          {DETAIL_TABS.map(tab => {
            const Icon = TAB_ICONS[tab]
            return (
              <Tab key={tab} label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Icon size={15} />
                  {TAB_LABELS[tab]()}
                </Box>
              } />
            )
          })}
        </Tabs>

        {/* ── Tab content (maximized area, scrolls inside Paper) ── */}
        {/* Each tab lazy-loads its own queries; an upstream 5xx used
            to leave the tab silently blank. Wrapping in ErrorBoundary
            ensures the operator always sees a clear error + reload
            path instead of an empty pane that reads as "no data". */}
        <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        <ErrorBoundary>
        {detailTab === 'security' && (
          <SecurityTab
            row={detailRow}
            sslAsset={sslAsset}
            dnsSecAsset={dnsSecAsset}
            emailAsset={emailAsset}
            httpAssets={httpAssets}
            wafAsset={wafAsset}
            sensitiveAsset={sensitiveAsset}
            takeoverAsset={takeoverAsset}
            projectId={row.project?.id}
            orgId={orgId}
            domain={row.domain}
          />
        )}
        {detailTab === 'network' && (
          <NetworkTab
            row={detailRow}
            dnsSecAsset={dnsSecAsset}
            ipAsset={ipAsset}
            portAsset={portAsset}
            projectId={row.project?.id}
            orgId={orgId}
            domain={row.domain}
          />
        )}
        {detailTab === 'intelligence' && (
          <IntelligenceTab
            row={detailRow}
            techAsset={techAsset}
            whoisAsset={whoisAsset}
            wafAsset={wafAsset}
            sensitiveAsset={sensitiveAsset}
            projectId={row.project?.id}
            orgId={orgId}
            domain={row.domain}
          />
        )}
        {detailTab === 'api' && (
          // `codeAPIs` are now filtered server-side by `?domain=` —
          // only repos whose homepage maps to this domain show up.
          // APISubTab still hides the routes tab when the list is
          // empty (e.g. no homepage metadata yet on any repo).
          <DataBoundary
            isLoading={queryUnresolved(apiQ, apiEnabled)}
            isError={apiQ.isError}
            error={apiQ.error}
            hasData={querySucceeded(apiQ, apiEnabled)}
            label={t('dast.tab.api')}
          >
            <APISubTab
              codeAPIs={apiQ.data?.apis ?? []}
              httpAssets={httpAssets}
              allAssets={assets}
              page={1}
              setPage={() => {}}
            />
          </DataBoundary>
        )}
        {detailTab === 'pagespeed' && (
          <PageSpeedTab
            assets={assets}
            projectId={row.project?.id}
            orgId={orgId}
            domain={row.domain}
            resourceId={row.resourceId}
          />
        )}
        {detailTab === 'evidence' && (
          <EvidenceTab orgId={orgId} assetKey={row.domain} assetType="subdomain" />
        )}
        {detailTab === 'ai' && (
          <AIAnalysisTab projectId={row.project?.id} />
        )}
        </ErrorBoundary>
      </Box>
      </Paper>
      </DataBoundary>
    </Box>
  )
}

/* ── Scorecard builder ── */

interface ScoreTile { key: string; label: string; value: string; sub?: string; tone: Tone; ratio: number }

/** 40px SVG ring — filled arc colored by tone, high contrast on dark bg.
 *  muted (no data) → dashed ring to signal "not scanned yet"
 *  ratio=0 but not muted → thin colored arc so the ring isn't invisible */
function MiniRing({ tone, ratio }: { tone: Tone; ratio: number }) {
  const size = 40
  const sw = 6
  const r = (size - sw) / 2
  const circ = 2 * Math.PI * r
  const color = TONE_COLOR[tone]

  // No data → dashed outline ring
  if (tone === 'muted') {
    return (
      <svg width={size} height={size} style={{ flexShrink: 0 }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="rgba(255,255,255,0.25)" strokeWidth={2}
          strokeDasharray="4 4" />
      </svg>
    )
  }

  // Ensure minimum visible arc even at ratio=0 (e.g. WAF: No)
  const minFill = circ * 0.08
  const fill = Math.max(minFill, circ * Math.max(0, Math.min(1, ratio)))

  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={sw} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={sw}
        strokeDasharray={`${fill} ${circ - fill}`}
        strokeDashoffset={circ * 0.25}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.5s ease', filter: `drop-shadow(0 0 6px ${color}80)` }}
      />
    </svg>
  )
}

function buildScorecard(
  row: DomainRow,
  sslAsset?: AttackSurfaceAsset, dnsSecAsset?: AttackSurfaceAsset, httpAssets?: AttackSurfaceAsset[], portAsset?: AttackSurfaceAsset, wafAsset?: AttackSurfaceAsset, sensitiveAsset?: AttackSurfaceAsset,
): ScoreTile[] {
  return [
    buildIssueTile(row),
    buildSSLTile(sslAsset),
    buildHeadersTile(httpAssets),
    buildEmailTile(dnsSecAsset),
    buildPortsTile(portAsset),
    buildWAFTile(wafAsset),
    buildFileTile(sensitiveAsset),
  ]
}

function buildIssueTile(row: DomainRow): ScoreTile {
  const c = row.issues.filter(i => i.severity === 'CRITICAL').length
  const h = row.issues.filter(i => i.severity === 'HIGH').length
  const total = row.issues.length
  return {
    key: 'issues',
    label: t('dast.score.issues'),
    value: String(total),
    sub: c + h > 0 ? `${c}C ${h}H` : total > 0 ? `${total} ${t('dast.score.total')}` : t('dast.score.clean'),
    tone: c > 0 ? 'bad' : h > 0 ? 'warn' : total > 0 ? 'muted' : 'good',
    ratio: total === 0 ? 1 : Math.max(0, 1 - (c * 0.3 + h * 0.15 + (total - c - h) * 0.05)),
  }
}

function buildSSLTile(asset?: AttackSurfaceAsset): ScoreTile {
  if (!asset) return { key: 'ssl', label: t('dast.score.ssl'), value: '—', tone: 'muted', ratio: 0 }
  const m = parseMeta(asset)
  const days = m.days_left ?? 0
  return {
    key: 'ssl',
    label: t('dast.score.ssl'),
    value: m.is_expired ? t('dast.score.expired') : `${days}d`,
    sub: m.tls_version,
    tone: m.is_expired ? 'bad' : days < 30 ? 'bad' : days < 90 ? 'warn' : 'good',
    ratio: m.is_expired ? 0 : Math.min(1, days / 365),
  }
}

function buildHeadersTile(httpAssets?: AttackSurfaceAsset[]): ScoreTile {
  const asset = httpAssets?.find(a => { try { return JSON.parse(a.metadata).scheme === 'https' } catch { return false } })
  if (!asset) return { key: 'headers', label: t('dast.score.headers'), value: '—', tone: 'muted', ratio: 0 }
  const m = parseMeta(asset)
  const h = (m.headers ?? {}) as Record<string, string>
  const checks = ['Strict-Transport-Security', 'Content-Security-Policy', 'X-Content-Type-Options', 'X-Frame-Options']
  const present = checks.filter(k => h[k]).length
  return {
    key: 'headers',
    label: t('dast.score.headers'),
    value: `${present}/${checks.length}`,
    sub: present === checks.length ? t('dast.score.allSet') : `${checks.length - present} ${t('dast.score.missing')}`,
    tone: present === checks.length ? 'good' : present >= 2 ? 'warn' : 'bad',
    ratio: present / checks.length,
  }
}

function buildEmailTile(dnsSecAsset?: AttackSurfaceAsset): ScoreTile {
  if (!dnsSecAsset) return { key: 'email', label: t('dast.score.email'), value: '—', tone: 'muted', ratio: 0 }
  const m = parseMeta(dnsSecAsset)
  const checks = [m.spf, m.dmarc, m.dkim].filter(Boolean).length
  const total = m.dkim !== undefined ? 3 : 2
  return {
    key: 'email',
    label: t('dast.score.email'),
    value: `${checks}/${total}`,
    sub: [m.spf && 'SPF', m.dmarc && 'DMARC', m.dkim && 'DKIM'].filter(Boolean).join(' ') || t('dast.score.none'),
    tone: checks === total ? 'good' : checks >= 1 ? 'warn' : 'bad',
    ratio: checks / total,
  }
}

function buildPortsTile(portAsset?: AttackSurfaceAsset): ScoreTile {
  if (!portAsset) return { key: 'ports', label: t('dast.score.ports'), value: '—', tone: 'muted', ratio: 0 }
  const m = parseMeta(portAsset)
  const ports = (m.open_ports ?? []) as Array<{ port: number }>
  const dangerous = [3306, 5432, 6379, 27017, 9200, 1433, 3389, 5900]
  const dangerCount = ports.filter(p => dangerous.includes(p.port)).length
  return {
    key: 'ports',
    label: t('dast.score.ports'),
    value: String(ports.length),
    sub: dangerCount > 0 ? `${dangerCount} ${t('dast.score.risky')}` : t('dast.score.ok'),
    tone: dangerCount > 0 ? 'bad' : ports.length > 10 ? 'warn' : 'good',
    ratio: dangerCount > 0 ? Math.max(0, 1 - dangerCount * 0.25) : 1,
  }
}

function buildWAFTile(wafAsset?: AttackSurfaceAsset): ScoreTile {
  if (!wafAsset) return { key: 'waf', label: t('dast.score.waf'), value: '—', tone: 'muted', ratio: 0 }
  const m = parseMeta(wafAsset)
  const hasWAF = (m.detected?.length ?? 0) > 0 || m.behavior_detected
  return {
    key: 'waf',
    label: t('dast.score.waf'),
    value: hasWAF ? t('dast.score.yes') : t('dast.score.no'),
    sub: m.detected?.[0]?.name,
    tone: hasWAF ? 'good' : 'warn',
    ratio: hasWAF ? 1 : 0.2,
  }
}

function buildFileTile(sensitiveAsset?: AttackSurfaceAsset): ScoreTile {
  if (!sensitiveAsset) return { key: 'files', label: t('dast.score.files'), value: '—', tone: 'muted', ratio: 0 }
  const m = parseMeta(sensitiveAsset)
  const files = (m.files ?? []) as Array<{ risk: string }>
  const crit = files.filter(f => f.risk === 'critical').length
  return {
    key: 'files',
    label: t('dast.score.files'),
    value: files.length > 0 ? String(files.length) : '0',
    sub: crit > 0 ? `${crit} ${t('dast.score.critical')}` : files.length > 0 ? `${files.length} ${t('dast.score.found')}` : t('dast.score.clean'),
    tone: crit > 0 ? 'bad' : files.length > 0 ? 'warn' : 'good',
    ratio: files.length === 0 ? 1 : Math.max(0, 1 - crit * 0.3 - (files.length - crit) * 0.1),
  }
}
