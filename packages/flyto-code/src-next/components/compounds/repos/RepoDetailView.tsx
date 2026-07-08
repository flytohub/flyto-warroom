import { useState, useEffect, useRef, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import {
  ArrowLeft,
  GitBranch, FileCode, Globe2, Box as LucideBox, Package, Shield, Play, Loader2,
  Lock, ExternalLink, GitPullRequest, ShieldAlert, CheckCircle2,
  ShieldCheck, XCircle, Upload, Wand2, Copy, AlertTriangle,
  Network, Route, Settings2, Zap, Sparkles,
} from 'lucide-react'
import {
  Box, Button, Chip, Dialog, DialogContent, DialogTitle,
  IconButton, LinearProgress, Paper, Tooltip, Typography,
} from '@mui/material'
import { TabBar } from '@atoms/TabBar'
import { LoadingState } from '@atoms/LoadingState'
import { t, tOr } from '@lib/i18n';
import { getRepoProfile, triggerScan, getAIFixContext, type ConnectedRepo, type RepoProfile, type HealthDimension } from '@lib/engine'
import { getComputedScore, type RepoScoreResultServer } from '@lib/engine'
import { qk } from '@lib/queryKeys'
import { useRepoDetail } from '@hooks/useRepoDetails'
import { useOrg } from '@hooks/useOrg'
import { FixPlanPanel } from './FixPlanPanel'
import { ScanControlsCard } from './ScanControlsCard'
import { AIProposalsPanel } from './AIProposalsPanel'
import { VerifyTimeline } from './VerifyTimeline'
import { ScanUploadDropzone } from '@compounds/_shared/ScanUploadDropzone'
import { REPO_GRADE_COLORS as GRADE_COLORS } from './colors'
import {
  flytoChipSx,
  flytoCircleIconBoxSx,
  flytoIconBoxSx,
  flytoOutlinedActionSx,
  flytoRadii,
  flytoSectionLabelSx,
  flytoTone,
  flytoToneIconStyle,
  flytoTypography,
  type FlytoTone,
} from '@/styles/visualSystem'
import {
  LanguageBar, InfoSection, CVERow, IntelCard,
  RecentVerifications, VerifyTargetsEditor,
  buildIntelItems,
} from './repo_detail/parts'

function BackToReposButton({ onBack }: { onBack: () => void }) {
  const label = tOr('repoDetail.backToRepos', 'Back to repositories')

  return (
    <Tooltip title={label} arrow>
      <IconButton
        size="small"
        onClick={onBack}
        aria-label={label}
        sx={{
          width: 36,
          height: 36,
          borderRadius: 1,
          flex: '0 0 auto',
          border: '1px solid',
          borderColor: 'divider',
          color: flytoTone.brand.fg,
          bgcolor: 'background.paper',
          '&:hover': {
            borderColor: flytoTone.brand.border,
            bgcolor: flytoTone.brand.bg,
          },
        }}
      >
        <ArrowLeft size={16} />
      </IconButton>
    </Tooltip>
  )
}

function CenteredDetailState({ children, onBack }: { children: ReactNode; onBack: () => void }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box sx={{ px: { xs: 1.5, md: 3 }, pt: 2, flexShrink: 0 }}>
        <BackToReposButton onBack={onBack} />
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
        {children}
      </Box>
    </Box>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   Hero Header — Grade + KPIs + Repo metadata
   ═══════════════════════════════════════════════════════════════════ */

function HeroHeader({ profile, repo, repoId, openIssues, scanning, onScan, onUpload, onCopyPrompt, promptCopied, isLocal, unifiedScore, onBack }: {
  profile: RepoProfile
  repo: ConnectedRepo | null
  repoId: string
  openIssues?: number
  scanning: boolean
  onScan: () => void
  onUpload: () => void
  onCopyPrompt: () => void
  promptCopied: boolean
  isLocal: boolean
  unifiedScore?: RepoScoreResultServer
  onBack: () => void
}) {
  // Unified score only
  const grade = unifiedScore?.grade ?? '--'
  const gradeStyle = GRADE_COLORS[grade] ?? { bg: 'var(--color-card-border)', color: 'text.secondary', border: 'var(--color-border)' }

  const kpis = [
    { icon: FileCode, label: t('repoDetail.files'), value: profile.file_count ?? 0, tone: 'tech' as const },
    { icon: Globe2, label: t('repoDetail.apis'), value: profile.api_definition_count ?? 0, tone: 'success' as const },
    { icon: LucideBox, label: t('repoDetail.models'), value: profile.model_count ?? 0, tone: 'brand' as const },
    { icon: Package, label: t('repoDetail.deps'), value: profile.dependency_count ?? 0, tone: 'warning' as const },
    ...(openIssues != null ? [{ icon: GitPullRequest, label: t('repoList.issues'), value: openIssues, tone: 'danger' as const }] : []),
  ]

  return (
    <Box sx={{ px: { xs: 1.5, md: 3 }, pt: 2.5, pb: 2, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
      {/* Row 1: Repo name + actions */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0, flex: { xs: '1 1 100%', md: '1 1 260px' } }}>
          <BackToReposButton onBack={onBack} />
          <GitBranch size={18} style={{ ...flytoToneIconStyle('success', 1), flexShrink: 0 }} />
          <Typography variant="h6" fontWeight={700} noWrap sx={{ color: 'text.primary' }}>
            {repo?.fullName ?? repoId}
          </Typography>
          {repo?.isPrivate && <Lock size={14} style={{ opacity: 0.4, flexShrink: 0 }} />}
          {repo?.htmlUrl && (
            <IconButton
              component="a"
              href={repo.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              size="small"
              aria-label={t('repoList.openInProvider')}
              title={t('repoList.openInProvider')}
            >
              <ExternalLink size={14} />
            </IconButton>
          )}
        </Box>
        <Box sx={{
          display: 'flex',
          gap: 1,
          flexWrap: 'wrap',
          justifyContent: { xs: 'flex-start', md: 'flex-end' },
          flex: { xs: '1 1 100%', md: '0 1 auto' },
          minWidth: 0,
          '& .MuiButton-root': {
            height: 36,
            whiteSpace: 'nowrap',
          },
        }}>
          {isLocal ? (
            <Button variant="outlined" size="small" color="secondary" startIcon={<Upload size={14} />} onClick={onUpload}>
              {t('repo.uploadScan')}
            </Button>
          ) : (
            <>
              <Button variant="contained" size="small" color="secondary"
                startIcon={scanning ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                onClick={onScan} disabled={scanning}>
                {scanning ? t('repoList.scanningAll') : t('repoList.scan')}
              </Button>
              <Button variant="outlined" size="small" color="secondary" startIcon={<Upload size={14} />} onClick={onUpload}>
                {t('repo.uploadScan')}
              </Button>
              <Button variant="outlined" size="small"
                startIcon={promptCopied ? <Copy size={14} /> : <Wand2 size={14} />}
                onClick={onCopyPrompt}
                sx={flytoOutlinedActionSx(promptCopied ? 'success' : 'brand')}>
                {promptCopied ? t('repo.promptCopied') : t('repo.aiPrompt')}
              </Button>
            </>
          )}
        </Box>
      </Box>

      {/* Row 2: Grade + KPIs + Metadata */}
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '92px minmax(0, 1fr)', lg: '108px minmax(0, 1fr) minmax(160px, 220px)' },
        gap: 1.5,
        alignItems: 'stretch',
      }}>
        {/* Grade block */}
        <Paper variant="outlined" sx={{
          px: 2, py: 1.5, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          bgcolor: gradeStyle.bg, borderColor: gradeStyle.border, borderRadius: flytoRadii.surface, minWidth: 0,
        }}>
          <Typography variant="h3" fontWeight={800} sx={{ color: gradeStyle.color, lineHeight: 1 }}>
            {grade}
          </Typography>
          <Typography variant="caption" sx={{ color: gradeStyle.color, fontWeight: 600, mt: 0.5 }}>
            {unifiedScore ? unifiedScore.display : '--'}
          </Typography>
        </Paper>

        {/* KPI tiles */}
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(118px, 1fr))', gap: 1, minWidth: 0 }}>
          {kpis.map((kpi) => {
            const Icon = kpi.icon
            const tone = flytoTone[kpi.tone]
            return (
              <Paper key={kpi.label} variant="outlined" sx={{
                p: 1.2, minHeight: 74, minWidth: 0, display: 'flex', alignItems: 'center', gap: 1,
                borderTop: `2px solid ${tone.border}`,
                bgcolor: tone.bg,
                overflow: 'hidden',
              }}>
                <Icon size={16} style={{ color: tone.fg, flexShrink: 0, opacity: 0.8 }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="subtitle2" fontWeight={700} color="text.primary" noWrap>{kpi.value}</Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>{kpi.label}</Typography>
                </Box>
              </Paper>
            )
          })}
        </Box>

        {/* Quick metadata */}
        <Box sx={{
          display: 'flex',
          flexDirection: { xs: 'row', lg: 'column' },
          flexWrap: 'wrap',
          gap: 0.75,
          alignItems: { xs: 'center', lg: 'flex-start' },
          justifyContent: 'center',
          minWidth: 0,
          gridColumn: { xs: '1 / -1', lg: 'auto' },
          overflow: 'hidden',
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
            <Chip label={profile.project_type} size="small" color="secondary" variant="outlined" />
            {profile.project_sub_type && (
              <Typography variant="caption" color="text.secondary" noWrap>{profile.project_sub_type}</Typography>
            )}
          </Box>
          {profile.frameworks && profile.frameworks.length > 0 && (
            <Typography variant="caption" color="text.secondary" noWrap sx={{ minWidth: 0, maxWidth: { xs: '100%', lg: 200 } }}>
              {profile.frameworks.map(fw => fw.name).join(', ')}
            </Typography>
          )}
          {profile.project_license && (
            <Typography variant="caption" color="text.secondary" noWrap>
              {profile.project_license}
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   Tab: Overview — Health dimensions + Project info + Languages
   ═══════════════════════════════════════════════════════════════════ */

function ActionBanner({ profile, onTabChange }: { profile: RepoProfile; onTabChange: (tab: TabKey) => void }) {
  const actions: Array<{ text: string; tone: FlytoTone; icon: typeof AlertTriangle; tab?: TabKey }> = []

  const critCve = profile.cve_critical ?? 0
  const highCve = profile.cve_high ?? 0
  const secrets = profile.secret_count ?? 0
  const complexFn = profile.complex_functions ?? 0

  if (critCve > 0) {
    actions.push({
      text: t('repoDetail.actionCriticalCve').replace('{n}', String(critCve)),
      tone: 'danger', icon: AlertTriangle, tab: 'security',
    })
  }
  if (highCve > 0) {
    actions.push({
      text: t('repoDetail.actionHighCve').replace('{n}', String(highCve)),
      tone: 'warning', icon: ShieldAlert, tab: 'security',
    })
  }
  if (secrets > 0) {
    actions.push({
      text: t('repoDetail.actionSecrets').replace('{n}', String(secrets)),
      tone: 'danger', icon: Lock, tab: 'security',
    })
  }
  if (complexFn > 10) {
    actions.push({
      text: t('repoDetail.actionComplexity').replace('{n}', String(complexFn)),
      tone: 'warning', icon: Zap, tab: 'intelligence',
    })
  }
  if ((profile.dead_code_count ?? 0) > 0) {
    actions.push({
      text: t('repoDetail.actionDeadCode'),
      tone: 'warning', icon: FileCode, tab: 'intelligence',
    })
  }

  if (actions.length === 0) {
    return (
      <Paper variant="outlined" sx={{
        p: 2, borderRadius: flytoRadii.surface, display: 'flex', alignItems: 'center', gap: 2,
        borderLeft: `4px solid ${flytoTone.success.fg}`, bgcolor: flytoTone.success.bg,
      }}>
        <CheckCircle2 size={18} style={flytoToneIconStyle('success', 1)} />
        <Typography variant="body2" sx={{ ...flytoTypography.surfaceSubtitle, color: flytoTone.success.fg }}>
          {t('repoDetail.actionGoodShape')}
        </Typography>
      </Paper>
    )
  }

  const topTone = flytoTone[actions[0].tone]

  return (
    <Paper variant="outlined" sx={{
      p: 2, borderRadius: flytoRadii.surface,
      borderLeft: `4px solid ${topTone.fg}`,
      bgcolor: topTone.bg,
    }}>
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
        <AlertTriangle size={15} style={{ color: topTone.fg }} />
        {t('repoDetail.actionTitle')}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {actions.map((action, i) => {
          const Icon = action.icon
          const tone = flytoTone[action.tone]
          return (
            <Box key={i} sx={{
              display: 'flex', alignItems: 'center', gap: 1.5, py: 0.5,
              cursor: action.tab ? 'pointer' : 'default',
              '&:hover': action.tab ? { opacity: 0.8 } : {},
            }} onClick={() => action.tab && onTabChange(action.tab)}>
              <Icon size={14} style={{ color: tone.fg, flexShrink: 0 }} />
              <Typography variant="body2" color="text.primary" sx={{ flex: 1 }}>{action.text}</Typography>
              {action.tab && (
                <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                  {action.tab === 'security'
                    ? t('repoDetail.viewIssues')
                    : action.tab === 'fixplan'
                    ? t('repoDetail.viewFixPlan')
                    : t('repoDetail.tabIntelligence')}
                  {' \u203A'}
                </Typography>
              )}
            </Box>
          )
        })}
      </Box>
    </Paper>
  )
}

function OverviewTab({ profile, repoId, repo, onTabChange }: { profile: RepoProfile; repoId: string; repo: ConnectedRepo | null; onTabChange: (tab: TabKey) => void }) {
  const dims = profile.health_dimensions
  const dimEntries: Array<{ key: string; label: string; dim: HealthDimension; icon: typeof Shield; tone: FlytoTone }> = []
  if (dims?.security) dimEntries.push({ key: 'security', label: t('nav.security'), dim: dims.security, icon: Shield, tone: 'danger' })
  if (dims?.complexity) dimEntries.push({ key: 'complexity', label: t('repoDetail.complexity'), dim: dims.complexity, icon: Zap, tone: 'warning' })
  if (dims?.dead_code) dimEntries.push({ key: 'dead_code', label: t('repoDetail.deadCode'), dim: dims.dead_code, icon: FileCode, tone: 'warning' })
  if (dims?.coverage) dimEntries.push({ key: 'coverage', label: t('item.coverage'), dim: dims.coverage, icon: ShieldCheck, tone: 'success' })

  const metaItems = [
    { label: t('repoDetail.secrets'), value: profile.secret_count ?? 0, tone: (profile.secret_count ?? 0) > 0 ? 'danger' : 'success', icon: Lock },
    { label: t('repoDetail.taintFlows'), value: profile.taint_flow_count ?? 0, tone: (profile.taint_flow_count ?? 0) > 0 ? 'warning' : 'neutral', icon: Route },
    { label: t('repoDetail.docScore'), value: `${profile.doc_score ?? 0}/100`, tone: 'tech', icon: FileCode },
    { label: t('repoDetail.connections'), value: profile.connection_count ?? 0, tone: 'brand', icon: Network },
    { label: t('repoDetail.orphans'), value: profile.orphan_count ?? 0, tone: (profile.orphan_count ?? 0) > 5 ? 'warning' : 'neutral', icon: XCircle },
    { label: t('repoDetail.complexity'), value: `${profile.complex_functions ?? 0} fn`, tone: (profile.complex_functions ?? 0) > 20 ? 'warning' : 'neutral', icon: Zap },
  ]

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* Action Guidance */}
      <ActionBanner profile={profile} onTabChange={onTabChange} />

      {/* Health Dimensions — individual cards */}
      {dimEntries.length > 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 2 }}>
          {dimEntries.map((d) => {
            const Icon = d.icon
            const pct = d.dim.max > 0 ? (d.dim.score / d.dim.max) * 100 : 0
            const statusTones: Record<string, FlytoTone> = { PASS: 'success', WARN: 'warning', FAIL: 'danger' }
            const barTone = flytoTone[statusTones[d.dim.status] ?? d.tone]
            return (
              <Paper key={d.key} variant="outlined" sx={{
                p: 2, borderRadius: flytoRadii.surface, position: 'relative', overflow: 'hidden',
                borderTop: `3px solid ${barTone.fg}`,
              }}>
                {/* Background glow */}
                <Box sx={{
                  position: 'absolute', top: 0, right: 0, width: 80, height: 80,
                  background: `radial-gradient(circle at top right, ${barTone.bg}, transparent 70%)`,
                }} />
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, position: 'relative' }}>
                  <Box sx={flytoIconBoxSx(statusTones[d.dim.status] ?? d.tone, 28)}>
                    <Icon size={14} style={{ color: barTone.fg }} />
                  </Box>
                  <Typography variant="body2" fontWeight={700} color="text.primary">{d.label}</Typography>
                  <Chip label={d.dim.status} size="small" sx={{
                    ...flytoChipSx(statusTones[d.dim.status] ?? d.tone, 18),
                    ml: 'auto',
                  }} />
                </Box>
                <Box sx={{ position: 'relative' }}>
                  <LinearProgress variant="determinate" value={pct} sx={{
                    height: 6, borderRadius: flytoRadii.pill, bgcolor: 'action.hover',
                    '& .MuiLinearProgress-bar': { bgcolor: barTone.fg, borderRadius: flytoRadii.pill },
                  }} />
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75, textAlign: 'right' }}>
                    {d.dim.score}/{d.dim.max}
                  </Typography>
                </Box>
              </Paper>
            )
          })}
        </Box>
      )}

      {/* Key Metrics — small stat tiles */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(84px, 1fr))', gap: 1.25 }}>
        {metaItems.map((m) => {
          const Icon = m.icon
          const tone = flytoTone[m.tone as FlytoTone]
          return (
            <Paper key={m.label} variant="outlined" sx={{
              p: 1.25, minHeight: 86, borderRadius: flytoRadii.surface, textAlign: 'center',
              borderBottom: `2px solid ${tone.border}`,
              minWidth: 0,
              overflow: 'hidden',
            }}>
              <Icon size={14} style={{ color: tone.fg, opacity: 0.7, margin: '0 auto 4px' }} />
              <Typography variant="subtitle2" color="text.primary" noWrap sx={flytoTypography.metricLabel}>
                {m.value}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                {m.label}
              </Typography>
            </Paper>
          )
        })}
      </Box>

      {/* Two-column: Project Stack + Languages */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2.5 }}>
        {/* Left: Frameworks / Services / Patterns */}
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: flytoRadii.surface, position: 'relative', overflow: 'hidden' }}>
          <Box sx={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 3,
            background: flytoTone.brand.gradient,
          }} />
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Package size={15} style={flytoToneIconStyle('brand', 1)} />
            {t('repoDetail.projectInfo') || 'Project Info'}
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {profile.frameworks && profile.frameworks.length > 0 && (
              <InfoSection label={t('repoDetail.frameworks')}>
                <Box className="flex flex-wrap gap-1">
                  {profile.frameworks.map((fw) => (
                    <Chip key={fw.name} size="small"
                      label={`${fw.name}${fw.version ? ` ${fw.version}` : ''} (${fw.type})`}
                      sx={flytoChipSx('brand')} />
                  ))}
                </Box>
              </InfoSection>
            )}
            {profile.services && profile.services.length > 0 && (
              <InfoSection label={t('repoDetail.services')}>
                <Box className="flex flex-wrap gap-1">
                  {profile.services.map((svc) => (
                    <Chip key={svc} size="small" label={svc}
                      sx={flytoChipSx('success')} />
                  ))}
                </Box>
              </InfoSection>
            )}
            {profile.patterns && profile.patterns.length > 0 && (
              <InfoSection label={t('repoDetail.patterns')}>
                <Box className="flex flex-wrap gap-1">
                  {profile.patterns.map((p) => (
                    <Chip key={p} size="small" label={p}
                      sx={flytoChipSx('tech')} />
                  ))}
                </Box>
              </InfoSection>
            )}
            {profile.project_license && (
              <InfoSection label={t('repoDetail.license')}>
                <Chip size="small" label={profile.project_license}
                  sx={flytoChipSx('warning')} />
              </InfoSection>
            )}
          </Box>
        </Paper>

        {/* Right: Languages */}
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: flytoRadii.surface, position: 'relative', overflow: 'hidden' }}>
          <Box sx={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 3,
            background: flytoTone.tech.gradient,
          }} />
          {profile.languages && <LanguageBar languages={profile.languages} />}
        </Paper>
      </Box>

      {/* Scan operations — folded in from the former Scan & Remediation Ops
          strip so scanning lives with the repo's operational overview. */}
      <Box>
        <Typography variant="overline" sx={flytoSectionLabelSx}>
          {t('repos.ops.tabScanControls')}
        </Typography>
        <Box sx={{ mt: 1 }}>
          <ScanControlsCard repoId={repoId} repo={repo} />
        </Box>
      </Box>
    </Box>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   Tab: Security — CVEs + Verifications + Allowlist
   ═══════════════════════════════════════════════════════════════════ */

function SecurityTab({ profile, repoId, orgId, isLocal, repoName: _repoName, onUpload: _onUpload }: {
  profile: RepoProfile; repoId: string; orgId: string | undefined; isLocal: boolean; repoName: string; onUpload: () => void
}) {
  const qc = useQueryClient()

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* CVE Summary Banner */}
      {(profile.cve_total ?? 0) > 0 ? (
        <Paper variant="outlined" sx={{
          p: 2, borderRadius: flytoRadii.surface,
          borderLeft: `4px solid ${(profile.cve_critical ?? 0) > 0 ? flytoTone.danger.fg : flytoTone.warning.fg}`,
          bgcolor: (profile.cve_critical ?? 0) > 0 ? flytoTone.danger.bg : flytoTone.warning.bg,
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1.5 }}>
            <ShieldAlert size={18} style={{ color: (profile.cve_critical ?? 0) > 0 ? flytoTone.danger.fg : flytoTone.warning.fg }} />
            <Typography variant="subtitle2" fontWeight={700} color="text.primary">
              {t('repoDetail.vulnerabilities')}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, ml: 'auto' }}>
              {(profile.cve_critical ?? 0) > 0 && (
                <Chip label={`${profile.cve_critical} ${t('dashboard.critical')}`} color="error" size="small" />
              )}
              {(profile.cve_high ?? 0) > 0 && (
                <Chip label={`${profile.cve_high} ${t('dashboard.high')}`} size="small"
                  sx={{ bgcolor: 'warning.dark', color: 'warning.contrastText' }} />
              )}
              <Chip label={`${profile.cve_total} ${t('repoDetail.total')}`} size="small" variant="outlined" />
            </Box>
          </Box>
          {profile.cve_vulnerabilities && profile.cve_vulnerabilities.length > 0 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {profile.cve_vulnerabilities.slice(0, 10).map((v, idx) => (
                <CVERow key={`${v.id}-${idx}`} cve={v} />
              ))}
            </Box>
          )}
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: flytoRadii.surface, display: 'flex', alignItems: 'center', gap: 2 }}>
          <Shield size={18} style={flytoToneIconStyle('success', 1)} />
          <Typography variant="body2" color="success.main" fontWeight={600}>
            {t('repoDetail.noVulnerabilities')}
          </Typography>
        </Paper>
      )}

      {/* Recent Verifications */}
      <RecentVerifications repoId={repoId} />

      {/* Verification Allowlist */}
      <VerifyTargetsEditor repoId={repoId} />

      {/* Upload for local repos */}
      {isLocal && (
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: flytoRadii.surface }}>
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
            {t('repo.uploadNewScan')}
          </Typography>
          <ScanUploadDropzone repoId={repoId} compact
            onSuccess={() => {
              qc.invalidateQueries({ queryKey: qk.repos.profile(repoId) })
              qc.invalidateQueries({ queryKey: qk.repos.healthSummary(orgId) })
            }} />
        </Paper>
      )}
    </Box>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   Tab: Intelligence — Engineering quality metrics
   ═══════════════════════════════════════════════════════════════════ */

function IntelligenceTab({ profile }: { profile: RepoProfile }) {
  const items = buildIntelItems(profile)
  if (items.length === 0) return null

  // Split into scored (affect health) and display-only
  const scored = items.filter(i => ['error_handling', 'tech_debt', 'perf_patterns', 'import_health'].includes(i.key))
  const display = items.filter(i => !['error_handling', 'tech_debt', 'perf_patterns', 'import_health'].includes(i.key))

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* Scored metrics — affect health grade */}
      {scored.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: flytoRadii.surface }}>
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Zap size={15} style={flytoToneIconStyle('tech', 1)} />
            {t('repoDetail.healthImpacting')}
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
            {scored.map((item) => <IntelCard key={item.key} item={item} />)}
          </Box>
        </Paper>
      )}

      {/* Display-only metrics */}
      {display.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: flytoRadii.surface }}>
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Settings2 size={15} style={flytoToneIconStyle('neutral', 1)} />
            {t('repoDetail.observability')}
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
            {display.map((item) => <IntelCard key={item.key} item={item} />)}
          </Box>
        </Paper>
      )}
    </Box>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   Tab: Fix Plan — delegated to FixPlanPanel
   ═══════════════════════════════════════════════════════════════════ */

function FixPlanTab({ repoId, repoName }: { repoId: string; repoName: string }) {
  // The Fix Plan tab is the repo's remediation surface, so the AI CVE-bump
  // proposals and the closed-loop verify timeline (formerly in the separate
  // Scan & Remediation Ops strip) live here alongside the static fix plan.
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <FixPlanPanel repoId={repoId} repoName={repoName} />
      <Box>
        <Typography variant="overline" sx={flytoSectionLabelSx}>
          {t('repos.ops.tabAiProposals')}
        </Typography>
        <Box sx={{ mt: 1 }}>
          <AIProposalsPanel repoId={repoId} />
        </Box>
      </Box>
      <Box>
        <Typography variant="overline" sx={flytoSectionLabelSx}>
          {t('repos.ops.verifyTimeline')}
        </Typography>
        <Box sx={{ mt: 1 }}>
          <VerifyTimeline repoId={repoId} />
        </Box>
      </Box>
    </Box>
  )
}


/* ═══════════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════════ */

interface RepoDetailViewProps {
  repoId: string
  repo: ConnectedRepo | null
}

const ALL_TAB_KEYS = ['overview', 'security', 'intelligence', 'fixplan'] as const
type TabKey = typeof ALL_TAB_KEYS[number]

const TAB_ICONS: Record<TabKey, typeof Shield> = {
  overview: ShieldCheck,
  security: ShieldAlert,
  intelligence: Zap,
  fixplan: Sparkles,
}

const TAB_I18N_MAP: Record<TabKey, string> = {
  overview: 'repoDetail.tabOverview',
  security: 'repoDetail.tabSecurity',
  intelligence: 'repoDetail.tabIntelligence',
  fixplan: 'repoDetail.tabFixPlan',
}

/** Only show tabs that have data to display */
function getVisibleTabs(profile: RepoProfile): TabKey[] {
  const tabs: TabKey[] = ['overview', 'security']
  if (buildIntelItems(profile).length > 0) tabs.push('intelligence')
  tabs.push('fixplan')
  return tabs
}

export function RepoDetailView({ repoId, repo }: RepoDetailViewProps) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [scanning, setScanning] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [promptCopied, setPromptCopied] = useState(false)
  const [promptMissing, setPromptMissing] = useState<string[] | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('overview')

  const { data: repoDetail } = useRepoDetail(repo?.ownerName ?? '', repo?.repoName ?? '')

  const { org } = useOrg()
  const orgId = repo?.orgId ?? org?.id
  const returnToRepos = () => {
    if (orgId) {
      navigate(`/projects/${orgId}/repos?mode=engineer`)
    } else {
      navigate(-1)
    }
  }
  const { data: profile, isLoading } = useQuery({
    queryKey: qk.repos.profile(repoId),
    queryFn: () => getRepoProfile(repoId),
    staleTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  })

  // Unified grade from computed-score
  const { data: computedScore } = useQuery({
    queryKey: qk.computedScore(org?.id),
    queryFn: () => getComputedScore(org!.id),
    enabled: !!org?.id,
    staleTime: 60_000,
  })
  const unifiedRepoScore = computedScore?.repo_scores?.find(r => r.repo_id === repoId)

  const visibleTabs = profile ? getVisibleTabs(profile) : ALL_TAB_KEYS
  const safeTab = visibleTabs.includes(activeTab) ? activeTab : 'overview'

  const isLocal = repo?.scanMode === 'local'

  const [scanError, setScanError] = useState<string | null>(null)

  // SSE-driven scan completion.
  //
  // The engine publishes scan.queued/running/complete events on the same
  // org SSE stream that useOrgEvents() mounts at the WorkspacePage root;
  // every one of those events with our repo_id invalidates
  // qk.repos.profile(repoId), so the profile query above refetches without
  // any polling here. We watch that refetch: when the profile's scan
  // identity (scanId, falling back to scannedAt) advances past the value
  // captured at trigger time, the new scan has landed and we drop the
  // "Scanning…" view. A single timeout (NOT a poll loop) surfaces an
  // explicit, honest error if no fresh result arrives — never a silent
  // hang.
  const SCAN_TIMEOUT_MS = 5 * 60_000
  const scanBaselineRef = useRef<string | null>(null)
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function clearScanTimer() {
    if (scanTimerRef.current != null) {
      clearTimeout(scanTimerRef.current)
      scanTimerRef.current = null
    }
  }

  // Identity of the profile's latest scan — changes only when a new scan
  // result is persisted. Used to detect "the scan I triggered finished".
  const scanIdentity = profile?.scanId ?? profile?.scannedAt ?? null

  useEffect(() => {
    if (!scanning) return
    // The triggered scan has landed once a fresh scan identity differs from
    // the one captured at trigger time (a brand-new scanId/scannedAt).
    if (scanIdentity != null && scanIdentity !== scanBaselineRef.current) {
      clearScanTimer()
      setScanning(false)
    }
  }, [scanning, scanIdentity])

  // Clean up any pending timeout on unmount.
  useEffect(() => clearScanTimer, [])

  async function handleScan() {
    if (isLocal) {
      setUploadOpen(true)
      return
    }
    setScanError(null)
    scanBaselineRef.current = scanIdentity
    clearScanTimer()
    setScanning(true)
    try {
      await triggerScan(repoId)
      // Belt-and-suspenders: bust the cache immediately so we don't wait on
      // a possibly-dropped SSE event for the queued/running transition. The
      // terminal refresh still rides on the scan.complete invalidation.
      qc.invalidateQueries({ queryKey: qk.repos.profile(repoId) })
      scanTimerRef.current = setTimeout(() => {
        scanTimerRef.current = null
        setScanning(false)
        setScanError(t('repoDetail.scanTimeout'))
        // Re-pull in case the terminal event was dropped while we waited.
        qc.invalidateQueries({ queryKey: qk.repos.profile(repoId) })
      }, SCAN_TIMEOUT_MS)
    } catch {
      setScanning(false)
      clearScanTimer()
      setScanError(t('repoDetail.scanFailed'))
    }
  }

  async function handleCopyAIPrompt() {
    try {
      const result = await getAIFixContext(repoId)
      if (result.ready && result.prompt) {
        await navigator.clipboard.writeText(result.prompt)
        setPromptCopied(true)
        setPromptMissing(null)
        setTimeout(() => setPromptCopied(false), 3000)
      } else {
        setPromptMissing(result.missing ?? ['unknown'])
      }
    } catch {
      setPromptMissing(['api_error'])
    }
  }

  // ── Scanning state ──
  if (scanning) {
    return (
      <CenteredDetailState onBack={returnToRepos}>
        <LoadingState variant="spinner" py={0} />
        <Typography variant="body1" fontWeight={600} color="text.primary">{t('repoDetail.scanning')}</Typography>
        <Typography variant="body2" color="text.secondary">{t('repoDetail.scanningDesc')}</Typography>
      </CenteredDetailState>
    )
  }

  // ── Loading state ──
  if (isLoading) {
    return (
      <CenteredDetailState onBack={returnToRepos}>
        <LoadingState variant="spinner" py={0} />
      </CenteredDetailState>
    )
  }

  // ── Empty state ──
  //
  // Two honestly-distinct cases collapse here, and we must NOT conflate them:
  //   (a) no scan has ever completed → "run a scan" prompt
  //   (b) a scan completed but found 0 analyzable files → that is a real,
  //       truthful result, not an absence of data.
  // The engine stamps `scannedAt` (and `scanId`) on the health response only
  // when a profile/audit scan result row exists (handlers_health.go) — the
  // never-scanned fallback object carries neither. So their presence is the
  // ground truth for "has this repo ever been scanned".
  const hasCompletedScan = !!profile && (profile.scannedAt != null || profile.scanId != null)
  if (!profile || profile.file_count === 0) {
    const isZeroFileResult = hasCompletedScan && profile!.file_count === 0
    return (
      <CenteredDetailState onBack={returnToRepos}>
        <Box sx={flytoCircleIconBoxSx(80)}>
          {isZeroFileResult
            ? <CheckCircle2 size={36} style={{ opacity: 0.25 }} />
            : <Shield size={36} style={{ opacity: 0.2 }} />}
        </Box>
        <Typography variant="h6" fontWeight={600} color="text.primary">
          {isZeroFileResult
            ? t('repoDetail.scanZeroFiles')
            : t('repoDetail.noProfile')}
        </Typography>
        {isZeroFileResult && (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', maxWidth: 420 }}>
            {t('repoDetail.scanZeroFilesDesc')}
          </Typography>
        )}
        {isLocal ? (
          <>
            <Button variant="outlined" size="small" color="secondary" startIcon={<Upload size={14} />}
              onClick={() => setUploadOpen(true)}>
              {t('repo.uploadScan')}
            </Button>
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', maxWidth: 400 }}>
              {t('repo.localHint')}
            </Typography>
          </>
        ) : (
          <>
            <Button variant="contained" size="small" color="secondary" startIcon={<Play size={14} />}
              onClick={handleScan} disabled={scanning}>
              {isZeroFileResult ? t('repoDetail.rerunScan') : t('repoDetail.runScan')}
            </Button>
            {scanError && (
              <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 1 }}>
                {scanError}
              </Typography>
            )}
          </>
        )}

        {/* Upload dialog */}
        <Dialog open={uploadOpen} onClose={() => setUploadOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>{t('repo.uploadScanTitle')}</DialogTitle>
          <DialogContent>
            <ScanUploadDropzone repoId={repoId} compact
              onSuccess={() => { setUploadOpen(false); qc.invalidateQueries({ queryKey: qk.repos.profile(repoId) }) }} />
          </DialogContent>
        </Dialog>
      </CenteredDetailState>
    )
  }

  // ── Main layout: Hero + Tabs ──
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Sticky Hero Header */}
      <HeroHeader
        profile={profile} repo={repo} repoId={repoId}
        openIssues={repoDetail?.openIssues}
        scanning={scanning} onScan={handleScan} onUpload={() => setUploadOpen(true)}
        onCopyPrompt={handleCopyAIPrompt} promptCopied={promptCopied} isLocal={isLocal}
        unifiedScore={unifiedRepoScore}
        onBack={returnToRepos}
      />

      {/* Missing data warning */}
      {promptMissing && (
        <Box sx={{ px: 3, pt: 1.5 }}>
          <Paper variant="outlined" sx={{ p: 1.5, borderColor: flytoTone.warning.border, bgcolor: flytoTone.warning.bg, borderRadius: flytoRadii.surface }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <AlertTriangle size={14} style={{ color: flytoTone.warning.fg, flexShrink: 0 }} />
              <Typography variant="caption" sx={{ color: flytoTone.warning.fg, flex: 1 }}>
                {t('repo.promptMissing')}
                {' — '}{promptMissing.join(', ')}
              </Typography>
              <Button size="small" variant="text" onClick={() => setPromptMissing(null)}
                sx={{ ...flytoOutlinedActionSx('neutral'), minWidth: 'auto' }}>
                {t('common.dismiss')}
              </Button>
            </Box>
          </Paper>
        </Box>
      )}

      {/* Tab bar */}
      <Box sx={{ px: { xs: 1.5, md: 3 }, pt: 1, flexShrink: 0 }}>
        <TabBar
          value={safeTab}
          onChange={(v) => setActiveTab(v as TabKey)}
          noDivider
          sx={{ minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0.5 } }}
          items={visibleTabs.map((key) => {
            const Icon = TAB_ICONS[key]
            return {
              value: key,
              label: tOr(TAB_I18N_MAP[key] as 'repoDetail.tabOverview', key),
              icon: <Icon size={14} />,
            }
          })}
        />
      </Box>

      {/* Tab content — scrollable */}
      <Box sx={{ flex: 1, overflow: 'auto', px: { xs: 1.5, md: 3 }, py: 2.5 }}>
        {safeTab === 'overview' && <OverviewTab profile={profile} repoId={repoId} repo={repo} onTabChange={setActiveTab} />}
        {safeTab === 'security' && (
          <SecurityTab profile={profile} repoId={repoId} orgId={repo?.orgId ?? org?.id} isLocal={isLocal}
            repoName={repo?.fullName ?? repoId} onUpload={() => setUploadOpen(true)} />
        )}
        {safeTab === 'intelligence' && <IntelligenceTab profile={profile} />}
        {safeTab === 'fixplan' && <FixPlanTab repoId={repoId} repoName={repo?.fullName ?? repoId} />}
      </Box>

      {/* Upload scan modal */}
      <Dialog open={uploadOpen} onClose={() => setUploadOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('repo.uploadScanTitle')}</DialogTitle>
        <DialogContent>
          <ScanUploadDropzone repoId={repoId} compact
            onSuccess={() => {
              setUploadOpen(false)
              qc.invalidateQueries({ queryKey: qk.repos.profile(repoId) })
            }} />
        </DialogContent>
      </Dialog>
    </Box>
  )
}
