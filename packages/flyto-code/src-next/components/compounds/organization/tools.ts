import {
  Building2, Users, UserCircle, User, Shield, Briefcase,
  Monitor, Cog, GitBranch, FlaskConical,
  Landmark, FolderTree, Crown, UserCheck,
  PenTool, GraduationCap,
  Wrench, Server, Database, Globe, FileText,
  type LucideIcon,
} from 'lucide-react'
import { t } from '@lib/i18n'
import type { ToolItem } from './types'

export const TOOL_DEFS: Omit<ToolItem, 'label'>[] = [
  // Organization structure
  { type: 'company',    icon: Landmark,       color: '#8b5cf6' },
  { type: 'department', icon: Building2,      color: '#818cf8' },
  { type: 'division',   icon: FolderTree,     color: '#6366f1' },
  { type: 'group',      icon: Users,          color: '#38bdf8' },
  // Roles
  { type: 'executive',  icon: Crown,          color: '#fbbf24' },
  { type: 'director',   icon: Shield,         color: '#f59e0b' },
  { type: 'manager',    icon: UserCheck,      color: '#fb923c' },
  { type: 'lead',       icon: UserCircle,     color: '#f97316' },
  { type: 'member',     icon: User,           color: '#34d399' },
  { type: 'intern',     icon: GraduationCap,  color: '#6ee7b7' },
  // Software roles
  { type: 'pm',         icon: Monitor,        color: '#22d3ee' },
  { type: 'designer',   icon: PenTool,        color: '#e879f9' },
  { type: 'engineer',   icon: Wrench,         color: '#60a5fa' },
  { type: 'qa',         icon: FlaskConical,   color: '#f87171' },
  { type: 'devops',     icon: Cog,            color: '#c084fc' },
  { type: 'sre',        icon: Server,         color: '#a855f7' },
  { type: 'dba',        icon: Database,       color: '#14b8a6' },
  { type: 'consultant', icon: Briefcase,      color: '#a3e635' },
  // Technical assets
  { type: 'repo',       icon: GitBranch,      color: '#4ade80' },
  { type: 'service',    icon: Globe,          color: '#2dd4bf' },
  { type: 'document',   icon: FileText,       color: '#fcd34d' },
]

const ICON_MAP: Record<string, LucideIcon> = {}
for (const d of TOOL_DEFS) {
  ICON_MAP[d.type] = d.icon
}

export function getTools(): ToolItem[] {
  return TOOL_DEFS.map((d) => ({ ...d, label: t(`org.tool.${d.type}`) }))
}

export function getIcon(type: string): LucideIcon {
  return ICON_MAP[type] ?? User
}
