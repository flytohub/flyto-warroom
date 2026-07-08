import { useState } from 'react'
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
import { alpha, useTheme } from '@mui/material/styles'
import { Check, Copy, FlaskConical, GitBranch, LockKeyhole, Radar, ShieldAlert, Siren, Target } from 'lucide-react'
import { useOrg } from '@hooks/useOrg'
import { mcpIngestEndpoint } from '@lib/engine'
import { t, tOr } from '@lib/i18n';
import { writeClipboardText } from '@lib/clipboard'
import { colors } from '@/styles/designTokens'

const BRAND = '#7c3aed'

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
    title: t('hardcoded.production.side.effect.c4a6afe4'),
    severity: 'approval',
    detects: 'A state-changing or externally visible action lands on declared production scope without an approved exception.',
    probes: [
      { toolName: 'deploy_prod', verb: 'DELETE', target: 'https://prod.example', stateChange: true },
    ],
  },
]

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

function curlFor(endpoint: string, chainId: string, probes: Array<Record<string, unknown>>) {
  return probes.map((probe) => `curl -sS -X POST "${endpoint}" \\
  -H "X-Flyto-API-Key: $FLYTO_AGENT_FIREWALL_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${probeBody(chainId, probe)}'`).join('\n\n')
}

export function AgentFirewallAttackLabManagerView() {
  const theme = useTheme()
  const dark = theme.palette.mode === 'dark'
  const [selectedChainId, setSelectedChainId] = useState<string | null>(null)
  const [labTab, setLabTab] = useState<'chains' | 'flow' | 'decision' | 'gates'>('chains')
  const denyChains = CHAINS.filter((chain) => String(chain.severity).includes('deny')).length
  const totalProbes = CHAINS.reduce((sum, chain) => sum + chain.probes.length, 0)
  const selectedChain = CHAINS.find((chain) => chain.id === selectedChainId)
  const surface = dark ? '#0b1220' : '#ffffff'
  const panel = dark ? alpha('#111827', 0.72) : alpha('#f8fafc', 0.94)
  const border = dark ? alpha(BRAND, 0.28) : alpha(BRAND, 0.18)
  const danger = dark ? '#f87171' : '#b42318'
  const warn = dark ? '#fbbf24' : '#9a5b00'
  const success = colors.semantic.success

  const gates = [
    { title: '高風險情境', value: CHAINS.length, helper: '需要納入 release gate', tone: danger, icon: <Siren size={16} /> },
    { title: '預期拒絕', value: denyChains, helper: '外傳與 mutation 必須阻擋', tone: danger, icon: <LockKeyhole size={16} /> },
    { title: 'Probe 覆蓋', value: totalProbes, helper: '每條鏈都要有證據', tone: BRAND, icon: <FlaskConical size={16} /> },
    { title: '正式閘門', value: '必須', helper: '未通過不得 enforce', tone: warn, icon: <Target size={16} /> },
  ]

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
          ? `radial-gradient(circle at 18% 18%, ${alpha(BRAND, 0.18)}, transparent 30%), linear-gradient(${alpha('#94a3b8', 0.08)} 1px, transparent 1px), linear-gradient(90deg, ${alpha('#94a3b8', 0.06)} 1px, transparent 1px)`
          : `radial-gradient(circle at 18% 18%, ${alpha(BRAND, 0.1)}, transparent 28%), linear-gradient(${alpha('#64748b', 0.06)} 1px, transparent 1px), linear-gradient(90deg, ${alpha('#64748b', 0.045)} 1px, transparent 1px)`,
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
          position: 'relative',
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            opacity: dark ? 0.22 : 0.34,
            background: `linear-gradient(90deg, ${alpha(BRAND, 0.14)}, transparent 38%), linear-gradient(${alpha('#64748b', 0.08)} 1px, transparent 1px), linear-gradient(90deg, ${alpha('#64748b', 0.06)} 1px, transparent 1px)`,
            backgroundSize: 'auto, 26px 26px, 26px 26px',
          },
        }}
      >
        <Box sx={{ position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 420px' }, gap: 1.1, p: 1.4, alignItems: 'stretch' }}>
          <Box sx={{ display: 'flex', gap: 1.2, minWidth: 0 }}>
            <Box sx={{ width: 52, height: 52, borderRadius: 1, display: 'grid', placeItems: 'center', flexShrink: 0, color: BRAND, bgcolor: alpha(BRAND, dark ? 0.18 : 0.1), border: `1px solid ${alpha(BRAND, 0.28)}`, boxShadow: `0 0 0 4px ${alpha(BRAND, 0.055)}` }}>
              <ShieldAlert size={24} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography component="h1" sx={{ fontSize: { xs: 27, md: 34 }, fontWeight: 950, lineHeight: 1.02, letterSpacing: 0 }}>
                  {tOr('agentFirewall.manager.attackLabTitle', '攻擊測試實驗室')}
                </Typography>
                <Chip size="small" label="LAB READY" sx={{ height: 24, color: BRAND, bgcolor: alpha(BRAND, 0.09), border: `1px solid ${alpha(BRAND, 0.22)}`, fontWeight: 900, letterSpacing: 0.25 }} />
              </Box>
              <Typography sx={{ mt: 0.55, color: 'text.secondary', fontSize: 13, lineHeight: 1.55, maxWidth: 850 }}>
                {tOr('agentFirewall.manager.attackLabSubtitle', '管理視角整理對抗式 AI 代理情境：測什麼、為什麼重要，以及哪些結果應該阻擋或暫停。')}
              </Typography>
              <Box sx={{ mt: 1, display: 'flex', gap: 0.7, flexWrap: 'wrap' }}>
                {['adversarial simulation', 'policy gate', 'digest evidence'].map((label) => (
                  <Box key={label} sx={{ px: 0.9, py: 0.45, borderRadius: 1, border: `1px solid ${alpha(BRAND, 0.14)}`, bgcolor: alpha(BRAND, 0.045), color: 'text.secondary', fontSize: 11, fontWeight: 850 }}>
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
          icon={labTab === 'decision' ? <Radar size={15} /> : labTab === 'gates' ? <LockKeyhole size={15} /> : <GitBranch size={15} />}
          title={labTab === 'decision' ? '決策焦點' : labTab === 'gates' ? '上線閘門與保證' : '攻擊鏈指揮板'}
          badge={labTab === 'decision' ? 'go / no-go' : labTab === 'gates' ? 'release gate' : `${CHAINS.length} chains`}
          tone={labTab === 'decision' ? danger : labTab === 'gates' ? warn : BRAND}
        />
        <Box sx={{ flexShrink: 0, display: 'flex', gap: 0.65, p: 0.85, borderBottom: `1px solid ${alpha('#334155', dark ? 0.28 : 0.12)}`, bgcolor: panel, overflowX: 'auto' }}>
            {[
              ['chains', '攻擊鏈'],
              ['flow', '檢測流程'],
              ['decision', '決策焦點'],
              ['gates', '上線閘門'],
            ].map(([id, label]) => (
              <Button
                key={id}
                size="small"
                onClick={() => setLabTab(id as 'chains' | 'flow' | 'decision' | 'gates')}
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
          {labTab === 'flow' ? (
              <Box sx={{ height: '100%', borderRadius: 1, border: `1px solid ${alpha(BRAND, 0.16)}`, bgcolor: panel, p: 1.15, display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 0.75 }}>
                  {[
                    ['讀取敏感', 'secret / code / customer data'],
                    ['序列關聯', '同 session 關聯前後行為'],
                    ['外部傳輸', 'webhook / public endpoint'],
                    ['政策判斷', 'deny / hold / approval'],
                    ['阻擋證據', 'digest-safe audit trail'],
                  ].map(([step, detail], index) => (
                    <Box key={step} sx={{ minWidth: 0, minHeight: 112, borderRadius: 1, border: `1px solid ${alpha(index < 3 ? danger : BRAND, 0.17)}`, bgcolor: alpha(index < 3 ? danger : BRAND, index === 3 ? 0.065 : 0.032), p: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <Typography sx={{ color: index < 3 ? danger : BRAND, fontSize: 11, fontWeight: 950 }}>0{index + 1}</Typography>
                      <Box>
                        <Typography sx={{ fontSize: 13, fontWeight: 950, lineHeight: 1.18 }}>{step}</Typography>
                        <Typography sx={{ mt: 0.45, color: 'text.secondary', fontSize: 11.5, lineHeight: 1.35 }}>{detail}</Typography>
                      </Box>
                    </Box>
                  ))}
                </Box>
                <Box sx={{ borderRadius: 1, border: `1px solid ${alpha(BRAND, 0.14)}`, bgcolor: alpha(BRAND, 0.04), p: 1.1 }}>
                  <Typography sx={{ color: BRAND, fontSize: 12, fontWeight: 950 }}>檢測結論</Typography>
                  <Typography sx={{ mt: 0.45, fontSize: 14, fontWeight: 850, lineHeight: 1.45 }}>
                    每條攻擊鏈只要缺少「政策判斷」或「阻擋證據」，就不能進入正式攔截模式。
                  </Typography>
                </Box>
              </Box>
          ) : labTab === 'decision' ? (
            <Box sx={{ minHeight: '100%', borderRadius: 1, border: `1px solid ${alpha(danger, 0.16)}`, bgcolor: alpha(danger, 0.028), p: 1.15, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '76px minmax(0, 1fr)', md: '96px minmax(0, 1fr)' }, gap: 1, alignItems: 'center' }}>
                <Box sx={{ width: { xs: 68, md: 82 }, height: { xs: 68, md: 82 }, borderRadius: 1, display: 'grid', placeItems: 'center', color: danger, bgcolor: alpha(danger, 0.045), border: `1px solid ${alpha(danger, 0.24)}` }}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography sx={{ color: danger, fontSize: { xs: 34, md: 42 }, fontWeight: 950, lineHeight: 0.9 }}>{denyChains}</Typography>
                    <Typography sx={{ mt: 0.45, color: 'text.secondary', fontSize: 11, fontWeight: 850 }}>go / no-go</Typography>
                  </Box>
                </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: { xs: 22, md: 26 }, fontWeight: 950, lineHeight: 1.08 }}>預期拒絕或暫停</Typography>
                <Typography sx={{ mt: 0.6, color: 'text.secondary', fontSize: 13, lineHeight: 1.5, maxWidth: 760 }}>
                  未跑完攻擊鏈，不建議進入 enforce。管理者只需要判斷三件事：是否能阻擋、是否有證據、是否可以上線。
                </Typography>
              </Box>
              </Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 0.75 }}>
                  {[
                    ['阻擋能力', '敏感讀取後外傳必須 deny', danger],
                    ['核准路徑', 'production side effect 必須 approval', warn],
                    ['證據輸出', '每個 probe 要產出稽核摘要', BRAND],
                  ].map(([title, detail, tone]) => (
                    <Box key={String(title)} sx={{ borderRadius: 1, border: `1px solid ${alpha(String(tone), 0.18)}`, bgcolor: alpha(String(tone), 0.045), p: 1 }}>
                      <Typography sx={{ fontSize: 13, fontWeight: 950 }}>{title}</Typography>
                      <Typography sx={{ mt: 0.4, color: 'text.secondary', fontSize: 12.5, lineHeight: 1.45 }}>{detail}</Typography>
                    </Box>
                  ))}
                </Box>
            </Box>
          ) : labTab === 'gates' ? (
            <Box sx={{ height: '100%', minHeight: 0, overflow: 'auto', display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 0.9, alignContent: 'start' }}>
              {[
                ['序列風險', '不能只用單次工具呼叫判斷。', success],
                ['拒絕驗證', '敏感讀取後外傳必須 deny。', danger],
                ['核准路徑', 'production side effect 必須 approval。', warn],
                ['證據交付', '每個 probe 要能產出稽核摘要。', BRAND],
                ['最小暴露', 'Dialog 看細節，主畫面只留 go/no-go 與鏈路。', BRAND],
              ].map(([title, detail, tone]) => (
                <Box key={String(title)} sx={{ borderRadius: 1, border: `1px solid ${alpha(String(tone), 0.18)}`, borderLeft: `3px solid ${alpha(String(tone), 0.78)}`, bgcolor: alpha(String(tone), 0.045), p: 1.15, minHeight: 96 }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 950 }}>{title}</Typography>
                  <Typography sx={{ mt: 0.5, color: 'text.secondary', fontSize: 13, lineHeight: 1.5 }}>{detail}</Typography>
                </Box>
              ))}
            </Box>
          ) : (
              <Box sx={{ height: '100%', minHeight: 0, overflow: 'auto', display: 'grid', gap: 0.65, alignContent: 'start', pr: 0.4 }}>
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

function AttackMetric({ title, value, helper, tone, icon }: { title: string; value: React.ReactNode; helper: string; tone: string; icon: React.ReactNode }) {
  return (
    <Box sx={{ minWidth: 0, borderRadius: 1, border: `1px solid ${alpha(tone, 0.18)}`, borderLeft: `3px solid ${alpha(tone, 0.82)}`, bgcolor: alpha(tone, 0.045), px: 1, py: 0.75, display: 'grid', gridTemplateColumns: '20px minmax(0, 1fr) auto', alignItems: 'center', gap: 0.7 }}>
      <Box sx={{ color: tone, display: 'grid', placeItems: 'center' }}>
        {icon}
      </Box>
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

function SectionHead({ icon, title, badge, tone }: { icon: React.ReactNode; title: string; badge: string; tone: string }) {
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
    '敏感資料讀取後外傳',
    '偵察後進行外部變更',
    '正式環境副作用需核准',
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
          詳情
        </Button>
      </Box>
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
