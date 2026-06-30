import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { qk } from '@lib/queryKeys'
import Paper from '@mui/material/Paper'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import {
  FolderCode, Radar, GitBranch, Users, ArrowUpRight, Calendar, Trash2,
} from 'lucide-react'
import { getOrgHealthSummary, getComputedScore, type Organization } from '@lib/engine'
import { GRADE_COLORS } from '@compounds/_shared/scoring'
import { t } from '@lib/i18n';
import { queryResolved, querySucceeded, resolvedList } from '@lib/queryState'

/**
 * formatDate / formatTimeAgo — local copies because the parent file
 * keeps a different formatter for the dialog. Pulling them out into
 * a shared util would force a 3rd file for two 8-line helpers; not
 * worth the extra hop.
 */
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatTimeAgo(dateStr: string | undefined): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff < 0) return ''
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

const PROJECT_TYPE_COLOR = '#7c3aed'

/* ── SeverityDot ── compact "<count> <colored-dot>" pair.
   Used on the project card to render per-severity counts without
   eating a chip's worth of space. Colour is strictly semantic
   (red=critical, orange=high, yellow=at-risk). */
function SeverityDot({ color, count, title }: { color: string; count: number; title: string }) {
  return (
    <Box
      title={`${count} ${title}`}
      sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
    >
      <Box sx={{
        width: 8, height: 8, borderRadius: '50%',
        bgcolor: color,
        boxShadow: `0 0 0 3px ${color}22`,
      }} />
      <Typography variant="caption" fontWeight={700} sx={{ color, lineHeight: 1 }}>
        {count}
      </Typography>
    </Box>
  )
}

/**
 * OrgCard — one entry in the Projects grid. Renders the org's
 * health/grade summary, repo + member counts, severity-dot strip, and
 * a last-scan timestamp. Extracted from ProjectsPage 2026-05-19.
 */
export function OrgCard({ org, index, onDelete }: { org: Organization; index: number; onDelete: (org: Organization) => void }) {
  // `index` reserved for future stagger animation — currently unused.
  void index
  const navigate = useNavigate()
  const repoCount = org.repoCount ?? 0
  const memberCount = org.memberCount ?? 0

  const healthQ = useQuery({
    queryKey: qk.repos.healthSummary(org.id),
    queryFn: () => getOrgHealthSummary(org.id),
    staleTime: 60_000,
    // health-summary is repo-scoped, so repo-gating is correct here.
    enabled: repoCount > 0,
  })
  const scoreQ = useQuery({
    queryKey: qk.computedScore(org.id),
    queryFn: () => getComputedScore(org.id),
    staleTime: 60_000,
    // A3 (Codex review of 97e3d90): computed-score is org/surface-
    // level contract, NOT repo-scoped. Pre-fix this query was
    // disabled for external-only / cloud-only / container-only orgs
    // because they have repoCount=0 — they'd render "Unscanned" even
    // when the engine had a perfectly good org_score row for their
    // external surface. Fetch whenever the org exists; the no-score
    // envelope handles the "really has no score yet" case downstream.
    enabled: !!org.id,
  })
  const healthData = healthQ.data
  const computedScore = scoreQ.data
  const healthReady = queryResolved(healthQ, repoCount > 0)
  const scoreReady = queryResolved(scoreQ, !!org.id)

  const agg = healthData?.aggregated
  const scannedCount = querySucceeded(healthQ, repoCount > 0) ? healthData?.scanned_count ?? 0 : 0
  // A3 (P1-F PR4 trigger #4) — `score_available === false` is the
  // ONLY no-score signal. Pre-A3 this card had a triple fallback
  // chain (`computedScore ?? agg ?? '--'`) plus a `?? 250` floor
  // that silently rendered an unscored org as the visual F band's
  // bottom (250) on a grey grade chip. Both violations gone.
  //
  // `undefined` is treated as truthy here (legacy rollout window —
  // older engine revisions don't emit `score_available`). Once the
  // contract has shipped everywhere we can flip to a stricter
  // `=== true` check via the same helper.
  const hasScore =
    querySucceeded(scoreQ, !!org.id) &&
    computedScore?.score_available !== false &&
    computedScore?.overall_grade != null &&
    computedScore?.overall_display != null
  const grade = hasScore ? computedScore!.overall_grade! : null
  const score = hasScore ? computedScore!.overall_display! : null
  const criticalCount = agg?.critical_count ?? 0
  const highCount = agg?.high_count ?? 0
  const atRiskCount = agg?.at_risk_count ?? 0
  const gradeColor = grade ? (GRADE_COLORS[grade] ?? '#6b7280') : '#6b7280'

  // Latest scan across this org's repos. Pulls `scanned_at` from
  // each RepoHealthSummary and keeps the freshest one — surfaces
  // scan recency on the card so users can tell at a glance whether
  // a number is fresh or two weeks stale.
  const lastScanAt = useMemo(() => {
    let latest: string | undefined
    for (const r of resolvedList(healthData?.repos, healthQ, repoCount > 0)) {
      if (r.scanned_at && (!latest || r.scanned_at > latest)) {
        latest = r.scanned_at
      }
    }
    return latest
  }, [healthData?.repos, healthQ, repoCount])

  return (
    <Paper
      elevation={1}
      className="rounded-2xl overflow-hidden cursor-pointer group"
      onClick={() => navigate(`/projects/${org.id}`)}
      sx={{
        border: 1, borderColor: 'divider',
        transition: 'all 0.2s',
        '&:hover': { borderColor: 'primary.main', boxShadow: 8, transform: 'translateY(-2px)' },
      }}
    >
      {/* Grade accent bar — single colour matching the overall grade.
          Previously this drew one segment per grade A..F across the
          full width which read as a rainbow and dominated the card
          even when the project's actual grade was solid. The
          per-grade distribution is still surfaced inside the
          dashboard; the card itself just needs one calm signal. */}
      {scannedCount > 0 && (
        <Box sx={{ height: 3, bgcolor: gradeColor, opacity: 0.85 }} />
      )}

      <Box sx={{ p: 3 }}>
        {/* Row 1: Name + Grade */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 2 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <FolderCode size={18} style={{ opacity: 0.5, flexShrink: 0 }} />
              <Typography variant="h6" fontWeight={700} noWrap>{org.name}</Typography>
              <ArrowUpRight size={14} className="opacity-0 group-hover:opacity-40 transition-opacity" />
            </Box>
            <Typography variant="body2" color="text.secondary" noWrap sx={{ mt: 0.25 }}>
              {org.description || org.slug}
            </Typography>
            {org.projectType && org.projectType !== 'all' && (
              <Chip
                size="small"
                variant="outlined"
                label={
                  org.projectType === 'code' ? t('projects.type.codeShort') :
                  org.projectType === 'ctem' ? t('projects.type.ctemShort') :
                  t('projects.type.customShort')
                }
                sx={{
                  mt: 0.75,
                  height: 20, fontSize: 12, fontWeight: 600,
                  borderColor: `${PROJECT_TYPE_COLOR}55`,
                  color: PROJECT_TYPE_COLOR,
                }}
              />
            )}
          </Box>

          {hasScore ? (
            // A3 (Codex review of 97e3d90): render the grade as soon
            // as the engine has a real score — independent of
            // scannedCount. Pre-fix an external-only org with a real
            // org_score row still showed "Unscanned" because its
            // repo-scoped scannedCount was 0. computed-score is
            // org/surface-level contract, not repo-derived.
            <Box sx={{ textAlign: 'center', flexShrink: 0 }}>
              <Typography variant="h4" fontWeight={800} sx={{ color: gradeColor, lineHeight: 1 }}>
                {grade}
              </Typography>
              <Typography variant="caption" color="text.secondary">{score}</Typography>
            </Box>
          ) : (
            // Two distinct empty states fold into the same chip
            // affordance — both are "we have no number to render
            // right now, do not fabricate one":
            //   - Repo-mode org pre-scan (scannedCount === 0): no
            //     scan has run yet, nothing for the engine to score.
            //   - Any org with score_available=false: scan ran (or
            //     the surface is external-only and the discovery
            //     loop is mid-cycle) but the engine reports nothing
            //     scoreable yet.
            <Chip
              icon={<Radar size={12} />}
              label={
                !scoreReady || !healthReady
                  ? t('projects.loadingScore')
                  :
                scannedCount === 0 && repoCount > 0
                  ? t('projects.unscanned')
                  : (computedScore?.message ?? t('projects.noScoreYet'))
              }
              size="small"
              variant="outlined"
              sx={{ opacity: 0.5 }}
            />
          )}
        </Box>

        {/* Row 2: Stats */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5, pt: 2, borderTop: 1, borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <GitBranch size={13} style={{ opacity: 0.4 }} />
            <Typography variant="body2"><strong>{repoCount}</strong> {t('projects.repos')}</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Users size={13} style={{ opacity: 0.4 }} />
            <Typography variant="body2"><strong>{memberCount}</strong> {t('projects.members')}</Typography>
          </Box>
          {scannedCount > 0 && (criticalCount > 0 || highCount > 0 || atRiskCount > 0) && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 'auto' }}>
              {criticalCount > 0 && (
                <SeverityDot color="#ef4444" count={criticalCount} title={t('projects.critical')} />
              )}
              {highCount > 0 && (
                <SeverityDot color="#f97316" count={highCount} title={t('projects.high')} />
              )}
              {criticalCount === 0 && highCount === 0 && atRiskCount > 0 && (
                <SeverityDot color="#eab308" count={atRiskCount} title={t('projects.atRisk')} />
              )}
            </Box>
          )}
        </Box>

        {/* Row 3: Last scan timestamp */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1.25 }}>
          <Calendar size={11} style={{ opacity: 0.3 }} />
          <Typography variant="caption" color="text.secondary">
            {lastScanAt
              ? `${t('projects.lastScan')} ${formatTimeAgo(lastScanAt)}`
              : `${t('projects.created')} ${formatDate(org.createdAt)}`}
          </Typography>
        </Box>
      </Box>

      <Box sx={{
        px: 3, py: 1.5,
        borderTop: 1, borderColor: 'divider',
        display: 'flex', justifyContent: 'flex-end',
        opacity: 0, transition: 'opacity 0.2s',
        '.group:hover &': { opacity: 1 },
      }}>
        <Button
          size="small"
          color="error"
          startIcon={<Trash2 size={12} />}
          onClick={(e) => { e.stopPropagation(); onDelete(org) }}
          sx={{ textTransform: 'none', fontSize: '0.75rem' }}
        >
          {t('projects.delete')}
        </Button>
      </Box>
    </Paper>
  )
}
