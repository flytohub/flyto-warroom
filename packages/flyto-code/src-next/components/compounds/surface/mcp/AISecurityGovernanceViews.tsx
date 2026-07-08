import Box from '@mui/material/Box'
import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Table from '@mui/material/Table'
import TableHead from '@mui/material/TableHead'
import TableBody from '@mui/material/TableBody'
import TableRow from '@mui/material/TableRow'
import TableCell from '@mui/material/TableCell'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import { alpha } from '@mui/material/styles'
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileSearch,
  Fingerprint,
  LockKeyhole,
  MonitorSmartphone,
  RadioTower,
  ShieldAlert,
  ShieldCheck,
  Download,
  Workflow,
  BarChart3,
  ClipboardCheck,
  Scale,
  Clock3,
  Pencil,
  Plus,
  Save,
  X,
} from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCapabilities } from '@hooks/useCapabilities'
import { useProjectCapabilities } from '@hooks/useProjectCapabilities'
import { useOrg } from '@hooks/useOrg'
import {
  createAIGovernanceUseCase,
  getMcpEvidenceReport,
  getMcpOverview,
  getMcpPolicy,
  getAIGovernanceScore,
  approveAIGovernanceUseCase,
  listAIGovernanceEvents,
  listAIGovernanceUseCases,
  mcpEvidenceReportUrl,
  rejectAIGovernanceUseCase,
  requestAIGovernanceUseCaseApproval,
  updateAIGovernanceUseCase,
  type AIGovernanceEvent,
  type AIGovernanceScoreDimension,
  type AIGovernanceUseCase,
  type AIGovernanceUseCaseInput,
  type MCPEvidenceReport,
  type MCPDecisionRow,
  type MCPOverview,
  type MCPRolloutMode,
} from '@lib/engine'
import { qk } from '@lib/queryKeys'
import { t, tOr } from '@lib/i18n';
import { FlytoCodeBlock } from '@atoms/FlytoCodeBlock'
import { FlytoSurface } from '@atoms/FlytoSurface'
import { FlytoMetricGrid } from '@atoms/FlytoMetric'
import { TabBar, type TabItem } from '@atoms/TabBar'
import { LoadingState } from '@atoms/LoadingState'
import { QueryError } from '@atoms/QueryError'
import { SEVERITY_TONE } from '@lib/tokens/severity'
import { colors } from '@/styles/designTokens'
import { flytoTextStyles } from '@/styles/visualSystem'
import { AgentFirewallManagerSurface, runtimeModeLabel } from './AgentFirewallManagerSurface'

const BRAND = colors.brandDeep
const STATUS_GOOD = colors.semantic.success
const STATUS_WARN = colors.semantic.warning
const STATUS_BAD = colors.semantic.danger
const STATUS_INFO = colors.semantic.info
const STATUS_NEUTRAL = colors.semantic.neutral
const CODE_TEXT = 'rgb(229, 231, 235)'

const EMPTY_OVERVIEW: MCPOverview = {
  configured: false,
  servers: [],
  serverStatusCounts: {},
  toolTotal: 0,
  unclassifiedTools: 0,
  recentDecisions: [],
  decisionCounts: {},
}

const RISK_TONE: Record<string, string> = {
  critical: SEVERITY_TONE.critical.tone,
  high: SEVERITY_TONE.high.tone,
  medium: SEVERITY_TONE.medium.tone,
  low: SEVERITY_TONE.low.tone,
}

function useAgentSecurityData() {
  const { org } = useOrg()
  const overview = useQuery({
    queryKey: qk.mcp.overview(org?.id),
    queryFn: () => getMcpOverview(org!.id),
    enabled: !!org?.id,
    staleTime: 60_000,
  })
  const policy = useQuery({
    queryKey: qk.mcp.policy(org?.id),
    queryFn: () => getMcpPolicy(org!.id),
    enabled: !!org?.id,
    staleTime: 60_000,
  })
  return { orgId: org?.id, overview, policy, data: overview.data ?? EMPTY_OVERVIEW, mode: ((policy.data?.defaultMode as MCPRolloutMode) || 'observe') }
}

function useAIGovernanceUseCases(orgId?: string) {
  return useQuery({
    queryKey: qk.mcp.aiGovernanceUseCases(orgId),
    queryFn: () => listAIGovernanceUseCases(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })
}

function useAIGovernanceScore(orgId?: string) {
  return useQuery({
    queryKey: qk.mcp.aiGovernanceScore(orgId),
    queryFn: () => getAIGovernanceScore(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })
}

function useAIGovernanceEvents(orgId?: string) {
  return useQuery({
    queryKey: qk.mcp.aiGovernanceEvents(orgId),
    queryFn: () => listAIGovernanceEvents(orgId!),
    enabled: !!orgId,
    staleTime: 30_000,
  })
}

interface GovernanceUseCaseRow {
  name: string
  department: string
  model: string
  owner: string
  risk: string
  status: string
  evidence: string
  next: string
}

function governanceRowFromUseCase(row: AIGovernanceUseCase): GovernanceUseCaseRow {
  const owner = row.businessOwner || row.technicalOwner || 'unassigned'
  const model = [row.modelProvider, row.modelName || row.appName].filter(Boolean).join(' / ') || 'unmapped model'
  const evidence = [
    row.policyMode ? `policy=${row.policyMode}` : '',
    row.approvalStatus ? `approval=${row.approvalStatus}` : '',
    row.frameworks?.length ? row.frameworks.join(', ') : '',
  ].filter(Boolean).join(' | ') || 'registry metadata'
  const next = row.approvalStatus === 'approved'
    ? 'review expiry and runtime evidence'
    : row.approvalStatus === 'pending'
      ? 'review and approve or reject'
      : 'request approval and attach evidence'
  return {
    name: row.name,
    department: row.department || 'Unassigned',
    model,
    owner,
    risk: row.riskLevel || 'medium',
    status: row.status || row.approvalStatus || 'draft',
    evidence,
    next,
  }
}

function Shell({
  title,
  desc,
  icon,
  tabs,
  tab,
  onTabChange,
  children,
}: {
  title: string
  desc: string
  icon: ReactNode
  tabs: TabItem[]
  tab: string
  onTabChange: (value: string) => void
  children: ReactNode
}) {
  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: (theme) => theme.palette.mode === 'dark'
          ? `radial-gradient(circle at 12% 0%, ${alpha(colors.section.exposure, 0.12)}, transparent 30%), linear-gradient(180deg, ${alpha('#020617', 0.94)}, ${alpha('#111827', 0.88)})`
          : `radial-gradient(circle at 12% 0%, ${alpha(colors.section.exposure, 0.12)}, transparent 30%), linear-gradient(180deg, ${alpha('#f8fafc', 0.98)}, ${alpha('#eef2ff', 0.34)})`,
      }}
    >
      <Box sx={{ px: { xs: 2, sm: 3 }, pt: { xs: 2, sm: 3 }, pb: 1.5, flexShrink: 0 }}>
        <Paper
          variant="outlined"
          sx={{
            borderRadius: 2,
            borderColor: alpha(colors.section.exposure, 0.24),
            bgcolor: (theme) => alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.68 : 0.9),
            backgroundImage: `linear-gradient(120deg, ${alpha(colors.section.exposure, 0.12)}, transparent 42%), linear-gradient(90deg, ${alpha(BRAND, 0.08)}, transparent 72%)`,
            boxShadow: (theme) => theme.palette.mode === 'dark'
              ? `0 18px 46px ${alpha('#000', 0.28)}`
              : `0 18px 46px ${alpha('#334155', 0.11)}`,
            p: { xs: 1.5, sm: 2 },
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
          }}
        >
          <Box sx={{ width: 42, height: 42, borderRadius: 1.5, display: 'grid', placeItems: 'center', bgcolor: alpha(colors.section.exposure, 0.12), color: colors.section.exposure, flexShrink: 0, boxShadow: `inset 0 0 0 1px ${alpha(colors.section.exposure, 0.32)}` }}>
            {icon}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography component="h1" sx={{ fontSize: { xs: 23, md: 27 }, fontWeight: 900, lineHeight: 1.05, letterSpacing: 0 }}>
                {title}
              </Typography>
              <Chip size="small" label={tOr('experience.engineer', 'Engineer')} sx={{ height: 23, fontSize: 12, fontWeight: 850, color: colors.section.exposure, bgcolor: alpha(colors.section.exposure, 0.11) }} />
            </Box>
            <Typography sx={{ mt: 0.5, color: 'text.secondary', fontSize: 13, lineHeight: 1.55, maxWidth: 920 }}>
              {desc}
            </Typography>
          </Box>
        </Paper>
      </Box>

      <Box sx={{ px: { xs: 2, sm: 3 }, pb: 1, flexShrink: 0 }}>
        <FlytoSurface density="compact" bodySx={{ p: 0 }} sx={{ overflow: 'hidden' }}>
          <TabBar
            accentColor={BRAND}
            noDivider
            value={tab}
            onChange={onTabChange}
            items={tabs}
            sx={{
              minHeight: 46,
              px: 0.75,
              '& .MuiTabs-indicator': { height: 3, borderRadius: 999 },
              '& .MuiTab-root': {
                minHeight: 46,
                px: 1.5,
                fontSize: 12,
                fontWeight: 850,
              },
            }}
          />
        </FlytoSurface>
      </Box>

      <Box sx={{ px: { xs: 2, sm: 3 }, pb: { xs: 2, sm: 3 }, flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Box sx={{ height: '100%', minHeight: 0, overflowY: 'auto', overflowX: 'hidden', pr: 0.5, display: 'flex', flexDirection: 'column', gap: 2.5, '& > *': { flexShrink: 0 } }}>
          {children}
        </Box>
      </Box>
    </Box>
  )
}

function LoadingOrError({ overview }: { overview: ReturnType<typeof useAgentSecurityData>['overview'] }) {
  if (overview.isLoading) return <LoadingState variant="spinner" py={8} />
  if (overview.error) return <Box sx={{ p: 3 }}><QueryError error={overview.error} onRetry={overview.refetch} label={t('agentFirewall.label')} compact /></Box>
  return null
}

function liveAgentDecisions(data: MCPOverview) {
  return data.recentDecisions.filter((d) => d.toolName !== 'connection_probe')
}

function isBlockingRuntimeMode(mode: string) {
  return mode === 'enforce' || mode === 'soft_enforce'
}

export function AISecurityCenterManagerView() {
  const { orgId, overview, data, mode } = useAgentSecurityData()
  const evidence = useQuery({
    queryKey: qk.mcp.evidence(orgId),
    queryFn: () => getMcpEvidenceReport(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })
  const registry = useAIGovernanceUseCases(orgId)
  if (overview.isLoading || overview.error) return <LoadingOrError overview={overview} />

  const live = liveAgentDecisions(data)
  const summary = evidence.data?.summary
  const blockedOrHeld = summary?.blockedOrHeld ?? live.filter((d) => ['deny', 'hold', 'approval', 'blocked'].includes(String(d.effective || d.verdict).toLowerCase())).length
  const telemetryReady = data.configured || live.length > 0 || (summary?.totalEvents ?? 0) > 0
  const blocking = isBlockingRuntimeMode(mode)
  const modeLabel = runtimeModeLabel(mode)
  const eventCount = summary?.totalEvents ?? live.length
  const useCaseCount = registry.data?.length ?? 0

  return (
    <AgentFirewallManagerSurface
      title="AI 安全中心"
      subtitle="統一檢視 Agent Firewall 執行期遙測、AI 使用案例、政策模式與可交付證據。"
      icon={<RadioTower size={24} />}
      status={blocking ? '正式攔截' : telemetryReady ? '觀察中' : '待接入'}
      surfaceLabel="AI SECURITY"
      railSteps={['遙測', '政策姿態', 'AI 名冊', '稽核報告']}
      variant="security"
      decision={
        telemetryReady
          ? blocking
            ? 'Agent Firewall 已可對高風險代理動作執行攔截或暫停。'
            : '目前已有遙測，建議先以觀察模式確認政策命中，再推進攔截。'
          : '尚未接入執行期遙測，不能宣稱具備 AI Agent 防護。'
      }
      decisionDetail="管理頁只回答三件事：有沒有遙測、政策是否能執行、證據能不能交付給 SOC / GRC。工程細節留在 engineer 模式。"
      metrics={[
        { label: '執行期事件', value: eventCount, tone: telemetryReady ? 'good' : 'info', helper: telemetryReady ? '已接入遙測' : '尚未看到事件' },
        { label: '政策模式', value: modeLabel, tone: blocking ? 'good' : 'info', helper: blocking ? '可攔截' : '觀察 / 漸進推行' },
        { label: '阻擋 / 暫停', value: blockedOrHeld, tone: blockedOrHeld > 0 ? 'bad' : 'neutral', helper: '需管理追蹤的決策' },
        { label: 'AI 使用案例', value: useCaseCount, tone: useCaseCount > 0 ? 'good' : 'info', helper: useCaseCount > 0 ? '已建立名冊' : '待盤點' },
      ]}
      primaryTitle="控制面就緒度"
      primaryItems={[
        {
          title: '遙測接入',
          detail: telemetryReady
            ? 'Agent Firewall endpoint、MCP proxy 或瀏覽器事件已進入後端。'
            : '先建立匯入金鑰並導入 MCP、瀏覽器或 endpoint 流量。',
          tone: telemetryReady ? 'good' : 'info',
          value: eventCount,
        },
        {
          title: '政策決策',
          detail: blocking
            ? '高風險工具呼叫可被暫停、拒絕或要求核准。'
            : '目前仍以觀察或影子決策為主，正式攔截前需要完成驗證。',
          tone: blocking ? 'good' : 'info',
          status: modeLabel,
        },
        {
          title: '證據輸出',
          detail: evidence.data
            ? '已可產生 digest-safe 證據摘要，不暴露原始 prompt。'
            : '等待更多事件後產生可稽核證據，避免只剩文字描述。',
          tone: evidence.data ? 'good' : 'warn',
        },
        {
          title: '資料最小化',
          detail: '確認 prompt、檔案與回應只保留必要摘要，原文與敏感欄位不得進入管理報告。',
          tone: 'neutral',
          status: '待驗證',
        },
        {
          title: '緊急旁路',
          detail: '正式攔截前要定義 break-glass 責任人、時限與事後審查，避免阻斷業務流程。',
          tone: 'neutral',
          status: '待設定',
        },
      ]}
      secondaryTitle="管理決策流程"
      secondaryItems={[
        {
          title: '盤點 AI 使用',
          detail: '先確認 Shadow AI、Coding Agent、瀏覽器 AI 與 MCP 工具的真實使用範圍。',
          tone: useCaseCount > 0 ? 'good' : 'info',
          value: useCaseCount,
        },
        {
          title: '推進政策模式',
          detail: '從 observe 到 soft enforce，再到 enforce；每一步都要有事件與核准證據支撐。',
          tone: blocking ? 'good' : 'info',
          status: modeLabel,
        },
        {
          title: '交付可稽核報告',
          detail: '證據需能回答誰、用什麼工具、送出什麼類型資料、政策做了什麼決策。',
          tone: evidence.data ? 'good' : 'neutral',
        },
        {
          title: '指定責任人',
          detail: '每個 AI 使用案例都要有業務 owner 與技術 owner，否則只能停在觀察名單。',
          tone: useCaseCount > 0 ? 'good' : 'neutral',
          status: 'RACI',
        },
        {
          title: '設定稽核節奏',
          detail: '每週看阻擋與暫停、每月看例外與政策漂移，季度輸出董事會摘要。',
          tone: 'neutral',
          status: '週 / 月 / 季',
        },
      ]}
    />
  )

  return (
    <AgentFirewallManagerSurface
      title={tOr('agentFirewall.manager.centerTitle', 'AI 安全中心')}
      subtitle={tOr('agentFirewall.manager.centerSubtitle', '集中查看 AI 執行期曝險、政策模式、證據準備度與部署進度。')}
      icon={<RadioTower size={24} />}
      status={blocking ? tOr('agentFirewall.manager.statusEnforcing', '執法中') : tOr('agentFirewall.manager.statusObserve', '觀察 / 推行')}
      surfaceLabel="AI SECURITY"
      railSteps={['遙測', '政策姿態', 'AI 名冊', '稽核報告']}
      variant="security"
      decision={telemetryReady
        ? blocking
          ? tOr('agentFirewall.manager.centerDecisionEnforce', '執行期控制已可交付主管檢視。')
          : tOr('agentFirewall.manager.centerDecisionRollout', '已有遙測，下一步是從觀察推進到可控執法。')
        : tOr('agentFirewall.manager.centerDecisionConnect', '先接上遙測，再宣稱具備 AI 執行期控制。')}
      decisionDetail={tOr('agentFirewall.manager.centerDecisionDetail', '此視圖把業務可決策狀態，和工程才需要看的政策與傳輸細節分開。')}
      metrics={[
        { label: tOr('agentFirewall.manager.metric.liveEvents', '即時事件'), value: summary?.totalEvents ?? live.length, tone: telemetryReady ? 'good' : 'warn', helper: data.configured ? '已設定匯入' : '需要流量' },
        { label: tOr('agentFirewall.manager.metric.policyMode', '政策模式'), value: modeLabel, tone: blocking ? 'good' : 'warn' },
        { label: tOr('agentFirewall.manager.metric.blockedHeld', '阻擋 / 暫停'), value: blockedOrHeld, tone: blockedOrHeld > 0 ? 'bad' : 'neutral' },
        { label: tOr('agentFirewall.manager.metric.useCases', '使用案例'), value: registry.data?.length ?? 0, tone: (registry.data?.length ?? 0) > 0 ? 'good' : 'warn' },
      ]}
      primaryTitle={tOr('agentFirewall.manager.primary.controls', '控制準備度')}
      primaryItems={[
        { title: tOr('agentFirewall.manager.item.telemetry', '遙測匯入'), detail: telemetryReady ? tOr('agentFirewall.manager.item.telemetryReady', '代理、瀏覽器、endpoint 或 MCP 流量已可支援決策。') : tOr('agentFirewall.manager.item.telemetryGap', '目前只看得到設計狀態，需接入真實執行期事件。'), tone: telemetryReady ? 'good' : 'warn', value: summary?.totalEvents ?? live.length },
        { title: tOr('agentFirewall.manager.item.policy', '政策執法'), detail: blocking ? tOr('agentFirewall.manager.item.policyOn', '政策可暫停或阻擋高風險動作。') : tOr('agentFirewall.manager.item.policyObserve', '目前推行模式尚未真正阻擋。'), tone: blocking ? 'good' : 'warn', status: modeLabel },
        { title: tOr('agentFirewall.manager.item.evidence', '證據狀態'), detail: evidence.data ? tOr('agentFirewall.manager.item.evidenceReady', '可供稽核的 digest-safe 報告已就緒。') : tOr('agentFirewall.manager.item.evidenceWait', '需要執行期證據，報告才有管理意義。'), tone: evidence.data ? 'good' : 'warn' },
      ]}
      secondaryTitle={tOr('agentFirewall.manager.secondary.executiveLoop', '管理迴路')}
      secondaryItems={[
        { title: tOr('agentFirewall.manager.item.discover', '盤點 AI 使用'), detail: 'Shadow AI、核准案例、使用者、裝置與應用分類。', tone: telemetryReady ? 'good' : 'warn' },
        { title: tOr('agentFirewall.manager.item.decide', '決定政策姿態'), detail: '依業務風險選擇觀察、影子、軟執法或正式執法。', tone: blocking ? 'good' : 'info' },
        { title: tOr('agentFirewall.manager.item.report', '回報稽核'), detail: '匯出政策結果、DLP 轉換與證據列，不保存原始 prompt。', tone: evidence.data ? 'good' : 'neutral' },
      ]}
    />
  )
}

export function AIGovernanceManagerView() {
  const { orgId, overview, data, mode } = useAgentSecurityData()
  const registry = useAIGovernanceUseCases(orgId)
  const scorecard = useAIGovernanceScore(orgId)
  const lifecycle = useAIGovernanceEvents(orgId)
  if (overview.isLoading || overview.error) return <LoadingOrError overview={overview} />

  const dimensions = scorecard.data?.dimensions ?? []
  const score = scorecard.data?.overall ?? 0
  const grade = scorecard.data?.grade ?? 'N/A'
  const openRuntimeGaps = numberSummary(scorecard.data?.summary?.openRuntimeGaps, data.configured ? 0 : 1)
  const approvalBacklog = (registry.data ?? []).filter((row) => row.approvalStatus !== 'approved').length
  const modeLabel = runtimeModeLabel(mode)

  return (
    <AgentFirewallManagerSurface
      title={tOr('agentFirewall.manager.governanceTitle', 'AI 治理')}
      subtitle={tOr('agentFirewall.manager.governanceSubtitle', '面向管理層的 AI 使用案例、責任歸屬、模型風險、核准與政策證據。')}
      icon={<ClipboardCheck size={24} />}
      status={`${tOr('agentFirewall.grade', '等級')} ${grade}`}
      surfaceLabel="AI GOVERNANCE"
      railSteps={['清冊', 'Owner', '核准', '框架']}
      variant="governance"
      decision={score >= 75
        ? tOr('agentFirewall.manager.governanceDecisionGood', '治理可信度足以擴大受監控的 AI 使用案例。')
        : tOr('agentFirewall.manager.governanceDecisionGap', '擴大前仍需要責任歸屬、核准或執行期證據。')}
      decisionDetail={tOr('agentFirewall.manager.governanceDecisionDetail', '管理模式顯示哪些缺口阻礙 AI 風險結論；工程模式保留可編輯清冊與證據細節。')}
      metrics={[
        { label: tOr('agentFirewall.manager.metric.readiness', '準備度'), value: `${score}%`, tone: score >= 75 ? 'good' : score >= 45 ? 'warn' : 'bad', helper: `${dimensions.length} 個維度` },
        { label: tOr('agentFirewall.manager.metric.useCases', '使用案例'), value: registry.data?.length ?? 0, tone: (registry.data?.length ?? 0) > 0 ? 'good' : 'warn' },
        { label: tOr('agentFirewall.manager.metric.approvals', '待核准'), value: approvalBacklog, tone: approvalBacklog > 0 ? 'warn' : 'good' },
        { label: tOr('agentFirewall.manager.metric.lifecycle', '生命週期事件'), value: lifecycle.data?.length ?? 0, tone: (lifecycle.data?.length ?? 0) > 0 ? 'good' : 'neutral' },
      ]}
      primaryTitle={tOr('agentFirewall.manager.primary.governanceGaps', '治理缺口')}
      primaryItems={[
        { title: tOr('agentFirewall.manager.item.modelInventory', '模型清冊'), detail: registry.data?.length ? tOr('agentFirewall.manager.item.modelInventoryReady', '已登錄的 AI 使用案例具備負責人與模型欄位。') : tOr('agentFirewall.manager.item.modelInventoryGap', '尚無已核准的 AI 使用案例清冊。'), tone: registry.data?.length ? 'good' : 'warn', value: registry.data?.length ?? 0 },
        { title: tOr('agentFirewall.manager.item.runtimeGap', '執行期證據'), detail: data.configured ? tOr('agentFirewall.manager.item.runtimeReady', 'Agent Firewall 可附加使用證據。') : tOr('agentFirewall.manager.item.runtimeGapDesc', '在流量導入前，治理仍只是政策文件。'), tone: data.configured ? 'good' : 'warn', value: openRuntimeGaps },
        { title: tOr('agentFirewall.manager.item.rolloutMode', '推行模式'), detail: tOr('agentFirewall.manager.item.rolloutModeDesc', '執法模式決定治理是否能真正阻擋高風險使用。'), tone: isBlockingRuntimeMode(mode) ? 'good' : 'info', status: modeLabel },
      ]}
      secondaryTitle={tOr('agentFirewall.manager.secondary.frameworks', '框架覆蓋')}
      secondaryItems={[
        { title: 'NIST AI RMF', detail: '以執行期證據支撐盤點、衡量、管理與治理。', tone: score >= 60 ? 'good' : 'warn' },
        { title: 'ISO 42001', detail: '責任歸屬、用途、控制、證據與生命週期審查。', tone: registry.data?.length ? 'good' : 'warn' },
        { title: '內部稽核', detail: '使用證據匯出與核准軌跡，不再靠截圖交差。', tone: lifecycle.data?.length ? 'good' : 'neutral' },
      ]}
    />
  )
}

export function ShadowAIManagerView() {
  const { overview, data, mode } = useAgentSecurityData()
  if (overview.isLoading || overview.error) return <LoadingOrError overview={overview} />

  const live = liveAgentDecisions(data)
  const highRiskApps = 4
  const blocking = isBlockingRuntimeMode(mode)
  const modeLabel = runtimeModeLabel(mode)

  return (
    <AgentFirewallManagerSurface
      title={tOr('agentFirewall.manager.shadowTitle', 'Shadow AI 曝險')}
      subtitle={tOr('agentFirewall.manager.shadowSubtitle', '依業務風險排序未核准 AI 目的地、Coding Agent、瀏覽器 AI 與私有 LLM 使用。')}
      icon={<MonitorSmartphone size={24} />}
      status={blocking ? tOr('agentFirewall.manager.statusBlockable', '可阻擋') : tOr('agentFirewall.manager.statusPolicyGap', '政策缺口')}
      surfaceLabel="SHADOW AI"
      railSteps={['探索', '分類', '核准', '封鎖']}
      variant="shadow"
      decision={live.length > 0
        ? tOr('agentFirewall.manager.shadowDecisionLive', 'Shadow AI 已可用觀測到的執行期證據治理。')
        : tOr('agentFirewall.manager.shadowDecisionDeploy', '先部署瀏覽器或 endpoint 遙測，再宣稱已覆蓋探索。')}
      decisionDetail={tOr('agentFirewall.manager.shadowDecisionDetail', '工程模式保留清冊與政策分頁；管理模式直接呈現曝險答案。')}
      metrics={[
        { label: tOr('agentFirewall.manager.metric.aiApps', 'AI 類別'), value: 6, tone: 'info' },
        { label: tOr('agentFirewall.manager.metric.highRisk', '高風險'), value: highRiskApps, tone: 'bad' },
        { label: tOr('agentFirewall.manager.metric.liveEvents', '即時事件'), value: live.length, tone: live.length > 0 ? 'good' : 'warn' },
        { label: tOr('agentFirewall.manager.metric.policyMode', '政策模式'), value: modeLabel, tone: blocking ? 'good' : 'warn' },
      ]}
      primaryTitle={tOr('agentFirewall.manager.primary.shadowPriority', 'Shadow AI 優先順序')}
      primaryItems={[
        { title: t('agentFirewall.shadowApp.deepseek'), detail: '未核准外部模型使用應阻擋或走例外核准。', tone: blocking ? 'good' : 'bad', status: blocking ? '政策已阻擋' : '政策缺口' },
        { title: t('agentFirewall.shadowApp.codingAgents'), detail: 'IDE 與 Coding Agent 需要讓工具呼叫通過 Agent Firewall。', tone: live.length > 0 ? 'good' : 'warn' },
        { title: t('agentFirewall.shadowApp.perplexityBrowser'), detail: '瀏覽器 AI 需要部署 connector 才能取得使用者側遙測。', tone: 'warn' },
      ]}
      secondaryTitle={tOr('agentFirewall.manager.secondary.shadowControls', '控制計畫')}
      secondaryItems={[
        { title: tOr('agentFirewall.manager.item.deployConnector', '部署 connector'), detail: '瀏覽器、endpoint 與 MCP proxy 覆蓋是探索層。', tone: data.configured ? 'good' : 'warn' },
        { title: tOr('agentFirewall.manager.item.requireOwner', '要求負責人'), detail: '沒有 owner 就不應視為已核准 AI 使用案例。', tone: 'info' },
        { title: tOr('agentFirewall.manager.item.routeRisk', '導入高風險動作'), detail: '原始碼、機密、客戶資料與正式環境操作必須導入。', tone: live.length > 0 ? 'good' : 'warn' },
      ]}
    />
  )
}

export function AIDLPManagerView() {
  const { orgId, overview, data } = useAgentSecurityData()
  const evidence = useQuery({
    queryKey: qk.mcp.evidence(orgId),
    queryFn: () => getMcpEvidenceReport(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })
  if (overview.isLoading || overview.error) return <LoadingOrError overview={overview} />

  const summary = evidence.data?.summary
  const tokenizationEligible = summary?.tokenizationEligible ?? 0
  const sensitiveOutbound = summary?.outboundSensitive ?? 0

  return (
    <AgentFirewallManagerSurface
      title={tOr('agentFirewall.manager.dlpTitle', 'AI DLP')}
      subtitle={tOr('agentFirewall.manager.dlpSubtitle', '保護 prompt、檔案、原始碼、截圖與送往 AI 的 payload，不保存原始敏感內容。')}
      icon={<Database size={24} />}
      status={tokenizationEligible > 0 ? tOr('agentFirewall.manager.statusEvidenceBacked', '證據支撐') : tOr('agentFirewall.manager.statusReady', '等待流量')}
      surfaceLabel="AI DLP"
      railSteps={['偵測', '遮罩', 'Token 化', '證據']}
      variant="dlp"
      decision={sensitiveOutbound > 0
        ? tOr('agentFirewall.manager.dlpDecisionSensitive', '敏感 AI 外流需要阻擋、遮罩或 token 化政策審查。')
        : tOr('agentFirewall.manager.dlpDecisionReady', 'DLP 控制已就緒，待執行期流量驗證覆蓋。')}
      decisionDetail={tOr('agentFirewall.manager.dlpDecisionDetail', '管理模式說明覆蓋與風險；工程模式保留控制矩陣與轉換細節。')}
      metrics={[
        { label: tOr('agentFirewall.manager.metric.protectedDecisions', '受保護決策'), value: data.recentDecisions.length, tone: data.recentDecisions.length > 0 ? 'good' : 'warn' },
        { label: tOr('agentFirewall.manager.metric.tokenEligible', '可 token 化'), value: tokenizationEligible, tone: tokenizationEligible > 0 ? 'good' : 'neutral' },
        { label: tOr('agentFirewall.manager.metric.sensitiveOutbound', '敏感外流'), value: sensitiveOutbound, tone: sensitiveOutbound > 0 ? 'bad' : 'good' },
        { label: tOr('agentFirewall.manager.metric.rawStorage', '原文保存'), value: '關閉', tone: 'good' },
      ]}
      primaryTitle={tOr('agentFirewall.manager.primary.dlpControls', 'DLP 控制')}
      primaryItems={[
        { title: 'Prompt / 貼上內容', detail: 'PII、機密與原始碼文字可遮罩或 token 化。', tone: 'good' },
        { title: '檔案上傳', detail: 'PDF、截圖與會議筆記上傳需套用轉換政策。', tone: tokenizationEligible > 0 ? 'good' : 'warn' },
        { title: '程式碼送往 AI', detail: '儲存庫片段與機密應暫停或核准後再送出。', tone: 'bad' },
      ]}
      secondaryTitle={tOr('agentFirewall.manager.secondary.dlpAssurance', '保證機制')}
      secondaryItems={[
        { title: tOr('agentFirewall.manager.item.digestSafe', 'Digest-safe 證據'), detail: '報告保留 hash、類別與轉換 metadata，不保存原始 prompt。', tone: 'good' },
        { title: tOr('agentFirewall.manager.item.transformPolicy', '轉換政策'), detail: '可依資料類別調整阻擋、遮罩、token 化、暫停或核准。', tone: 'info' },
        { title: tOr('agentFirewall.manager.item.coverageGap', '覆蓋缺口'), detail: data.recentDecisions.length ? '已有執行期決策。' : '尚無導入的執行期決策。', tone: data.recentDecisions.length ? 'good' : 'warn' },
      ]}
    />
  )
}

export function EvidenceReportsManagerView() {
  const { orgId, overview, data, mode } = useAgentSecurityData()
  const evidence = useQuery({
    queryKey: qk.mcp.evidence(orgId),
    queryFn: () => getMcpEvidenceReport(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })
  if (overview.isLoading || overview.error) return <LoadingOrError overview={overview} />

  const summary = evidence.data?.summary
  const rows = summary?.totalEvents ?? data.recentDecisions.length
  const modeLabel = runtimeModeLabel(mode)

  return (
    <AgentFirewallManagerSurface
      title={tOr('agentFirewall.manager.evidenceTitle', '證據報告')}
      subtitle={tOr('agentFirewall.manager.evidenceSubtitle', '供稽核使用的執行期執法、敏感外流、使用者/裝置歸因與 AI 攻擊鏈證據。')}
      icon={<FileSearch size={24} />}
      status={evidence.data ? tOr('agentFirewall.manager.statusExportReady', '可匯出') : tOr('agentFirewall.manager.statusWaiting', '等待事件')}
      surfaceLabel="EVIDENCE"
      railSteps={['事件', 'Digest', '歸因', '匯出']}
      variant="evidence"
      decision={rows > 0
        ? tOr('agentFirewall.manager.evidenceDecisionReady', '證據已可用於 SOC、稽核與管理報告。')
        : tOr('agentFirewall.manager.evidenceDecisionWait', '報告需要執行期事件後才有實際意義。')}
      decisionDetail={tOr('agentFirewall.manager.evidenceDecisionDetail', '證據模式強調保證與隱私，不提供原始 payload 瀏覽。')}
      metrics={[
        { label: tOr('agentFirewall.manager.metric.evidenceRows', '證據列'), value: rows, tone: rows > 0 ? 'good' : 'warn' },
        { label: tOr('agentFirewall.manager.metric.policyMode', '政策模式'), value: modeLabel, tone: isBlockingRuntimeMode(mode) ? 'good' : 'warn' },
        { label: tOr('agentFirewall.manager.metric.sensitiveOutbound', '敏感外流'), value: summary?.outboundSensitive ?? 0, tone: (summary?.outboundSensitive ?? 0) > 0 ? 'bad' : 'good' },
        { label: tOr('agentFirewall.manager.metric.rawStorage', '原文保存'), value: '關閉', tone: 'good' },
      ]}
      primaryTitle={tOr('agentFirewall.manager.primary.reportSet', '報告組')}
      primaryItems={[
        { title: '執行期執法報告', detail: '顯示模式、有效決策、暫停/阻擋總量與政策原因。', tone: evidence.data ? 'good' : 'warn', status: modeLabel },
        { title: '敏感外流報告', detail: '彙整外傳敏感類別與 token 化資格。', tone: (summary?.outboundSensitive ?? 0) > 0 ? 'bad' : 'good' },
        { title: '使用者與裝置報告', detail: '在有遙測時將 AI 動作歸因到身分與 endpoint。', tone: summary?.deviceAttributed ? 'good' : 'warn' },
      ]}
      secondaryTitle={tOr('agentFirewall.manager.secondary.reportAssurance', '保證護欄')}
      secondaryItems={[
        { title: tOr('agentFirewall.manager.item.noRawPrompt', '不保存原始 prompt'), detail: '證據使用 digest-safe metadata 與轉換結果。', tone: 'good' },
        { title: tOr('agentFirewall.manager.item.replayable', '可回放鏈'), detail: '可審查 session 行為，不暴露 payload 文字。', tone: rows > 0 ? 'good' : 'neutral' },
        { title: tOr('agentFirewall.manager.item.exportPath', '匯出路徑'), detail: 'CSV 與 JSON 證據可供稽核、SOC 或 GRC 流程使用。', tone: evidence.data ? 'good' : 'warn' },
      ]}
    />
  )
}

export function AISecurityCenterView() {
  const { orgId, overview, data, mode } = useAgentSecurityData()
  const evidence = useQuery({
    queryKey: qk.mcp.evidence(orgId),
    queryFn: () => getMcpEvidenceReport(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })
  const registry = useAIGovernanceUseCases(orgId)
  if (overview.isLoading || overview.error) return <LoadingOrError overview={overview} />

  const summary = evidence.data?.summary
  const liveDecisions = data.recentDecisions.filter((d) => d.toolName !== 'connection_probe')
  const blockedOrHeld = summary?.blockedOrHeld ?? liveDecisions.filter((d) => ['deny', 'hold', 'approval', 'blocked'].includes(String(d.effective || d.verdict).toLowerCase())).length
  const telemetryReady = data.configured || liveDecisions.length > 0 || (summary?.totalEvents ?? 0) > 0
  const registeredUseCases = registry.data ?? []
  const approvedUseCases = registeredUseCases.filter((row) => row.approvalStatus === 'approved').length
  const deploymentProfile = mode === 'enforce' || mode === 'soft_enforce' ? 'enforcing' : mode === 'shadow' ? 'shadow rollout' : 'observe first'
  const capabilityRows = [
    {
      capability: t('agentFirewall.centerShadowCapability'),
      manager: t('agentFirewall.centerShadowManager'),
      engineer: 'browser extension, endpoint relay, appName, appCategory, userId, deviceId',
      status: telemetryReady ? t('agentFirewall.statusTelemetryReady') : t('agentFirewall.statusNeedsConnectorTraffic'),
      owner: 'IT Security',
      risk: 'medium',
    },
    {
      capability: t('agentFirewall.centerAccessCapability'),
      manager: t('agentFirewall.centerAccessManager'),
      engineer: 'policy catalog, app risk tier, targetTrust, permissionScope, rollout mode',
      status: mode === 'enforce' || mode === 'soft_enforce' ? t('agentFirewall.statusBlockable') : t('agentFirewall.statusPolicyReady'),
      owner: 'Security Governance',
      risk: 'high',
    },
    {
      capability: t('agentFirewall.centerDlpCapability'),
      manager: t('agentFirewall.centerDlpManager'),
      engineer: 'contentClass, dataClass, transform=block|mask|tokenize, transformedInputText',
      status: (summary?.tokenizationEligible ?? 0) > 0 ? t('agentFirewall.statusEvidenceBacked') : t('agentFirewall.statusReadyForTraffic'),
      owner: 'Data Protection',
      risk: 'critical',
    },
    {
      capability: t('agentFirewall.centerRuntimeCapability'),
      manager: t('agentFirewall.centerRuntimeManager'),
      engineer: 'toolName, verb, actionType, stateChange, externalSideEffect, sequence memory',
      status: liveDecisions.length > 0 ? t('agentFirewall.statusLiveDecisions') : t('agentFirewall.statusIngestReady'),
      owner: 'Engineering Security',
      risk: 'critical',
    },
    {
      capability: t('agentFirewall.centerEvidenceCapability'),
      manager: t('agentFirewall.centerEvidenceManager'),
      engineer: 'digest-safe JSON/CSV, eventId, projectHash, verdict, effective action, transform metadata',
      status: (summary?.totalEvents ?? 0) > 0 ? t('agentFirewall.statusExportReady') : t('agentFirewall.statusWaitingForEvents'),
      owner: 'SOC / Audit',
      risk: 'medium',
    },
    {
      capability: t('agentFirewall.centerDeploymentCapability'),
      manager: t('agentFirewall.centerDeploymentManager'),
      engineer: 'engineUrl + projectHash + apiKey, OIDC/SAML/LDAP plan, offline bundles, signed installers',
      status: t('agentFirewall.statusPackageReady'),
      owner: 'MIS / Platform',
      risk: 'high',
    },
  ]
  const rolloutRows = [
    [t('agentFirewall.centerPocStep1'), t('agentFirewall.centerPocStep1Desc'), telemetryReady],
    [t('agentFirewall.centerPocStep2'), t('agentFirewall.centerPocStep2Desc'), data.configured],
    [t('agentFirewall.centerPocStep3'), t('agentFirewall.centerPocStep3Desc'), true],
    [t('agentFirewall.centerPocStep4'), t('agentFirewall.centerPocStep4Desc'), mode === 'enforce' || mode === 'soft_enforce'],
  ]
  const integrationRows = [
    ['AD / Entra / Okta', t('agentFirewall.centerIdentityJoin'), telemetryReady ? 'ready to map' : 'needs telemetry'],
    ['DLP / CASB', t('agentFirewall.centerDlpCasbJoin'), 'integration source'],
    ['SIEM / SOAR', t('agentFirewall.centerSiemJoin'), (summary?.totalEvents ?? 0) > 0 ? 'export-ready' : 'waiting for events'],
    ['GitHub Enterprise / GitLab', t('agentFirewall.centerCodeJoin'), 'projectHash ready'],
    ['Private LLM / Azure OpenAI', t('agentFirewall.centerModelJoin'), 'policy-ready'],
    ['Offline update bundle', t('agentFirewall.centerOfflineJoin'), 'enterprise track'],
  ]

  return (
    <Shell
      title={t('agentFirewall.centerTitle')}
      desc={t('agentFirewall.centerDesc')}
      icon={<RadioTower size={23} />}
      tab="center"
      onTabChange={() => {}}
      tabs={[{ value: 'center', label: t('agentFirewall.tabControlCenter') }]}
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1fr) 390px' }, gap: 2.5 }}>
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 1, minWidth: 0, borderColor: alpha(BRAND, 0.25), bgcolor: alpha(BRAND, 0.035) }}>
          <Typography variant="overline" fontWeight={900} sx={{ color: BRAND }}>{t('agentFirewall.centerPositioning')}</Typography>
          <Typography variant="h4" fontWeight={900} sx={{ mt: 0.4, lineHeight: 1.16 }}>
            {t('agentFirewall.centerHeadline')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, lineHeight: 1.65, maxWidth: 920 }}>
            {t('agentFirewall.centerLede')}
          </Typography>
          <Box sx={{ mt: 2 }}>
            <MetricGrid items={[
              [t('agentFirewall.centerLiveEvents'), String(summary?.totalEvents ?? liveDecisions.length), telemetryReady ? STATUS_GOOD : STATUS_WARN],
              [t('agentFirewall.centerRegisteredUseCases'), String(registeredUseCases.length), registeredUseCases.length > 0 ? STATUS_GOOD : STATUS_WARN],
              [t('agentFirewall.centerBlockedHeld'), String(blockedOrHeld), blockedOrHeld > 0 ? STATUS_BAD : STATUS_NEUTRAL],
              [t('agentFirewall.centerApprovedUseCases'), String(approvedUseCases), approvedUseCases > 0 ? STATUS_GOOD : STATUS_NEUTRAL],
              [t('agentFirewall.centerDeploymentMode'), deploymentProfile, mode === 'enforce' ? STATUS_GOOD : STATUS_WARN],
            ]} />
          </Box>
        </Paper>

        <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden', minWidth: 0 }}>
          <Header icon={<MonitorSmartphone size={16} />} title={t('agentFirewall.centerPocTitle')} />
          <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {rolloutRows.map(([title, detail, ready]) => (
              <ClosureCard key={String(title)} title={String(title)} detail={String(detail)} ready={Boolean(ready)} />
            ))}
          </Box>
        </Paper>
      </Box>

      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <Header icon={<ShieldCheck size={16} />} title={t('agentFirewall.centerCapabilities')} />
        <DataTable minWidth={1220}>
          <TableHead>
            <TableRow>
              <TableCell>{t('agentFirewall.colCapability')}</TableCell>
              <TableCell>{t('agentFirewall.colManagerValue')}</TableCell>
              <TableCell>{t('agentFirewall.colEngineerContract')}</TableCell>
              <TableCell>{t('agentFirewall.colOwner')}</TableCell>
              <TableCell>{t('agentFirewall.colRisk')}</TableCell>
              <TableCell>{t('agentFirewall.colStatus')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {capabilityRows.map((row) => (
              <TableRow key={row.capability}>
                <TableCell sx={{ fontWeight: 850 }}>{row.capability}</TableCell>
                <TableCell sx={{ minWidth: 260 }}>{row.manager}</TableCell>
                <TableCell sx={{ ...flytoTextStyles.codeSmall, minWidth: 300 }}>{row.engineer}</TableCell>
                <TableCell>{row.owner}</TableCell>
                <TableCell><Risk risk={row.risk} /></TableCell>
                <TableCell><StatusText value={row.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </DataTable>
      </Paper>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) minmax(0, 1fr)' }, gap: 2.5 }}>
        <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden', minWidth: 0 }}>
          <Header icon={<Workflow size={16} />} title={t('agentFirewall.centerClosedLoopTitle')} />
          <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1 }}>
            {[
              [t('agentFirewall.centerLoopDiscover'), 'Shadow AI, user, device, app, model'],
              [t('agentFirewall.centerLoopClassify'), 'risk tier, data class, permission, target trust'],
              [t('agentFirewall.centerLoopDecide'), 'allow, hold, deny, approval, mask, tokenize'],
              [t('agentFirewall.centerLoopEnforce'), 'endpoint, browser, MCP proxy, API ingest'],
              [t('agentFirewall.centerLoopEvidence'), 'digest, token metadata, policy reason, CSV/JSON'],
              [t('agentFirewall.centerLoopImprove'), 'exceptions, policy gaps, POC to production'],
            ].map(([title, detail]) => (
              <Paper key={String(title)} variant="outlined" sx={{ p: 1.5, borderRadius: 1.5 }}>
                <Typography variant="body2" fontWeight={850}>{title}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, lineHeight: 1.55 }}>{detail}</Typography>
              </Paper>
            ))}
          </Box>
        </Paper>

        <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden', minWidth: 0 }}>
          <Header icon={<Database size={16} />} title={t('agentFirewall.centerIntegrationTitle')} />
          <DataTable minWidth={720}>
            <TableHead>
              <TableRow>
                <TableCell>{t('agentFirewall.colSystem')}</TableCell>
                <TableCell>{t('agentFirewall.colPurpose')}</TableCell>
                <TableCell>{t('agentFirewall.colReadiness')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {integrationRows.map(([system, purpose, readiness]) => (
                <TableRow key={system}>
                  <TableCell sx={{ fontWeight: 850 }}>{system}</TableCell>
                  <TableCell>{purpose}</TableCell>
                  <TableCell><StatusText value={readiness} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </DataTable>
        </Paper>
      </Box>
    </Shell>
  )
}

export function AIGovernanceView() {
  const { orgId, overview, data, mode } = useAgentSecurityData()
  const caps = useCapabilities(orgId)
  const projectCaps = useProjectCapabilities(orgId)
  const evidence = useQuery({
    queryKey: qk.mcp.evidence(orgId),
    queryFn: () => getMcpEvidenceReport(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })
  const registry = useAIGovernanceUseCases(orgId)
  const scorecard = useAIGovernanceScore(orgId)
  const lifecycle = useAIGovernanceEvents(orgId)
  if (overview.isLoading || overview.error) return <LoadingOrError overview={overview} />

  const report = evidence.data
  const summary = report?.summary
  const scoreSummary = scorecard.data?.summary ?? {}
  const liveAgentEvents = data.recentDecisions.filter((d) => d.toolName !== 'connection_probe').length
  const registeredUseCases = registry.data ?? []
  const governanceScore = scorecard.data?.overall ?? 0
  const governanceGrade = scorecard.data?.grade ?? 'N/A'
  const enterpriseScore = scorecard.data?.enterpriseOverall ?? 0
  const enterpriseGrade = scorecard.data?.enterpriseGrade ?? 'N/A'
  const enterpriseReadiness = scorecard.data?.enterpriseReadiness ?? []
  const dimensionCount = scorecard.data?.dimensions.length ?? 0
  const dimensionCountLabel = scorecard.isLoading ? '...' : String(dimensionCount)
  const lifecycleEvents = numberSummary(scoreSummary.lifecycleEvents, lifecycle.data?.length ?? 0)
  const openRuntimeGaps = numberSummary(scoreSummary.openRuntimeGaps, 0)
  const blockedByGovernance = numberSummary(scoreSummary.blockedByGovernance, 0)
  const canManageGovernance = caps.canDoAction('mcp:configure') && projectCaps.canUseAction('mcp:configure')
  const fallbackUseCases = [
    { name: t('agentFirewall.fallbackUseCase.engineeringAgents'), department: 'Engineering', model: 'Claude / local IDE agent', owner: 'Engineering Security', risk: 'high', status: liveAgentEvents > 0 ? 'monitored' : 'waiting for routed traffic', evidence: `${liveAgentEvents} live decisions`, next: 'route proxy and enforce tool policy' },
    { name: t('agentFirewall.fallbackUseCase.publicAi'), department: 'Business', model: 'ChatGPT / Perplexity', owner: 'IT Security', risk: 'medium', status: 'connector package ready', evidence: 'browser telemetry pending', next: 'deploy browser connector' },
    { name: t('agentFirewall.fallbackUseCase.externalModel'), department: 'Unapproved', model: 'DeepSeek / unknown SaaS', owner: 'Security Governance', risk: 'critical', status: mode === 'enforce' ? 'blockable by policy' : 'policy gap', evidence: 'policy catalog', next: 'block or require exception' },
    { name: t('agentFirewall.fallbackUseCase.privateLlm'), department: 'Platform', model: 'private endpoint / Azure OpenAI', owner: 'AI Platform', risk: 'medium', status: data.configured ? 'ingest-ready' : 'needs registration', evidence: `${data.servers.length} servers`, next: 'register app and project hash' },
    { name: t('agentFirewall.fallbackUseCase.aiDlp'), department: 'All departments', model: 'all routed AI', owner: 'Data Protection', risk: 'high', status: 'tokenization-ready', evidence: `${summary?.tokenizationEligible ?? 0} eligible events`, next: 'expand endpoint coverage' },
  ]
  const useCases = registeredUseCases.length > 0 ? registeredUseCases.map(governanceRowFromUseCase) : fallbackUseCases
  const modelCount = registeredUseCases.length > 0
    ? new Set(registeredUseCases.map((row) => `${row.modelProvider}:${row.modelName || row.appName}`).filter((v) => v !== ':')).size
    : 5
  const frameworks = [
    { name: t('agentFirewall.framework.nistAiRmf'), control: 'Map / Measure / Manage / Govern', coverage: data.configured ? 'partial evidence' : 'design-ready', proof: 'inventory, risk tier, policy, monitoring, evidence report' },
    { name: t('agentFirewall.framework.iso42001'), control: 'AI management system', coverage: (summary?.totalEvents ?? 0) > 0 ? 'runtime evidence' : 'control catalog ready', proof: 'owner, purpose, risk, operating control, audit trail' },
    { name: t('agentFirewall.framework.euAiAct'), control: 'risk-based classification', coverage: 'classification-ready', proof: 'use case risk tier and policy outcome history' },
    { name: t('agentFirewall.framework.internalAudit'), control: 'accountability and remediation', coverage: report ? 'export-ready' : 'needs traffic', proof: 'CSV / JSON digest-safe evidence report' },
  ]

  return (
    <Shell
      title={t('agentFirewall.aiGovernanceTitle')}
      desc={t('agentFirewall.aiGovernanceDesc')}
      icon={<ClipboardCheck size={23} />}
      tab="governance"
      onTabChange={() => {}}
      tabs={[{ value: 'governance', label: t('agentFirewall.tabGovernance') }]}
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1.1fr) minmax(360px, 0.9fr)' }, gap: 2.5 }}>
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 1, minWidth: 0, bgcolor: alpha(BRAND, 0.04), borderColor: alpha(BRAND, 0.25) }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h4" fontWeight={900}>{scorecard.isLoading ? '...' : `${governanceScore}%`}</Typography>
              <Typography variant="subtitle2" fontWeight={850}>{t('agentFirewall.governanceReadiness')}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, lineHeight: 1.6 }}>
                {t('agentFirewall.governanceReadinessDesc')}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <StatusText value={`${t('agentFirewall.grade')} ${governanceGrade}`} />
              <StatusText value={`${t('agentFirewall.enterpriseGrade')} ${enterpriseGrade}`} />
              <StatusText value={mode} />
              <StatusText value={data.configured ? 'runtime registered' : 'runtime not registered'} />
              <StatusText value={(summary?.totalEvents ?? 0) > 0 ? 'evidence available' : 'waiting for evidence'} />
            </Box>
          </Box>
          <Box sx={{ mt: 2 }}>
            <MetricGrid items={[
              [t('agentFirewall.aiUseCases'), String(useCases.length), BRAND],
              [t('agentFirewall.modelsTracked'), String(modelCount), STATUS_INFO],
              [t('agentFirewall.policyMode'), mode, mode === 'enforce' ? STATUS_GOOD : STATUS_WARN],
              [t('agentFirewall.scoreDimensions'), dimensionCountLabel, dimensionCount > 0 ? STATUS_GOOD : STATUS_WARN],
              [t('agentFirewall.enterpriseReadinessShort'), scorecard.isLoading ? '...' : `${enterpriseScore}%`, scoreTone(enterpriseScore)],
              [t('agentFirewall.lifecycleEvents'), scorecard.isLoading && lifecycle.isLoading ? '...' : String(lifecycleEvents), lifecycleEvents > 0 ? STATUS_GOOD : STATUS_WARN],
              [t('agentFirewall.runtimeGaps'), String(openRuntimeGaps), openRuntimeGaps > 0 ? STATUS_WARN : STATUS_GOOD],
              [t('agentFirewall.governanceBlocks'), String(blockedByGovernance), blockedByGovernance > 0 ? BRAND : STATUS_NEUTRAL],
            ]} />
          </Box>
        </Paper>

        <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden', minWidth: 0 }}>
          <Header icon={<Scale size={16} />} title={t('agentFirewall.frameworkCoverage')} />
          <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {frameworks.map((fw) => (
              <Paper key={fw.name} variant="outlined" sx={{ p: 1.5, borderRadius: 1.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'center' }}>
                  <Typography variant="body2" fontWeight={850}>{fw.name}</Typography>
                  <StatusText value={fw.coverage} />
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.6 }}>{fw.control}</Typography>
                <Box component="code" sx={{ display: 'block', mt: 0.8, px: 1, py: 0.7, borderRadius: 1, bgcolor: 'grey.900', color: CODE_TEXT, fontSize: 12, lineHeight: 1.45, overflowWrap: 'anywhere' }}>
                  {fw.proof}
                </Box>
              </Paper>
            ))}
          </Box>
        </Paper>
      </Box>

      <EnterpriseReadinessPanel
        loading={scorecard.isLoading}
        error={scorecard.error}
        overall={enterpriseScore}
        grade={enterpriseGrade}
        pillars={enterpriseReadiness}
      />

      <GovernanceDimensionPanel loading={scorecard.isLoading} error={scorecard.error} dimensions={scorecard.data?.dimensions ?? []} />

      <AIGovernanceUseCaseEditor orgId={orgId} rows={registeredUseCases} canManage={canManageGovernance} />

      <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
        <Header icon={<BarChart3 size={16} />} title={t('agentFirewall.aiUseCaseRegister')} />
        <DataTable minWidth={1120}>
          <TableHead>
            <TableRow>
              <TableCell>{t('agentFirewall.colUseCase')}</TableCell>
              <TableCell>{t('agentFirewall.colDepartment')}</TableCell>
              <TableCell>{t('agentFirewall.colModel')}</TableCell>
              <TableCell>{t('agentFirewall.colOwner')}</TableCell>
              <TableCell>{t('agentFirewall.colRisk')}</TableCell>
              <TableCell>{t('agentFirewall.colStatus')}</TableCell>
              <TableCell>{t('agentFirewall.colEvidence')}</TableCell>
              <TableCell>{t('agentFirewall.colNextAction')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {useCases.map((row) => (
              <TableRow key={row.name}>
                <TableCell sx={{ fontWeight: 850 }}>{row.name}</TableCell>
                <TableCell>{row.department}</TableCell>
                <TableCell>{row.model}</TableCell>
                <TableCell>{row.owner}</TableCell>
                <TableCell><Risk risk={row.risk} /></TableCell>
                <TableCell><StatusText value={row.status} /></TableCell>
                <TableCell sx={flytoTextStyles.codeSmall}>{row.evidence}</TableCell>
                <TableCell sx={{ color: 'text.secondary' }}>{row.next}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </DataTable>
      </Paper>

      <GovernanceApprovalPanel orgId={orgId} rows={registeredUseCases} canManage={canManageGovernance} />

      <AIGovernanceTimelinePanel loading={lifecycle.isLoading} error={lifecycle.error} events={lifecycle.data ?? []} rows={registeredUseCases} />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5 }}>
        <ClosureCard title={t('agentFirewall.governanceInventory')} detail={t('agentFirewall.governanceInventoryDesc')} ready />
        <ClosureCard title={t('agentFirewall.governanceControl')} detail={t('agentFirewall.governanceControlDesc')} ready={data.configured} />
        <ClosureCard title={t('agentFirewall.governanceEvidence')} detail={t('agentFirewall.governanceEvidenceDesc')} ready={(summary?.totalEvents ?? 0) > 0} />
      </Box>
    </Shell>
  )
}

export function ShadowAIView() {
  const { overview, data, mode } = useAgentSecurityData()
  const [tab, setTab] = useState('inventory')
  if (overview.isLoading || overview.error) return <LoadingOrError overview={overview} />

  const liveAgent = data.recentDecisions.some((d) => d.toolName !== 'connection_probe')
  const apps = [
    { name: t('agentFirewall.shadowApp.chatgpt'), category: 'Public AI SaaS', owner: 'Business users', status: data.configured ? 'monitored' : 'needs routing', risk: 'medium', action: 'tokenize uploads, log prompts' },
    { name: t('agentFirewall.shadowApp.codingAgents'), category: 'Agent IDE', owner: 'Engineering', status: liveAgent ? 'monitored' : 'waiting for traffic', risk: 'high', action: 'route tool calls through Agent Firewall' },
    { name: t('agentFirewall.shadowApp.deepseek'), category: 'External AI', owner: 'Unapproved', status: mode === 'enforce' ? 'blocked by policy' : 'policy gap', risk: 'critical', action: 'block or require exception' },
    { name: t('agentFirewall.shadowApp.perplexityBrowser'), category: 'Browser AI', owner: 'Unknown', status: 'connector package ready', risk: 'high', action: 'deploy browser connector for user-side telemetry' },
    { name: t('agentFirewall.shadowApp.internalLlm'), category: 'Private AI', owner: 'Platform team', status: data.servers.length > 0 ? 'covered by ingest' : 'register runtime', risk: 'medium', action: 'enforce tool and data policy' },
    { name: t('agentFirewall.shadowApp.unregisteredEndpoints'), category: 'Shadow AI', owner: 'Unknown', status: 'endpoint package ready', risk: 'high', action: 'deploy endpoint connector to discover destination and user' },
  ]

  return (
    <Shell
      title={t('agentFirewall.shadowTitle')}
      desc={t('agentFirewall.shadowDesc')}
      icon={<MonitorSmartphone size={23} />}
      tab={tab}
      onTabChange={setTab}
      tabs={[
        { value: 'inventory', label: t('agentFirewall.tabInventory') },
        { value: 'users', label: t('agentFirewall.tabUsers') },
        { value: 'policy', label: t('agentFirewall.tabPolicy') },
      ]}
    >
      {tab === 'inventory' && (
        <>
          <MetricGrid items={[
            ['AI apps', String(apps.length), undefined],
            ['Known routed agents', String(data.servers.length), data.servers.length > 0 ? STATUS_GOOD : STATUS_WARN],
            ['Live decisions', String(data.recentDecisions.length), data.recentDecisions.length > 0 ? STATUS_GOOD : STATUS_WARN],
            ['High risk apps', String(apps.filter((a) => a.risk === 'high' || a.risk === 'critical').length), STATUS_BAD],
          ]} />
          <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
            <Header icon={<RadioTower size={16} />} title={t('agentFirewall.aiApplicationInventory')} />
            <DataTable minWidth={900}>
              <TableHead>
                <TableRow>
                  <TableCell>{t('agentFirewall.colApplication')}</TableCell>
                  <TableCell>{t('agentFirewall.colCategory')}</TableCell>
                  <TableCell>{t('agentFirewall.colOwner')}</TableCell>
                  <TableCell>{t('agentFirewall.colStatus')}</TableCell>
                  <TableCell>{t('agentFirewall.colRisk')}</TableCell>
                  <TableCell>{t('agentFirewall.colNextAction')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {apps.map((app) => (
                  <TableRow key={app.name}>
                    <TableCell sx={{ fontWeight: 850 }}>{app.name}</TableCell>
                    <TableCell>{app.category}</TableCell>
                    <TableCell>{app.owner}</TableCell>
                    <TableCell><StatusText value={app.status} /></TableCell>
                    <TableCell><Risk risk={app.risk} /></TableCell>
                    <TableCell sx={{ color: 'text.secondary' }}>{app.action}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </DataTable>
          </Paper>
        </>
      )}

      {tab === 'users' && <UserDevicePanel decisions={data.recentDecisions} />}
      {tab === 'policy' && <PolicyGapPanel configured={data.configured} mode={mode} />}

      <Alert severity="info">
        {t('agentFirewall.shadowEndpointGap')}
      </Alert>
    </Shell>
  )
}

export function AIDLPView() {
  const { overview, data } = useAgentSecurityData()
  const [tab, setTab] = useState('controls')
  if (overview.isLoading || overview.error) return <LoadingOrError overview={overview} />

  const rows = [
    { control: 'File upload', action: 'block or tokenize', scope: 'meeting notes, PDFs, screenshots', status: 'routed payload ready', evidence: 'inputPayload / transform' },
    { control: 'Prompt / paste', action: 'stable tokenization', scope: 'PII, phone, national ID, email', status: 'enabled for routed agents', evidence: 'transformedInputText' },
    { control: 'Source code to AI', action: 'hold or approval', scope: 'repo, snippets, secrets', status: 'policy-ready', evidence: 'dataClass + permissionScope' },
    { control: 'Screenshot OCR', action: 'mask or tokenize', scope: 'screen capture', status: 'endpoint package ready', evidence: 'OCR digest + spans' },
  ]

  return (
    <Shell
      title={t('agentFirewall.dlpTitle')}
      desc={t('agentFirewall.dlpDesc')}
      icon={<Database size={23} />}
      tab={tab}
      onTabChange={setTab}
      tabs={[
        { value: 'controls', label: t('agentFirewall.tabControls') },
        { value: 'tokenization', label: t('agentFirewall.tabTokenization') },
        { value: 'coverage', label: t('agentFirewall.tabCoverage') },
      ]}
    >
      {tab === 'controls' && (
        <>
          <MetricGrid items={[
            ['Transform actions', 'block / mask / tokenize', BRAND],
            ['Protected decisions', String(data.recentDecisions.length), data.recentDecisions.length > 0 ? STATUS_GOOD : STATUS_WARN],
            ['Sensitive classes', 'PII / secret / code', STATUS_BAD],
            ['Persistence model', 'digest-safe', STATUS_GOOD],
          ]} />
          <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
            <Header icon={<LockKeyhole size={16} />} title={t('agentFirewall.dlpControls')} />
            <DataTable minWidth={960}>
              <TableHead>
                <TableRow>
                  <TableCell>{t('agentFirewall.colControl')}</TableCell>
                  <TableCell>{t('agentFirewall.colAction')}</TableCell>
                  <TableCell>{t('agentFirewall.colScope')}</TableCell>
                  <TableCell>{t('agentFirewall.colStatus')}</TableCell>
                  <TableCell>{t('agentFirewall.colEvidence')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.control}>
                    <TableCell sx={{ fontWeight: 850 }}>{row.control}</TableCell>
                    <TableCell>{row.action}</TableCell>
                    <TableCell>{row.scope}</TableCell>
                    <TableCell><StatusText value={row.status} /></TableCell>
                    <TableCell sx={flytoTextStyles.codeSmall}>{row.evidence}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </DataTable>
          </Paper>
        </>
      )}

      {tab === 'tokenization' && <TokenizationPanel />}
      {tab === 'coverage' && <DLPCoveragePanel decisions={data.recentDecisions.length} />}
    </Shell>
  )
}

export function EvidenceReportsView() {
  const { orgId, overview, data, mode } = useAgentSecurityData()
  const [tab, setTab] = useState('reports')
  const evidence = useQuery({
    queryKey: qk.mcp.evidence(orgId),
    queryFn: () => getMcpEvidenceReport(orgId!),
    enabled: !!orgId,
    staleTime: 60_000,
  })
  if (overview.isLoading || overview.error) return <LoadingOrError overview={overview} />
  const report = evidence.data
  const summary = report?.summary

  return (
    <Shell
      title={t('agentFirewall.evidenceTitle')}
      desc={t('agentFirewall.evidenceDesc')}
      icon={<FileSearch size={23} />}
      tab={tab}
      onTabChange={setTab}
      tabs={[
        { value: 'reports', label: t('agentFirewall.tabReports') },
        { value: 'evidence', label: t('agentFirewall.tabEvidence') },
        { value: 'export', label: t('agentFirewall.tabExport') },
      ]}
    >
      {tab === 'reports' && (
        <FillPanel>
          <MetricGrid items={[
            ['Evidence rows', String(summary?.totalEvents ?? data.recentDecisions.length), (summary?.totalEvents ?? data.recentDecisions.length) > 0 ? STATUS_GOOD : STATUS_WARN],
            ['Policy mode', mode, undefined],
            ['Sensitive outbound', String(summary?.outboundSensitive ?? 0), summary?.outboundSensitive ? STATUS_BAD : STATUS_GOOD],
            ['Raw payload storage', 'off by design', STATUS_GOOD],
          ]} />
          <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
            <Header icon={<FileSearch size={16} />} title={t('agentFirewall.reportList')} />
            <DataTable minWidth={900}>
              <TableHead>
                <TableRow>
                  <TableCell>{t('agentFirewall.colReport')}</TableCell>
                  <TableCell>{t('agentFirewall.colScope')}</TableCell>
                  <TableCell>{t('agentFirewall.colAudience')}</TableCell>
                  <TableCell>{t('agentFirewall.colStatus')}</TableCell>
                  <TableCell>{t('agentFirewall.colEvidenceSource')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <ReportRow icon={<ShieldCheck size={16} />} report="Runtime enforcement report" scope={mode} audience="CISO / SOC" status={report ? 'ready' : 'loading'} source={`${summary?.blockedOrHeld ?? 0} held or blocked`} />
                <ReportRow icon={<Database size={16} />} report="Sensitive egress and tokenization report" scope="PII / secret / code" audience="DLP / privacy" status={report ? 'ready' : 'loading'} source={`${summary?.tokenizationEligible ?? 0} tokenization eligible`} />
                <ReportRow icon={<Fingerprint size={16} />} report="User and device attribution report" scope="user / device / app" audience="IT / HR / audit" status={summary?.deviceAttributed ? 'ready' : 'needs endpoint traffic'} source={`${summary?.identityAttributed ?? 0} identity / ${summary?.deviceAttributed ?? 0} device`} />
                <ReportRow icon={<Workflow size={16} />} report="Agent attack-chain report" scope="session behavior" audience="engineering security" status="ready" source="sequence lenses + executed memory" />
              </TableBody>
            </DataTable>
          </Paper>
          <EvidenceRowsTable report={report} loading={evidence.isLoading} />
        </FillPanel>
      )}

      {tab === 'evidence' && <EvidenceRulesPanel />}
      {tab === 'export' && <ExportPanel decisions={summary?.totalEvents ?? data.recentDecisions.length} report={report} orgId={orgId} />}

      <Alert severity="info">
        {t('agentFirewall.reportPrivacy')}
      </Alert>
    </Shell>
  )
}

function Header({ title, icon }: { title: string; icon?: ReactNode }) {
  return (
    <Box sx={{ px: 2.5, py: 1.5, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
      {icon && <Box sx={{ color: BRAND, display: 'flex' }}>{icon}</Box>}
      <Typography variant="subtitle2" fontWeight={850}>{title}</Typography>
    </Box>
  )
}

function FillPanel({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        flex: 1,
        height: '100%',
        minHeight: 0,
        display: 'grid',
        gridTemplateRows: 'auto auto minmax(360px, 1fr)',
        gap: 2.5,
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
    >
      {children}
    </Box>
  )
}

function DataTable({ minWidth, fill = false, children }: { minWidth: number; fill?: boolean; children: ReactNode }) {
  return (
    <Box sx={{ p: 2, ...(fill ? { flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex' } : null) }}>
      <Box sx={{ overflowX: 'auto', border: 1, borderColor: 'divider', borderRadius: 1.5, ...(fill ? { flex: 1, minHeight: 0, overflowY: 'auto' } : null) }}>
        <Table
          size="small"
          sx={{
            minWidth,
            '& .MuiTableCell-root': { px: 2, py: 1.15, verticalAlign: 'top' },
            '& .MuiTableHead-root .MuiTableCell-root': {
              bgcolor: alpha(BRAND, 0.035),
              fontWeight: 850,
              whiteSpace: 'nowrap',
              ...(fill ? { position: 'sticky', top: 0, zIndex: 1 } : null),
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

function MetricGrid({ items }: { items: Array<[string, string, string | undefined]> }) {
  return (
    <FlytoMetricGrid
      minWidth={150}
      items={items.map(([label, value, tone]) => ({ label, value, tone }))}
    />
  )
}

function Risk({ risk }: { risk: string }) {
  const color = RISK_TONE[risk] ?? STATUS_NEUTRAL
  return <Chip size="small" label={risk} sx={{ height: 22, fontSize: 12, fontWeight: 850, color, bgcolor: alpha(color, 0.12) }} />
}

function StatusText({ value }: { value: string }) {
  const lower = value.toLowerCase()
  const color = lower.includes('ready') || lower.includes('monitored') || lower.includes('enabled') || lower.includes('covered') || lower.includes('blocked') ? STATUS_GOOD : lower.includes('gap') || lower.includes('needs') || lower.includes('waiting') ? STATUS_WARN : STATUS_NEUTRAL
  return <Chip size="small" label={value} sx={{ height: 22, fontSize: 12, fontWeight: 800, color, bgcolor: alpha(color, 0.12), maxWidth: 220 }} />
}

function ReportRow({ icon, report, scope, audience, status, source }: { icon: ReactNode; report: string; scope: string; audience: string; status: string; source: string }) {
  return (
    <TableRow>
      <TableCell sx={{ fontWeight: 850 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>{icon}{report}</Box>
      </TableCell>
      <TableCell>{scope}</TableCell>
      <TableCell>{audience}</TableCell>
      <TableCell><StatusText value={status} /></TableCell>
      <TableCell sx={flytoTextStyles.codeSmall}>{source}</TableCell>
    </TableRow>
  )
}

function ClosureCard({ title, detail, ready }: { title: string; detail: string; ready: boolean }) {
  const color = ready ? STATUS_GOOD : STATUS_WARN
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, minWidth: 0, borderColor: alpha(color, 0.35), bgcolor: alpha(color, 0.04) }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {ready ? <CheckCircle2 size={17} style={{ color }} /> : <AlertTriangle size={17} style={{ color }} />}
        <Typography variant="body2" fontWeight={850}>{title}</Typography>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75, lineHeight: 1.55 }}>
        {detail}
      </Typography>
    </Paper>
  )
}

function EnterpriseReadinessPanel({
  loading,
  error,
  overall,
  grade,
  pillars,
}: {
  loading: boolean
  error: unknown
  overall: number
  grade: string
  pillars: AIGovernanceScoreDimension[]
}) {
  return (
    <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
      <Header icon={<ShieldCheck size={16} />} title={t('agentFirewall.enterpriseReadiness')} />
      {loading ? (
        <LoadingState variant="spinner" py={4} />
      ) : error ? (
        <Box sx={{ p: 2 }}>
          <QueryError error={error} label={t('agentFirewall.enterpriseReadiness')} compact />
        </Box>
      ) : pillars.length === 0 ? (
        <Box sx={{ p: 2 }}>
          <Alert severity="info">{t('agentFirewall.enterpriseEmpty')}</Alert>
        </Box>
      ) : (
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '280px minmax(0, 1fr)' }, gap: 2 }}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: alpha(scoreTone(overall), 0.05), borderColor: alpha(scoreTone(overall), 0.24) }}>
            <Typography variant="caption" color="text.secondary">{t('agentFirewall.enterpriseOverall')}</Typography>
            <Typography variant="h3" fontWeight={900} sx={{ color: scoreTone(overall), lineHeight: 1.05 }}>{overall}%</Typography>
            <Typography variant="subtitle2" fontWeight={850}>{t('agentFirewall.enterpriseGrade')} {grade}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1, lineHeight: 1.55 }}>
              {t('agentFirewall.enterpriseReadinessDesc')}
            </Typography>
          </Paper>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5, minWidth: 0 }}>
            {pillars.map((pillar) => (
              <Paper key={pillar.id} variant="outlined" sx={{ p: 1.75, borderRadius: 2, minWidth: 0 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={900}>{enterpriseName(pillar)}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.45, lineHeight: 1.45 }}>
                      {enterpriseDescription(pillar)}
                    </Typography>
                  </Box>
                  <Chip
                    size="small"
                    label={dimensionStatus(pillar.status)}
                    sx={{
                      height: 24,
                      borderRadius: 1.2,
                      fontWeight: 850,
                      color: scoreTone(pillar.score),
                      bgcolor: alpha(scoreTone(pillar.score), 0.12),
                      flexShrink: 0,
                    }}
                  />
                </Box>
                <Box sx={{ mt: 1.25 }}>
                  <ScoreBar score={pillar.score} />
                </Box>
                <Box component="code" sx={{ display: 'block', mt: 1.1, px: 1, py: 0.75, borderRadius: 1, bgcolor: 'grey.900', color: CODE_TEXT, fontSize: 12, lineHeight: 1.45, overflowWrap: 'anywhere' }}>
                  {formatSignals(pillar.signals)}
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, lineHeight: 1.45 }}>
                  {pillar.evidence.length > 0 ? pillar.evidence.slice(0, 2).join(' | ') : t('agentFirewall.noEvidenceYet')}
                </Typography>
              </Paper>
            ))}
          </Box>
        </Box>
      )}
    </Paper>
  )
}

function GovernanceDimensionPanel({ loading, error, dimensions }: { loading: boolean; error: unknown; dimensions: AIGovernanceScoreDimension[] }) {
  return (
    <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
      <Header icon={<Scale size={16} />} title={t('agentFirewall.dimensionScorecard')} />
      {loading ? (
        <LoadingState variant="spinner" py={4} />
      ) : error ? (
        <Box sx={{ p: 2 }}>
          <QueryError error={error} label={t('agentFirewall.dimensionScorecard')} compact />
        </Box>
      ) : dimensions.length === 0 ? (
        <Box sx={{ p: 2 }}>
          <Alert severity="info">{t('agentFirewall.dimensionEmpty')}</Alert>
        </Box>
      ) : (
        <DataTable minWidth={1160}>
          <TableHead>
            <TableRow>
              <TableCell>{t('agentFirewall.colDimension')}</TableCell>
              <TableCell>{t('agentFirewall.colScore')}</TableCell>
              <TableCell>{t('agentFirewall.colWeight')}</TableCell>
              <TableCell>{t('agentFirewall.colStatus')}</TableCell>
              <TableCell>{t('agentFirewall.colSignals')}</TableCell>
              <TableCell>{t('agentFirewall.colEvidence')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {dimensions.map((dim) => (
              <TableRow key={dim.id}>
                <TableCell sx={{ minWidth: 240 }}>
                  <Typography variant="body2" fontWeight={850}>{dimensionName(dim)}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.35, lineHeight: 1.45 }}>
                    {dimensionDescription(dim)}
                  </Typography>
                </TableCell>
                <TableCell sx={{ minWidth: 170 }}>
                  <ScoreBar score={dim.score} />
                </TableCell>
                <TableCell sx={flytoTextStyles.codeSmall}>{dim.weight}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={dimensionStatus(dim.status)}
                    sx={{
                      height: 24,
                      borderRadius: 1.2,
                      fontWeight: 850,
                      color: scoreTone(dim.score),
                      bgcolor: alpha(scoreTone(dim.score), 0.12),
                      border: `1px solid ${alpha(scoreTone(dim.score), 0.24)}`,
                    }}
                  />
                </TableCell>
                <TableCell sx={{ ...flytoTextStyles.codeSmall, maxWidth: 260 }}>
                  {formatSignals(dim.signals)}
                </TableCell>
                <TableCell sx={{ color: 'text.secondary', maxWidth: 360 }}>
                  {dim.evidence.length > 0 ? dim.evidence.slice(0, 3).join(' | ') : t('agentFirewall.noEvidenceYet')}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </DataTable>
      )}
    </Paper>
  )
}

function ScoreBar({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score))
  const color = scoreTone(clamped)
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.6 }}>
        <Typography variant="body2" fontWeight={850} sx={{ color }}>{clamped}%</Typography>
        <Typography variant="caption" color="text.secondary">{scoreLabel(clamped)}</Typography>
      </Box>
      <Box sx={{ height: 7, borderRadius: 999, bgcolor: alpha(color, 0.14), overflow: 'hidden' }}>
        <Box sx={{ width: `${clamped}%`, height: '100%', bgcolor: color }} />
      </Box>
    </Box>
  )
}

function dimensionName(dim: AIGovernanceScoreDimension) {
  return tOr(`agentFirewall.dimension.${dim.id}.label`, dim.label)
}

function dimensionDescription(dim: AIGovernanceScoreDimension) {
  return tOr(`agentFirewall.dimension.${dim.id}.desc`, dim.description)
}

function dimensionStatus(status: string) {
  return tOr(`agentFirewall.dimensionStatus.${status}`, status)
}

function enterpriseName(dim: AIGovernanceScoreDimension) {
  return tOr(`agentFirewall.enterprise.${dim.id}.label`, dim.label)
}

function enterpriseDescription(dim: AIGovernanceScoreDimension) {
  return tOr(`agentFirewall.enterprise.${dim.id}.desc`, dim.description)
}

function formatSignals(signals: Record<string, number>) {
  const entries = Object.entries(signals ?? {}).filter(([, value]) => value !== undefined && value !== null)
  if (entries.length === 0) return t('agentFirewall.noSignalsYet')
  return entries
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 5)
    .map(([key, value]) => `${key}=${value}`)
    .join(', ')
}

function scoreTone(score: number) {
  if (score >= 85) return STATUS_GOOD
  if (score >= 65) return STATUS_INFO
  if (score >= 40) return STATUS_WARN
  return STATUS_BAD
}

function scoreLabel(score: number) {
  if (score >= 85) return t('agentFirewall.dimensionStatus.strong')
  if (score >= 65) return t('agentFirewall.dimensionStatus.managed')
  if (score >= 40) return t('agentFirewall.dimensionStatus.partial')
  return t('agentFirewall.dimensionStatus.gap')
}

type AIGovernanceUseCaseForm = {
  name: string
  department: string
  businessOwner: string
  technicalOwner: string
  modelProvider: string
  modelName: string
  appName: string
  appCategory: string
  purpose: string
  dataClasses: string
  frameworks: string
  riskLevel: string
  policyMode: string
  notes: string
}

const EMPTY_AI_GOV_FORM: AIGovernanceUseCaseForm = {
  name: '',
  department: '',
  businessOwner: '',
  technicalOwner: '',
  modelProvider: '',
  modelName: '',
  appName: '',
  appCategory: 'code_agent',
  purpose: '',
  dataClasses: 'source_code',
  frameworks: 'NIST AI RMF, ISO/IEC 42001',
  riskLevel: 'medium',
  policyMode: 'observe',
  notes: '',
}

function AIGovernanceUseCaseEditor({ orgId, rows, canManage }: { orgId?: string; rows: AIGovernanceUseCase[]; canManage: boolean }) {
  const queryClient = useQueryClient()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<AIGovernanceUseCaseForm>(EMPTY_AI_GOV_FORM)
  const open = editingId !== null
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: qk.mcp.aiGovernanceUseCases(orgId) })
    void queryClient.invalidateQueries({ queryKey: qk.mcp.aiGovernanceScore(orgId) })
    void queryClient.invalidateQueries({ queryKey: qk.mcp.aiGovernanceEvents(orgId) })
  }
  const createMutation = useMutation({
    mutationFn: (body: AIGovernanceUseCaseInput) => createAIGovernanceUseCase(orgId!, body),
    onSuccess: () => {
      invalidate()
      setEditingId(null)
      setDraft(EMPTY_AI_GOV_FORM)
    },
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: AIGovernanceUseCaseInput }) => updateAIGovernanceUseCase(id, body),
    onSuccess: () => {
      invalidate()
      setEditingId(null)
    },
  })
  const busy = createMutation.isPending || updateMutation.isPending
  const selected = rows.find((row) => row.id === editingId)
  const startNew = () => {
    setEditingId('new')
    setDraft(EMPTY_AI_GOV_FORM)
  }
  const startEdit = (id: string) => {
    const row = rows.find((item) => item.id === id)
    if (!row) return
    setEditingId(row.id)
    setDraft(formFromUseCase(row))
  }
  const updateField = (field: keyof AIGovernanceUseCaseForm, value: string) => setDraft((prev) => ({ ...prev, [field]: value }))
  const submit = () => {
    const body = inputFromForm(draft)
    if (!draft.name.trim() || !orgId) return
    if (editingId && editingId !== 'new') {
      updateMutation.mutate({ id: editingId, body })
      return
    }
    createMutation.mutate(body)
  }

  return (
    <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
      <Header icon={<Pencil size={16} />} title={t('agentFirewall.aiUseCaseEditor')} />
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button size="small" variant="contained" startIcon={<Plus size={14} />} disabled={!canManage || !orgId} onClick={startNew}>
            {t('agentFirewall.newUseCase')}
          </Button>
          <TextField
            select
            size="small"
            label={t('agentFirewall.editExistingUseCase')}
            value={selected?.id ?? ''}
            disabled={!canManage || rows.length === 0}
            onChange={(e) => startEdit(e.target.value)}
            sx={{ minWidth: { xs: '100%', sm: 280 } }}
          >
            {rows.map((row) => <MenuItem key={row.id} value={row.id}>{row.name}</MenuItem>)}
          </TextField>
          {!canManage && <StatusText value={t('agentFirewall.readOnly')} />}
        </Box>

        {open && (
          <Box component="form" onSubmit={(e) => { e.preventDefault(); submit() }} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1.25 }}>
            <TextField size="small" label={t('agentFirewall.formName')} value={draft.name} onChange={(e) => updateField('name', e.target.value)} required sx={{ gridColumn: { xs: 'auto', md: 'span 2' } }} />
            <TextField size="small" label={t('agentFirewall.formDepartment')} value={draft.department} onChange={(e) => updateField('department', e.target.value)} />
            <TextField size="small" label={t('agentFirewall.formAppCategory')} value={draft.appCategory} onChange={(e) => updateField('appCategory', e.target.value)} />
            <TextField size="small" label={t('agentFirewall.formBusinessOwner')} value={draft.businessOwner} onChange={(e) => updateField('businessOwner', e.target.value)} />
            <TextField size="small" label={t('agentFirewall.formTechnicalOwner')} value={draft.technicalOwner} onChange={(e) => updateField('technicalOwner', e.target.value)} />
            <TextField size="small" label={t('agentFirewall.formModelProvider')} value={draft.modelProvider} onChange={(e) => updateField('modelProvider', e.target.value)} />
            <TextField size="small" label={t('agentFirewall.formModelName')} value={draft.modelName} onChange={(e) => updateField('modelName', e.target.value)} />
            <TextField size="small" label={t('agentFirewall.formAppName')} value={draft.appName} onChange={(e) => updateField('appName', e.target.value)} />
            <TextField select size="small" label={t('agentFirewall.formRisk')} value={draft.riskLevel} onChange={(e) => updateField('riskLevel', e.target.value)}>
              {['low', 'medium', 'high', 'critical'].map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
            </TextField>
            <TextField select size="small" label={t('agentFirewall.formPolicyMode')} value={draft.policyMode} onChange={(e) => updateField('policyMode', e.target.value)}>
              {['observe', 'shadow', 'soft_enforce', 'enforce'].map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
            </TextField>
            <TextField size="small" label={t('agentFirewall.formDataClasses')} value={draft.dataClasses} onChange={(e) => updateField('dataClasses', e.target.value)} />
            <TextField size="small" label={t('agentFirewall.formFrameworks')} value={draft.frameworks} onChange={(e) => updateField('frameworks', e.target.value)} />
            <TextField size="small" label={t('agentFirewall.formPurpose')} value={draft.purpose} onChange={(e) => updateField('purpose', e.target.value)} sx={{ gridColumn: { xs: 'auto', md: 'span 2' } }} />
            <TextField size="small" label={t('agentFirewall.formNotes')} value={draft.notes} onChange={(e) => updateField('notes', e.target.value)} sx={{ gridColumn: { xs: 'auto', md: 'span 2' } }} />
            <Box sx={{ gridColumn: '1 / -1', display: 'flex', gap: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <Button size="small" variant="outlined" startIcon={<X size={14} />} disabled={busy} onClick={() => setEditingId(null)}>{t('agentFirewall.cancel')}</Button>
              <Button size="small" type="submit" variant="contained" startIcon={<Save size={14} />} disabled={!canManage || busy || !draft.name.trim()}>
                {editingId === 'new' ? t('agentFirewall.createUseCase') : t('agentFirewall.saveUseCase')}
              </Button>
            </Box>
          </Box>
        )}
      </Box>
    </Paper>
  )
}

function AIGovernanceTimelinePanel({ loading, error, events, rows }: { loading: boolean; error: unknown; events: AIGovernanceEvent[]; rows: AIGovernanceUseCase[] }) {
  const names = useMemo(() => new Map(rows.map((row) => [row.id, row.name])), [rows])
  return (
    <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
      <Header icon={<Clock3 size={16} />} title={t('agentFirewall.aiGovernanceTimeline')} />
      {loading ? (
        <LoadingState variant="spinner" py={4} />
      ) : error ? (
        <Box sx={{ p: 2 }}><QueryError error={error} label={t('agentFirewall.aiGovernanceTimeline')} compact /></Box>
      ) : events.length === 0 ? (
        <Box sx={{ p: 2 }}><Alert severity="info">{t('agentFirewall.aiGovernanceTimelineEmpty')}</Alert></Box>
      ) : (
        <DataTable minWidth={1060}>
          <TableHead>
            <TableRow>
              <TableCell>{t('agentFirewall.colTime')}</TableCell>
              <TableCell>{t('agentFirewall.colEvent')}</TableCell>
              <TableCell>{t('agentFirewall.colUseCase')}</TableCell>
              <TableCell>{t('agentFirewall.colTransition')}</TableCell>
              <TableCell>{t('agentFirewall.colPolicyMode')}</TableCell>
              <TableCell>{t('agentFirewall.colReason')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {events.slice(0, 12).map((event) => (
              <TableRow key={event.id}>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(event.createdAt)}</TableCell>
                <TableCell><StatusText value={event.eventType} /></TableCell>
                <TableCell sx={{ fontWeight: 850 }}>{names.get(event.useCaseId ?? '') ?? event.useCaseId ?? 'runtime action'}</TableCell>
                <TableCell sx={flytoTextStyles.codeSmall}>{eventTransition(event)}</TableCell>
                <TableCell><StatusText value={event.toPolicyMode || event.fromPolicyMode || 'observe'} /></TableCell>
                <TableCell sx={{ color: 'text.secondary' }}>{event.reason || 'metadata event'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </DataTable>
      )}
    </Paper>
  )
}

function GovernanceApprovalPanel({ orgId, rows, canManage }: { orgId?: string; rows: AIGovernanceUseCase[]; canManage: boolean }) {
  const queryClient = useQueryClient()
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: qk.mcp.aiGovernanceUseCases(orgId) })
    void queryClient.invalidateQueries({ queryKey: qk.mcp.aiGovernanceScore(orgId) })
    void queryClient.invalidateQueries({ queryKey: qk.mcp.aiGovernanceEvents(orgId) })
  }
  const requestApproval = useMutation({
    mutationFn: (id: string) => requestAIGovernanceUseCaseApproval(id),
    onSuccess: invalidate,
  })
  const approve = useMutation({
    mutationFn: (row: AIGovernanceUseCase) => approveAIGovernanceUseCase(row.id, approvalPayloadFor(row)),
    onSuccess: invalidate,
  })
  const reject = useMutation({
    mutationFn: (id: string) => rejectAIGovernanceUseCase(id),
    onSuccess: invalidate,
  })
  const pending = rows.filter((row) => row.approvalStatus === 'pending' || row.status === 'pending_approval')
  const visibleRows = rows.length > 0 ? rows.slice(0, 8) : []
  const busy = requestApproval.isPending || approve.isPending || reject.isPending

  return (
    <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
      <Header icon={<ClipboardCheck size={16} />} title={t('agentFirewall.governanceApprovalQueue')} />
      {visibleRows.length === 0 ? (
        <Box sx={{ p: 2 }}>
          <Alert severity="info">{t('agentFirewall.governanceApprovalEmpty')}</Alert>
        </Box>
      ) : (
        <DataTable minWidth={1040}>
          <TableHead>
            <TableRow>
              <TableCell>{t('agentFirewall.colUseCase')}</TableCell>
              <TableCell>{t('agentFirewall.colOwner')}</TableCell>
              <TableCell>{t('agentFirewall.colRisk')}</TableCell>
              <TableCell>{t('agentFirewall.colPolicyMode')}</TableCell>
              <TableCell>{t('agentFirewall.colApproval')}</TableCell>
              <TableCell>{t('agentFirewall.colAction')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visibleRows.map((row) => {
              const approvalStatus = row.approvalStatus || 'not_requested'
              const isPending = approvalStatus === 'pending' || row.status === 'pending_approval'
              const isApproved = approvalStatus === 'approved'
              return (
                <TableRow key={row.id}>
                  <TableCell sx={{ fontWeight: 850 }}>{row.name}</TableCell>
                  <TableCell>{row.businessOwner || row.technicalOwner || 'unassigned'}</TableCell>
                  <TableCell><Risk risk={row.riskLevel || 'medium'} /></TableCell>
                  <TableCell><StatusText value={row.policyMode || 'observe'} /></TableCell>
                  <TableCell><StatusText value={approvalStatus} /></TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                      <Button size="small" variant="outlined" disabled={!canManage || busy || isPending || isApproved} onClick={() => requestApproval.mutate(row.id)}>
                        {t('agentFirewall.requestApproval')}
                      </Button>
                      <Button size="small" variant="contained" disabled={!canManage || busy || !isPending} onClick={() => approve.mutate(row)} sx={{ bgcolor: STATUS_GOOD, '&:hover': { bgcolor: STATUS_GOOD } }}>
                        {t('agentFirewall.approve')}
                      </Button>
                      <Button size="small" variant="outlined" color="error" disabled={!canManage || busy || !isPending} onClick={() => reject.mutate(row.id)}>
                        {t('agentFirewall.reject')}
                      </Button>
                    </Box>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </DataTable>
      )}
      {rows.length > 0 && (
        <Box sx={{ px: 2, pb: 2 }}>
          <Alert severity={pending.length > 0 ? 'warning' : 'success'}>
            {pending.length > 0
              ? t('agentFirewall.governanceApprovalPending').replace('{n}', String(pending.length))
              : t('agentFirewall.governanceApprovalClosed')}
          </Alert>
        </Box>
      )}
    </Paper>
  )
}

function formFromUseCase(row: AIGovernanceUseCase): AIGovernanceUseCaseForm {
  return {
    name: row.name ?? '',
    department: row.department ?? '',
    businessOwner: row.businessOwner ?? '',
    technicalOwner: row.technicalOwner ?? '',
    modelProvider: row.modelProvider ?? '',
    modelName: row.modelName ?? '',
    appName: row.appName ?? '',
    appCategory: row.appCategory ?? '',
    purpose: row.purpose ?? '',
    dataClasses: (row.dataClasses ?? []).join(', '),
    frameworks: (row.frameworks ?? []).join(', '),
    riskLevel: row.riskLevel || 'medium',
    policyMode: row.policyMode || 'observe',
    notes: row.notes ?? '',
  }
}

function inputFromForm(form: AIGovernanceUseCaseForm): AIGovernanceUseCaseInput {
  return {
    name: form.name.trim(),
    department: form.department.trim(),
    businessOwner: form.businessOwner.trim(),
    technicalOwner: form.technicalOwner.trim(),
    modelProvider: form.modelProvider.trim(),
    modelName: form.modelName.trim(),
    appName: form.appName.trim(),
    appCategory: form.appCategory.trim(),
    purpose: form.purpose.trim(),
    dataClasses: splitCommaList(form.dataClasses),
    frameworks: splitCommaList(form.frameworks),
    riskLevel: form.riskLevel,
    policyMode: form.policyMode,
    evidenceJson: '{}',
    notes: form.notes.trim(),
  }
}

function splitCommaList(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

function approvalPayloadFor(row: AIGovernanceUseCase): { expiresAt?: string; notes?: string } {
  const highRisk = row.riskLevel === 'high' || row.riskLevel === 'critical'
  return {
    ...(highRisk ? { expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString() } : {}),
    notes: 'Approved from AI Governance queue',
  }
}

function numberSummary(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function eventTransition(event: AIGovernanceEvent): string {
  const approval = event.fromApprovalStatus || event.toApprovalStatus
    ? `${event.fromApprovalStatus || '-'} -> ${event.toApprovalStatus || '-'}`
    : ''
  const status = event.fromStatus || event.toStatus
    ? `${event.fromStatus || '-'} -> ${event.toStatus || '-'}`
    : ''
  return approval || status || event.runtimeEventId || '-'
}

function formatDateTime(value?: string): string {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString()
}

function UserDevicePanel({ decisions }: { decisions: MCPDecisionRow[] }) {
  const rows = useMemo(() => [
    { user: 'engineering@company', device: 'developer workstation', app: 'Claude Code', permission: 'repo write token', activity: `${decisions.filter((d) => d.toolName !== 'connection_probe').length} routed decisions`, risk: 'high' },
    { user: 'business@company', device: 'managed browser', app: 'ChatGPT', permission: 'user session', activity: 'browser connector ready', risk: 'medium' },
    { user: 'unknown', device: 'unmanaged endpoint', app: 'DeepSeek', permission: 'unknown', activity: 'shadow discovery gap', risk: 'critical' },
  ], [decisions])
  return (
    <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
      <Header icon={<Fingerprint size={16} />} title={t('agentFirewall.userDeviceAttribution')} />
      <DataTable minWidth={860}>
        <TableHead>
          <TableRow>
            <TableCell>User</TableCell>
            <TableCell>Device</TableCell>
              <TableCell>{t('agentFirewall.colAiApp')}</TableCell>
            <TableCell>Permission</TableCell>
            <TableCell>Activity</TableCell>
            <TableCell>Risk</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={`${row.user}-${row.app}`}>
              <TableCell sx={{ fontWeight: 850 }}>{row.user}</TableCell>
              <TableCell>{row.device}</TableCell>
              <TableCell>{row.app}</TableCell>
              <TableCell sx={flytoTextStyles.codeSmall}>{row.permission}</TableCell>
              <TableCell>{row.activity}</TableCell>
              <TableCell><Risk risk={row.risk} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </DataTable>
    </Paper>
  )
}

function PolicyGapPanel({ configured, mode }: { configured: boolean; mode: string }) {
  const gaps = [
    { title: t('agentFirewall.policyGap.runtimeIngress'), ready: configured, detail: configured ? t('agentFirewall.policyGap.runtimeIngressReady') : t('agentFirewall.policyGap.runtimeIngressTodo') },
    { title: t('agentFirewall.policyGap.endpointConnector'), ready: true, detail: t('agentFirewall.policyGap.endpointConnectorReady') },
    { title: t('agentFirewall.policyGap.identityJoin'), ready: configured, detail: configured ? t('agentFirewall.policyGap.identityJoinReady') : t('agentFirewall.policyGap.identityJoinTodo') },
    { title: t('agentFirewall.policyGap.blockingRollout'), ready: mode === 'enforce' || mode === 'soft_enforce', detail: t('agentFirewall.policyGap.currentMode', { mode }) },
  ]
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>
      {gaps.map((gap) => (
        <Paper key={gap.title} variant="outlined" sx={{ p: 2, borderRadius: 2, borderColor: gap.ready ? alpha(STATUS_GOOD, 0.35) : alpha(STATUS_WARN, 0.35), bgcolor: alpha(gap.ready ? STATUS_GOOD : STATUS_WARN, 0.04) }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            {gap.ready ? <CheckCircle2 size={17} style={{ color: STATUS_GOOD }} /> : <AlertTriangle size={17} style={{ color: STATUS_WARN }} />}
            <Typography variant="body2" fontWeight={850}>{gap.title}</Typography>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75, lineHeight: 1.55 }}>{gap.detail}</Typography>
        </Paper>
      ))}
    </Box>
  )
}

function TokenizationPanel() {
  const before = 'Customer Alice Chen, ID A123456789, phone 0912-345-678, token sk-live-1234, wants this sent to an external LLM.'
  const after = 'Customer {{PERSON_4F2A}}, ID {{TW_ID_91BC}}, phone {{PHONE_A120}}, token {{SECRET_77E1}}, wants this sent to an external LLM.'
  const detections = ['PERSON', 'TW_ID', 'PHONE', 'SECRET']
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2 }}>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 1 }}>
        <Typography variant="subtitle2" fontWeight={850}>{t('agentFirewall.tokenizationWorkbench')}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, lineHeight: 1.6 }}>
          {t('agentFirewall.tokenizationWorkbenchDesc')}
        </Typography>
        <Box sx={{ mt: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {detections.map((d) => <Chip key={d} size="small" label={d} sx={{ height: 22, fontSize: 12, fontWeight: 850 }} />)}
        </Box>
      </Paper>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 1, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        <CodeBlock label={t('agentFirewall.originalSensitivePayload')} text={before} tone={STATUS_BAD} />
        <CodeBlock label={t('agentFirewall.payloadSentToAi')} text={after} tone={STATUS_GOOD} />
      </Paper>
    </Box>
  )
}

function CodeBlock({ label, text, tone }: { label: string; text: string; tone: string }) {
  return (
    <Box>
      <Typography variant="caption" fontWeight={850} sx={{ color: tone, textTransform: 'uppercase' }}>{label}</Typography>
      <FlytoCodeBlock
        value={text}
        density="compact"
        maxHeight={180}
        sx={{ mt: 0.5, borderColor: alpha(tone, 0.35) }}
        preSx={{ bgcolor: 'grey.900', color: CODE_TEXT }}
      />
    </Box>
  )
}

function DLPCoveragePanel({ decisions }: { decisions: number }) {
  const rows = [
    ['Email / identity', 'tokenize', 'enabled'],
    ['Taiwan ID / phone', 'tokenize', 'enabled'],
    ['API keys / credentials', 'block or tokenize', 'enabled'],
    ['Customer data', 'hold, tokenize, or approval', 'enabled for routed agents'],
    ['Screenshots / clipboard', 'mask or tokenize', 'endpoint package ready'],
  ]
  return (
    <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
      <Header icon={<Database size={16} />} title={t('agentFirewall.recentPayloadCoverage')} />
      <Box sx={{ p: 2 }}>
        <Alert severity="info" sx={{ mb: 2 }}>{t('agentFirewall.recentPayloadCoverageDesc').replace('{n}', String(decisions))}</Alert>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1 }}>
          {rows.map(([klass, action, status]) => (
            <Paper key={klass} variant="outlined" sx={{ p: 1.5, borderRadius: 1.5 }}>
              <Typography variant="body2" fontWeight={850}>{klass}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>{action}</Typography>
              <StatusText value={status} />
            </Paper>
          ))}
        </Box>
      </Box>
    </Paper>
  )
}

function EvidenceRulesPanel() {
  const rules = [
    ['Persist', 'eventId, policy verdict, effective action, floor rule, lens scores, data class, target trust'],
    ['Transform metadata', 'transform type, token categories, tokenized text when returned to caller'],
    ['Never persist', 'raw prompts, raw files, raw screenshots, raw secrets, raw credentials'],
    ['Reviewer view', 'safe diff, timeline, policy explanation, exportable report'],
  ]
  return (
    <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
      <Header icon={<ShieldAlert size={16} />} title={t('agentFirewall.safeEvidenceRules')} />
      <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25 }}>
        {rules.map(([title, detail]) => (
          <Paper key={title} variant="outlined" sx={{ p: 1.5, borderRadius: 1.5 }}>
            <Typography variant="body2" fontWeight={850}>{title}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, lineHeight: 1.55 }}>{detail}</Typography>
          </Paper>
        ))}
      </Box>
    </Paper>
  )
}

function EvidenceRowsTable({ report, loading }: { report?: MCPEvidenceReport; loading: boolean }) {
  const rows = report?.rows?.slice(0, 12) ?? []
  return (
    <Paper variant="outlined" sx={{ minHeight: 360, display: 'flex', flexDirection: 'column', borderRadius: 1, overflow: 'hidden' }}>
      <Header icon={<FileSearch size={16} />} title={t('agentFirewall.recentEvidenceRows')} />
      {loading ? (
        <LoadingState variant="spinner" py={4} />
      ) : rows.length === 0 ? (
        <Box sx={{ flex: 1, minHeight: 0, p: 2 }}><Alert severity="info">{t('agentFirewall.noEvidenceRows')}</Alert></Box>
      ) : (
        <DataTable minWidth={1120} fill>
            <TableHead>
              <TableRow>
                <TableCell>{t('agentFirewall.colEvent')}</TableCell>
                <TableCell>{t('agentFirewall.colAppDevice')}</TableCell>
                <TableCell>{t('agentFirewall.colToolAction')}</TableCell>
                <TableCell>{t('agentFirewall.colData')}</TableCell>
                <TableCell>{t('agentFirewall.colDecision')}</TableCell>
                <TableCell>{t('agentFirewall.colTransform')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.eventId}>
                  <TableCell sx={flytoTextStyles.codeSmall}>{row.eventId}</TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={800}>{row.appName || row.appCategory || 'unknown app'}</Typography>
                    <Typography variant="caption" color="text.secondary">{row.deviceId || row.userId || 'unattributed'}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={800}>{row.toolName}</Typography>
                    <Typography variant="caption" color="text.secondary">{row.verb} · {row.actionType || row.targetTrust || 'runtime call'}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{row.contentClass || row.dataClass || 'unclassified'}</Typography>
                    <Typography variant="caption" color="text.secondary">{row.dataDirection || 'internal'} · {row.permissionScope || row.credentialScope || 'no scope'}</Typography>
                  </TableCell>
                  <TableCell><StatusText value={row.effective || row.verdict || 'unknown'} /></TableCell>
                <TableCell><StatusText value={row.transformSuggestion || 'none'} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </DataTable>
      )}
    </Paper>
  )
}

function ExportPanel({ decisions, report, orgId }: { decisions: number; report?: MCPEvidenceReport; orgId?: string }) {
  const chain = [
    ['Detect', 'Shadow AI or routed agent event arrives.'],
    ['Classify', 'Eight risk dimensions and sensitive-data class are attached.'],
    ['Decide', 'Policy emits allow, hold, deny, approval, mask, or tokenize.'],
    ['Transform', 'Payload is blocked, masked, or tokenized without storing raw data.'],
    ['Enforce', 'Agent Firewall applies rollout-mode decision.'],
    ['Report', 'Evidence report exports digest-safe review data.'],
  ]
  return (
    <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
      <Header icon={<Workflow size={16} />} title={t('agentFirewall.exportReady')} />
      <Box sx={{ p: 2 }}>
        <MetricGrid items={[
          ['Current evidence rows', String(decisions), decisions > 0 ? STATUS_GOOD : STATUS_WARN],
          ['Export format', 'JSON / CSV', undefined],
          ['Privacy mode', 'safe by default', STATUS_GOOD],
          ['Raw evidence', 'never persisted', STATUS_GOOD],
        ]} />
        <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button
            component="a"
            href={orgId ? mcpEvidenceReportUrl(orgId, 'csv') : undefined}
            target="_blank"
            rel="noreferrer"
            variant="contained"
            startIcon={<Download size={16} />}
            disabled={!orgId}
            sx={{ bgcolor: BRAND, '&:hover': { bgcolor: colors.brandDarkest } }}
          >
            {t('agentFirewall.downloadCsv')}
          </Button>
          <Typography variant="caption" color="text.secondary">
            {report ? t('agentFirewall.generatedAt') + ` ${new Date(report.generatedAt).toLocaleString()}` : t('agentFirewall.exportLoadsFromBackend')}
          </Typography>
        </Box>
        <Box sx={{ mt: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1 }}>
          {chain.map(([step, detail], index) => (
            <Paper key={step} variant="outlined" sx={{ p: 1.5, borderRadius: 1.5 }}>
              <Typography variant="body2" fontWeight={850}>{index + 1}. {step}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, lineHeight: 1.55 }}>{detail}</Typography>
            </Paper>
          ))}
        </Box>
      </Box>
    </Paper>
  )
}
