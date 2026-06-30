/**
 * OrgManagerView — the manager-mode surface for the Organization page.
 *
 * Engineer mode keeps the interactive org-chart canvas (OrgTree).
 * Manager mode answers the questions a leader actually asks of the
 * org page: how big is my team, how much of my plan am I using, and
 * how healthy is the org overall — without dragging nodes around.
 *
 * Every number is sourced from a REAL engine endpoint:
 *   - getMyCapabilities  → plan / tier / seat & repo caps / role
 *   - listConnectedRepos → connected repo count + provider mix
 *   - getGitHubOrgMembers→ member headcount (when GitHub connected)
 *   - listInvitations    → pending seat invitations
 *   - getComputedScore   → org posture grade for the health gauge
 *
 * Client functions are imported by DIRECT FILE PATH (decoupling rule).
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import { alpha, useTheme } from '@mui/material/styles'
import { Users, GitBranch } from 'lucide-react'

import {
  ManagerDashboard,
  ChartCard,
  KpiCard,
  DonutChart,
  ManagerHero,
  HeroStat,
  type DonutDatum,
} from '@compounds/_shared'

import { useOrg } from '@hooks/useOrg'
import { getMyCapabilities } from '@lib/engine/platform/capabilities'
import { listInvitations } from '@lib/engine/platform/orgs'
import { listConnectedRepos } from '@lib/engine/code/repos'
import { getGitHubOrgMembers } from '@lib/engine/github'
import { getComputedScore } from '@lib/engine/scoring/scoring'
import { qk } from '@lib/queryKeys'
import { t, tOr } from '@lib/i18n';
import { colors } from '@/styles/designTokens'

const ACCENT = colors.tech

export function OrgManagerView() {
  const { org } = useOrg()
  const orgId = org?.id
  const theme = useTheme()

  const capsQ = useQuery({
    queryKey: qk.organization.managerCapabilities(orgId),
    queryFn: () => getMyCapabilities(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const reposQ = useQuery({
    queryKey: qk.organization.managerRepos(orgId),
    queryFn: () => listConnectedRepos(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const repos = reposQ.data?.repos ?? []
  const hasGitHub = repos.some((r) => r.provider === 'github')

  const membersQ = useQuery({
    queryKey: qk.organization.managerMembers(orgId),
    queryFn: () => getGitHubOrgMembers(orgId!, org!.slug),
    enabled: !!orgId && !!org?.slug && hasGitHub,
    staleTime: 60_000,
  })

  const invitesQ = useQuery({
    queryKey: qk.organization.managerInvites(orgId),
    queryFn: () => listInvitations(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const scoreQ = useQuery({
    queryKey: qk.computedScore(orgId),
    queryFn: () => getComputedScore(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })

  const caps = capsQ.data
  const score = scoreQ.data
  const hasScore = !!score && score.score_available !== false && score.overall_display != null

  const memberCount = membersQ.data?.members?.length ?? 0
  const pendingInviteRows = useMemo(
    () => (invitesQ.data?.invitations ?? []).filter((i) => !i.acceptedAt),
    [invitesQ.data],
  )
  const pendingInvites = pendingInviteRows.length

  // Provider mix donut from connected repos.
  const providerMix: DonutDatum[] = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of repos) {
      counts.set(r.provider, (counts.get(r.provider) ?? 0) + 1)
    }
    return [...counts.entries()].map(([provider, value]) => ({
      label: provider === 'github' ? 'GitHub' : provider === 'gitlab' ? 'GitLab' : provider,
      value,
    }))
  }, [repos])

  const seatCap = caps?.seat_cap ?? 0
  const repoCap = caps?.repo_cap ?? 0

  // Seat utilization — the page's focal datum. Seats in use = counted
  // members + outstanding invitations (an invite holds a seat).
  const seatsUsed = memberCount + pendingInvites
  const hasSeatCap = seatCap > 0
  const utilPct = hasSeatCap ? Math.min(100, Math.round((seatsUsed / seatCap) * 100)) : 0
  // 70% amber, 90% red — matches the seat-pressure thresholds.
  const utilTone =
    utilPct >= 90 ? colors.semantic.danger : utilPct >= 70 ? colors.semantic.warning : ACCENT

  return (
    <ManagerDashboard
      title={t('organization.manager.title')}
      subtitle={org?.name
        ? t('organization.manager.subtitleWithOrg', { org: org.name })
        : t('organization.manager.subtitle')}
      accent={ACCENT}
      titleIcon={<Users size={20} />}
      layout="full-bleed"
      hero={
        <ManagerHero
          accent={ACCENT}
          icon={<Users size={15} />}
          minHeight={200}
          visual={
            hasSeatCap ? (
              <CapacityBar pct={utilPct} tone={utilTone} used={seatsUsed} cap={seatCap} />
            ) : undefined
          }
          headline={{
            label: t('organization.manager.seatUtilization'),
            value: hasSeatCap ? t('common.countOfTotal', { count: seatsUsed, total: seatCap }) : seatsUsed || '—',
            unit: t('organization.manager.seats'),
            sub: hasSeatCap
              ? tOr(
                  repoCap ? 'organization.manager.seatPlanWithRepoCap' : 'organization.manager.seatPlan',
                  repoCap ? '{pct}% of plan seats in use · {repos} of {repoCap} repos connected' : '{pct}% of plan seats in use · {repos} repos connected',
                  { pct: utilPct, repos: repos.length, repoCap },
                )
              : tOr(
                  repoCap ? 'organization.manager.noSeatCapWithRepoCap' : 'organization.manager.noSeatCap',
                  repoCap ? 'No seat cap on this plan · {repos} of {repoCap} repos connected' : 'No seat cap on this plan',
                  { repos: repos.length, repoCap },
                ),
            delta:
              hasSeatCap && utilPct >= 70 ? (
                <Chip
                  size="small"
                  label={utilPct >= 90 ? t('organization.manager.atCapacity') : t('organization.manager.fillingUp')}
                  sx={{
                    fontWeight: 700,
                    fontSize: 12,
                    bgcolor: alpha(utilTone, 0.14),
                    color: utilTone,
                  }}
                />
              ) : undefined,
          }}
          aside={
            <Box>
              <HeroStat
                icon={<Users size={14} />}
                tone={ACCENT}
                label={t('organization.manager.headcount')}
                value={hasGitHub ? memberCount : '—'}
              />
              <HeroStat
                icon={<GitBranch size={14} />}
                tone={ACCENT}
                label={t('organization.manager.repos')}
                value={reposQ.isSuccess ? repos.length : '—'}
              />
            </Box>
          }
        />
      }
      actions={
        caps ? (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Chip label={t('organization.manager.planChip', { value: caps.plan ?? '—' })} size="small" sx={{ fontWeight: 700, textTransform: 'capitalize' }} />
            <Chip label={t('organization.manager.tierChip', { value: caps.tier ?? '—' })} size="small" variant="outlined" sx={{ fontWeight: 700, textTransform: 'uppercase' }} />
            <Chip label={t('organization.manager.roleChip', { value: caps.role ?? '—' })} size="small" variant="outlined" sx={{ fontWeight: 700, textTransform: 'capitalize' }} />
          </Box>
        ) : undefined
      }
      kpis={
        <>
          <KpiCard
            label={t('organization.manager.teamMembers')}
            value={hasGitHub ? memberCount : null}
            loading={membersQ.isLoading}
            empty={!hasGitHub}
            emptyHint={t('organization.manager.empty.connectGithubMembers')}
          />
          <KpiCard
            label={t('organization.manager.pendingInvites')}
            value={invitesQ.isSuccess ? pendingInvites : null}
            loading={invitesQ.isLoading}
          />
          <KpiCard
            label={t('organization.manager.connectedRepos')}
            value={reposQ.isSuccess ? repos.length : null}
            unit={repoCap ? t('common.ofCount', { count: repoCap }) : undefined}
            loading={reposQ.isLoading}
          />
          <KpiCard
            label={t('organization.manager.postureGrade')}
            value={hasScore ? (score!.overall_grade ?? '—') : null}
            loading={scoreQ.isLoading}
            empty={!scoreQ.isLoading && !hasScore}
            emptyHint={t('organization.manager.empty.pendingFirstScan')}
          />
        </>
      }
      charts={
        <>
          <ChartCard title={t('organization.manager.repositorySources')}>
            {providerMix.length > 0 ? (
              <DonutChart data={providerMix} totalLabel={t('organization.manager.repos')} height={240} />
            ) : (
              <Box sx={{ height: 240, display: 'grid', placeItems: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  {t('organization.manager.empty.repositories')}
                </Typography>
              </Box>
            )}
          </ChartCard>

          <ChartCard title={t('organization.manager.pendingInvitesList')}>
            {invitesQ.isSuccess ? (
              pendingInviteRows.length > 0 ? (
                <Box sx={{ height: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1, pr: 0.5 }}>
                  {pendingInviteRows.map((inv, i) => (
                    <Box
                      key={inv.id ?? inv.email ?? i}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.5,
                        px: 1.25,
                        py: 1,
                        borderRadius: 1,
                        bgcolor: alpha(ACCENT, theme.palette.mode === 'dark' ? 0.1 : 0.06),
                        border: `1px solid ${alpha(ACCENT, 0.18)}`,
                      }}
                    >
                      <Box
                        sx={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          flexShrink: 0,
                          display: 'grid',
                          placeItems: 'center',
                          bgcolor: alpha(ACCENT, 0.18),
                          color: ACCENT,
                        }}
                      >
                        <Users size={14} />
                      </Box>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                          {inv.email ?? '—'}
                        </Typography>
                        {inv.role && (
                          <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'capitalize' }}>
                            {inv.role}
                          </Typography>
                        )}
                      </Box>
                      <Chip label={t('common.pending')} size="small" variant="outlined" sx={{ fontSize: 12, fontWeight: 700 }} />
                    </Box>
                  ))}
                </Box>
              ) : (
                <Box sx={{ height: 240, display: 'grid', placeItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    {t('organization.manager.empty.pendingInvitations')}
                  </Typography>
                </Box>
              )
            ) : (
              <Box sx={{ height: 240, display: 'grid', placeItems: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  {t('organization.manager.loadingInvitations')}
                </Typography>
              </Box>
            )}
          </ChartCard>
        </>
      }
      narrative={
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
            {t('common.summary')}
          </Typography>
	          <Typography variant="body2" color="text.secondary">
	            {caps
	              ? t('organization.manager.narrative.summary', {
	                    org: org?.name ?? t('organization.manager.thisOrganization'),
	                    plan: caps.plan ?? '',
	                    tier: String(caps.tier ?? '').toUpperCase(),
	                    repos: repos.length,
	                    repoCapClause: repoCap ? t('organization.manager.narrative.repoCapClause', { repoCap }) : '',
	                    membersClause: hasGitHub ? t('organization.manager.narrative.membersClause', { count: memberCount }) : '',
	                    invitesClause: pendingInvites ? t('organization.manager.narrative.invitesClause', { count: pendingInvites }) : '',
	                  })
	              : t('organization.manager.loadingCapabilities')}
	          </Typography>
	        </Box>
	      }
	    />
	  )
	}

/** CapacityBar — the hero's focal visual: a vertical-fill seat-capacity
 *  meter. Fill tone passes 70% amber / 90% red via the caller. Pure
 *  presentational, dual-mode safe (track from theme, fill from accent). */
function CapacityBar({
  pct, tone, used, cap,
}: { pct: number; tone: string; used: number; cap: number }) {
  const theme = useTheme()
  const clamped = Math.max(0, Math.min(100, pct))
  return (
    <Box sx={{ width: 188, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
      <Box
        sx={{
          position: 'relative',
          width: 64,
          height: 150,
          borderRadius: 2,
          overflow: 'hidden',
          bgcolor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.1 : 0.08),
          border: `1px solid ${alpha(tone, 0.3)}`,
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: `${clamped}%`,
            bgcolor: alpha(tone, 0.85),
            boxShadow: `0 0 22px ${alpha(tone, 0.5)}`,
            transition: 'height 0.4s ease',
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <Typography
            sx={{
              fontFamily: 'ui-monospace, monospace',
              fontSize: 22,
              fontWeight: 800,
              color: clamped >= 55 ? theme.palette.common.white : tone,
            }}
          >
            {clamped}%
          </Typography>
        </Box>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
        {t('organization.manager.capacitySeats', { used, cap })}
      </Typography>
    </Box>
  )
}
