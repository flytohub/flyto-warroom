import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material'
import { alpha, styled } from '@mui/material/styles'
import { Building2, Download, ListChecks, RefreshCw, ShieldCheck, ShieldX } from 'lucide-react'

import { EmptyStateGuide } from '@atoms/EmptyStateGuide'
import { FlytoPageHeader } from '@atoms/FlytoPageHeader'
import { LoadingState } from '@atoms/LoadingState'
import { QueryError } from '@atoms/QueryError'
import { SectionCard } from '@atoms/SectionCard'
import { StatusDot } from '@atoms/StatusDot'
import { useCapabilities } from '@hooks/useCapabilities'
import { useOrg } from '@hooks/useOrg'
import {
  downloadEnterpriseAuditExport,
  getEventScope,
  getEnterpriseProfile,
  getEnterpriseReadiness,
  listEnterpriseAuditEvents,
  type EnterpriseAuditEvent,
  type EnterpriseProfile,
  type EnterpriseReadinessDomain,
  type EnterpriseReadinessResponse,
  type EnterpriseReadinessStatus,
} from '@lib/engine'
import { t, tOr } from '@lib/i18n'
import { qk } from '@lib/queryKeys'

const EXPORT_ACTION = 'audit:export'
const LIMIT = 100

const Root = styled(Box)({
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
})

const HeaderBand = styled(Box)(({ theme }) => ({
  flexShrink: 0,
  paddingLeft: theme.spacing(2),
  paddingRight: theme.spacing(2),
  paddingTop: theme.spacing(2),
  [theme.breakpoints.up('md')]: {
    paddingLeft: theme.spacing(4),
    paddingRight: theme.spacing(4),
    paddingTop: theme.spacing(3),
  },
}))

const ContentPane = styled(Box)(({ theme }) => ({
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  paddingLeft: theme.spacing(2),
  paddingRight: theme.spacing(2),
  paddingBottom: theme.spacing(3),
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(2),
  [theme.breakpoints.up('md')]: {
    paddingLeft: theme.spacing(4),
    paddingRight: theme.spacing(4),
  },
}))

const BoundaryGrid = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: '1fr',
  gap: theme.spacing(1.5),
  [theme.breakpoints.up('md')]: {
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  },
}))

const BoundaryTile = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'strong',
})<{ strong?: boolean }>(({ theme, strong }) => ({
  minWidth: 0,
  border: '1px solid',
  borderColor: theme.palette.divider,
  borderRadius: theme.shape.borderRadius,
  padding: theme.spacing(1.5),
  backgroundColor: alpha(theme.palette.primary.main, strong ? 0.08 : 0.03),
}))

const ReadinessGrid = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: '1fr',
  gap: theme.spacing(1.5),
  [theme.breakpoints.up('lg')]: {
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  },
}))

const ReadinessDomainCard = styled(Box)(({ theme }) => ({
  minWidth: 0,
  border: '1px solid',
  borderColor: theme.palette.divider,
  borderRadius: theme.shape.borderRadius,
  padding: theme.spacing(1.5),
  backgroundColor: theme.palette.background.paper,
}))

const EvidenceCode = styled('code')(({ theme }) => ({
  display: 'inline-flex',
  maxWidth: '100%',
  borderRadius: theme.shape.borderRadius,
  padding: theme.spacing(0.25, 0.75),
  backgroundColor: alpha(theme.palette.text.primary, 0.06),
  color: theme.palette.text.secondary,
  fontSize: 12,
  overflowWrap: 'anywhere',
}))

const TileLabel = styled(Typography)(({ theme }) => ({
  display: 'block',
  marginBottom: theme.spacing(0.5),
}))

const WrapValue = styled(Typography)({
  overflowWrap: 'anywhere',
})

const FilterControl = styled(FormControl)({
  minWidth: 180,
})

const TableScroller = styled(Box)({
  overflowX: 'auto',
})

const TimeCell = styled(TableCell)({
  whiteSpace: 'nowrap',
})

const ResourceCell = styled(TableCell)({
  maxWidth: 220,
})

const ResourceSecondary = styled(Typography)({
  display: 'block',
})

export function EnterpriseControlPlaneView() {
  const { org } = useOrg()
  const orgId = org?.id
  const caps = useCapabilities(orgId)
  const [outcome, setOutcome] = useState<string>('all')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const scopeQ = useQuery({
    queryKey: qk.platform.eventScope(),
    queryFn: getEventScope,
    staleTime: 5 * 60_000,
  })
  const isPlatformAdmin = !!scopeQ.data?.is_platform_admin
  const accessDenied = !scopeQ.isLoading && !isPlatformAdmin

  const profileQ = useQuery({
    queryKey: qk.platform.enterpriseProfile(),
    queryFn: getEnterpriseProfile,
    enabled: isPlatformAdmin,
    staleTime: 60_000,
  })
  const profile = profileQ.data
  const queryOutcome = outcome === 'all' ? undefined : outcome

  const eventsQ = useQuery({
    queryKey: qk.platform.enterpriseAuditEvents(orgId, queryOutcome, LIMIT),
    queryFn: () => listEnterpriseAuditEvents({ org: orgId!, outcome: queryOutcome, limit: LIMIT }),
    enabled: isPlatformAdmin && !!orgId && !!profile?.enterprise_enabled,
    staleTime: 30_000,
  })
  const readinessQ = useQuery({
    queryKey: qk.platform.enterpriseReadiness(orgId),
    queryFn: () => getEnterpriseReadiness(orgId!),
    enabled: isPlatformAdmin && !!orgId && !!profile?.enterprise_enabled,
    staleTime: 30_000,
  })

  const canExport = isPlatformAdmin && (caps.canDoAction(EXPORT_ACTION) || caps.canUseAction(EXPORT_ACTION))
  const events = eventsQ.data?.events ?? []
  const verification = eventsQ.data?.verification
  const boundary = useMemo(() => profile ? profileCards(profile) : [], [profile])

  async function exportJson() {
    if (!orgId || !canExport) return
    setExporting(true)
    setExportError(null)
    try {
      const blob = await downloadEnterpriseAuditExport({ org: orgId, outcome: queryOutcome, limit: LIMIT, format: 'json' })
      if (typeof window !== 'undefined' && typeof URL.createObjectURL === 'function') {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `enterprise-audit-${orgId}.json`
        a.click()
        URL.revokeObjectURL(url)
      }
      await eventsQ.refetch()
    } catch (err) {
      setExportError(err instanceof Error ? err.message : t('enterprise.audit.exportFailed'))
    } finally {
      setExporting(false)
    }
  }

  return (
    <Root>
      <HeaderBand>
        <FlytoPageHeader
          title={t('enterprise.title')}
          subtitle={t('enterprise.subtitle')}
          bottomGap={4}
        />
      </HeaderBand>

      <ContentPane>
        {scopeQ.isLoading && (
          <SectionCard icon={<ShieldCheck size={16} />} title={t('enterprise.profile.title')}>
            <LoadingState rows={3} />
          </SectionCard>
        )}

        {accessDenied && (
          <SectionCard
            icon={<ShieldX size={16} />}
            title={tOr('enterprise.platformAdminOnlyTitle', 'Platform admin access required')}
          >
            <EmptyStateGuide
              title={tOr('enterprise.platformAdminOnlyTitle', 'Platform admin access required')}
              description={
                scopeQ.isError
                  ? tOr('enterprise.platformAdminScopeError', 'Could not verify platform-admin scope. Check your session and try again.')
                  : tOr('enterprise.platformAdminOnlyDesc', 'Enterprise control-plane evidence is restricted to platform administrators.')
              }
            />
          </SectionCard>
        )}

        {!scopeQ.isLoading && !accessDenied && (
          <>
        <SectionCard
          icon={<Building2 size={16} />}
          title={t('enterprise.profile.title')}
          action={profile ? <ProfileChip profile={profile} /> : undefined}
        >
          {profileQ.isLoading && <LoadingState rows={3} />}
          {profileQ.isError && <QueryError error={profileQ.error} onRetry={profileQ.refetch} label={t('enterprise.profile.loadFailed')} compact />}
          {profile && (
            <BoundaryGrid>
              {boundary.map((item) => (
                <BoundaryTile
                  key={item.key}
                  strong={item.strong}
                >
                  <TileLabel variant="caption" color="text.secondary">
                    {item.label}
                  </TileLabel>
                  <WrapValue variant="body2" fontWeight={700}>
                    {item.value || t('enterprise.valueUnavailable')}
                  </WrapValue>
                </BoundaryTile>
              ))}
            </BoundaryGrid>
          )}
        </SectionCard>

        {profile && !profile.enterprise_enabled && (
          <SectionCard icon={<ShieldX size={16} />} title={t('enterprise.saas.title')}>
            <EmptyStateGuide
              title={t(profile.control_plane === 'saas' ? 'enterprise.saas.disabledTitle' : 'enterprise.community.disabledTitle')}
              description={t('enterprise.saas.disabledDesc')}
            />
          </SectionCard>
        )}

        {profile?.enterprise_enabled && (
          <SectionCard
            icon={<ListChecks size={16} />}
            title={t('enterprise.readiness.title')}
            action={readinessQ.data ? <ReadinessStatusChip status={readinessQ.data.summary.status} /> : undefined}
          >
            {readinessQ.isLoading && <LoadingState rows={4} />}
            {readinessQ.isError && <QueryError error={readinessQ.error} onRetry={readinessQ.refetch} label={t('enterprise.readiness.loadFailed')} compact />}
            {readinessQ.data && <EnterpriseReadinessPanel readiness={readinessQ.data} />}
          </SectionCard>
        )}

        <SectionCard
          icon={<ShieldCheck size={16} />}
          title={t('enterprise.audit.title')}
          action={profile?.enterprise_enabled ? (
            <Stack direction="row" spacing={1} alignItems="center">
              <Tooltip title={t(canExport ? 'enterprise.audit.exportTooltip' : 'enterprise.audit.exportDenied')}>
                <span>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<Download size={14} />}
                    disabled={!canExport || exporting || eventsQ.isLoading}
                    onClick={exportJson}
                  >
                    {exporting ? t('enterprise.audit.exporting') : t('enterprise.audit.exportJson')}
                  </Button>
                </span>
              </Tooltip>
              <Button
                size="small"
                variant="text"
                startIcon={<RefreshCw size={14} />}
                disabled={eventsQ.isFetching}
                onClick={() => void eventsQ.refetch()}
              >
                {t('enterprise.audit.refresh')}
              </Button>
            </Stack>
          ) : undefined}
        >
          <Stack spacing={2}>
            {profile?.enterprise_enabled && (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between">
                <ChainStatus intact={verification?.intact} count={verification?.count} />
                <FilterControl size="small">
                  <InputLabel id="enterprise-outcome-label">{t('enterprise.audit.filterOutcome')}</InputLabel>
                  <Select
                    labelId="enterprise-outcome-label"
                    value={outcome}
                    label={t('enterprise.audit.filterOutcome')}
                    onChange={(e) => setOutcome(e.target.value)}
                  >
                    <MenuItem value="all">{t('enterprise.outcome.all')}</MenuItem>
                    <MenuItem value="success">{t('enterprise.outcome.success')}</MenuItem>
                    <MenuItem value="failure">{t('enterprise.outcome.failure')}</MenuItem>
                    <MenuItem value="denied">{t('enterprise.outcome.denied')}</MenuItem>
                  </Select>
                </FilterControl>
              </Stack>
            )}

            {exportError && (
              <Typography variant="body2" color="error">
                {exportError}
              </Typography>
            )}

            {eventsQ.isLoading && <LoadingState rows={5} />}
            {eventsQ.isError && <QueryError error={eventsQ.error} onRetry={eventsQ.refetch} label={t('enterprise.audit.loadFailed')} compact />}
            {profile?.enterprise_enabled && !eventsQ.isLoading && !eventsQ.isError && events.length === 0 && (
              <EmptyStateGuide title={t('enterprise.audit.emptyTitle')} description={t('enterprise.audit.emptyDesc')} />
            )}
            {events.length > 0 && <EnterpriseAuditTable events={events} />}
          </Stack>
        </SectionCard>
          </>
        )}
      </ContentPane>
    </Root>
  )
}

function ProfileChip({ profile }: { profile: EnterpriseProfile }) {
  const enabled = profile.enterprise_enabled
  return (
    <Chip
      size="small"
      label={enabled ? t('enterprise.status.enterprise') : t('enterprise.status.notEnterprise')}
      sx={{
        fontWeight: 700,
        bgcolor: enabled ? 'success.light' : 'warning.light',
        color: enabled ? 'success.contrastText' : 'warning.contrastText',
      }}
    />
  )
}

function EnterpriseReadinessPanel({ readiness }: { readiness: EnterpriseReadinessResponse }) {
  const summary = readiness.summary
  return (
    <Stack spacing={2}>
      <BoundaryGrid>
        <BoundaryTile strong>
          <TileLabel variant="caption" color="text.secondary">
            {t('enterprise.readiness.summaryStatus')}
          </TileLabel>
          <ReadinessStatusChip status={summary.status} />
        </BoundaryTile>
        <BoundaryTile>
          <TileLabel variant="caption" color="text.secondary">
            {t('enterprise.readiness.summaryPass')}
          </TileLabel>
          <WrapValue variant="body2" fontWeight={700}>{summary.pass}</WrapValue>
        </BoundaryTile>
        <BoundaryTile>
          <TileLabel variant="caption" color="text.secondary">
            {t('enterprise.readiness.summaryWarn')}
          </TileLabel>
          <WrapValue variant="body2" fontWeight={700}>{summary.warn}</WrapValue>
        </BoundaryTile>
        <BoundaryTile>
          <TileLabel variant="caption" color="text.secondary">
            {t('enterprise.readiness.summaryFail')}
          </TileLabel>
          <WrapValue variant="body2" fontWeight={700}>{summary.fail}</WrapValue>
        </BoundaryTile>
      </BoundaryGrid>

      <ReadinessGrid>
        {readiness.domains.map((domain) => (
          <ReadinessDomain key={domain.id} domain={domain} />
        ))}
      </ReadinessGrid>
    </Stack>
  )
}

function ReadinessDomain({ domain }: { domain: EnterpriseReadinessDomain }) {
  return (
    <ReadinessDomainCard>
      <Stack spacing={1.25}>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
          <Typography variant="body2" fontWeight={700}>
            {readinessDomainLabel(domain.id)}
          </Typography>
          <ReadinessStatusChip status={domain.status} />
        </Stack>
        <Stack spacing={1}>
          {domain.controls.map((control) => (
            <Box key={control.id}>
              <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                <Typography variant="caption" color="text.primary" fontWeight={700}>
                  {readinessControlLabel(control.id)}
                </Typography>
                <ReadinessStatusChip status={control.status} size="tiny" />
              </Stack>
              {control.capability && (
                <Typography variant="caption" color="text.secondary">
                  {t('enterprise.readiness.capability', { capability: control.capability })}
                </Typography>
              )}
              {control.operator_action && (
                <Typography variant="caption" color="warning.main" display="block">
                  {readinessOperatorActionLabel(control.operator_action)}
                </Typography>
              )}
              <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" mt={0.75}>
                {control.evidence.map((item) => (
                  <EvidenceCode key={`${control.id}:${item}`}>
                    {item}
                  </EvidenceCode>
                ))}
              </Stack>
            </Box>
          ))}
        </Stack>
      </Stack>
    </ReadinessDomainCard>
  )
}

function ReadinessStatusChip({ status, size = 'small' }: { status: EnterpriseReadinessStatus; size?: 'small' | 'tiny' }) {
  return (
    <Chip
      size="small"
      label={readinessStatusLabel(status)}
      color={readinessStatusColor(status)}
      sx={{
        height: size === 'tiny' ? 20 : 24,
        fontWeight: 700,
        '& .MuiChip-label': {
          px: size === 'tiny' ? 0.75 : 1,
          fontSize: size === 'tiny' ? 11 : 12,
        },
      }}
    />
  )
}

function ChainStatus({ intact, count }: { intact?: boolean; count?: number }) {
  const color = intact ? 'success.main' : 'error.main'
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <StatusDot color={intact === false ? '#ef4444' : '#22c55e'} />
      <Box>
        <Typography variant="body2" fontWeight={700} color={color}>
          {intact === false ? t('enterprise.audit.chainBroken') : t('enterprise.audit.chainIntact')}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {t('enterprise.audit.verifiedEvents', { count: count ?? 0 })}
        </Typography>
      </Box>
    </Stack>
  )
}

function EnterpriseAuditTable({ events }: { events: EnterpriseAuditEvent[] }) {
  return (
    <TableScroller>
      <Table size="small" aria-label={t('enterprise.audit.tableLabel')}>
        <TableHead>
          <TableRow>
            <TableCell>{t('enterprise.audit.colTime')}</TableCell>
            <TableCell>{t('enterprise.audit.colActor')}</TableCell>
            <TableCell>{t('enterprise.audit.colAction')}</TableCell>
            <TableCell>{t('enterprise.audit.colOutcome')}</TableCell>
            <TableCell>{t('enterprise.audit.colResource')}</TableCell>
            <TableCell>{t('enterprise.audit.colHash')}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {events.map((event) => (
            <TableRow key={event.id} hover>
              <TimeCell>{formatTime(event.created_at)}</TimeCell>
              <TableCell>
                <Typography variant="body2" fontWeight={600}>{event.actor_id || event.actor_type}</Typography>
                <Typography variant="caption" color="text.secondary">{event.source}</Typography>
              </TableCell>
              <TableCell>
                <Typography variant="body2" fontWeight={600}>{event.action}</Typography>
                <Typography variant="caption" color="text.secondary">{event.surface || t('enterprise.valueUnavailable')}</Typography>
              </TableCell>
              <TableCell>
                <Chip size="small" label={outcomeLabel(event.outcome)} color={outcomeColor(event.outcome)} />
              </TableCell>
              <ResourceCell>
                <Typography variant="body2" noWrap>{event.resource_type || t('enterprise.valueUnavailable')}</Typography>
                <ResourceSecondary variant="caption" color="text.secondary" noWrap>{event.resource_id || event.request_id || event.evidence_id || event.org_id}</ResourceSecondary>
              </ResourceCell>
              <TableCell>
                <Box component="code">
                  {shortHash(event.entry_hash)}
                </Box>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableScroller>
  )
}

function profileCards(profile: EnterpriseProfile): Array<{ key: string; label: string; value: string; strong?: boolean }> {
  return [
    { key: 'edition', label: t('enterprise.profile.edition'), value: editionLabel(profile.edition), strong: true },
    { key: 'control', label: t('enterprise.profile.controlPlane'), value: controlPlaneLabel(profile.control_plane), strong: true },
    { key: 'deploy', label: t('enterprise.profile.deployMode'), value: profile.deploy_mode },
    { key: 'license', label: t('enterprise.profile.license'), value: profile.license_class },
    { key: 'auth', label: t('enterprise.provider.auth'), value: profile.providers.auth ?? '' },
    { key: 'billing', label: t('enterprise.provider.billing'), value: profile.providers.billing ?? '' },
    { key: 'storage', label: t('enterprise.provider.storage'), value: profile.providers.storage ?? '' },
    { key: 'ai', label: t('enterprise.provider.ai'), value: profile.providers.ai ?? '' },
    { key: 'threat', label: t('enterprise.provider.threatIntel'), value: profile.providers.threat_intel ?? '' },
  ]
}

function editionLabel(value: string): string {
  const key = `enterprise.edition.${value}`
  const translated = t(key)
  return translated === key ? value : translated
}

function controlPlaneLabel(value: string): string {
  const key = `enterprise.controlPlane.${value}`
  const translated = t(key)
  return translated === key ? value : translated
}

function outcomeLabel(value: string): string {
  const key = `enterprise.outcome.${value}`
  const translated = t(key)
  return translated === key ? value : translated
}

function readinessDomainLabel(value: string): string {
  const key = `enterprise.readiness.domain.${value}`
  const translated = t(key)
  return translated === key ? value : translated
}

function readinessControlLabel(value: string): string {
  const key = `enterprise.readiness.control.${value}`
  const translated = t(key)
  return translated === key ? value : translated
}

function readinessOperatorActionLabel(value: string): string {
  const key = `enterprise.readiness.operatorAction.${value}`
  const translated = t(key)
  return translated === key ? value : translated
}

function readinessStatusLabel(value: string): string {
  const key = `enterprise.readiness.status.${value}`
  const translated = t(key)
  return translated === key ? value : translated
}

function readinessStatusColor(value: string): 'success' | 'error' | 'warning' | 'default' {
  if (value === 'pass' || value === 'ready') return 'success'
  if (value === 'fail' || value === 'blocked') return 'error'
  if (value === 'warn' || value === 'operator_action_required') return 'warning'
  return 'default'
}

function outcomeColor(value: string): 'success' | 'error' | 'warning' | 'default' {
  if (value === 'success') return 'success'
  if (value === 'failure') return 'error'
  if (value === 'denied') return 'warning'
  return 'default'
}

function shortHash(hash?: string): string {
  if (!hash) return t('enterprise.valueUnavailable')
  return hash.length > 16 ? `${hash.slice(0, 10)}...${hash.slice(-6)}` : hash
}

function formatTime(value?: string): string {
  if (!value) return t('enterprise.valueUnavailable')
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString()
}
