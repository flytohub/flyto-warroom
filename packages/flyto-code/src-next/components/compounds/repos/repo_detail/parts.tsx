/**
 * repo_detail/parts.tsx — shared sub-components extracted from
 * RepoDetailView.tsx (which was 1144 lines pre-split).
 *
 * Contains:
 *   - LanguageBar          (per-language stacked bar)
 *   - InfoSection          (label + children wrapper for repo metadata)
 *   - CVERow               (single CVE finding row)
 *   - IntelItem + buildIntelItems  (analyser-style intelligence cards)
 *   - IntelCard            (renderer for an IntelItem)
 *   - RecentVerifications + VerifyRow + verdictSpec + formatRelative
 *   - VerifyTargetsEditor  (allow-list textarea for dynamic verify)
 *
 * These were all module-internal helpers in the parent file — moved
 * here verbatim, only the imports rewritten + helper `ti` duplicated
 * so each file is self-contained. The parent's tab components now
 * import from here.
 */

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2, Clock, ExternalLink, FileCode, ListTodo, Lock, Network, Route, Settings2,
  ShieldAlert, ShieldBan, ShieldCheck, ShieldOff, Users, XCircle, Zap,
} from 'lucide-react'
import {
  Box, Button, Chip, IconButton, Paper, TextField, Typography,
} from '@mui/material'
import { t, tOr } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { severityColor } from '@atoms/SeverityChip'
import {
  listRepoWorkflowExecutions, getVerifyTargets, updateVerifyTargets,
  type RepoProfile, type RepoWorkflowExecution,
} from '@lib/engine'
import { LANG_COLORS } from '../colors'

/** i18n helper: replace {n} placeholder. Duplicated from RepoDetailView.tsx
 *  so this module stays standalone. */
function ti(key: string, fallback: string, n: number | string): string {
  return tOr(key as 'common.save', fallback).replace('{n}', String(n))
}

/* ── Repo metadata helpers ─────────────────────────────────────────── */

export function LanguageBar({ languages }: { languages: Record<string, number> }) {
  const entries = Object.entries(languages).sort((a, b) => b[1] - a[1])
  const total = entries.reduce((sum, [, v]) => sum + v, 0)
  if (total === 0) return null

  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
        {t('repoDetail.langBreakdown')}
      </Typography>
      <Box sx={{ display: 'flex', height: 10, borderRadius: 1.5, overflow: 'hidden' }}>
        {entries.map(([lang, count]) => (
          <Box key={lang} sx={{ width: `${(count / total) * 100}%`, bgcolor: LANG_COLORS[lang] ?? '#666' }}
            title={`${lang}: ${count} files`} />
        ))}
      </Box>
      <Box className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {entries.map(([lang, count]) => (
          <Box key={lang} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: LANG_COLORS[lang] ?? '#666' }} />
            <Typography variant="caption" color="text.secondary">{lang}</Typography>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>
              {Math.round((count / total) * 100)}%
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

export function InfoSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ display: 'block', mb: 0.75, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 12 }}>
        {label}
      </Typography>
      {children}
    </Box>
  )
}

export function CVERow({ cve }: { cve: { id: string; severity: string; package: string; version: string; summary?: string; fixed_in?: string } }) {
  const sevColor = severityColor(cve.severity)
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 1.5, py: 1, px: 1.5, borderRadius: 1,
      '&:hover': { bgcolor: 'action.hover' },
    }}>
      <ShieldAlert size={14} style={{ color: sevColor, flexShrink: 0 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" fontWeight={600} color="text.primary">{cve.id}</Typography>
          <Chip label={cve.severity} size="small"
            color={cve.severity === 'CRITICAL' ? 'error' : cve.severity === 'HIGH' ? 'warning' : 'default'}
            sx={{ height: 18, fontSize: 12 }} />
          <Typography variant="caption" color="text.secondary">{cve.package}@{cve.version}</Typography>
        </Box>
        {cve.summary && (
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', mt: 0.25 }}>
            {cve.summary}
          </Typography>
        )}
      </Box>
      {cve.fixed_in && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
          <CheckCircle2 size={12} style={{ color: '#22c55e' }} />
          <Typography variant="caption" color="success.main" fontWeight={600}>{cve.fixed_in}</Typography>
        </Box>
      )}
    </Box>
  )
}

/* ── Intelligence helpers ───────────────────────────────────────────── */

export type IntelItem = {
  key: string; label: string; value: string; detail?: string; icon: typeof FileCode
  color: string; severity: 'ok' | 'warn' | 'alert'
}

export function buildIntelItems(profile: RepoProfile): IntelItem[] {
  const items: IntelItem[] = []

  if (profile.error_handling) {
    const eh = profile.error_handling
    const cov = eh.coverage_pct ?? 0
    items.push({
      key: 'error_handling', label: t('repoDetail.intelErrorHandling'),
      value: ti('repoDetail.intelCoveragePct', '{n}% coverage', cov.toFixed(0)),
      detail: ti('repoDetail.intelIssuesFound', '{n} issues found', eh.issue_count ?? 0),
      icon: ShieldBan, color: '#ef4444',
      severity: cov < 20 && (eh.issue_count ?? 0) > 5 ? 'alert' : cov < 50 ? 'warn' : 'ok',
    })
  }
  if (profile.tech_debt) {
    const td = profile.tech_debt
    items.push({
      key: 'tech_debt', label: t('repoDetail.intelTechDebt'),
      value: ti('repoDetail.intelMarkers', '{n} markers', td.total_items),
      detail: ti('repoDetail.intelHighSeverity', '{n} high severity', td.high_count ?? 0),
      icon: ListTodo, color: '#fb923c',
      severity: (td.high_count ?? 0) > 10 ? 'alert' : td.total_items > 20 ? 'warn' : 'ok',
    })
  }
  if (profile.perf_patterns) {
    const pp = profile.perf_patterns
    items.push({
      key: 'perf_patterns', label: t('repoDetail.intelPerformance'),
      value: ti('repoDetail.intelAntiPatterns', '{n} anti-patterns', pp.total_issues),
      icon: Zap, color: '#fbbf24',
      severity: pp.total_issues > 5 ? 'alert' : pp.total_issues > 0 ? 'warn' : 'ok',
    })
  }
  if (profile.import_health) {
    const ih = profile.import_health
    items.push({
      key: 'import_health', label: t('repoDetail.intelModuleHealth'),
      value: ti('repoDetail.intelModules', '{n} modules', ih.total_modules),
      detail: ti('repoDetail.intelGodModules', '{n} god modules', ih.god_module_count ?? 0),
      icon: Network, color: '#a78bfa',
      severity: (ih.god_module_count ?? 0) > 0 || (ih.circular_dep_count ?? 0) > 0 ? 'warn' : 'ok',
    })
  }
  if (profile.config_drift) {
    const cd = profile.config_drift
    items.push({
      key: 'config_drift', label: t('repoDetail.intelConfigDrift'),
      value: ti('repoDetail.intelVarsDefined', '{n} vars defined', cd.env_vars_defined),
      detail: ti('repoDetail.intelMismatches', '{n} mismatches', cd.issue_count),
      icon: Settings2, color: '#38bdf8',
      severity: cd.issue_count > 0 ? 'warn' : 'ok',
    })
  }
  if (profile.bus_factor) {
    const bf = profile.bus_factor
    items.push({
      key: 'bus_factor', label: t('repoDetail.intelBusFactor'),
      value: ti('repoDetail.intelSingleAuthor', '{n} single-author', bf.bus_factor_1_count),
      detail: ti('repoDetail.intelPctOfFiles', '{n}% of files', (bf.bus_factor_1_pct ?? 0).toFixed(0)),
      icon: Users, color: '#34d399',
      severity: (bf.bus_factor_1_pct ?? 0) > 50 ? 'warn' : 'ok',
    })
  }
  if (profile.api_drift) {
    const ad = profile.api_drift
    items.push({
      key: 'api_drift', label: t('repoDetail.intelApiContract'),
      value: ti('repoDetail.intelBrokenCalls', '{n} broken calls', ad.broken_calls),
      detail: ti('repoDetail.intelDeadEndpoints', '{n} dead endpoints', ad.dead_endpoints),
      icon: Route, color: '#22d3ee',
      severity: ad.broken_calls > 0 ? 'alert' : ad.dead_endpoints > 3 ? 'warn' : 'ok',
    })
  }

  return items
}

export function IntelCard({ item }: { item: IntelItem }) {
  const bgMap = { alert: '#ef444410', warn: '#eab30810', ok: '#22c55e10' }
  const borderMap = { alert: '#ef444430', warn: '#eab30830', ok: '#22c55e30' }
  const Icon = item.icon

  return (
    <Paper variant="outlined" sx={{
      p: 2, display: 'flex', alignItems: 'flex-start', gap: 1.5, borderRadius: 1.5,
      bgcolor: bgMap[item.severity], borderColor: borderMap[item.severity],
    }}>
      <Box sx={{
        width: 32, height: 32, borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        bgcolor: `${item.color}15`, flexShrink: 0,
      }}>
        <Icon size={16} style={{ color: item.color }} />
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2" fontWeight={700} color="text.primary">{item.label}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: 13 }}>{item.value}</Typography>
        {item.detail && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{item.detail}</Typography>
        )}
      </Box>
    </Paper>
  )
}

/* ── Verification sub-components ────────────────────────────────────── */

export function RecentVerifications({ repoId }: { repoId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: qk.security.repoVerifications(repoId),
    queryFn: () => listRepoWorkflowExecutions(repoId, 10),
    staleTime: 30_000,
  })

  if (isLoading) return null
  if (isError) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 1.5 }}>
        <XCircle size={14} style={{ color: '#ef4444', flexShrink: 0 }} />
        <Typography variant="body2" color="error.main">{t('common.loadError')}</Typography>
      </Box>
    )
  }
  const execs = data?.executions ?? []
  if (execs.length === 0) return null

  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
        <ShieldCheck size={15} style={{ color: '#22c55e' }} />
        <Typography variant="subtitle2" fontWeight={700} sx={{ flex: 1 }}>
          {t('repoDetail.recentVerifications')}
        </Typography>
        <Chip label={execs.length} size="small" variant="outlined" sx={{ height: 20 }} />
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {execs.map((e) => <VerifyRow key={e.id} exec={e} />)}
      </Box>
    </Paper>
  )
}

function VerifyRow({ exec }: { exec: RepoWorkflowExecution }) {
  const spec = verdictSpec(exec)
  const Icon = spec.icon
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 2, py: 0.75, px: 1, borderRadius: 1,
      '&:hover': { bgcolor: 'action.hover' },
    }}>
      <Icon size={14} style={{ color: spec.color, flexShrink: 0 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ color: spec.color, fontWeight: 600 }}>{spec.label}</Typography>
        <Typography variant="caption" color="text.secondary" title={exec.findingFp} noWrap>
          {exec.findingFp.slice(0, 16)}...
        </Typography>
      </Box>
      <Typography variant="caption" color="text.secondary">{formatRelative(exec.createdAt)}</Typography>
      {exec.evidenceUrl && (
        <IconButton component="a" href={exec.evidenceUrl} target="_blank" rel="noopener noreferrer" size="small"
          aria-label={t('warroom.viewEvidence')}
          title={t('warroom.viewEvidence')}>
          <ExternalLink size={12} />
        </IconButton>
      )}
    </Box>
  )
}

function verdictSpec(exec: RepoWorkflowExecution): { icon: typeof ShieldCheck; color: string; label: string } {
  if (exec.status === 'queued' || exec.status === 'running') {
    return { icon: Clock, color: '#94a3b8', label: t(`warroom.${exec.status === 'running' ? 'verifyRunning' : 'verifyQueued'}`) }
  }
  if (exec.status === 'error' || exec.status === 'failed') {
    return { icon: XCircle, color: '#ef4444', label: exec.errorMessage || t('warroom.verifyError') }
  }
  switch (exec.verdict) {
    case 'exploitable': return { icon: ShieldAlert, color: '#ef4444', label: t('warroom.verdictExploitable') }
    case 'sanitized':   return { icon: ShieldCheck, color: '#22c55e', label: t('warroom.verdictSanitized') }
    case 'unreachable': return { icon: ShieldOff, color: '#94a3b8', label: t('warroom.verdictUnreachable') }
    default:            return { icon: ShieldCheck, color: '#94a3b8', label: t('warroom.verifyDone') }
  }
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return t('dashboard.justNow')
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export function VerifyTargetsEditor({ repoId }: { repoId: string }) {
  const qc = useQueryClient()
  const { data, isLoading, isError } = useQuery({
    queryKey: qk.security.verifyTargets(repoId),
    queryFn: () => getVerifyTargets(repoId),
  })
  const [text, setText] = useState('')
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (!hydrated && data) {
      setText(data.targets.join('\n'))
      setHydrated(true)
    }
  }, [data, hydrated])

  const save = useMutation({
    mutationFn: async () => {
      const targets = text.split('\n').map((s) => s.trim()).filter(Boolean)
      return updateVerifyTargets(repoId, targets)
    },
    onSuccess: (resp) => {
      qc.setQueryData(qk.security.verifyTargets(repoId), resp)
      setText(resp.targets.join('\n'))
    },
  })

  if (isLoading) return null
  if (isError) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 1.5 }}>
        <XCircle size={14} style={{ color: '#ef4444', flexShrink: 0 }} />
        <Typography variant="body2" color="error.main">
          {t('repoDetail.verifyTargetsError')}
        </Typography>
      </Box>
    )
  }

  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Lock size={14} style={{ color: '#38bdf8' }} />
        {t('repoDetail.verifyTargetsTitle')}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        {t('repoDetail.verifyTargetsHint')}
      </Typography>
      <TextField multiline rows={3} fullWidth size="small"
        placeholder={"https://staging.acme.com\nhttps://qa.acme.com/api"}
        value={text} onChange={(e) => setText(e.target.value)} spellCheck={false}
        sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { fontFamily: 'monospace', fontSize: 13 } }} />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Button variant="contained" size="small" color="secondary"
          onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? t('common.saving') : t('common.save')}
        </Button>
        {save.isSuccess && <Typography variant="caption" color="success.main">{t('common.saved')}</Typography>}
        {save.isError && <Typography variant="caption" color="error.main">{(save.error as Error).message}</Typography>}
      </Box>
    </Paper>
  )
}
