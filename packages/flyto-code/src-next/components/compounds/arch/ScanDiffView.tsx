import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Box, Alert, Chip, Tooltip, Typography } from '@mui/material'
import {
  AlertTriangle, ShieldCheck, ShieldOff,
  TrendingUp, TrendingDown, FileCode2, Activity, Skull, Zap,
} from 'lucide-react'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { getOrgScanDiff, type NewCVEDigest } from '@lib/engine'
import { useOrg } from '@hooks/useOrg'
import { colors, softBg } from '@/styles/designTokens'
import { SkeletonRows } from '@atoms/Skeleton'
import { JellyCard } from '@atoms/JellyCard'
import { severityColor } from '@atoms/SeverityChip'

// ScanDiffView — "what changed since last scan" per org. Compares
// the two most recent completed scans per repo and rolls the diff
// up into a single regression-spotting view.
//
// Why this exists: Pulse answers "what's most important now". This
// answers the orthogonal CTO/PM question "what got worse this week"
// — which is the first thing operators ask after a merge wave or a
// new deploy lands.

function deltaTone(d: number, lowerIsBetter = true): string {
  if (d === 0) return colors.semantic.neutral
  const worse = lowerIsBetter ? d > 0 : d < 0
  return worse ? colors.severity.high : colors.semantic.success
}

function deltaArrow(d: number): React.ReactNode {
  if (d > 0) return <TrendingUp size={14} />
  if (d < 0) return <TrendingDown size={14} />
  return null
}

export function ScanDiffView() {
  const { org } = useOrg()
  const orgId = org?.id

  const diffQ = useQuery({
    queryKey: qk.repos.scanDiff(orgId),
    queryFn: () => getOrgScanDiff(orgId!),
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  })

  const groupedByRepo = useMemo(() => {
    if (!diffQ.data) return new Map<string, NewCVEDigest[]>()
    const map = new Map<string, NewCVEDigest[]>()
    for (const item of diffQ.data.new_cves_top) {
      const key = item.repo_id
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(item)
    }
    return map
  }, [diffQ.data])

  if (diffQ.isLoading) {
    return <Box sx={{ p: 3 }}><SkeletonRows rows={8} /></Box>
  }
  if (diffQ.isError) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          {t('scanDiff.loadFailed')}
        </Alert>
      </Box>
    )
  }
  if (!diffQ.data) return null

  const d = diffQ.data

  return (
    <Box sx={{ height: '100%', overflowY: 'auto', p: 3 }}>
      {/* Header — Fuse typography hierarchy */}
      <div className="mb-6 flex flex-col">
        <Typography className="mb-1 text-3xl leading-none font-semibold tracking-tight">
          {t('scanDiff.title')}
        </Typography>
        <Typography className="text-md" color="text.secondary">
          {t('scanDiff.subtitle')}
        </Typography>
      </div>

      {/* Coverage summary */}
      <Box sx={{
        display: 'flex',
        gap: 2,
        mb: 3,
        p: 2,
        borderRadius: 1,
        backgroundColor: softBg(colors.semantic.neutral, 0.04),
        border: `1px solid ${softBg(colors.semantic.neutral, 0.1)}`,
        fontSize: 13,
        flexWrap: 'wrap',
      }}>
        <Box>
          <Box component="span" sx={{ color: 'text.secondary' }}>
            {t('scanDiff.reposCompared')}:
          </Box>
          <Box component="strong" sx={{ ml: 0.5 }}>{d.repos_compared}</Box>
        </Box>
        <Box>
          <Box component="span" sx={{ color: 'text.secondary' }}>
            {t('scanDiff.reposChanged')}:
          </Box>
          <Box component="strong" sx={{ ml: 0.5 }}>{d.repos_with_changes}</Box>
        </Box>
        <Box>
          <Box component="span" sx={{ color: 'text.secondary' }}>
            {t('scanDiff.reposNoHistory')}:
          </Box>
          <Box component="strong" sx={{ ml: 0.5 }}>{d.repos_no_history}</Box>
        </Box>
        <Box sx={{ ml: 'auto', color: 'text.secondary', fontSize: 12 }}>
          {t('scanDiff.comparedAt')}: {new Date(d.compared_at).toLocaleString()}
        </Box>
      </Box>

      {/* Delta tiles */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2, mb: 3 }}>
        <JellyCard delay={0}><DeltaTile
          icon={<AlertTriangle size={16} />}
          label={t('scanDiff.newCves')}
          delta={d.new_cves_count}
          lowerIsBetter
        /></JellyCard>
        <JellyCard delay={0.04}><DeltaTile
          icon={<ShieldCheck size={16} />}
          label={t('scanDiff.resolvedCves')}
          delta={d.resolved_cves_count}
          lowerIsBetter={false}
          flipSign
        /></JellyCard>
        <JellyCard delay={0.08}><DeltaTile
          icon={<ShieldOff size={16} />}
          label={t('scanDiff.secretsDelta')}
          delta={d.secrets_delta}
          lowerIsBetter
        /></JellyCard>
        <JellyCard delay={0.12}><DeltaTile
          icon={<Skull size={16} />}
          label={t('scanDiff.deadCodeDelta')}
          delta={d.dead_code_delta}
          lowerIsBetter
        /></JellyCard>
        <JellyCard delay={0.16}><DeltaTile
          icon={<Zap size={16} />}
          label={t('scanDiff.complexFnsDelta')}
          delta={d.complex_fns_delta}
          lowerIsBetter
        /></JellyCard>
        <JellyCard delay={0.20}><DeltaTile
          icon={<Activity size={16} />}
          label={t('scanDiff.taintFlowsDelta')}
          delta={d.taint_flows_delta}
          lowerIsBetter
        /></JellyCard>
      </Box>

      {/* New CVEs by repo */}
      <Box sx={{ mb: 1.5, fontSize: 13, fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {t('scanDiff.newCvesTop')}
      </Box>
      {groupedByRepo.size === 0 ? (
        <Box sx={{
          p: 3,
          textAlign: 'center',
          backgroundColor: softBg(colors.semantic.success, 0.06),
          border: `1px dashed ${softBg(colors.semantic.success, 0.25)}`,
          borderRadius: 1,
          color: colors.semantic.success,
        }}>
          <ShieldCheck size={24} />
          <Box sx={{ mt: 1, fontSize: 14, fontWeight: 500 }}>
            {t('scanDiff.noNewCves')}
          </Box>
        </Box>
      ) : (
        <JellyCard delay={0.24} noHover>
        <Box sx={{
          borderRadius: 1,
          border: `1px solid ${softBg(colors.semantic.neutral, 0.15)}`,
          overflow: 'hidden',
        }}>
          {Array.from(groupedByRepo.entries()).map(([repoId, items]) => (
            <Box key={repoId} sx={{
              borderTop: `1px solid ${softBg(colors.semantic.neutral, 0.08)}`,
              '&:first-of-type': { borderTop: 'none' },
            }}>
              <Box sx={{
                px: 2,
                py: 1,
                backgroundColor: softBg(colors.semantic.neutral, 0.05),
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                fontSize: 13,
                fontWeight: 600,
              }}>
                <FileCode2 size={14} style={{ color: 'currentcolor', opacity: 0.6 }} />
                {items[0].repo_name || repoId}
                <Chip
                  size="small"
                  label={`+${items.length}`}
                  sx={{
                    height: 18,
                    fontSize: 13,
                    backgroundColor: softBg(colors.severity.high, 0.12),
                    color: colors.severity.high,
                    fontWeight: 600,
                  }}
                />
              </Box>
              {items.map((item, idx) => (
                <Box key={`${item.cve_id}-${item.package}-${idx}`} sx={{
                  display: 'grid',
                  gridTemplateColumns: '140px 90px 1fr 140px 140px',
                  gap: 1.5,
                  px: 2,
                  py: 1,
                  borderTop: `1px solid ${softBg(colors.semantic.neutral, 0.05)}`,
                  fontSize: 12,
                  alignItems: 'center',
                }}>
                  <Box sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    {item.cve_id}
                  </Box>
                  <Chip
                    size="small"
                    label={item.severity}
                    sx={{
                      height: 18,
                      fontSize: 13,
                      backgroundColor: softBg(severityColor(item.severity), 0.12),
                      color: severityColor(item.severity),
                      fontWeight: 600,
                    }}
                  />
                  <Tooltip title={item.summary ?? ''}>
                    <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.summary ?? t('scanDiff.noSummary')}
                    </Box>
                  </Tooltip>
                  <Box sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                    {item.package}@{item.version}
                  </Box>
                  <Box sx={{ fontFamily: 'monospace', color: item.fixed_in ? colors.semantic.success : 'text.secondary' }}>
                    {item.fixed_in
                      ? `→ ${item.fixed_in}`
                      : t('scanDiff.noFix')}
                  </Box>
                </Box>
              ))}
            </Box>
          ))}
        </Box>
        </JellyCard>
      )}
    </Box>
  )
}

function DeltaTile({
  icon, label, delta, lowerIsBetter, flipSign = false,
}: {
  icon: React.ReactNode
  label: string
  delta: number
  lowerIsBetter: boolean
  flipSign?: boolean
}) {
  const tone = deltaTone(delta, lowerIsBetter)
  const display = flipSign ? Math.abs(delta) : (delta > 0 ? `+${delta}` : String(delta))
  return (
    <Box sx={{
      p: 2,
      borderRadius: 1,
      backgroundColor: softBg(tone, 0.06),
      border: `1px solid ${softBg(tone, 0.15)}`,
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: tone, mb: 0.5 }}>
        {icon}
        <Box sx={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {label}
        </Box>
      </Box>
      <Box sx={{ fontSize: 22, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.5, color: tone }}>
        {display}
        {deltaArrow(delta)}
      </Box>
    </Box>
  )
}
