// Shared types and tab metadata for the AutoFix war-room.
// Split from AutofixView.tsx (was 665 LOC).

import {
  Box, Code2, FileCode, History, Package,
  Settings as SettingsIcon, Sparkles, Target, Wand2, Wrench,
} from 'lucide-react'

export type Tab =
  // Category tabs (findings filtered by rule_category)
  | 'dependencies' | 'sast' | 'iac' | 'pentest' | 'containers'
  // Admin-only utility tabs
  | 'audit' | 'promotion' | 'settings' | 'remediation'

export interface RuleRow {
  id: string
  version: string
  title: string
  category: string
  severity: string
  description: string
  enabled: boolean
  auto_merge: boolean
  daily_quota: number
}

export interface TabDef {
  id: Tab
  icon: typeof Wand2
  labelKey: string
  defaultLabel: string
  /** Mapped to AutofixFindingRow.rule_category — empty for non-category tabs. */
  category?: string
  /** Hidden from member / guest users. Engine endpoints behind these
   *  tabs require admin role anyway; rendering them for non-admins
   *  produces 403 noise. */
  adminOnly?: boolean
}

export const TABS: TabDef[] = [
  { id: 'dependencies', icon: Package,      labelKey: 'tabDeps',       defaultLabel: 'Dependencies', category: 'dependencies' },
  { id: 'sast',         icon: Code2,        labelKey: 'tabSast',       defaultLabel: 'SAST',         category: 'sast' },
  { id: 'iac',          icon: FileCode,     labelKey: 'tabIac',        defaultLabel: 'IaC',          category: 'iac' },
  { id: 'pentest',      icon: Target,       labelKey: 'tabPentest',    defaultLabel: 'Pentest',      category: 'pentest' },
  { id: 'containers',   icon: Box,          labelKey: 'tabContainers', defaultLabel: 'Containers',   category: 'containers' },
  { id: 'remediation',  icon: Wrench,       labelKey: 'tabRemediation', defaultLabel: '' },
  { id: 'audit',        icon: History,      labelKey: 'tabAudit',      defaultLabel: 'Audit' },
  { id: 'promotion',    icon: Sparkles,     labelKey: 'tabPromotion',  defaultLabel: 'Promotion',    adminOnly: true },
  { id: 'settings',     icon: SettingsIcon, labelKey: 'tabSettings',   defaultLabel: 'Settings',     adminOnly: true },
]
