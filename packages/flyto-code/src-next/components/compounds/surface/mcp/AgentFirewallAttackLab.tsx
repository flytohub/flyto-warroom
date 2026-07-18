import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import { alpha, useTheme } from '@mui/material/styles'
import {
  Check,
  Copy,
  FlaskConical,
  GitBranch,
  LockKeyhole,
  Radar,
  ShieldAlert,
  Activity,
  DatabaseZap,
  ShieldCheck,
} from 'lucide-react'
import { useOrg } from '@hooks/useOrg'
import {
  getMcpEgress,
  getMcpOverview,
  getMcpPolicy,
  mcpIngestEndpoint,
  simulateMcpPolicy,
} from '@lib/engine'
import { qk } from '@lib/queryKeys'
import { t } from '@lib/i18n'
import { writeClipboardText } from '@lib/clipboard'
import { colors } from '@/styles/designTokens'

const BRAND = '#7c3aed'
const CYAN = '#06b6d4'

type LabTab = 'chains' | 'live' | 'decision' | 'gates'

const CHAINS = [
  {
    id: 'read-sensitive-external',
    title: 'Sensitive read -> external transmit',
    severity: 'deny',
    detects: 'A session reads secrets, credentials, customer data, or source code, then later exports or transmits to an external target.',
    probes: [
      { toolName: 'vault_read', verb: 'READ', dataClass: 'secret', target: 'https://internal.vault.local', executed: true },
      { toolName: 'send_to_webhook', verb: 'TRANSMIT', dataDirection: 'outbound', target: 'https://webhook.example' },
    ],
  },
  {
    id: 'recon-external-mutation',
    title: 'Recon -> external mutation',
    severity: 'hold / deny',
    detects: 'A session scans an external target, then follows with a write, delete, export, or transmit action against an external target.',
    probes: [
      { toolName: 'probe_target', verb: 'SCAN', target: 'https://target.example', executed: true },
      { toolName: 'mutate_target', verb: 'WRITE', target: 'https://target.example', stateChange: true },
    ],
  },
  {
    id: 'production-side-effect',
    title: 'Production side effect',
    severity: 'approval',
    detects: 'A state-changing or externally visible action lands on declared production scope without an approved exception.',
    probes: [
      { toolName: 'deploy_prod', verb: 'DELETE', target: 'https://prod.example', stateChange: true },
    ],
  },
] as const

function probeBody(chainId: string, probe: Record<string, unknown>) {
  return JSON.stringify({
    projectHash: '<project-hash>',
    sessionKey: `attack-lab-${chainId}`,
    agentId: 'attack-lab-agent',
    serverId: 'agent-firewall-lab',
    ...probe,
    occurredAt: undefined,
  }, null, 2)
}

function curlFor(endpoint: string, chainId: string, probes: readonly Record<string, unknown>[]) {
  return probes.map((probe) => `curl -sS -X POST "${endpoint}" \\
  -H "X-Flyto2-API-Key: $FLYTO_AGENT_FIREWALL_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${probeBody(chainId, probe)}'`).join('\n\n')
}

function isBlockingMode(mode?: string) {
  return mode === 'enforce' || mode === 'soft_enforce'
}

export function AgentFirewallAttackLabManagerView() {
  const theme = useTheme()
  const dark = theme.palette.mode === 'dark'
  const { org } = useOrg()
  const [selectedChainId, setSelectedChainId] = useState<string | null>(null)
  const [labTab, setLabTab] = useState<LabTab>('chains')

  const overviewQ = useQuery({
    queryKey: qk.mcp.overview(org?.id),
    queryFn: () => getMcpOverview(org!.id),
    enabled: !!org?.id,
    staleTime: 60_000,
  })
  const egressQ = useQuery({
    queryKey: qk.mcp.egress(org?.id),
    queryFn: () => getMcpEgress(org!.id),
    enabled: !!org?.id,
    staleTime: 60_000,
  })
  const policyQ = useQuery({
    queryKey: qk.mcp.policy(org?.id),
    queryFn: () => getMcpPolicy(org!.id),
    enabled: !!org?.id,
    staleTime: 60_000,
  })
  const simulateQ = useQuery({
    queryKey: qk.mcp.attackLabSimulation(org?.id, 'enforce'),
    queryFn: () => simulateMcpPolicy(org!.id, { defaultMode: 'enforce', limit: 200 }),
    enabled: !!org?.id,
    staleTime: 60_000,
  })

  const selectedChain = CHAINS.find((chain) => chain.id === selectedChainId)
  const denyChains = CHAINS.filter((chain) => String(chain.severity).includes('deny')).length
  const totalProbes = CHAINS.reduce((sum, chain) => sum + chain.probes.length, 0)
  const liveDecisions = (overviewQ.data?.recentDecisions ?? []).filter((row) => row.toolName !== 'connection_probe')
  const liveBlocked = liveDecisions.filter((row) => {
    const verdict = String(row.effective || row.verdict || '').toLowerCase()
    return ['deny', 'hold', 'approval', 'blocked', 'block'].includes(verdict)
  }).length
  const sensitiveEgress = egressQ.data?.total ?? 0
  const enforceWouldBlock = simulateQ.data?.wouldBlock ?? 0
  const configured = Boolean(overviewQ.data?.configured)
  const mode = policyQ.data?.defaultMode ?? 'observe'
  const blockingMode = isBlockingMode(mode)
  const loadingLive = overviewQ.isLoading || egressQ.isLoading || policyQ.isLoading || simulateQ.isLoading

  const surface = dark ? '#0b1220' : '#ffffff'
  const panel = dark ? alpha('#111827', 0.72) : alpha('#f8fafc', 0.94)
  const border = dark ? alpha(BRAND, 0.32) : alpha(BRAND, 0.2)
  const danger = dark ? '#f87171' : '#b42318'
  const warn = dark ? '#fbbf24' : '#9a5b00'
  const success = colors.semantic.success

  const gates = useMemo(() => [
    { title: 'Blueprint chains', value: CHAINS.length, helper: 'front-end lab scenarios', tone: BRAND, icon: <GitBranch size={16} /> },
    { title: 'Probe coverage', value: totalProbes, helper: 'lab payload sequence', tone: BRAND, icon: <FlaskConical size={16} /> },
    { title: 'Live decisions', value: liveDecisions.length, helper: configured ? 'from MCP overview API' : 'no runtime ingest yet', tone: configured ? CYAN : warn, icon: <Activity size={16} /> },
    { title: 'Sensitive egress', value: sensitiveEgress, helper: 'from egress risk API', tone: sensitiveEgress > 0 ? danger : success, icon: <DatabaseZap size={16} /> },
    { title: 'Release gate', value: blockingMode ? 'ON' : 'OBS', helper: String(mode), tone: blockingMode ? success : warn, icon: <LockKeyhole size={16} /> },
  ], [blockingMode, configured, liveDecisions.length, mode, sensitiveEgress, success, warn, danger, totalProbes])

  return (
    <>
      <Box
        sx={{
          height: '100%',
          minHeight: 0,
          overflow: 'hidden',
          p: { xs: 2, md: 3 },
          display: 'flex',
          flexDirection: 'column',
          gap: 1.25,
          bgcolor: dark ? '#0b1020' : '#f8f7fc',
          backgroundImage: dark
            ? `radial-gradient(circle at 16% 18%, ${alpha(BRAND, 0.16)}, transparent 30%), linear-gradient(${alpha('#94a3b8', 0.08)} 1px, transparent 1px), linear-gradient(90deg, ${alpha('#94a3b8', 0.06)} 1px, transparent 1px)`
            : `radial-gradient(circle at 16% 18%, ${alpha(BRAND, 0.1)}, transparent 28%), linear-gradient(${alpha('#64748b', 0.06)} 1px, transparent 1px), linear-gradient(90deg, ${alpha('#64748b', 0.045)} 1px, transparent 1px)`,
          backgroundSize: 'auto, 32px 32px, 32px 32px',
        }}
      >
        <Paper
          variant="outlined"
          sx={{
            flexShrink: 0,
            borderRadius: 1,
            borderColor: border,
            bgcolor: dark ? alpha('#0b1220', 0.94) : alpha('#ffffff', 0.98),
            overflow: 'hidden',
            boxShadow: dark ? `0 18px 48px ${alpha('#000', 0.28)}` : `0 14px 34px ${alpha('#0f172a', 0.07)}`,
          }}
        >
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 440px' }, gap: 1.1, p: 1.4, alignItems: 'stretch' }}>
            <Box sx={{ display: 'flex', gap: 1.2, minWidth: 0 }}>
              <Box sx={{ width: 52, height: 52, borderRadius: 1, display: 'grid', placeItems: 'center', flexShrink: 0, color: BRAND, bgcolor: alpha(BRAND, dark ? 0.18 : 0.1), border: `1px solid ${alpha(BRAND, 0.28)}`, boxShadow: `0 0 0 4px ${alpha(BRAND, 0.055)}` }}>
                <ShieldAlert size={24} />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Typography component="h1" sx={{ fontSize: { xs: 27, md: 34 }, fontWeight: 950, lineHeight: 1.02, letterSpacing: 0 }}>
                    攻擊測試實驗室
                  </Typography>
                  <Chip size="small" label={configured ? 'LIVE API' : 'BLUEPRINT'} sx={{ height: 24, color: configured ? CYAN : BRAND, bgcolor: alpha(configured ? CYAN : BRAND, 0.09), border: `1px solid ${alpha(configured ? CYAN : BRAND, 0.22)}`, fontWeight: 900, letterSpacing: 0.25 }} />
                </Box>
                <Typography sx={{ mt: 0.55, color: 'text.secondary', fontSize: 13, lineHeight: 1.55, maxWidth: 840 }}>
                  這頁現在分成兩層：上方藍圖是固定測試劇本；Live 區塊會讀 Agent Firewall overview、egress risk、policy simulate API。
                </Typography>
                <Box sx={{ mt: 1, display: 'flex', gap: 0.7, flexWrap: 'wrap' }}>
                  {[
                    configured ? 'runtime connected' : 'runtime not connected',
                    `mode: ${mode}`,
                    `ingest: ${mcpIngestEndpoint(org?.id)}`,
                  ].map((label) => (
                    <Box key={label} sx={{ px: 0.9, py: 0.45, borderRadius: 1, border: `1px solid ${alpha(BRAND, 0.14)}`, bgcolor: alpha(BRAND, 0.045), color: 'text.secondary', fontSize: 11, fontWeight: 850, maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {label}
                    </Box>
                  ))}
                </Box>
              </Box>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 0.75, minWidth: 0 }}>
              {gates.map((gate) => (
                <AttackMetric key={gate.title} {...gate} />
              ))}
            </Box>
          </Box>
        </Paper>

        <Paper variant="outlined" sx={{ flex: 1, minHeight: 0, borderRadius: 1, borderColor: border, bgcolor: surface, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <SectionHead
            icon={labTab === 'live' ? <Activity size={15} /> : labTab === 'decision' ? <Radar size={15} /> : labTab === 'gates' ? <LockKeyhole size={15} /> : <GitBranch size={15} />}
            title={labTab === 'live' ? 'Live API 狀態' : labTab === 'decision' ? '決策焦點' : labTab === 'gates' ? '上線閘門' : '攻擊鏈指揮板'}
            badge={labTab === 'live' ? (configured ? 'connected' : 'no ingest') : labTab === 'decision' ? 'go / no-go' : labTab === 'gates' ? 'release gate' : `${CHAINS.length} chains`}
            tone={labTab === 'live' ? CYAN : labTab === 'decision' ? danger : labTab === 'gates' ? warn : BRAND}
          />
          <Box sx={{ flexShrink: 0, display: 'flex', gap: 0.65, p: 0.85, borderBottom: `1px solid ${alpha('#334155', dark ? 0.28 : 0.12)}`, bgcolor: panel, overflowX: 'auto' }}>
            {[
              ['chains', '攻擊鏈'],
              ['live', 'Live API'],
              ['decision', '決策焦點'],
              ['gates', '上線閘門'],
            ].map(([id, label]) => (
              <Button
                key={id}
                size="small"
                onClick={() => setLabTab(id as LabTab)}
                sx={{
                  height: 32,
                  px: 1.25,
                  flexShrink: 0,
                  borderRadius: 1,
                  fontWeight: 900,
                  color: labTab === id ? '#fff' : BRAND,
                  bgcolor: labTab === id ? BRAND : alpha(BRAND, 0.08),
                  border: `1px solid ${alpha(BRAND, labTab === id ? 0.42 : 0.18)}`,
                  '&:hover': { bgcolor: labTab === id ? BRAND : alpha(BRAND, 0.14) },
                }}
              >
                {label}
              </Button>
            ))}
          </Box>
          <Box sx={{ p: 1.15, flex: 1, minHeight: 0, overflow: 'auto' }}>
            {labTab === 'live' ? (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.1fr 0.9fr' }, gap: 1, alignContent: 'start' }}>
                <LivePanel
                  loading={loadingLive}
                  configured={configured}
                  liveDecisions={liveDecisions.length}
                  liveBlocked={liveBlocked}
                  sensitiveEgress={sensitiveEgress}
                  enforceWouldBlock={enforceWouldBlock}
                  mode={String(mode)}
                  overviewError={overviewQ.isError}
                  egressError={egressQ.isError}
                  simulateError={simulateQ.isError}
                />
                <Box sx={{ display: 'grid', gap: 0.8, alignContent: 'start' }}>
                  <ApiStatusCard title="Overview API" value={configured ? 'connected' : 'empty'} detail="/api/v1/code/orgs/{id}/mcp/overview" tone={configured ? success : warn} />
                  <ApiStatusCard title="Egress Risk API" value={`${sensitiveEgress} events`} detail="/api/v1/code/orgs/{id}/mcp/risk/egress" tone={sensitiveEgress > 0 ? danger : success} />
                  <ApiStatusCard title="Policy Simulate API" value={`${enforceWouldBlock} would block`} detail="/api/v1/code/orgs/{id}/mcp/policy/simulate" tone={enforceWouldBlock > 0 ? danger : success} />
                </Box>
              </Box>
            ) : labTab === 'decision' ? (
              <Box sx={{ minHeight: '100%', borderRadius: 1, border: `1px solid ${alpha(danger, 0.16)}`, bgcolor: alpha(danger, 0.028), p: 1.15, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '170px minmax(0, 1fr)' }, gap: 1, alignContent: 'start' }}>
                <Box sx={{ borderRadius: 1, display: 'grid', placeItems: 'center', color: danger, bgcolor: alpha(danger, 0.045), border: `1px solid ${alpha(danger, 0.24)}`, minHeight: 140 }}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography sx={{ color: danger, fontSize: 54, fontWeight: 950, lineHeight: 0.9 }}>{Math.max(denyChains, enforceWouldBlock)}</Typography>
                    <Typography sx={{ mt: 0.7, color: 'text.secondary', fontSize: 12, fontWeight: 850 }}>go / no-go</Typography>
                  </Box>
                </Box>
                <Box sx={{ minWidth: 0, display: 'grid', gap: 0.75 }}>
                  <Typography sx={{ fontSize: { xs: 22, md: 26 }, fontWeight: 950, lineHeight: 1.08 }}>未接實際事件前，不應進入 enforce</Typography>
                  <Typography sx={{ color: 'text.secondary', fontSize: 13, lineHeight: 1.5 }}>
                    管理者要看的不是漂亮數字，而是：目前有沒有 runtime 事件、有沒有外傳、有沒有政策模擬證據。沒有事件時，這裡只能算測試藍圖。
                  </Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 0.75 }}>
                    <DecisionCard title="Runtime evidence" detail={`${liveDecisions.length} live decisions`} tone={configured ? success : warn} />
                    <DecisionCard title="Sensitive egress" detail={`${sensitiveEgress} outbound events`} tone={sensitiveEgress > 0 ? danger : success} />
                    <DecisionCard title="Enforce simulation" detail={`${enforceWouldBlock} would block`} tone={enforceWouldBlock > 0 ? danger : warn} />
                  </Box>
                </Box>
              </Box>
            ) : labTab === 'gates' ? (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 0.9, alignContent: 'start' }}>
                {[
                  ['必須有 runtime ingest', configured ? '已接 overview API，可讀後端事件。' : '尚未看到 Agent Firewall runtime 事件。', configured ? success : warn],
                  ['必須有外傳風險資料', egressQ.data ? `egress API 回傳 ${sensitiveEgress} 筆。` : 'egress API 尚無資料。', egressQ.data ? CYAN : warn],
                  ['必須跑 policy simulate', simulateQ.data ? `enforce 模擬會阻擋 ${enforceWouldBlock} 筆。` : 'simulate API 尚未回傳。', simulateQ.data ? CYAN : warn],
                  ['前端不得自行判定結果', '前端只呈現：測試藍圖、後端事件、後端模擬結果。', BRAND],
                ].map(([title, detail, tone]) => (
                  <Box key={String(title)} sx={{ borderRadius: 1, border: `1px solid ${alpha(String(tone), 0.18)}`, borderLeft: `3px solid ${alpha(String(tone), 0.78)}`, bgcolor: alpha(String(tone), 0.045), p: 1.15, minHeight: 92 }}>
                    <Typography sx={{ fontSize: 14, fontWeight: 950 }}>{title}</Typography>
                    <Typography sx={{ mt: 0.5, color: 'text.secondary', fontSize: 13, lineHeight: 1.5 }}>{detail}</Typography>
                  </Box>
                ))}
              </Box>
            ) : (
              <Box sx={{ display: 'grid', gap: 0.65, alignContent: 'start', pr: 0.4 }}>
                {CHAINS.map((chain, index) => (
                  <AttackChainRow key={chain.id} chain={chain} index={index} onOpen={() => setSelectedChainId(chain.id)} />
                ))}
              </Box>
            )}
          </Box>
        </Paper>
      </Box>

      <Dialog open={Boolean(selectedChain)} onClose={() => setSelectedChainId(null)} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 1 } }}>
        {selectedChain && (
          <>
            <DialogTitle sx={{ pb: 1 }}>
              <Typography sx={{ fontSize: 20, fontWeight: 950 }}>{selectedChain.title}</Typography>
              <Typography sx={{ mt: 0.4, color: 'text.secondary', fontSize: 13 }}>{selectedChain.detects}</Typography>
            </DialogTitle>
            <DialogContent dividers sx={{ display: 'grid', gap: 1 }}>
              {selectedChain.probes.map((probe, index) => (
                <Box key={`${selectedChain.id}-${index}`} sx={{ borderRadius: 1, border: `1px solid ${alpha(BRAND, 0.16)}`, bgcolor: alpha(BRAND, 0.045), p: 1.2 }}>
                  <Typography sx={{ color: BRAND, fontSize: 12, fontWeight: 950 }}>Probe {index + 1}</Typography>
                  <Typography sx={{ mt: 0.4, fontSize: 14, fontWeight: 900 }}>{String(probe.verb)} / {String(probe.toolName)}</Typography>
                  <Typography sx={{ mt: 0.35, color: 'text.secondary', fontSize: 12.5, overflowWrap: 'anywhere' }}>
                    {String((probe as Record<string, unknown>).target || (probe as Record<string, unknown>).dataClass || (probe as Record<string, unknown>).dataDirection || 'policy signal')}
                  </Typography>
                </Box>
              ))}
            </DialogContent>
            <DialogActions sx={{ px: 2, py: 1.25 }}>
              <Button onClick={() => setSelectedChainId(null)} sx={{ fontWeight: 850 }}>關閉</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </>
  )
}

function AttackMetric({ title, value, helper, tone, icon }: { title: string; value: ReactNode; helper: string; tone: string; icon: ReactNode }) {
  return (
    <Box sx={{ minWidth: 0, borderRadius: 1, border: `1px solid ${alpha(tone, 0.18)}`, borderLeft: `3px solid ${alpha(tone, 0.82)}`, bgcolor: alpha(tone, 0.045), px: 1, py: 0.75, display: 'grid', gridTemplateColumns: '20px minmax(0, 1fr) auto', alignItems: 'center', gap: 0.7 }}>
      <Box sx={{ color: tone, display: 'grid', placeItems: 'center' }}>{icon}</Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ minWidth: 0, color: 'text.secondary', fontSize: 10, fontWeight: 950, textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {title}
        </Typography>
        <Typography sx={{ mt: 0.22, color: 'text.secondary', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{helper}</Typography>
      </Box>
      <Typography sx={{ color: tone, fontSize: 22, fontWeight: 950, lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</Typography>
    </Box>
  )
}

function SectionHead({ icon, title, badge, tone }: { icon: ReactNode; title: string; badge: string; tone: string }) {
  return (
    <Box sx={{ flexShrink: 0, px: 1.2, py: 0.95, borderBottom: `1px solid ${alpha('#334155', 0.13)}`, display: 'flex', alignItems: 'center', gap: 0.75 }}>
      <Box sx={{ color: tone, display: 'grid', placeItems: 'center' }}>{icon}</Box>
      <Typography sx={{ fontSize: 14, fontWeight: 950, flex: 1 }}>{title}</Typography>
      <Chip size="small" label={badge} sx={{ height: 22, color: tone, bgcolor: alpha(tone, 0.1), border: `1px solid ${alpha(tone, 0.18)}`, fontSize: 11, fontWeight: 850 }} />
    </Box>
  )
}

function AttackChainRow({ chain, index, onOpen }: { chain: typeof CHAINS[number]; index: number; onOpen: () => void }) {
  const tone = String(chain.severity).includes('deny') ? colors.semantic.danger : colors.semantic.warning
  const summaries = [
    '讀取敏感資料後外傳',
    '偵察外部目標後修改',
    '生產環境副作用',
  ]
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '34px minmax(0, 1.16fr) minmax(0, 0.8fr) 168px' }, gap: 0.8, alignItems: 'center', borderRadius: 1, border: `1px solid ${alpha(tone, 0.18)}`, borderLeft: `3px solid ${alpha(tone, 0.82)}`, bgcolor: alpha(tone, 0.042), px: 1, py: 0.72 }}>
      <Box sx={{ width: 26, height: 26, borderRadius: 1, display: 'grid', placeItems: 'center', color: tone, bgcolor: alpha(tone, 0.1), fontSize: 12, fontWeight: 950 }}>{index + 1}</Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 950, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{chain.title}</Typography>
        <Typography sx={{ mt: 0.25, color: 'text.secondary', fontSize: 11.5 }}>{chain.probes.length} probes</Typography>
      </Box>
      <Typography sx={{ minWidth: 0, color: 'text.secondary', fontSize: 12.5, lineHeight: 1.35, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {summaries[index] ?? chain.detects}
      </Typography>
      <Box sx={{ justifySelf: { md: 'end' }, display: 'flex', alignItems: 'center', gap: 0.6 }}>
        <Chip size="small" label={chain.severity} sx={{ height: 24, color: tone, bgcolor: alpha(tone, 0.1), border: `1px solid ${alpha(tone, 0.2)}`, fontWeight: 850 }} />
        <Button size="small" onClick={onOpen} sx={{ height: 26, minWidth: 54, borderRadius: 1, fontWeight: 850, color: BRAND, bgcolor: alpha(BRAND, 0.08), border: `1px solid ${alpha(BRAND, 0.16)}` }}>
          細節
        </Button>
      </Box>
    </Box>
  )
}

function LivePanel({
  loading,
  configured,
  liveDecisions,
  liveBlocked,
  sensitiveEgress,
  enforceWouldBlock,
  mode,
  overviewError,
  egressError,
  simulateError,
}: {
  loading: boolean
  configured: boolean
  liveDecisions: number
  liveBlocked: number
  sensitiveEgress: number
  enforceWouldBlock: number
  mode: string
  overviewError: boolean
  egressError: boolean
  simulateError: boolean
}) {
  const hasError = overviewError || egressError || simulateError
  return (
    <Box sx={{ borderRadius: 1, border: `1px solid ${alpha(CYAN, 0.18)}`, bgcolor: alpha(CYAN, 0.035), p: 1.2, minHeight: 260 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <ShieldCheck size={18} color={configured ? colors.semantic.success : colors.semantic.warning} />
        <Typography sx={{ fontSize: 17, fontWeight: 950 }}>後端資料狀態</Typography>
        {loading && <CircularProgress size={16} sx={{ ml: 'auto' }} />}
      </Box>
      <Typography sx={{ mt: 0.55, color: 'text.secondary', fontSize: 13, lineHeight: 1.5 }}>
        {hasError
          ? '有 API 回傳錯誤，這頁不能宣稱已具備真實測試結果。'
          : configured
            ? '已讀到後端 Agent Firewall 資料，下面數字來自 API。'
            : '目前沒有 runtime ingest，因此管理頁只能呈現測試藍圖與接線狀態。'}
      </Typography>
      <Box sx={{ mt: 1.15, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 0.8 }}>
        <DecisionCard title="Policy mode" detail={mode} tone={isBlockingMode(mode) ? colors.semantic.success : colors.semantic.warning} />
        <DecisionCard title="Live decisions" detail={`${liveDecisions} events / ${liveBlocked} blocked`} tone={liveBlocked > 0 ? colors.semantic.danger : CYAN} />
        <DecisionCard title="Sensitive egress" detail={`${sensitiveEgress} outbound`} tone={sensitiveEgress > 0 ? colors.semantic.danger : colors.semantic.success} />
        <DecisionCard title="Enforce preview" detail={`${enforceWouldBlock} would block`} tone={enforceWouldBlock > 0 ? colors.semantic.danger : colors.semantic.success} />
      </Box>
    </Box>
  )
}

function DecisionCard({ title, detail, tone }: { title: string; detail: string; tone: string }) {
  return (
    <Box sx={{ borderRadius: 1, border: `1px solid ${alpha(tone, 0.18)}`, bgcolor: alpha(tone, 0.045), p: 1, minWidth: 0 }}>
      <Typography sx={{ fontSize: 12, fontWeight: 950, color: tone }}>{title}</Typography>
      <Typography sx={{ mt: 0.35, color: 'text.primary', fontSize: 14, lineHeight: 1.35, fontWeight: 850, overflowWrap: 'anywhere' }}>{detail}</Typography>
    </Box>
  )
}

function ApiStatusCard({ title, value, detail, tone }: { title: string; value: string; detail: string; tone: string }) {
  return (
    <Box sx={{ borderRadius: 1, border: `1px solid ${alpha(tone, 0.18)}`, bgcolor: alpha(tone, 0.035), p: 1.1, minWidth: 0 }}>
      <Typography sx={{ color: tone, fontSize: 12, fontWeight: 950, textTransform: 'uppercase', letterSpacing: 0.2 }}>{title}</Typography>
      <Typography sx={{ mt: 0.4, fontSize: 22, fontWeight: 950, lineHeight: 1 }}>{value}</Typography>
      <Typography sx={{ mt: 0.45, color: 'text.secondary', fontSize: 11.5, overflowWrap: 'anywhere' }}>{detail}</Typography>
    </Box>
  )
}

export function AgentFirewallAttackLab() {
  const { org } = useOrg()
  const endpoint = org?.id ? mcpIngestEndpoint(org.id) : ''
  const [copied, setCopied] = useState<string | null>(null)

  async function copy(id: string, text: string) {
    try {
      const copiedOk = await writeClipboardText(text)
      if (!copiedOk) return
      setCopied(id)
      window.setTimeout(() => setCopied(null), 1400)
    } catch {
      setCopied(null)
    }
  }

  return (
    <Box sx={{ height: '100%', minHeight: 0, p: { xs: 2, sm: 3 }, display: 'flex', flexDirection: 'column', gap: 2.5, overflow: 'hidden' }}>
      <Alert severity="info" sx={{ flexShrink: 0, '& .MuiAlert-message': { lineHeight: 1.6 } }}>
        {t('agentFirewall.attackLabKeyNote')}
      </Alert>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', pr: { xs: 0.5, sm: 1 }, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {CHAINS.map((chain) => {
          const curl = curlFor(endpoint, chain.id, chain.probes)
          return (
            <Paper
              key={chain.id}
              variant="outlined"
              sx={{
                borderRadius: 2.5,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                flex: '0 0 auto',
                maxHeight: { xs: 'min(520px, calc(100dvh - 180px))', md: 'min(620px, calc(100dvh - 210px))' },
              }}
            >
              <Box sx={{ px: { xs: 2, sm: 3 }, py: 1.75, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', flexShrink: 0 }}>
                <GitBranch size={16} style={{ color: BRAND }} />
                <Typography variant="subtitle2" fontWeight={800}>{chain.title}</Typography>
                <Chip size="small" label={chain.severity} sx={{ height: 22, fontSize: 12, fontWeight: 800, color: '#ef4444', bgcolor: 'rgba(239,68,68,0.10)' }} />
              </Box>
              <Box sx={{ p: { xs: 2, sm: 3 }, display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0, overflowY: 'auto' }}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                  <ShieldAlert size={16} style={{ color: '#f59e0b', marginTop: 2, flexShrink: 0 }} />
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>{chain.detects}</Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {chain.probes.map((probe, index) => (
                    <Chip
                      key={`${chain.id}-${index}`}
                      size="small"
                      label={`${index + 1}. ${String(probe.verb)} ${String(probe.toolName)}`}
                      sx={{ height: 26, fontSize: 12, fontWeight: 800 }}
                    />
                  ))}
                </Box>

                <Box sx={{ minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                    <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ textTransform: 'uppercase' }}>
                      {t('agentFirewall.probeSequence')}
                    </Typography>
                    <Tooltip title={t('common.copy')}>
                      <IconButton size="small" onClick={() => copy(chain.id, curl)} aria-label={t('agentFirewall.copyProbe')}>
                        {copied === chain.id ? <Check size={14} /> : <Copy size={14} />}
                      </IconButton>
                    </Tooltip>
                  </Box>
                  <Box component="pre" sx={{
                    m: 0,
                    px: { xs: 1.5, sm: 2 },
                    py: 1.75,
                    minHeight: { xs: 180, md: 220 },
                    maxHeight: { xs: 240, md: 300 },
                    borderRadius: 1.5,
                    backgroundColor: '#020617',
                    color: '#e5e7eb',
                    border: '1px solid rgba(148, 163, 184, 0.24)',
                    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
                    fontSize: 12,
                    lineHeight: 1.6,
                    overflow: 'auto',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}>
                    {curl}
                  </Box>
                </Box>
              </Box>
            </Paper>
          )
        })}
      </Box>
    </Box>
  )
}
