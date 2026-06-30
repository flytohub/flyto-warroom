/**
 * Data source registry — auto-collected from engine modules.
 *
 * Each engine module (repos.ts, security.ts, etc.) exports its own
 * REPORT_SOURCES array. This file just aggregates them and adds icons.
 *
 * TO ADD A NEW DATASOURCE:
 *   1. Go to the engine module where your fetcher lives (e.g. lib/engine/security.ts)
 *   2. Add an entry to its *_REPORT_SOURCES array
 *   3. Done — it appears in the report builder automatically
 *
 * You do NOT need to edit this file.
 */

import {
  Heart, Shield, Activity, Network, Package, GitBranch,
  AlertTriangle, Skull, Wrench, Server, Lock, Scale,
  Globe, TrendingUp, Award, Bug, Cloud, Radio,
  Radar, BarChart3, FileText, Eye,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { DataSourceDef, FieldDef } from './types'
import type { ReportSourceMeta, SourceCategory } from '@lib/engine'

// ── Import all module REPORT_SOURCES ──
import { REPOS_REPORT_SOURCES } from '@lib/engine'
import { ISSUES_REPORT_SOURCES } from '@lib/engine'
import { ARCH_REPORT_SOURCES } from '@lib/engine'
import { SECURITY_REPORT_SOURCES } from '@lib/engine'
import { AUTOFIX_REPORT_SOURCES } from '@lib/engine'
import { CI_REPORT_SOURCES } from '@lib/engine'
import { PENTEST_REPORT_SOURCES } from '@lib/engine'
import { SCORING_REPORT_SOURCES } from '@lib/engine'
import { COMPLIANCE_REPORT_SOURCES } from '@lib/engine'
import { MONITORING_REPORT_SOURCES } from '@lib/engine'
import { FOOTPRINT_REPORT_SOURCES } from '@lib/engine/code/footprintSurface'

// ── Collect all sources ──
const ALL_SOURCES: ReportSourceMeta[] = [
  ...REPOS_REPORT_SOURCES,
  ...ISSUES_REPORT_SOURCES,
  ...ARCH_REPORT_SOURCES,
  ...SECURITY_REPORT_SOURCES,
  ...AUTOFIX_REPORT_SOURCES,
  ...CI_REPORT_SOURCES,
  ...PENTEST_REPORT_SOURCES,
  ...SCORING_REPORT_SOURCES,
  ...COMPLIANCE_REPORT_SOURCES,
  ...MONITORING_REPORT_SOURCES,
  ...FOOTPRINT_REPORT_SOURCES,
]

// ── Icon mapping per source ID (overrides) + category defaults ──

const SOURCE_ICONS: Record<string, LucideIcon> = {
  'health-summary': Heart,
  'issues': Shield,
  'pulse': Activity,
  'arch-map': Network,
  'dependencies': Package,
  'enriched-deps': Package,
  'taint-flows': AlertTriangle,
  'dead-code': Skull,
  'autofix': Wrench,
  'autofix-runs': Wrench,
  'ci-checks': GitBranch,
  'containers': Server,
  'iac': Lock,
  'licenses': Scale,
  'attack-surface': Globe,
  'scan-diff': TrendingUp,
  'score-history': TrendingUp,
  'computed-score': Award,
  'compliance-matrix': Lock,
  'malware': Bug,
  'cspm': Cloud,
  'runtime-events': Radio,
  'pentest-projects': Radar,
  'scan-log': BarChart3,
  'score-events': TrendingUp,
  'monitoring-events': Eye,
  'api-definitions': Network,
  'research-footprints': FileText,
}

const CATEGORY_ICONS: Record<SourceCategory, LucideIcon> = {
  health: Heart,
  security: Shield,
  architecture: Network,
  compliance: Lock,
  ci: GitBranch,
  external: Globe,
}

const REQUIRED_PAGE_BY_SOURCE: Record<string, string> = {
  'health-summary': 'repos',
  'scan-log': 'repos',
  'issues': 'issues',
  'pulse': 'pulse',
  'arch-map': 'warroom_architecture',
  'dependencies': 'warroom_architecture',
  'enriched-deps': 'warroom_architecture',
  'taint-flows': 'warroom_architecture',
  'dead-code': 'warroom_architecture',
  'api-definitions': 'warroom_architecture',
  'autofix': 'autofix',
  'autofix-runs': 'autofix',
  'ci-checks': 'warroom_cicd',
  'containers': 'containers',
  'iac': 'issues',
  'licenses': 'issues',
  'malware': 'issues',
  'cspm': 'cspm',
  'runtime-events': 'mcp',
  'scan-diff': 'warroom_architecture',
  'score-history': 'scoring',
  'computed-score': 'scoring',
  'score-events': 'scoring',
  'compliance-matrix': 'compliance',
  'attack-surface': 'domains',
  'pentest-projects': 'pentest',
  'monitoring-events': 'domains',
  'research-footprints': 'domains',
}

// ── Convert ReportSourceMeta → DataSourceDef ──

function toDataSourceDef(meta: ReportSourceMeta): DataSourceDef {
  return {
    id: meta.id,
    name: meta.name,
    nameKey: meta.nameKey,
    category: meta.category as DataSourceDef['category'],
    icon: SOURCE_ICONS[meta.id] ?? CATEGORY_ICONS[meta.category] ?? FileText,
    requiredPage: meta.requiredPage ?? REQUIRED_PAGE_BY_SOURCE[meta.id],
    fetcher: meta.fetcher,
    rowsPath: meta.rowsPath,
    joinableOn: meta.joinableOn,
    fields: meta.fields as FieldDef[],
  }
}

export const DATA_SOURCES: DataSourceDef[] = ALL_SOURCES.map(toDataSourceDef)

export const DATA_SOURCE_MAP: Record<string, DataSourceDef> = Object.fromEntries(
  DATA_SOURCES.map(ds => [ds.id, ds])
)

export interface ReportDataSourceGate {
  ready: boolean
  canSeePage: (page: string) => boolean
}

export function canUseDataSource(ds: DataSourceDef | undefined, gate: ReportDataSourceGate): boolean {
  if (!ds?.requiredPage) return true
  if (!gate.ready) return false
  return gate.canSeePage(ds.requiredPage)
}

export function blockedDataSourceMessage(ds: DataSourceDef): string {
  return `Data source requires access to ${ds.requiredPage ?? 'the backing module'}`
}

export const DATA_SOURCE_CATEGORIES = [
  { id: 'health' as const, label: 'Health', labelKey: 'reports.dsCat.health' },
  { id: 'security' as const, label: 'Security', labelKey: 'reports.dsCat.security' },
  { id: 'architecture' as const, label: 'Architecture', labelKey: 'reports.dsCat.architecture' },
  { id: 'compliance' as const, label: 'Compliance', labelKey: 'reports.dsCat.compliance' },
  { id: 'ci' as const, label: 'CI/CD', labelKey: 'reports.dsCat.ci' },
  { id: 'external' as const, label: 'External', labelKey: 'reports.dsCat.external' },
] as const
