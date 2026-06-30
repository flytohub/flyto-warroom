import { useQuery } from '@tanstack/react-query'
import {
  Box, Drawer, IconButton, Alert, Chip, Tooltip, Typography, Divider,
} from '@mui/material'
import {
  Package, X, GitBranch, ExternalLink, Sparkles, AlertTriangle,
  CheckCircle2, ShieldAlert, Flame, GitPullRequest,
} from 'lucide-react'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { getFindingByPackage, type PackageFinding, type PackageRepoGroup, type PackageSubissue } from '@lib/engine'
import { colors, softBg } from '@/styles/designTokens'
import { SkeletonRows } from '@atoms/Skeleton'

// PackageFindingDrawer — aggregated cross-repo view for one package.
//
// Opens from IssuesView when the operator clicks a package@version
// chip on a CVE row. Answers "how does this single package affect
// the whole org" — repos touching it, autofix availability, open PRs
// pinned to this dep, last verification verdicts, taint hits, blast
// radius. Single endpoint call (POST /findings/by-package), no
// chatty fan-out per repo.

const SEVERITY_TONE: Record<string, string> = {
  CRITICAL: colors.severity.critical,
  HIGH:     colors.severity.high,
  MEDIUM:   colors.severity.medium,
  MODERATE: colors.severity.medium,
  LOW:      colors.severity.low,
}

function tone(sev: string): string {
  return SEVERITY_TONE[sev.toUpperCase()] ?? colors.semantic.neutral
}

export interface PackageFindingDrawerProps {
  open: boolean
  orgId: string
  pkg: string | null
  type: string  // cve | sast | license | ...
  onClose: () => void
}

export function PackageFindingDrawer({
  open, orgId, pkg, type, onClose,
}: PackageFindingDrawerProps) {
  const query = useQuery({
    queryKey: qk.security.findingsByPackage(orgId, pkg, type),
    queryFn: () => getFindingByPackage(orgId, pkg!, type),
    enabled: open && !!orgId && !!pkg,
    staleTime: 5 * 60_000,
    retry: false,
  })

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100%', md: 720 } } }}
    >
      {pkg && (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* Header */}
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1.5,
            px: 2.5, py: 2,
            borderBottom: '1px solid', borderColor: 'divider',
          }}>
            <Package size={20} style={{ color: colors.brand }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {t('issues.packageDrawer.label')}
              </Typography>
              <Typography variant="h6" sx={{ fontFamily: 'monospace', fontWeight: 700, lineHeight: 1.2 }}>
                {pkg}
              </Typography>
            </Box>
            <IconButton
              size="small"
              onClick={onClose}
              aria-label={t('common.close')}
              title={t('common.close')}
            >
              <X size={18} />
            </IconButton>
          </Box>

          <Box sx={{ flex: 1, overflowY: 'auto', p: 2.5 }}>
            {query.isLoading && <SkeletonRows rows={6} />}

            {query.isError && (
              <Alert severity="error" sx={{ fontSize: 13 }}>
                {t('issues.packageDrawer.loadFailed')}
              </Alert>
            )}

            {query.data && <PackageBody data={query.data} />}
          </Box>
        </Box>
      )}
    </Drawer>
  )
}

function PackageBody({ data }: { data: PackageFinding }) {
  const sevTone = tone(data.worst_severity)
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* Top summary tiles */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 1.5 }}>
        <SummaryTile
          icon={<ShieldAlert size={14} />}
          label={t('issues.packageDrawer.worstSev')}
          value={data.worst_severity}
          color={sevTone}
        />
        <SummaryTile
          icon={<AlertTriangle size={14} />}
          label={t('issues.packageDrawer.issues')}
          value={String(data.issue_count)}
          color={colors.severity.high}
        />
        <SummaryTile
          icon={<GitBranch size={14} />}
          label={t('issues.packageDrawer.repos')}
          value={String(data.repo_count)}
          color={colors.tech}
        />
        <SummaryTile
          icon={<Flame size={14} />}
          label={t('issues.packageDrawer.blast')}
          value={String(data.blast_radius)}
          color={data.blast_radius >= 60 ? colors.severity.critical : data.blast_radius >= 30 ? colors.severity.high : colors.semantic.neutral}
        />
      </Box>

      {/* Fix / autofix banner */}
      {(data.fix_available || data.autofix_available) && (
        <Box sx={{
          p: 1.5, borderRadius: 1,
          bgcolor: softBg(colors.semantic.success, 0.08),
          border: `1px solid ${softBg(colors.semantic.success, 0.25)}`,
          display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap',
        }}>
          <CheckCircle2 size={16} style={{ color: colors.semantic.success, flexShrink: 0 }} />
          <Typography variant="body2" sx={{ fontSize: 13 }}>
            {data.fix_available && data.fix_version && (
              <>
                {t('issues.packageDrawer.fixAt')}{' '}
                <Box component="strong" sx={{ fontFamily: 'monospace' }}>{data.fix_version}</Box>
              </>
            )}
            {data.autofix_available && (
              <>
                {data.fix_available ? ' · ' : ''}
                <Sparkles size={12} style={{ verticalAlign: 'middle', color: colors.brand }} />{' '}
                {t('issues.packageDrawer.autofix')}
              </>
            )}
          </Typography>
        </Box>
      )}

      {/* Description */}
      {data.description && (
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 0.5 }}>
            {t('issues.packageDrawer.descSection')}
          </Typography>
          <Typography variant="body2" sx={{ fontSize: 13, lineHeight: 1.6 }}>
            {data.description}
          </Typography>
        </Box>
      )}

      {/* Open PRs */}
      {data.open_prs && data.open_prs.length > 0 && (
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 1 }}>
            <GitPullRequest size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            {t('issues.packageDrawer.openPrs')} ({data.open_prs.length})
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            {data.open_prs.slice(0, 5).map((pr) => (
              <Box
                key={pr.pr_number}
                component="a"
                href={pr.html_url}
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1,
                  p: 1, borderRadius: 1,
                  border: '1px solid', borderColor: 'divider',
                  fontSize: 12, color: 'inherit', textDecoration: 'none',
                  '&:hover': { borderColor: 'primary.main', bgcolor: softBg(colors.brand, 0.04) },
                }}
              >
                <Box sx={{ fontFamily: 'monospace', color: 'text.secondary', flexShrink: 0 }}>
                  #{pr.pr_number}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {pr.title}
                </Box>
                {pr.is_draft && (
                  <Chip label="draft" size="small" sx={{ height: 18, fontSize: 12, bgcolor: softBg(colors.semantic.neutral, 0.15), color: 'text.secondary' }} />
                )}
                <ExternalLink size={12} style={{ opacity: 0.4, flexShrink: 0 }} />
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* Per-repo breakdown */}
      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 1 }}>
          {t('issues.packageDrawer.byRepo')}
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {data.repo_groups.map((rg) => (
            <RepoGroupRow key={rg.repo_id} group={rg} />
          ))}
        </Box>
      </Box>

      {/* Taint signal */}
      {data.taint_categories && data.taint_categories.length > 0 && (
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 0.5 }}>
            {t('issues.packageDrawer.taint')} ({data.unsanitized_flows} {t('issues.packageDrawer.unsanitized')})
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {data.taint_categories.map((cat) => (
              <Chip key={cat} label={cat} size="small" sx={{ height: 20, fontSize: 13 }} />
            ))}
          </Box>
        </Box>
      )}

      {/* Verifications */}
      {data.verifications && data.verifications.length > 0 && (
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 1 }}>
            {t('issues.packageDrawer.verifications')}
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {data.verifications.slice(0, 5).map((v) => (
              <Box key={v.workflow_id} sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 12 }}>
                <Chip label={v.verdict || v.status} size="small" sx={{ height: 18, fontSize: 13, fontWeight: 600 }} />
                <Box sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>
                  {new Date(v.ran_at).toLocaleString()}
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  )
}

function RepoGroupRow({ group }: { group: PackageRepoGroup }) {
  return (
    <Box sx={{
      borderRadius: 1, border: '1px solid', borderColor: 'divider',
      overflow: 'hidden',
    }}>
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1,
        px: 1.5, py: 0.75,
        bgcolor: 'action.hover',
        fontSize: 12, fontWeight: 600,
      }}>
        <GitBranch size={12} style={{ opacity: 0.7 }} />
        {group.repo_name || group.repo_id}
        <Chip
          label={group.issues.length}
          size="small"
          sx={{ ml: 'auto', height: 18, fontSize: 13, bgcolor: softBg(colors.severity.high, 0.15), color: colors.severity.high, fontWeight: 700 }}
        />
      </Box>
      <Divider />
      {group.issues.slice(0, 4).map((sub, idx) => (
        <PackageSubissueRow key={`${sub.fingerprint}-${idx}`} sub={sub} />
      ))}
      {group.issues.length > 4 && (
        <Box sx={{ p: 1, fontSize: 13, color: 'text.secondary', textAlign: 'center' }}>
          {t('issues.packageDrawer.moreCount').replace('{n}', String(group.issues.length - 4))}
        </Box>
      )}
    </Box>
  )
}

function PackageSubissueRow({ sub }: { sub: PackageSubissue }) {
  const sevTone = tone(sub.severity)
  return (
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: '120px 70px 1fr 110px',
      gap: 1, alignItems: 'center',
      px: 1.5, py: 0.75,
      fontSize: 12,
      borderTop: '1px solid', borderColor: 'divider',
      '&:first-of-type': { borderTop: 'none' },
    }}>
      <Box sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
        {sub.cve_id || sub.fingerprint.slice(0, 8)}
      </Box>
      <Chip
        label={sub.severity}
        size="small"
        sx={{
          height: 18, fontSize: 12, fontWeight: 700,
          bgcolor: softBg(sevTone, 0.15), color: sevTone,
        }}
      />
      <Tooltip title={sub.title}>
        <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {sub.title}
        </Box>
      </Tooltip>
      <Box sx={{ fontFamily: 'monospace', color: sub.fixed_in ? colors.semantic.success : 'text.secondary' }}>
        {sub.fixed_in ? `→ ${sub.fixed_in}` : sub.version}
      </Box>
    </Box>
  )
}

function SummaryTile({
  icon, label, value, color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  color: string
}) {
  return (
    <Box sx={{
      p: 1.25, borderRadius: 1,
      bgcolor: softBg(color, 0.06),
      border: `1px solid ${softBg(color, 0.15)}`,
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color, mb: 0.25 }}>
        {icon}
        <Box sx={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {label}
        </Box>
      </Box>
      <Box sx={{ fontSize: 18, fontWeight: 700 }}>{value}</Box>
    </Box>
  )
}
