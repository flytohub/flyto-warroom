// Shared sub-components + helpers for the per-domain detail tabs.
// Split from DomainDetail.tsx (was 901 LOC).

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Lock, Play } from 'lucide-react'
import { t, tOr } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { scanAsset, triggerDiscovery, type ScanAssetType } from '@lib/engine'
// Direct-path import (decoupling rule): per-asset lifecycle clients live
// in the footprint domain folder, NOT the @lib/engine barrel.
import { scanAttackSurfaceAsset } from '@lib/engine/code/footprintSurface'
import {
  markDiscoveryComplete,
  markDiscoveryStarted,
  useDiscoveryStatus,
} from '@hooks/useDiscoveryStatus'

/** True when the engine reports an in-flight discovery, or the error is
 *  the idempotency 409 ("already running"). Lets a duplicate trigger
 *  resolve as "it's already going" instead of a silent failure. */
function isAlreadyRunningErr(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err ?? '')
  return /409|already.?running|in.?progress|already.?queued/i.test(m)
}

// Shared empty state for scan tabs — shows a Run Discovery button so
// the user doesn't have to hunt for one when a tab has no data yet.
// Common cause: the project was created before SSL/Tech/WHOIS/WAF
// scanners existed, or discovery hit its timeout on a previous run.
export function DiscoveryEmptyState({
  icon: Icon,
  message,
  projectId,
  orgId,
  // When provided, the button triggers a TARGETED single-scanner run
  // against `domain` instead of the full pentest discovery — used on
  // sub-domain tabs that the auto-cascade couldn't cover (PageSpeed /
  // port_scan / api_verify).
  domain,
  assetType,
  // Kernel resource_id for a footprint/kernel-origin domain that has NO
  // PentestProject. When there's no projectId, the button falls back to
  // the per-asset scan endpoint (full discovery, resolves kernel-first)
  // so a discovered domain is still scannable from its detail tabs.
  resourceId,
}: {
  icon: typeof Lock
  message: string
  projectId?: string
  orgId: string
  domain?: string
  assetType?: ScanAssetType
  resourceId?: string
}) {
  const qc = useQueryClient()
  const targeted = !!(projectId && domain && assetType)
  // Project-less footprint row: no targeted single-scanner path, only a
  // full per-asset re-scan by resource_id.
  const assetOnly = !projectId && !!resourceId
  // Server-reported in-flight state (SSE + /discoveries/active seed),
  // shared across the whole app — so this button reflects a scan started
  // from any tab and survives a refresh, instead of only guarding the
  // ~200ms HTTP window. Mirrors the robust DomainsView scan-all pattern.
  const { isScanning } = useDiscoveryStatus()
  // M1: project-less footprint scans run under a discovery keyed on the
  // kernel resource_id, so reflect that in-flight state too.
  const scanKey = projectId || resourceId
  const scanning = !!scanKey && isScanning(scanKey)
  const mut = useMutation({
    mutationFn: () => assetOnly
      ? scanAttackSurfaceAsset(orgId, resourceId!)
      : targeted
        ? scanAsset(projectId!, domain!, assetType!)
        : triggerDiscovery(projectId!),
    onMutate: () => {
      if (scanKey) markDiscoveryStarted(scanKey)
    },
    onSuccess: () => {
      if (scanKey) markDiscoveryStarted(scanKey) // optimistic, app-wide
      qc.invalidateQueries({ queryKey: qk.attackSurface(orgId) })
      qc.invalidateQueries({ queryKey: qk.externalPosture(orgId) })
      qc.invalidateQueries({ queryKey: qk.externalPostureKernel(orgId) })
      qc.invalidateQueries({ queryKey: qk.externalIssues(orgId) })
      qc.invalidateQueries({ queryKey: qk.assetMapKernel(orgId) })
      qc.invalidateQueries({ queryKey: qk.exposure.discoveriesActive(orgId) })
    },
    onError: (err) => {
      // A duplicate that slipped through (two tabs / slow network) comes
      // back as the engine's "already running" 409 — treat it as started,
      // not a silent failure.
      if (scanKey && isAlreadyRunningErr(err)) {
        markDiscoveryStarted(scanKey)
      } else {
        if (scanKey) markDiscoveryComplete(scanKey)
        if (import.meta.env.DEV) console.error('discovery trigger failed:', err)
      }
    },
  })
  const busy = mut.isPending || scanning
  const failed = mut.isError && !isAlreadyRunningErr(mut.error)
  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex flex-col items-center justify-center py-14 text-text-tertiary">
        <Icon size={44} className="mb-4 opacity-20" />
        <div className="text-base mb-4">{message}</div>
        {(projectId || resourceId) && (
          <button
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-white/20 text-text-secondary hover:bg-white/5 transition-colors disabled:opacity-60"
            onClick={() => mut.mutate()}
            disabled={busy}
          >
            {busy
              ? <><Loader2 size={12} className="animate-spin" />{scanning && !mut.isPending ? t('pentest.runningDiscovery') : t('pentest.discoveryQueued')}</>
              : targeted
                ? <><Play size={12} />{t('pentest.runScanThisHost')}</>
                : <><Play size={12} />{t('pentest.runDiscovery')}</>}
          </button>
        )}
        {failed && (
          <div className="text-xs text-red-400 mt-2">
            {t('pentest.discoveryFailed')}
          </div>
        )}
      </div>
    </div>
  )
}

// PageSpeed — score → color mapping with the standard PageSpeed
// thresholds (≥90 green, ≥50 yellow, else red).
export function psColor(score: number) {
  if (score >= 90) return '#22c55e'
  if (score >= 50) return '#eab308'
  return '#ef4444'
}

export function psHint(category: string, score: number): string | null {
  if (category === 'performance' && score < 50) return t('dast.psHintPerf')
  if (category === 'accessibility' && score < 90) return t('dast.psHintA11y')
  if (category === 'best-practices' && score < 90) return t('dast.psHintBP')
  if (category === 'seo' && score < 90) return t('dast.psHintSEO')
  return null
}

// Tech stack — turns evidence tags like "header:Via" into a localised
// version. Only the prefix is translated; the value after the colon is
// a literal HTTP header / cookie name and stays as-is across languages.
// tOr returns the translated prefix when it exists, else the original
// English word — so "header:Via" stays as-is when there's no zh-TW
// translation rather than leaking a key string.
export function translateTechSource(src: string): string {
  if (!src) return src
  const [prefix, ...rest] = src.split(':')
  if (rest.length === 0) return src
  const translated = tOr(`dast.techSrc.${prefix}`, prefix)
  return `${translated}:${rest.join(':')}`
}

export function gradeColor(grade: string): string {
  switch (grade) {
    case 'A': return '#22c55e'
    case 'B': return '#84cc16'
    case 'C': return '#eab308'
    case 'D': return '#f97316'
    case 'F': return '#ef4444'
    default: return '#94a3b8'
  }
}

// ── Shared layout components for domain detail tabs ──

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { Check, X, Minus } from 'lucide-react'

/** Section card — rounded, subtle border, filled bg for visual grouping. */
export function Section({ icon: Icon, title, color, children }: {
  icon: any
  title: string
  color: string
  children: React.ReactNode
}) {
  return (
    <Box sx={{
      display: 'flex', flexDirection: 'column', gap: 1, minHeight: 0,
      p: 2, borderRadius: 2.5,
      bgcolor: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25 }}>
        <Icon size={15} style={{ color, opacity: 0.8 }} />
        <Typography sx={{ fontSize: 13, fontWeight: 700, color }}>{title}</Typography>
      </Box>
      {children}
    </Box>
  )
}

/** Pass/fail row — clear visual: red bg on fail so problems jump out. */
export function PassFail({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 1,
      py: 0.5, px: ok ? 0 : 1,
      borderRadius: 1,
      bgcolor: ok ? 'transparent' : 'rgba(239,68,68,0.06)',
    }}>
      {ok
        ? <Check size={14} style={{ color: '#22c55e', flexShrink: 0 }} />
        : <X size={14} style={{ color: '#ef4444', flexShrink: 0 }} />}
      <Typography sx={{ fontSize: 13, color: ok ? 'text.primary' : '#ef4444' }}>
        {label}
      </Typography>
    </Box>
  )
}

/** Neutral "not scanned" row — distinguishes "we never checked this"
 *  from a real ✗ finding ("we checked and it's missing"). Honesty rule:
 *  沒掃到 vs 確定沒有 差很多. Muted grey dash, no red. */
export function NotScanned({ label }: { label: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
      <Minus size={14} style={{ color: '#64748b', flexShrink: 0 }} />
      <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
        {label}
      </Typography>
    </Box>
  )
}

/** Key-value info row for WHOIS, IP, etc. */
export function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <Box sx={{ display: 'flex', gap: 2, py: 0.5 }}>
      <Typography sx={{ fontSize: 13, color: 'text.secondary', minWidth: 80, fontWeight: 500, flexShrink: 0 }}>{label}</Typography>
      <Typography sx={{ fontSize: 13, fontFamily: 'var(--flyto-font-mono)', color: 'text.primary' }} noWrap>{value}</Typography>
    </Box>
  )
}

/** Parse asset metadata JSON safely. */
export function pm(asset?: { metadata: string }): Record<string, any> {
  if (!asset?.metadata) return {}
  try { return JSON.parse(asset.metadata) } catch { return {} }
}
