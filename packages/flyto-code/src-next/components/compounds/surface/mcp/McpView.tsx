/**
 * McpView — the Agent Firewall product surface. Tabs over the three planes
 * the guardian backend exposes (flyto-engine PR #209):
 *   • Overview   — registered servers, tool inventory, recent decisions
 *   • Policy     — rollout-mode control plane + simulate-before-enable
 *   • Egress     — sensitive-data egress risk + decision explanations
 * Each tab owns its own fetch + empty state; the shell just routes.
 */
import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { ShieldCheck } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useOrg } from '@hooks/useOrg'
import { TabBar } from '@atoms/TabBar'
import { t, tOr } from '@lib/i18n';
import { getMcpOverview, getMcpPolicy, type MCPOverview, type MCPRolloutMode } from '@lib/engine'
import { qk } from '@lib/queryKeys'
import { LoadingState } from '@atoms/LoadingState'
import { QueryError } from '@atoms/QueryError'
import { McpOverviewView } from '../McpOverviewView'
import { McpPolicyView } from './McpPolicyView'
import { McpEgressView } from './McpEgressView'
import { AgentFirewallFlow3D } from './AgentFirewallFlow3D'
import { AgentFirewallManagerSurface, runtimeModeLabel } from './AgentFirewallManagerSurface'

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

export type AgentFirewallTab = 'overview' | 'policy' | 'egress'

function isBlockingMode(mode: MCPRolloutMode) {
  return mode === 'enforce' || mode === 'soft_enforce'
}

export function McpManagerView() {
  const { org } = useOrg()
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

  if (isLoading) return <LoadingState variant="spinner" py={8} />
  if (isError) return <Box sx={{ p: 3 }}><QueryError error={error} onRetry={refetch} label={t('agentFirewall.title')} compact /></Box>

  const data = rawData ?? EMPTY_OVERVIEW
  const mode = ((policy?.defaultMode as MCPRolloutMode) || 'observe')
  const liveDecisions = data.recentDecisions.filter((d) => d.toolName !== 'connection_probe')
  const blocking = isBlockingMode(mode)
  const modeLabel = runtimeModeLabel(mode)
  const blocked = liveDecisions.filter((d) => ['deny', 'hold', 'approval', 'blocked'].includes(String(d.effective || d.verdict).toLowerCase())).length
  const tokenized = liveDecisions.filter((d) => String(d.effective || d.verdict).toLowerCase().includes('token')).length
  const allowed = liveDecisions.filter((d) => ['allow', 'allowed', 'proceed'].includes(String(d.effective || d.verdict).toLowerCase())).length

  return (
    <AgentFirewallManagerSurface
      title={tOr('agentFirewall.manager.mainTitle', 'Agent Firewall')}
      subtitle={tOr('agentFirewall.manager.mainSubtitle', '代理工具呼叫、政策推行、敏感資料外流與證據決策的執行期控制面。')}
      icon={<ShieldCheck size={24} />}
      status={blocking ? tOr('agentFirewall.manager.statusEnforcing', '執法中') : tOr('agentFirewall.manager.statusObserve', '觀察 / 推行')}
      surfaceLabel="CONTROL PLANE"
      railSteps={['接入', '政策', '外流控制', '證據']}
      variant="control"
      decision={data.configured
        ? blocking
          ? tOr('agentFirewall.manager.mainDecisionEnforce', 'Agent Firewall 已可主動暫停或阻擋高風險代理動作。')
          : tOr('agentFirewall.manager.mainDecisionObserve', '執行期已連線，正式阻擋前先用政策模擬驗證。')
        : tOr('agentFirewall.manager.mainDecisionConnect', '先接上 Agent Firewall 匯入路徑，再宣稱具備執行期防護。')}
      decisionDetail={tOr('agentFirewall.manager.mainDecisionDetail', '工程模式保留概覽、政策、外流細節；管理模式直接回答防護是真實、模擬中，還是仍待接入。')}
      metrics={[
        { label: tOr('agentFirewall.manager.metric.liveEvents', '即時事件'), value: liveDecisions.length, tone: liveDecisions.length > 0 ? 'good' : 'info' },
        { label: tOr('agentFirewall.manager.metric.policyMode', '政策模式'), value: modeLabel, tone: blocking ? 'good' : 'info' },
        { label: tOr('agentFirewall.manager.metric.servers', '伺服器'), value: data.servers.length, tone: data.servers.length > 0 ? 'good' : 'info' },
        { label: tOr('agentFirewall.manager.metric.tools', '工具'), value: data.toolTotal, tone: data.toolTotal > 0 ? 'info' : 'neutral' },
      ]}
      primaryTitle={tOr('agentFirewall.manager.primary.runtimeLoop', '執行期控制迴路')}
      primaryItems={[
        { title: tOr('agentFirewall.manager.item.ingest', '匯入與身分'), detail: data.configured ? '此組織已設定 Agent Firewall endpoint。' : '建立匯入金鑰，並導入 MCP、瀏覽器或 endpoint 流量。', tone: data.configured ? 'good' : 'info' },
        { title: tOr('agentFirewall.manager.item.policy', '政策決策'), detail: blocking ? '高風險動作可被暫停或拒絕。' : '目前只觀察或影子記錄決策，尚未阻擋。', tone: blocking ? 'good' : 'info', status: modeLabel },
        { title: tOr('agentFirewall.manager.item.egress', 'AI 資料外流'), detail: '敏感 prompt 與 payload 類別可進入阻擋、遮罩或 token 化策略。', tone: liveDecisions.length > 0 ? 'good' : 'info' },
      ]}
      secondaryTitle={tOr('agentFirewall.manager.secondary.flow3d', '即時控制路徑')}
      secondaryItems={[
        { title: tOr('agentFirewall.manager.item.blockedHeld', '阻擋 / 暫停'), detail: '未經政策核准不應繼續執行的動作。', value: blocked, tone: blocked > 0 ? 'bad' : 'neutral' },
        { title: tOr('agentFirewall.manager.item.tokenized', '已 token 化'), detail: '敏感資料在抵達 AI 工具前已轉換。', value: tokenized, tone: tokenized > 0 ? 'good' : 'neutral' },
        { title: tOr('agentFirewall.manager.item.allowed', '已允許'), detail: '通過政策的已知安全決策。', value: allowed, tone: allowed > 0 ? 'good' : 'neutral' },
      ]}
      footer={(
        <Box sx={{ height: { xs: 210, lg: 250 }, minHeight: 0, overflow: 'hidden', borderRadius: 2 }}>
          <AgentFirewallFlow3D live={liveDecisions.length > 0} blocked={blocked} tokenized={tokenized} allowed={allowed} />
        </Box>
      )}
    />
  )
}

export function McpView({ initialTab = 'overview' }: { initialTab?: AgentFirewallTab }) {
  const { org } = useOrg()
  const [tab, setTab] = useState<AgentFirewallTab>(initialTab)

  useEffect(() => {
    setTab(initialTab)
  }, [initialTab])

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Box sx={{ px: 3, pt: 2.5, pb: 0, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <ShieldCheck size={22} style={{ color: BRAND }} />
        <Typography variant="h5" fontWeight={800}>{t('agentFirewall.title')}</Typography>
      </Box>
      <Box sx={{ px: 3 }}>
        <TabBar
          accentColor={BRAND}
          value={tab}
          onChange={(v) => setTab(v as AgentFirewallTab)}
          items={[
            { value: 'overview', label: t('agentFirewall.tabOverview') },
            { value: 'policy', label: t('agentFirewall.tabPolicy') },
            { value: 'egress', label: t('agentFirewall.tabEgress') },
          ]}
        />
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {tab === 'overview' && <McpOverviewView />}
        {tab === 'policy' && org?.id && <McpPolicyView orgId={org.id} />}
        {tab === 'egress' && org?.id && <McpEgressView orgId={org.id} />}
      </Box>
    </Box>
  )
}
