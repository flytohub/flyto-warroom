import { t } from '@lib/i18n';
import { useMemo, useState } from 'react'
import { Chip, Tooltip } from '@mui/material'
import { Radar, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react'
import { colors, softBg } from '@/styles/designTokens'
import { navigateToCTEMActions } from '@lib/warroomNav'
import type { AttackSurfaceAsset } from '@lib/engine'

// ShodanEnrichmentPanel — surfaces the data accumulated by the
// Shodan worker loop (cmd/worker/shodan_loop.go). Each enriched
// asset has `metadata.shodan = { ports, vulns, cpes, tags,
// hostnames, fetched_at }`. Without this UI, that data accrues
// silently and the operator never sees it.
//
// Header (always visible): summary chip "47 assets enriched · 12 CVEs"
// Click to expand → table of top N assets sorted by CVE count, each
// with port chips + clickable CVE chips that deep-link to CTEM Actions
// filtered to that CVE.
//
// "Enriched" = asset has any shodan metadata. "Has CVEs" = vulns[]
// non-empty.

export interface ShodanEnrichmentPanelProps {
  assets: AttackSurfaceAsset[]
  /** Max rows shown when expanded. Default 10. */
  topN?: number
}

interface ParsedShodan {
  ports: number[]
  vulns: string[]
  cpes: string[]
  tags: string[]
  hostnames: string[]
  fetched_at: string
}

interface EnrichedAsset {
  asset: AttackSurfaceAsset
  shodan: ParsedShodan
}

export function ShodanEnrichmentPanel({ assets, topN = 10 }: ShodanEnrichmentPanelProps) {
  const [open, setOpen] = useState(false)

  const enriched = useMemo(() => extractEnriched(assets), [assets])
  // Hooks MUST run unconditionally — moved early-return after the
  // second useMemo to satisfy react-hooks/rules-of-hooks.
  const top = useMemo(
    () => [...enriched]
      .sort((a, b) => b.shodan.vulns.length - a.shodan.vulns.length || b.shodan.ports.length - a.shodan.ports.length)
      .slice(0, topN),
    [enriched, topN],
  )

  if (enriched.length === 0) return null

  const totalCVEs = enriched.reduce((sum, e) => sum + e.shodan.vulns.length, 0)
  const totalPorts = enriched.reduce((sum, e) => sum + e.shodan.ports.length, 0)
  const cveAssets = enriched.filter(e => e.shodan.vulns.length > 0)

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          width: '100%', padding: '12px 16px',
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'inherit', textAlign: 'left',
        }}
      >
        <Radar size={14} style={{ color: colors.tech }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
          {t('atoms.shodanEnrichment')}
        </span>
        <Chip
          size="small"
          label={`${enriched.length} enriched · ${totalPorts} ports`}
          variant="outlined"
          sx={{
            height: 20, fontSize: 12,
            borderColor: 'var(--mui-palette-divider, #334155)',
            color: 'var(--mui-palette-text-secondary, #94a3b8)',
          }}
        />
        {totalCVEs > 0 && (
          <Chip
            size="small"
            icon={<AlertCircle size={12} />}
            label={`${totalCVEs} CVEs across ${cveAssets.length} ${cveAssets.length === 1 ? 'asset' : 'assets'}`}
            sx={{
              height: 20, fontSize: 12, fontWeight: 700,
              bgcolor: softBg(colors.severity.critical, 0.20),
              color: colors.severity.critical,
              '& .MuiChip-icon': { color: colors.severity.critical },
            }}
          />
        )}
        <span style={{
          marginLeft: 'auto',
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 13, color: 'var(--mui-palette-text-secondary, #94a3b8)',
        }}>
          Top {Math.min(top.length, topN)}
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>

      {open && (
        <div style={{
          borderTop: '1px solid var(--mui-palette-divider, #334155)',
          maxHeight: 380, overflow: 'auto',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{
                position: 'sticky', top: 0,
                background: 'var(--mui-palette-background-paper, #1e293b)',
                color: 'var(--mui-palette-text-secondary, #94a3b8)',
                fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>
                <th style={cellStyle}>Asset</th>
                <th style={cellStyle}>{t('assetMap.openPorts')}</th>
                <th style={cellStyle}>CVEs</th>
                <th style={cellStyle}>Tags</th>
                <th style={{ ...cellStyle, textAlign: 'right' }}>{t('atoms.shodanEnrichment.fetched')}</th>
              </tr>
            </thead>
            <tbody>
              {top.map(({ asset, shodan }) => (
                <AssetRow key={asset.id} asset={asset} shodan={shodan} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function AssetRow({ asset, shodan }: { asset: AttackSurfaceAsset; shodan: ParsedShodan }) {
  return (
    <tr style={{ borderTop: '1px solid var(--mui-palette-divider, #334155)' }}>
      <td style={{ ...cellStyle, fontFamily: 'var(--font-mono, monospace)', fontSize: 13, fontWeight: 600 }}>
        {asset.value}
        <span style={{
          marginLeft: 8,
          fontSize: 12, textTransform: 'uppercase',
          color: 'var(--mui-palette-text-secondary, #94a3b8)',
        }}>{asset.asset_type}</span>
      </td>
      <td style={cellStyle}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 240 }}>
          {shodan.ports.length === 0 && <span style={{ fontSize: 13, color: 'var(--mui-palette-text-secondary)' }}>—</span>}
          {shodan.ports.slice(0, 8).map(p => (
            <PortChip key={p} port={p} />
          ))}
          {shodan.ports.length > 8 && (
            <Chip size="small" label={`+${shodan.ports.length - 8}`} sx={{ height: 18, fontSize: 12 }} />
          )}
        </div>
      </td>
      <td style={cellStyle}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 280 }}>
          {shodan.vulns.length === 0 && <span style={{ fontSize: 13, color: 'var(--mui-palette-text-secondary)' }}>—</span>}
          {shodan.vulns.slice(0, 4).map(cve => (
            <Tooltip key={cve} title={t('atoms.shodanEnrichment.openInCtemActions')}>
              <Chip
                size="small"
                label={cve}
                onClick={() => navigateToCTEMActions({ search: cve })}
                sx={{
                  height: 20, fontSize: 12, cursor: 'pointer',
                  bgcolor: softBg(colors.severity.critical, 0.16),
                  color: colors.severity.critical,
                  fontWeight: 700,
                  '&:hover': { bgcolor: softBg(colors.severity.critical, 0.30) },
                }}
              />
            </Tooltip>
          ))}
          {shodan.vulns.length > 4 && (
            <Chip size="small" label={`+${shodan.vulns.length - 4} CVEs`} sx={{ height: 20, fontSize: 12 }} />
          )}
        </div>
      </td>
      <td style={cellStyle}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {shodan.tags.slice(0, 3).map(t => (
            <Chip key={t} size="small" label={t}
              sx={{ height: 18, fontSize: 12, bgcolor: softBg(colors.tech, 0.16), color: colors.tech }} />
          ))}
        </div>
      </td>
      <td style={{ ...cellStyle, textAlign: 'right', fontSize: 12, color: 'var(--mui-palette-text-secondary)' }}>
        {relativeTime(shodan.fetched_at)}
      </td>
    </tr>
  )
}

// PortChip — colour-coded by danger. Same heuristic as the
// monitoring loop's dangerous-port list.
const DANGER_PORTS = new Set([21, 23, 1433, 3306, 3389, 5432, 5900, 6379, 9200, 27017, 445])

function PortChip({ port }: { port: number }) {
  const danger = DANGER_PORTS.has(port)
  return (
    <Chip
      size="small"
      label={String(port)}
      sx={{
        height: 18, fontSize: 12, fontWeight: 600,
        fontVariantNumeric: 'tabular-nums',
        bgcolor: danger ? softBg(colors.severity.high, 0.18) : softBg(colors.tech, 0.12),
        color: danger ? colors.severity.high : colors.tech,
      }}
    />
  )
}

const cellStyle: React.CSSProperties = {
  padding: '8px 12px',
  textAlign: 'left',
  verticalAlign: 'top',
  whiteSpace: 'nowrap',
}

function extractEnriched(assets: AttackSurfaceAsset[]): EnrichedAsset[] {
  const out: EnrichedAsset[] = []
  for (const a of assets) {
    if (!a.metadata) continue
    let parsed: unknown
    try { parsed = JSON.parse(a.metadata) } catch { continue }
    const s = (parsed as { shodan?: Record<string, unknown> } | null)?.shodan
    if (!s || typeof s !== 'object') continue
    out.push({
      asset: a,
      shodan: {
        ports: Array.isArray(s.ports) ? s.ports : [],
        vulns: Array.isArray(s.vulns) ? s.vulns : [],
        cpes: Array.isArray(s.cpes) ? s.cpes : [],
        tags: Array.isArray(s.tags) ? s.tags : [],
        hostnames: Array.isArray(s.hostnames) ? s.hostnames : [],
        fetched_at: typeof s.fetched_at === 'string' ? s.fetched_at : '',
      },
    })
  }
  return out
}

function relativeTime(iso: string): string {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return iso
  const diff = Date.now() - then
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`
  return `${Math.round(diff / 86_400_000)}d ago`
}

