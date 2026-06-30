/**
 * UniversalFindingPanel — Aikido-style 4-tab drawer.
 * Supports package-level aggregation (multiple issues for same package).
 */

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  X, Play, EyeOff, AlarmClock, RotateCcw, CheckCircle,
} from 'lucide-react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Button from '@mui/material/Button'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import CircularProgress from '@mui/material/CircularProgress'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { useOrg } from '@hooks/useOrg'
import { getUnifiedFinding, type EnrichedSecurityIssue, type SecurityIssue } from '@lib/engine'

import { OverviewTab } from './finding_panel/OverviewTab'
import { FixTab } from './finding_panel/FixTab'
import { ActivityTab } from './finding_panel/ActivityTab'
import { ContextTab } from './finding_panel/ContextTab'
import { sevCfg, typeLabel } from './finding_panel/shared'

interface Props {
  /** Single finding mode */
  fingerprint: string | null
  /** Aggregated mode — all issues for the same package */
  relatedIssues?: SecurityIssue[]
  /** Fallback data if unified API 404s */
  fallback?: SecurityIssue | null
  onClose: () => void
  onAction?: (action: string, fingerprint: string) => void
  onNavigateRepo?: (repoId: string) => void
}

// Score gauge — compact Aikido-style
function ScoreGauge({ score, color }: { score: number; color: string }) {
  const r = 28
  const circumference = Math.PI * r
  const progress = circumference * (score / 100)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
      <svg width={68} height={42} viewBox="0 0 68 42">
        <path d={`M 6 38 A ${r} ${r} 0 0 1 62 38`}
          fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={7} strokeLinecap="round" />
        <path d={`M 6 38 A ${r} ${r} 0 0 1 62 38`}
          fill="none" stroke={color} strokeWidth={7} strokeLinecap="round"
          strokeDasharray={`${progress} ${circumference}`}
          style={{ transition: 'stroke-dasharray 0.6s ease' }} />
        <text x="34" y="34" textAnchor="middle" fill={color}
          fontSize="16" fontWeight="900" fontFamily="inherit">
          {score}
        </text>
      </svg>
    </Box>
  )
}

export function UniversalFindingPanel({
  fingerprint, relatedIssues, fallback, onClose, onAction, onNavigateRepo,
}: Props) {
  const { org } = useOrg()
  const [tab, setTab] = useState(0)

  // Fetch unified finding detail (for autofix patches, verifications)
  const { data: apiFinding, isLoading } = useQuery({
    queryKey: qk.security.unifiedFinding(org?.id, fingerprint),
    queryFn: () => getUnifiedFinding(org!.id, fingerprint!),
    enabled: !!org?.id && !!fingerprint,
    staleTime: 30_000,
    retry: false,
  })

  useEffect(() => {
    if (!fingerprint) return
    setTab(0) // reset tab on new finding
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [fingerprint, onClose])

  if (!fingerprint) return null

  // Primary issue — from fallback or first related
  const primary: SecurityIssue | null = fallback ?? relatedIssues?.[0] ?? null
  const related = relatedIssues ?? []
  const allIssues = primary ? [primary, ...related.filter(r => r.fingerprint !== primary.fingerprint)] : []
  const issueCount = allIssues.length

  if (!primary && !isLoading) return null

  const pkg = primary?.package ?? apiFinding?.package ?? ''
  const version = primary?.version ?? apiFinding?.version ?? ''
  const findingTitle = primary?.title ?? apiFinding?.title ?? ''
  // Title: prefer the descriptive title; fallback to "package vX.X"
  const displayTitle = findingTitle || (pkg ? `${pkg}${version ? ` ${version}` : ''}` : '—')
  const type = primary?.type ?? apiFinding?.type ?? ''
  const status = primary?.status ?? apiFinding?.status ?? 'open'

  // Best severity across all related issues
  const sevOrder = ['CRITICAL', 'HIGH', 'MODERATE', 'LOW']
  const worstSev = allIssues.reduce((worst, i) => {
    const a = sevOrder.indexOf(worst)
    const b = sevOrder.indexOf(i.severity)
    return b >= 0 && (a < 0 || b < a) ? i.severity : worst
  }, primary?.severity ?? '')

  const sevConfig = sevCfg(worstSev)

  return (
    <>
      {/* Backdrop */}
      <Box onClick={onClose} sx={{
        position: 'fixed', inset: 0, zIndex: 50,
        bgcolor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)',
      }} />

      {/* Drawer */}
      <Paper
        elevation={16}
        component="aside"
        role="dialog"
        aria-modal="true"
        square
        sx={{
          position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 51,
          width: { xs: '90vw', sm: 520 },
          display: 'flex', flexDirection: 'column',
          bgcolor: 'background.default', borderRadius: 0,
          borderLeft: '1px solid rgba(139,92,246,0.2)',
          boxShadow: '-24px 0 64px rgba(0,0,0,0.6)',
          animation: 'slide-in-right 0.18s ease-out',
          '@keyframes slide-in-right': {
            from: { transform: 'translateX(20px)', opacity: 0 },
            to: { transform: 'translateX(0)', opacity: 1 },
          },
        }}
      >
        {/* ── Header card ── */}
        <Paper
          elevation={2}
          square
          sx={{
            flexShrink: 0,
            background: `linear-gradient(180deg, ${sevConfig.bg}, transparent)`,
            borderBottom: 1, borderColor: 'divider',
          }}
        >
          {/* Close button row */}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 1.5, pt: 1 }}>
            <IconButton
              size="small"
              onClick={onClose}
              aria-label={t('common.close')}
              title={t('common.close')}
              sx={{ color: 'text.secondary' }}
            >
              <X size={16} />
            </IconButton>
          </Box>

          {/* Gauge + title */}
          <Box className="flex items-center gap-3" sx={{ px: 2.5, pb: 2 }}>
            <ScoreGauge score={sevConfig.score} color={sevConfig.color} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h6" fontWeight={700} color="text.primary" sx={{ lineHeight: 1.3, fontSize: 16 }}>
                {displayTitle}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontSize: 13 }}>
                {pkg && <><strong style={{ color: 'var(--mui-palette-text-primary)' }}>{pkg}</strong>{version ? ` ${version}` : ''} · </>}
                {issueCount > 1
                  ? `${issueCount} CVEs`
                  : primary?.cve_id ?? ''
                }
                {primary?.published_at && ` · last detected ${_timeAgo(primary.published_at)}`}
              </Typography>
              <Box className="flex items-center gap-1 mt-1.5">
                <Chip
                  label={worstSev}
                  size="small"
                  sx={{ height: 22, fontSize: 13, fontWeight: 700, bgcolor: sevConfig.bg, color: sevConfig.color }}
                />
                <Chip
                  label={typeLabel(type)}
                  size="small"
                  variant="outlined"
                  sx={{ height: 22, fontSize: 13 }}
                />
                <Chip
                  label={status.charAt(0).toUpperCase() + status.slice(1)}
                  size="small"
                  sx={{
                    height: 22, fontSize: 13, fontWeight: 600,
                    bgcolor: status === 'open' ? '#f9731618' : status === 'solved' ? '#22c55e18' : '#94a3b818',
                    color: status === 'open' ? '#fdba74' : status === 'solved' ? '#86efac' : '#94a3b8',
                  }}
                />
              </Box>
            </Box>
          </Box>

          {/* Tabs */}
          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            sx={{
              minHeight: 40, px: 1,
              '& .MuiTab-root': { minHeight: 40, py: 0, px: 2.5, fontSize: 13, fontWeight: 600, textTransform: 'none' },
              '& .MuiTabs-indicator': { height: 2.5, borderRadius: 1 },
            }}
          >
            <Tab label={t('common.overview')} />
            <Tab label={t('common.fix')} />
            <Tab label={t('findings.activity')} />
            <Tab label={t('findings.context')} />
          </Tabs>
        </Paper>

        {/* ── Tab content — scrolls ── */}
        <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          {isLoading && !primary && (
            <Box className="flex items-center justify-center py-12">
              <CircularProgress size={20} />
            </Box>
          )}

          {primary && tab === 0 && (
            <OverviewTab primary={primary} related={related} onNavigateRepo={onNavigateRepo} />
          )}

          {primary && tab === 1 && (
            <FixTab
              primary={primary}
              related={related}
              autofixPatches={apiFinding?.autofix_patches}
              autofixAvailable={apiFinding?.autofix_available}
            />
          )}

          {tab === 2 && (
            <ActivityTab
              verifications={apiFinding?.verifications}
              status={status}
              publishedAt={primary?.published_at}
            />
          )}

          {tab === 3 && primary && (
            <ContextTab issue={primary as EnrichedSecurityIssue} />
          )}
        </Box>

        {/* ── Action bar — pinned bottom ── */}
        {primary && onAction && (
          <Box sx={{
            px: 2.5, py: 1.5, flexShrink: 0,
            borderTop: 1, borderColor: 'divider',
            display: 'flex', gap: 1, flexWrap: 'wrap',
          }}>
            {status === 'open' ? (
              <>
                <Button size="small" variant="contained" startIcon={<Play size={13} />}
                  onClick={() => onAction('verify', fingerprint!)}
                  sx={{ textTransform: 'none', fontWeight: 600, fontSize: 12, bgcolor: '#7c3aed', '&:hover': { bgcolor: '#6d28d9' } }}>
                  {t('issues.verify')}
                </Button>
                <Button size="small" variant="outlined" startIcon={<AlarmClock size={13} />}
                  onClick={() => onAction('snooze', fingerprint!)}
                  sx={{ textTransform: 'none', fontWeight: 500, fontSize: 12, borderColor: 'divider', color: 'text.secondary' }}>
                  {t('issues.snooze')}
                </Button>
                <Button size="small" variant="outlined" startIcon={<EyeOff size={13} />}
                  onClick={() => onAction('ignore', fingerprint!)}
                  sx={{ textTransform: 'none', fontWeight: 500, fontSize: 12, borderColor: 'divider', color: 'text.secondary' }}>
                  {t('issues.ignore')}
                </Button>
                <Button size="small" variant="outlined" startIcon={<CheckCircle size={13} />}
                  onClick={() => onAction('solve', fingerprint!)}
                  sx={{ textTransform: 'none', fontWeight: 500, fontSize: 12, borderColor: 'divider', color: 'text.secondary' }}>
                  {t('issues.solve')}
                </Button>
              </>
            ) : (
              <Button size="small" variant="outlined" startIcon={<RotateCcw size={13} />}
                onClick={() => onAction('reopen', fingerprint!)}
                sx={{ textTransform: 'none', fontWeight: 500, fontSize: 12, borderColor: 'divider', color: 'text.secondary' }}>
                {t('issues.reopen')}
              </Button>
            )}
          </Box>
        )}
      </Paper>
    </>
  )
}

// Simple time-ago helper
function _timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return `${Math.floor(days / 7)}w ago`
}
