import Box from '@mui/material/Box'
import { useState, type ReactElement, type ReactNode } from 'react'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import Table from '@mui/material/Table'
import TableHead from '@mui/material/TableHead'
import TableBody from '@mui/material/TableBody'
import TableRow from '@mui/material/TableRow'
import TableCell from '@mui/material/TableCell'
import { alpha } from '@mui/material/styles'
import { Activity, AlertTriangle, CheckCircle2, KeyRound, ListChecks, ServerCog, ShieldCheck } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useOrg } from '@hooks/useOrg'
import { getMcpOverview, getMcpPolicy, type MCPOverview, type MCPRolloutMode } from '@lib/engine'
import { qk } from '@lib/queryKeys'
import { t, tOr } from '@lib/i18n';
import { LoadingState } from '@atoms/LoadingState'
import { QueryError } from '@atoms/QueryError'

const BRAND = '#7c3aed'

const EMPTY_OVERVIEW: MCPOverview = {
  configured: false,
  servers: [],
  serverStatusCounts: {},
  toolTotal: 0,
  unclassifiedTools: 0,
  recentDecisions: [],
  decisionCounts: {},
}

const VERDICT_TONE: Record<string, string> = {
  allow: '#16a34a', allowed: '#16a34a', proceed: '#16a34a',
  deny: '#ef4444', denied: '#ef4444', block: '#ef4444', blocked: '#ef4444',
  flag: '#f59e0b', flagged: '#f59e0b', warn: '#f59e0b',
}

const RISK_DIMENSIONS = [
  { id: 'tool', labelKey: 'agentFirewall.dimTool', fallback: 'Tool capability', detailKey: 'agentFirewall.dimToolDesc', detail: 'Read, write, scan, browser automation, shell execution.' },
  { id: 'data', labelKey: 'agentFirewall.dimData', fallback: 'Data sensitivity', detailKey: 'agentFirewall.dimDataDesc', detail: 'Public, internal, source code, customer PII, secrets.' },
  { id: 'target', labelKey: 'agentFirewall.dimTarget', fallback: 'Target trust', detailKey: 'agentFirewall.dimTargetDesc', detail: 'Public, internal, production, unknown external, private or metadata IP.' },
  { id: 'action', labelKey: 'agentFirewall.dimAction', fallback: 'Action impact', detailKey: 'agentFirewall.dimActionDesc', detail: 'Read, draft, submit, config change, delete, merge, deploy.' },
  { id: 'flow', labelKey: 'agentFirewall.dimFlow', fallback: 'Data flow', detailKey: 'agentFirewall.dimFlowDesc', detail: 'Internal only, cross-system, internal to external.' },
  { id: 'identity', labelKey: 'agentFirewall.dimIdentity', fallback: 'Identity and permission', detailKey: 'agentFirewall.dimIdentityDesc', detail: 'Anonymous, service account, user token, admin or production credential.' },
  { id: 'sequence', labelKey: 'agentFirewall.dimSequence', fallback: 'Behavior sequence', detailKey: 'agentFirewall.dimSequenceDesc', detail: 'Sensitive read to external transmit, recon to mutation, and future chains.' },
  { id: 'history', labelKey: 'agentFirewall.dimHistory', fallback: 'History trust', detailKey: 'agentFirewall.dimHistoryDesc', detail: 'Repeatedly safe, previously blocked, or incident-linked behavior memory.' },
]

type ActivityTab = 'controls' | 'risk' | 'decisions' | 'servers'

function isBlockingMode(mode: MCPRolloutMode) {
  return mode === 'enforce' || mode === 'soft_enforce'
}

function StatusChip({ label, tone }: { label: string; tone: 'ok' | 'warn' | 'off' }) {
  const color = tone === 'ok' ? '#16a34a' : tone === 'warn' ? '#f59e0b' : '#64748b'
  return (
    <Chip
      size="small"
      label={label}
      sx={{ height: 22, fontSize: 12, fontWeight: 800, color, bgcolor: alpha(color, 0.12), border: `1px solid ${alpha(color, 0.35)}` }}
    />
  )
}

export function AgentFirewallActivityView() {
  const { org } = useOrg()
  const [tab, setTab] = useState<ActivityTab>('controls')
  const { data: rawData, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.mcp.overview(org?.id),
    queryFn: () => getMcpOverview(org!.id),
    enabled: !!org?.id,
    staleTime: 60_000,
  })
  const { data: policy } = useQuery({
    queryKey: qk.mcp.policy(org?.id),
    queryFn: () => getMcpPolicy(org!.id),
    enabled: !!org?.id,
    staleTime: 60_000,
  })

  if (isLoading) {
    return <LoadingState variant="spinner" py={8} />
  }

  if (isError) {
    return <Box sx={{ p: 3 }}><QueryError error={error} onRetry={refetch} label={t('agentFirewall.activityLoadFailed')} compact /></Box>
  }

  const data = rawData ?? EMPTY_OVERVIEW
  const mode = ((policy?.defaultMode as MCPRolloutMode) || 'observe')
  const liveDecisions = data.recentDecisions.filter((d) => d.toolName !== 'connection_probe')
  const riskyDecisions = liveDecisions.filter((d) => d.stateChange || d.externalSideEffect)
  const needsClassification = data.unclassifiedTools > 0
  const blocking = isBlockingMode(mode)
  const controls = [
    {
      id: 'enforce',
      title: blocking ? t('agentFirewall.controlEnforceOk') : t('agentFirewall.controlEnforce'),
      detail: blocking
        ? t('agentFirewall.controlEnforceOkDesc')
        : t('agentFirewall.controlEnforceDesc'),
      tone: blocking ? 'ok' : 'warn',
    },
    {
      id: 'classify',
      title: needsClassification ? t('agentFirewall.controlClassify') : t('agentFirewall.controlClassifyOk'),
      detail: needsClassification
        ? tOr('agentFirewall.controlClassifyDesc', `${data.unclassifiedTools} tools need verb/data-class classification before policy can be precise.`)
        : t('agentFirewall.controlClassifyOkDesc'),
      tone: needsClassification ? 'warn' : 'ok',
    },
    {
      id: 'traffic',
      title: liveDecisions.length > 0 ? t('agentFirewall.controlTrafficOk') : t('agentFirewall.controlTraffic'),
      detail: liveDecisions.length > 0
        ? t('agentFirewall.controlTrafficOkDesc')
        : t('agentFirewall.controlTrafficDesc'),
      tone: liveDecisions.length > 0 ? 'ok' : 'off',
    },
    {
      id: 'side-effects',
      title: riskyDecisions.length > 0 ? t('agentFirewall.controlSideEffects') : t('agentFirewall.controlSideEffectsOk'),
      detail: riskyDecisions.length > 0
        ? tOr('agentFirewall.controlSideEffectsDesc', `${riskyDecisions.length} recent decisions changed state or touched an external side effect.`)
        : t('agentFirewall.controlSideEffectsOkDesc'),
      tone: riskyDecisions.length > 0 ? 'warn' : 'ok',
    },
  ] as const
  const tabs: { id: ActivityTab; label: string; icon: ReactElement }[] = [
    { id: 'controls', label: t('agentFirewall.controlQueue'), icon: <ListChecks size={15} /> },
    { id: 'risk', label: t('agentFirewall.riskDimensions'), icon: <ShieldCheck size={15} /> },
    { id: 'decisions', label: t('agentFirewall.decisionFeed'), icon: <Activity size={15} /> },
    { id: 'servers', label: t('agentFirewall.protectedServers'), icon: <ServerCog size={15} /> },
  ]

  return (
    <Box sx={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Box sx={{ px: { xs: 2, sm: 3 }, pt: { xs: 2, sm: 3 }, pb: 1.5, flexShrink: 0 }}>
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2.5, display: 'flex', gap: 1.5, alignItems: 'flex-start', borderColor: alpha(BRAND, 0.35), bgcolor: alpha(BRAND, 0.04) }}>
          <Activity size={24} style={{ color: BRAND, flexShrink: 0, marginTop: 2 }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h5" fontWeight={850}>{t('agentFirewall.activityTitle')}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.6 }}>
              {t('agentFirewall.activityDesc')}
            </Typography>
          </Box>
        </Paper>
      </Box>

      <Box sx={{ px: { xs: 2, sm: 3 }, pb: 1, flexShrink: 0 }}>
        <Paper variant="outlined" sx={{ borderRadius: 2.5, overflow: 'hidden' }}>
          <Tabs
            value={tab}
            onChange={(_event, value: ActivityTab) => setTab(value)}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            aria-label={t('agentFirewall.activityTitle')}
            sx={{
              minHeight: 46,
              px: 0.75,
              '& .MuiTabs-indicator': { bgcolor: BRAND, height: 3, borderRadius: 999 },
              '& .MuiTab-root': {
                minHeight: 46,
                px: 1.5,
                gap: 0.75,
                fontSize: 12,
                fontWeight: 850,
                textTransform: 'none',
                color: 'text.secondary',
              },
              '& .MuiTab-root.Mui-selected': { color: BRAND },
            }}
          >
            {tabs.map((item) => (
              <Tab
                key={item.id}
                value={item.id}
                icon={item.icon}
                iconPosition="start"
                label={item.label}
                id={`agent-firewall-tab-${item.id}`}
                aria-controls={`agent-firewall-panel-${item.id}`}
              />
            ))}
          </Tabs>
        </Paper>
      </Box>

      <Box sx={{ px: { xs: 2, sm: 3 }, pb: { xs: 2, sm: 3 }, flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <ScrollTabPanel active={tab === 'controls'} value="controls">
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.05fr 0.95fr' }, gap: 2.5 }}>
            <Paper variant="outlined" sx={{ borderRadius: 2.5, overflow: 'hidden' }}>
              <SectionHeader icon={<ListChecks size={16} />} title={t('agentFirewall.controlQueue')} />
              <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                {controls.map((item) => (
                  <Box key={item.id} sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start', py: 0.5 }}>
                    {item.tone === 'ok' ? <CheckCircle2 size={17} style={{ color: '#16a34a', marginTop: 2 }} /> : <AlertTriangle size={17} style={{ color: item.tone === 'warn' ? '#f59e0b' : '#64748b', marginTop: 2 }} />}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Typography variant="body2" fontWeight={800}>{item.title}</Typography>
                        <StatusChip label={item.tone === 'ok' ? t('agentFirewall.ok') : item.tone === 'warn' ? t('agentFirewall.needsAction') : t('agentFirewall.notReady')} tone={item.tone} />
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25, lineHeight: 1.5 }}>{item.detail}</Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            </Paper>

            <Paper variant="outlined" sx={{ borderRadius: 2.5, overflow: 'hidden' }}>
              <SectionHeader icon={<ShieldCheck size={16} />} title={t('agentFirewall.coverageList')} />
              <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: '1fr', gap: 1 }}>
                <CoverageRow label={t('agentFirewall.coverageIngress')} ready={data.configured} detail={data.configured ? t('agentFirewall.coverageIngressOn') : t('agentFirewall.coverageIngressOff')} />
                <CoverageRow label={t('agentFirewall.coverageDecision')} ready={data.recentDecisions.length > 0} detail={`${data.recentDecisions.length} ${t('agentFirewall.coverageDecisions')}`} />
                <CoverageRow label={t('agentFirewall.coverageEgress')} ready={true} detail={t('agentFirewall.coverageEgressDesc')} />
                <CoverageRow label={t('agentFirewall.coverageMutation')} ready={true} detail={t('agentFirewall.coverageMutationDesc')} />
                <CoverageRow label={t('agentFirewall.coverageEnforce')} ready={blocking} detail={mode} />
              </Box>
            </Paper>
          </Box>
        </ScrollTabPanel>

        <ScrollTabPanel active={tab === 'risk'} value="risk">
          <Paper variant="outlined" sx={{ borderRadius: 2.5, overflow: 'hidden' }}>
            <SectionHeader icon={<KeyRound size={16} />} title={t('agentFirewall.riskDimensions')} />
            <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(4, minmax(0, 1fr))' }, gap: 1.25 }}>
              {RISK_DIMENSIONS.map((dim) => (
                <Box key={dim.id} sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1.5, minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={850}>{tOr(dim.labelKey, dim.fallback)}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, lineHeight: 1.5 }}>{tOr(dim.detailKey, dim.detail)}</Typography>
                </Box>
              ))}
            </Box>
          </Paper>
        </ScrollTabPanel>

        <ScrollTabPanel active={tab === 'decisions'} value="decisions">
          <Paper variant="outlined" sx={{ borderRadius: 2.5, overflow: 'hidden' }}>
            <SectionHeader icon={<Activity size={16} />} title={t('agentFirewall.decisionFeed')} />
            {data.recentDecisions.length > 0 ? (
              <Box sx={{ p: 2 }}>
                <Box sx={{ overflowX: 'auto', border: 1, borderColor: 'divider', borderRadius: 1.5 }}>
                  <Table
                    size="small"
                    sx={{
                      minWidth: 720,
                      '& .MuiTableCell-root': { px: 2, py: 1.15 },
                      '& .MuiTableHead-root .MuiTableCell-root': {
                        bgcolor: alpha(BRAND, 0.035),
                        fontWeight: 850,
                      },
                      '& .MuiTableBody-root .MuiTableRow-root:last-of-type .MuiTableCell-root': {
                        borderBottom: 0,
                      },
                    }}
                  >
                    <TableHead>
                      <TableRow>
                        <TableCell>{t('agentFirewall.colTool')}</TableCell>
                        <TableCell>{t('agentFirewall.colVerb')}</TableCell>
                        <TableCell>{t('agentFirewall.colDecision')}</TableCell>
                        <TableCell>{t('agentFirewall.colSignals')}</TableCell>
                        <TableCell>{t('agentFirewall.colSource')}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.recentDecisions.map((d, index) => {
                        const verdict = d.effective || d.verdict || 'unknown'
                        const color = VERDICT_TONE[verdict.toLowerCase()] ?? '#64748b'
                        const signals = [
                          d.stateChange ? t('agentFirewall.signalStateChange') : null,
                          d.externalSideEffect ? t('agentFirewall.signalExternal') : null,
                        ].filter(Boolean).join(', ')
                        return (
                          <TableRow key={`${d.toolName}-${index}`}>
                            <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{d.toolName}</TableCell>
                            <TableCell>{d.verb || '-'}</TableCell>
                            <TableCell><Chip size="small" label={verdict} sx={{ height: 22, fontSize: 12, fontWeight: 800, color, bgcolor: alpha(color, 0.12) }} /></TableCell>
                            <TableCell sx={{ color: signals ? 'text.primary' : 'text.secondary', fontSize: 13 }}>{signals || t('agentFirewall.noRiskSignals')}</TableCell>
                            <TableCell sx={{ color: d.toolName === 'connection_probe' ? '#64748b' : '#16a34a', fontSize: 13 }}>
                              {d.toolName === 'connection_probe' ? t('agentFirewall.diagnosticProbe') : t('agentFirewall.liveAgent')}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </Box>
              </Box>
            ) : (
              <Box sx={{ p: 2 }}><Alert severity="info">{t('agentFirewall.emptyDecisionFeed')}</Alert></Box>
            )}
          </Paper>
        </ScrollTabPanel>

        <ScrollTabPanel active={tab === 'servers'} value="servers">
          <Paper variant="outlined" sx={{ borderRadius: 2.5, overflow: 'hidden' }}>
            <SectionHeader icon={<ServerCog size={16} />} title={t('agentFirewall.protectedServers')} />
            {data.servers.length > 0 ? (
              <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25 }}>
                {data.servers.map((s) => (
                  <Box key={s.id} sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1.5, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Typography variant="body2" fontWeight={800}>{s.name || s.id}</Typography>
                      <Chip size="small" label={s.status || 'unknown'} sx={{ height: 20, fontSize: 12 }} />
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>{s.transport}{s.deploymentKind ? ` / ${s.deploymentKind}` : ''}</Typography>
                    <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                      <Chip size="small" label={`${s.toolCount} ${t('agentFirewall.tools')}`} sx={{ height: 22, fontSize: 12 }} />
                      <Chip size="small" label={`${s.writeTools} ${t('agentFirewall.writeTools')}`} sx={{ height: 22, fontSize: 12, color: s.writeTools > 0 ? '#f59e0b' : '#64748b' }} />
                      {s.unclassifiedTools > 0 && <Chip size="small" label={`${s.unclassifiedTools} ${t('agentFirewall.unclassified')}`} sx={{ height: 22, fontSize: 12, color: '#ef4444' }} />}
                    </Box>
                  </Box>
                ))}
              </Box>
            ) : (
              <Box sx={{ p: 2 }}><Alert severity="info">{t('agentFirewall.emptyProtectedServers')}</Alert></Box>
            )}
          </Paper>
        </ScrollTabPanel>
      </Box>
    </Box>
  )
}

function ScrollTabPanel({ active, value, children }: { active: boolean; value: ActivityTab; children: ReactNode }) {
  if (!active) return null

  return (
    <Box
      role="tabpanel"
      id={`agent-firewall-panel-${value}`}
      aria-labelledby={`agent-firewall-tab-${value}`}
      sx={{
        height: '100%',
        minHeight: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        pr: 0.5,
        display: 'flex',
        flexDirection: 'column',
        gap: 2.5,
      }}
    >
      {children}
    </Box>
  )
}

function SectionHeader({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <Box sx={{ px: 2.5, py: 1.5, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
      <Box sx={{ color: BRAND, display: 'flex' }}>{icon}</Box>
      <Typography variant="subtitle2" fontWeight={850}>{title}</Typography>
    </Box>
  )
}

function CoverageRow({ label, ready, detail }: { label: string; ready: boolean; detail: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 0.75, borderBottom: '1px solid', borderColor: 'divider', '&:last-child': { borderBottom: 0 } }}>
      {ready ? <CheckCircle2 size={17} style={{ color: '#16a34a' }} /> : <AlertTriangle size={17} style={{ color: '#f59e0b' }} />}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" fontWeight={800}>{label}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflowWrap: 'anywhere' }}>{detail}</Typography>
      </Box>
      <StatusChip label={ready ? t('agentFirewall.covered') : t('agentFirewall.gap')} tone={ready ? 'ok' : 'warn'} />
    </Box>
  )
}
