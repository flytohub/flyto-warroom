import { Activity, Bot, ClipboardCheck, Database, FileSearch, FlaskConical, RadioTower, Smartphone } from 'lucide-react'
import { defineModulePackage } from './boundary'

export const runtimeModules = defineModulePackage('runtime', {
  edition: 'ce',
  exportable: true,
  mergeSurface: 'runtime',
  moat: 'none',
  licenseTier: 'community',
}, [
// ── AGENT FIREWALL (MCP transport) ──────────────────────────────────
  // Active Agent Firewall surface: setup/test connection, policy simulation,
  // rollout control, recent decisions, and egress-risk drilldowns. Gated on
  // the `mcp` page id so entitlement keeps matching backend capability state.
  {
    id: 'ai_security_center',
    path: 'agent-firewall/security-center',
    capability: 'mcp',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/AISecurityCenterPage'),
    sidebar: { group: 'runtime', labelKey: 'nav.aiSecurityCenter', fallback: 'AI Security Center', icon: RadioTower },
  },
  {
    id: 'agent_firewall_attack_lab',
    path: 'agent-firewall/attack-lab',
    capability: 'mcp',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/AgentFirewallAttackLabPage'),
    sidebar: { group: 'runtime', labelKey: 'nav.agentAttackLab', fallback: 'Attack Lab', icon: FlaskConical },
  },
  {
    id: 'ai_governance',
    path: 'agent-firewall/governance',
    capability: 'mcp',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/AIGovernancePage'),
    sidebar: { group: 'runtime', labelKey: 'nav.aiGovernance', fallback: 'AI Governance', icon: ClipboardCheck },
  },
  {
    id: 'mcp',
    path: 'mcp',
    capability: 'mcp',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/McpPage'),
    sidebar: { group: 'runtime', labelKey: 'nav.agentFirewall', fallback: 'Agent Firewall', icon: Bot },
  },
  {
    id: 'agent_firewall_activity',
    path: 'agent-firewall/activity',
    capability: 'mcp',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/AgentFirewallActivityPage'),
    sidebar: { group: 'runtime', labelKey: 'nav.agentActivity', fallback: 'Agent Activity', icon: Activity },
  },
  {
    id: 'shadow_ai',
    path: 'agent-firewall/shadow-ai',
    capability: 'mcp',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/ShadowAIPage'),
    sidebar: { group: 'runtime', labelKey: 'nav.shadowAI', fallback: 'Shadow AI', icon: Smartphone },
  },
  {
    id: 'ai_dlp',
    path: 'agent-firewall/ai-dlp',
    capability: 'mcp',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/AIDLPPage'),
    sidebar: { group: 'runtime', labelKey: 'nav.aiDLP', fallback: 'AI DLP', icon: Database },
  },
  {
    id: 'ai_evidence_reports',
    path: 'agent-firewall/evidence',
    capability: 'mcp',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/EvidenceReportsPage'),
    sidebar: { group: 'runtime', labelKey: 'nav.aiEvidenceReports', fallback: 'Evidence Reports', icon: FileSearch },
  },
])
