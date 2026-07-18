/**
 * McpOverviewView — Agent Firewall connection + runtime overview. The page is
 * intentionally not read-only: it exposes the real ingest endpoint, the API-key
 * scope required by the MCP proxy, and a dashboard-safe test probe that writes
 * one digest-only event through the same backend decision pipeline.
 */
import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Table from '@mui/material/Table'
import TableHead from '@mui/material/TableHead'
import TableBody from '@mui/material/TableBody'
import TableRow from '@mui/material/TableRow'
import TableCell from '@mui/material/TableCell'
import { alpha } from '@mui/material/styles'
import { Bot, Check, Copy, Database, FileSearch, KeyRound, PlugZap, ServerCog, Terminal, Eye, ShieldAlert, ShieldCheck, Info, MonitorSmartphone, Workflow } from 'lucide-react'
import { useOrg } from '@hooks/useOrg'
import {
  getMcpOverview,
  getMcpPolicy,
  mcpIngestEndpoint,
  testMcpConnection,
  type MCPOverview,
  type MCPRolloutMode,
  type MCPTestConnectionResponse,
} from '@lib/engine'
import { qk } from '@lib/queryKeys'
import { t, tOr } from '@lib/i18n';
import { writeClipboardText } from '@lib/clipboard'
import { AgentFirewallFlow3D } from './mcp/AgentFirewallFlow3D'

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

function Tile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2.5, flex: 1, minWidth: 150 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{label}</Typography>
      <Typography variant="h5" fontWeight={800} sx={{ color: tone ?? 'text.primary' }}>{value}</Typography>
    </Paper>
  )
}

function DataTable({ minWidth, children }: { minWidth: number; children: ReactNode }) {
  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ overflowX: 'auto', border: 1, borderColor: 'divider', borderRadius: 1.5 }}>
        <Table
          size="small"
          sx={{
            minWidth,
            '& .MuiTableCell-root': { px: 2, py: 1.15, verticalAlign: 'top' },
            '& .MuiTableHead-root .MuiTableCell-root': {
              bgcolor: alpha(BRAND, 0.035),
              fontWeight: 850,
              whiteSpace: 'nowrap',
            },
            '& .MuiTableBody-root .MuiTableRow-root:last-of-type .MuiTableCell-root': {
              borderBottom: 0,
            },
          }}
        >
          {children}
        </Table>
      </Box>
    </Box>
  )
}

const CLOSED_LOOP_STEPS = [
  {
    icon: MonitorSmartphone,
    title: t('agentFirewall.loop1Title'),
    manager: 'Sanctioned, unsanctioned, and unknown AI usage by app.',
    engineer: 'userId, deviceId, appName, appCategory, and source connector.',
  },
  {
    icon: Bot,
    title: t('agentFirewall.loop2Title'),
    manager: 'Who ran which agent action, against what target, with what outcome.',
    engineer: 'toolName, verb, actionType, targetTrust, stateChange, externalSideEffect.',
  },
  {
    icon: Database,
    title: 'AI DLP + tokenization',
    manager: 'Sensitive content can be blocked, masked, or tokenized before AI exposure.',
    engineer: 'contentClass, permissionScope, transform, transformedInputText.',
  },
  {
    icon: ShieldAlert,
    title: t('agentFirewall.loop4Title'),
    manager: 'Policy decides allow, hold, deny, approval, or transform.',
    engineer: 'eight risk dimensions, floor rule, sequence lens, rollout mode.',
  },
  {
    icon: Workflow,
    title: t('agentFirewall.loop5Title'),
    manager: 'Multi-step agent attacks are judged as a chain, not isolated calls.',
    engineer: 'executed=true commits safe first probes before second-call evaluation.',
  },
  {
    icon: FileSearch,
    title: t('agentFirewall.loop6Title'),
    manager: 'Digest-safe report for audit, SOC review, and customer governance.',
    engineer: 'eventId, verdict, effective action, transform metadata, evidence list.',
  },
]

const VERDICT_TONE: Record<string, string> = {
  allow: '#16a34a', allowed: '#16a34a',
  deny: '#ef4444', denied: '#ef4444', block: '#ef4444', blocked: '#ef4444',
  flag: '#f59e0b', flagged: '#f59e0b', warn: '#f59e0b',
}

export function McpOverviewView() {
  const { org } = useOrg()
  const qc = useQueryClient()
  const [copied, setCopied] = useState<'endpoint' | 'curl' | null>(null)
  const [lastProbe, setLastProbe] = useState<MCPTestConnectionResponse | null>(null)
  const { data: rawData, isLoading, isError, error } = useQuery({
    queryKey: qk.mcp.overview(org?.id),
    queryFn: () => getMcpOverview(org!.id),
    enabled: !!org?.id,
    staleTime: 60_000,
  })
  // Enforcement mode drives the honest "are we actually blocking?" banner.
  const { data: policy } = useQuery({
    queryKey: qk.mcp.policy(org?.id),
    queryFn: () => getMcpPolicy(org!.id),
    enabled: !!org?.id,
    staleTime: 60_000,
  })
  const testConnection = useMutation({
    mutationFn: () => testMcpConnection(org!.id),
    onSuccess: (resp) => {
      setLastProbe(resp)
      qc.invalidateQueries({ queryKey: qk.mcp.overview(org?.id) })
      qc.invalidateQueries({ queryKey: qk.mcp.egress(org?.id) })
    },
  })

  if (isLoading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress size={26} /></Box>
  }

  if (isError) {
    const msg = error instanceof Error ? error.message : String(error)
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{t('agentFirewall.loadFailed')}: {msg}</Alert>
      </Box>
    )
  }

  const data = rawData ?? EMPTY_OVERVIEW
  const endpoint = org?.id ? mcpIngestEndpoint(org.id) : ''
  const curlSnippet = `curl -sS -X POST "${endpoint}" \\
  -H "X-Flyto2-API-Key: $FLYTO_MCP_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"projectHash":"<project-hash>","sessionKey":"manual-test","agentId":"local-mcp","serverId":"flyto-security-mcp","toolName":"connection_probe","verb":"READ","dataClass":"metadata","dataDirection":"internal"}'`
  // Separate real agent traffic from the dashboard diagnostic probe.
  // The test-connection probe is recorded as a decision row with the
  // backend-stable toolName "connection_probe" (handlers_mcp_guardian.go
  // — ServerID flyto-dashboard-diagnostics / ToolName connection_probe),
  // so it shows up in recentDecisions just like a real call. Counting it
  // as "telemetry received" overstates live traffic: a user who only
  // clicked "Test connection" would see the same green badge as one
  // whose agents are actually streaming events. Gate the live-traffic
  // badge on NON-diagnostic decisions only, and acknowledge the probe
  // separately so we never pretend nothing happened.
  const DIAGNOSTIC_TOOL = 'connection_probe'
  const realDecisions = data.recentDecisions.filter((d) => d.toolName !== DIAGNOSTIC_TOOL)
  const diagnosticDecisions = data.recentDecisions.length - realDecisions.length
  const hasRealTelemetry = realDecisions.length > 0
  const hasDiagnosticOnly = !hasRealTelemetry && diagnosticDecisions > 0

  async function copyText(kind: 'endpoint' | 'curl', text: string) {
    if (!text) return
    const copiedOk = await writeClipboardText(text)
    if (!copiedOk) return
    setCopied(kind)
    window.setTimeout(() => setCopied(null), 1600)
  }

  const mode = ((policy?.defaultMode as MCPRolloutMode) || 'observe')
  const countBy = (names: string[]) => names.reduce((sum, name) => sum + (data.decisionCounts[name] ?? 0), 0)
  const blockedCount = countBy(['block', 'blocked', 'deny', 'denied', 'hold'])
  const tokenizedCount = countBy(['tokenize', 'tokenized', 'mask', 'masked'])
  const allowedCount = Math.max(0, realDecisions.length - blockedCount)

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <ProtectionHero
        mode={mode}
        configured={data.configured}
        live={hasRealTelemetry}
        servers={data.servers.length}
        tools={data.toolTotal}
      />

      <AgentFirewallFlow3D
        live={hasRealTelemetry}
        blocked={blockedCount}
        tokenized={tokenizedCount}
        allowed={allowedCount}
      />

      <Paper variant="outlined" sx={{ borderRadius: 2.5, overflow: 'hidden' }}>
        <Box sx={{ px: 2.5, py: 1.75, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
          <Workflow size={17} style={{ color: BRAND }} />
          <Typography variant="subtitle2" fontWeight={850}>{t('agentFirewall.closedLoopTitle')}</Typography>
          <Chip size="small" label={t('agentFirewall.managerEngineerReady')} sx={{ height: 22, fontSize: 12, fontWeight: 800 }} />
        </Box>
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' }, gap: 1.25 }}>
          {CLOSED_LOOP_STEPS.map((step, index) => {
            const Icon = step.icon
            return (
              <Paper key={step.title} variant="outlined" sx={{ p: 1.75, borderRadius: 1.75, minWidth: 0, bgcolor: index === 3 ? alpha(BRAND, 0.04) : 'background.paper', borderColor: index === 3 ? alpha(BRAND, 0.3) : 'divider' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 30, height: 30, borderRadius: 1.5, display: 'grid', placeItems: 'center', bgcolor: alpha(BRAND, 0.1), color: BRAND, flexShrink: 0 }}>
                    <Icon size={16} />
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={850}>{index + 1}. {tOr(`agentFirewall.loop${index + 1}Title`, step.title)}</Typography>
                  </Box>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, lineHeight: 1.55 }}>
                  {tOr(`agentFirewall.loop${index + 1}Manager`, step.manager)}
                </Typography>
                <Box component="code" sx={{ display: 'block', mt: 1, px: 1, py: 0.75, borderRadius: 1, bgcolor: 'grey.900', color: '#e5e7eb', fontSize: 12, lineHeight: 1.45, overflowWrap: 'anywhere' }}>
                  {tOr(`agentFirewall.loop${index + 1}Engineer`, step.engineer)}
                </Box>
              </Paper>
            )
          })}
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ borderRadius: 2.5, overflow: 'hidden' }}>
        <Box sx={{ px: 2.5, py: 1.75, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
          <PlugZap size={17} style={{ color: BRAND }} />
          <Typography variant="subtitle2" fontWeight={800}>{t('agentFirewall.connectTitle')}</Typography>
          <Chip
            size="small"
            label={data.configured ? t('mcp.serverRegistered') : t('mcp.serverNotRegistered')}
            color={data.configured ? 'success' : 'default'}
            sx={{ height: 22, fontSize: 12, fontWeight: 700 }}
          />
          <Chip
            size="small"
            label={
              hasRealTelemetry
                ? t('mcp.telemetryReceived')
                : hasDiagnosticOnly
                  ? t('mcp.diagnosticOnly')
                  : t('mcp.waitingTelemetry')
            }
            color={hasRealTelemetry ? 'success' : hasDiagnosticOnly ? 'info' : 'warning'}
            variant="outlined"
            sx={{ height: 22, fontSize: 12, fontWeight: 700 }}
          />
        </Box>
        <Box sx={{ p: { xs: 2, sm: 2.5 }, display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) minmax(360px, 0.95fr)' }, gap: 2.5 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.75, minWidth: 0 }}>
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
              <KeyRound size={16} style={{ color: BRAND, marginTop: 2 }} />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="body2" fontWeight={800}>{t('agentFirewall.stepKey')}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.6, overflowWrap: 'anywhere' }}>
                  {t('agentFirewall.stepKeyDesc')}
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
              <ServerCog size={16} style={{ color: BRAND, marginTop: 2 }} />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="body2" fontWeight={800}>{t('agentFirewall.stepEndpoint')}</Typography>
                <Box sx={{ mt: 0.75, display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                  <Box component="code" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', px: 1.25, py: 0.75, borderRadius: 1.5, bgcolor: '#0f172a', color: '#e5e7eb', fontSize: 12, fontFamily: 'monospace' }}>
                    {endpoint}
                  </Box>
                  <Tooltip title={t('common.copy')}>
                    <IconButton size="small" onClick={() => copyText('endpoint', endpoint)} aria-label={t('mcp.copyEndpoint')}>
                      {copied === 'endpoint' ? <Check size={15} /> : <Copy size={15} />}
                    </IconButton>
                  </Tooltip>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75, lineHeight: 1.6, overflowWrap: 'anywhere' }}>
                  {t('agentFirewall.proxyEnv')}
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
              <Bot size={16} style={{ color: BRAND, marginTop: 2 }} />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="body2" fontWeight={800}>{t('agentFirewall.stepVerify')}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.6, overflowWrap: 'anywhere' }}>
                  {t('agentFirewall.stepVerifyDesc')}
                </Typography>
              </Box>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Terminal size={15} style={{ color: BRAND }} />
              <Typography variant="caption" fontWeight={800} sx={{ textTransform: 'uppercase', color: 'text.secondary' }}>
                {t('mcp.curlProbe')}
              </Typography>
              <Tooltip title={t('common.copy')}>
                <IconButton size="small" onClick={() => copyText('curl', curlSnippet)} aria-label={t('mcp.copyCurl')}>
                  {copied === 'curl' ? <Check size={14} /> : <Copy size={14} />}
                </IconButton>
              </Tooltip>
            </Box>
            <Box component="pre" sx={{ m: 0, px: 1.5, py: 1.25, borderRadius: 1.5, bgcolor: '#0f172a', color: '#e5e7eb', fontSize: 12, lineHeight: 1.55, overflow: 'auto', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {curlSnippet}
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                startIcon={testConnection.isPending ? <CircularProgress size={14} /> : <PlugZap size={16} />}
                disabled={!org?.id || testConnection.isPending}
                onClick={() => testConnection.mutate()}
                sx={{ bgcolor: BRAND, '&:hover': { bgcolor: '#6d28d9' }, textTransform: 'none', fontWeight: 800 }}
              >
                {testConnection.isPending ? t('agentFirewall.testingConnection') : t('agentFirewall.testConnection')}
              </Button>
              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 0, flex: '1 1 180px', overflowWrap: 'anywhere' }}>
                {t('agentFirewall.testRequires')}
              </Typography>
            </Box>
            {(lastProbe || testConnection.isSuccess) && (
              <Alert severity={lastProbe?.blocked ? 'warning' : 'success'} sx={{ py: 0.5, '& .MuiAlert-message': { minWidth: 0, overflowWrap: 'anywhere' } }}>
                {t('mcp.testRecorded')} · {lastProbe?.eventId || '—'} · {lastProbe?.effective || lastProbe?.verdict || '—'}
              </Alert>
            )}
            {testConnection.isError && (
              <Alert severity="error" sx={{ py: 0.5 }}>
                {testConnection.error instanceof Error ? testConnection.error.message : t('agentFirewall.testFailed')}
              </Alert>
            )}
          </Box>
        </Box>
      </Paper>

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Tile label={t('mcp.servers')} value={String(data.servers.length)} />
        <Tile label={t('mcp.tools')} value={String(data.toolTotal)} />
        <Tile label={t('mcp.unclassified')} value={String(data.unclassifiedTools)} tone={data.unclassifiedTools > 0 ? '#f59e0b' : undefined} />
        <Tile
          label={t('mcp.decisions')}
          value={
            diagnosticDecisions > 0
              ? `${realDecisions.length} + ${diagnosticDecisions} ${t('mcp.diagnosticSuffix')}`
              : String(realDecisions.length)
          }
        />
      </Box>

      {Object.keys(data.decisionCounts).length > 0 && (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {t('mcp.verdicts')}
          </Typography>
          {Object.entries(data.decisionCounts).map(([v, n]) => (
            <Chip key={v} size="small" label={`${v}: ${n}`}
              sx={{ height: 22, fontSize: 12, fontWeight: 700, color: VERDICT_TONE[v.toLowerCase()] ?? 'text.primary' }} />
          ))}
        </Box>
      )}

      {/* Servers */}
      {data.servers.length > 0 ? (
        <Paper variant="outlined" sx={{ borderRadius: 2.5, overflow: 'hidden' }}>
          <Box sx={{ px: 2.5, py: 1.5, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
            <ServerCog size={16} style={{ color: BRAND }} />
            <Typography variant="subtitle2" fontWeight={700}>{t('mcp.serverInventory')}</Typography>
          </Box>
          <DataTable minWidth={560}>
            <TableHead>
              <TableRow>
                <TableCell>{t('mcp.colServer')}</TableCell>
                <TableCell>{t('mcp.colTransport')}</TableCell>
                <TableCell>{t('mcp.colStatus')}</TableCell>
                <TableCell align="right">{t('mcp.colTools')}</TableCell>
                <TableCell align="right">{t('mcp.colWrite')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.servers.map((s) => (
                <TableRow key={s.id}>
                  <TableCell sx={{ fontWeight: 600 }}>{s.name || s.id}</TableCell>
                  <TableCell sx={{ color: 'text.secondary', fontSize: 13 }}>{s.transport}{s.deploymentKind ? ` · ${s.deploymentKind}` : ''}</TableCell>
                  <TableCell><Chip size="small" label={s.status || '—'} sx={{ height: 20, fontSize: 12 }} /></TableCell>
                  <TableCell align="right">{s.toolCount}{s.unclassifiedTools > 0 ? ` (${s.unclassifiedTools}?)` : ''}</TableCell>
                  <TableCell align="right" sx={{ color: s.writeTools > 0 ? '#f59e0b' : 'text.secondary' }}>{s.writeTools}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </DataTable>
        </Paper>
      ) : (
        <Alert severity="info">
          {hasRealTelemetry
            ? t('agentFirewall.noRegistryButEvents')
            : hasDiagnosticOnly
              ? t('agentFirewall.noRegistryDiagnosticOnly')
              : t('agentFirewall.noRegistryYet')}
        </Alert>
      )}

      {/* Recent decisions */}
      {data.recentDecisions.length > 0 && (
        <Paper variant="outlined" sx={{ borderRadius: 2.5, overflow: 'hidden' }}>
          <Box sx={{ px: 2.5, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
            <Typography variant="subtitle2" fontWeight={700}>{t('agentFirewall.recentDecisions')}</Typography>
          </Box>
          <DataTable minWidth={640}>
            <TableHead>
              <TableRow>
                <TableCell>{t('mcp.colTool')}</TableCell>
                <TableCell>{t('mcp.colVerb')}</TableCell>
                <TableCell>{t('mcp.colVerdict')}</TableCell>
                <TableCell>{t('mcp.colEffect')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.recentDecisions.map((d, i) => {
                const v = (d.effective || d.verdict || '').toLowerCase()
                return (
                  <TableRow key={`${d.toolName}-${i}`}>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{d.toolName}</TableCell>
                    <TableCell sx={{ color: 'text.secondary', fontSize: 13 }}>{d.verb || '—'}</TableCell>
                    <TableCell sx={{ color: VERDICT_TONE[v] ?? 'text.primary', fontWeight: 700, fontSize: 13 }}>{d.effective || d.verdict || '—'}</TableCell>
                    <TableCell sx={{ fontSize: 12 }}>
                      {[d.stateChange ? t('mcp.stateChange') : null, d.externalSideEffect ? t('mcp.sideEffect') : null].filter(Boolean).join(' · ') || '—'}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </DataTable>
        </Paper>
      )}
    </Box>
  )
}

// ── Protection status hero — the honest "are we actually blocking?" banner ──
// Security must never overclaim. The rollout mode is the truth: in observe/
// shadow the guardian watches but does NOT block; only enforce/soft_enforce
// actually prevent calls — and only for traffic routed through the proxy.

function modeMeta(mode: MCPRolloutMode) {
  switch (mode) {
    case 'enforce':
      return { Icon: ShieldCheck, color: '#16a34a', label: t('mcp.modeEnforce'),
        sub: t('mcp.modeEnforceSub'), blocking: true }
    case 'soft_enforce':
      return { Icon: ShieldAlert, color: '#f59e0b', label: t('mcp.modeSoft'),
        sub: t('mcp.modeSoftSub'), blocking: true }
    case 'shadow':
      return { Icon: Eye, color: '#3b82f6', label: t('mcp.modeShadow'),
        sub: t('mcp.modeShadowSub'), blocking: false }
    case 'observe':
    default:
      return { Icon: Eye, color: '#64748b', label: t('mcp.modeObserve'),
        sub: t('mcp.modeObserveSub'), blocking: false }
  }
}

function ProtectionHero({ mode, configured, live, servers, tools }: {
  mode: MCPRolloutMode; configured: boolean; live: boolean; servers: number; tools: number
}) {
  const m = modeMeta(mode)
  const Icon = m.Icon
  // "Protecting" is only true when there's a registered server, live traffic,
  // AND a blocking mode. Anything less is honestly "not blocking yet".
  const active = configured && live && m.blocking
  const okTone = '#16a34a'
  const offTone = '#64748b'
  return (
    <Paper variant="outlined" sx={{ borderRadius: 2.5, overflow: 'hidden', borderColor: alpha(m.color, 0.4), bgcolor: alpha(m.color, 0.05) }}>
      <Box sx={{ p: { xs: 2, sm: 2.5 }, display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <Box sx={{ width: 48, height: 48, borderRadius: 2, flexShrink: 0, display: 'grid', placeItems: 'center', bgcolor: alpha(m.color, 0.15), border: `1px solid ${alpha(m.color, 0.4)}`, color: m.color }}>
          <Icon size={24} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="subtitle1" fontWeight={800}>{t('agentFirewall.guardian')}</Typography>
            <Chip size="small" label={m.label} sx={{ height: 22, fontSize: 12, fontWeight: 800, color: m.color, bgcolor: alpha(m.color, 0.14), border: `1px solid ${alpha(m.color, 0.4)}` }} />
            <Chip size="small"
              label={active ? t('mcp.protecting') : t('mcp.notBlocking')}
              sx={{ height: 22, fontSize: 12, fontWeight: 700, color: active ? okTone : offTone, bgcolor: alpha(active ? okTone : offTone, 0.12) }} />
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{m.sub}</Typography>
          <Box sx={{ display: 'flex', gap: 1.5, mt: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <Stat n={servers} label={t('mcp.servers')} />
            <Stat n={tools} label={t('mcp.tools')} />
            <Chip size="small" variant="outlined" label={live ? t('mcp.liveTraffic') : t('mcp.noLiveTraffic')}
              sx={{ height: 20, fontSize: 12, fontWeight: 700, color: live ? okTone : '#f59e0b', borderColor: alpha(live ? okTone : '#f59e0b', 0.4) }} />
          </Box>
        </Box>
      </Box>
      {/* Honest scope — what it does and does NOT protect. */}
      <Box sx={{ px: { xs: 2, sm: 2.5 }, py: 1.5, borderTop: `1px solid ${alpha(m.color, 0.2)}`, display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        <Info size={14} style={{ color: offTone, flexShrink: 0, marginTop: 2 }} />
        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5 }}>
          {t('agentFirewall.scopeNote')}
        </Typography>
      </Box>
    </Paper>
  )
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.4 }}>
      <Typography sx={{ fontWeight: 800, fontFamily: 'ui-monospace, monospace' }}>{n}</Typography>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
    </Box>
  )
}
