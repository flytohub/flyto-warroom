import type { Module } from '../Module'
import { overviewModules } from './overview'
import { assetsModules } from './assets'
import { codeModules } from './code'
import { exposureModules } from './exposure'
import { cloudModules } from './cloud'
import { runtimeModules } from './runtime'
import { identityModules } from './identity'
import { operationsModules } from './operations'
import { darkwebModules } from './darkweb'
import { historyModules } from './history'
import { scoringModules } from './scoring'
import { adminModules } from './admin'
import { hiddenModules } from './hidden'

export const MODULE_PACKAGE_ORDER = [
  'overview',
  'assets',
  'code',
  'exposure',
  'cloud',
  'runtime',
  'identity',
  'operations',
  'darkweb',
  'history',
  'scoring',
  'admin',
  'hidden',
] as const

export const MODULES: Module[] = [
  ...overviewModules,
  ...assetsModules,
  ...codeModules,
  ...exposureModules,
  ...cloudModules,
  ...runtimeModules,
  ...identityModules,
  ...operationsModules,
  ...darkwebModules,
  ...historyModules,
  ...scoringModules,
  ...adminModules,
  ...hiddenModules,
]

/** Ordered list of sidebar groups for rendering. Groups not listed
 *  here (notably `hidden`) are filtered out of the sidebar. */
export const SIDEBAR_GROUP_ORDER: { id: Exclude<import('../Module').ModuleGroup, 'hidden'>; headerKey: string; headerFallback: string; showHeader: boolean }[] = [
  { id: 'overview', headerKey: '',                    headerFallback: '',                   showHeader: false },
  { id: 'assets',   headerKey: 'nav.assets',          headerFallback: 'Assets',             showHeader: true  },
  { id: 'code',     headerKey: 'nav.codeSection',     headerFallback: 'Code',               showHeader: true  },
  { id: 'exposure', headerKey: 'nav.exposureSection', headerFallback: 'Exposure',           showHeader: true  },
  { id: 'cloud',    headerKey: 'nav.cloudSection',    headerFallback: 'Cloud',              showHeader: true  },
  { id: 'runtime',  headerKey: 'nav.agentFirewallSection', headerFallback: 'Agent Firewall', showHeader: true  },
  { id: 'identity', headerKey: 'nav.identitySection', headerFallback: 'Identity',           showHeader: true  },
  { id: 'darkweb',  headerKey: 'nav.darkwebSection',  headerFallback: 'Darkweb & Threat Intel', showHeader: true  },
  { id: 'history',  headerKey: 'nav.historySection',  headerFallback: 'History',            showHeader: true  },
  { id: 'scoring',  headerKey: 'nav.scoringSection',  headerFallback: 'Scoring',            showHeader: true  },
  { id: 'operations', headerKey: 'nav.operationsSection', headerFallback: 'Operations',     showHeader: true  },
  { id: 'admin',    headerKey: '',                    headerFallback: '',                   showHeader: false },
]

/** Strip dynamic suffixes (`/:repoId`, `/*` splat) from a module path,
 *  yielding the stable nav/base segment. `repos/:repoId` → `repos`,
 *  `architecture/*` → `architecture`, `dashboard` → `dashboard`. */
export function navPath(path: string): string {
  return path.replace(/\/(:|\*).*$/, '')
}

/** Lookup: paths needing `overflow: hidden` outer shell.
 *  Derived from MODULES so adding a new entry auto-populates. */
export function getFullBleedPaths(): string[] {
  return MODULES.filter(m => m.fullBleed).map(m => '/' + navPath(m.path))
}

/** Lookup: paths exposing the workspace Manager / Engineer switch.
 *  Derived from MODULES for the same reason as full-bleed paths:
 *  page metadata should not drift into toolbar-specific lists. */
export function getDualModePaths(): string[] {
  return MODULES.filter(m => m.dualMode).map(m => '/' + navPath(m.path))
}

export function isDualModeWorkspacePath(path: string): boolean {
  const pathname = (path.startsWith('/') ? path : `/${path}`).split(/[?#]/, 1)[0]
  return getDualModePaths().some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

/** Lookup: modules by sidebar group (drops hidden entries). */
export function getModulesByGroup(group: import('../Module').ModuleGroup): Module[] {
  return MODULES.filter(m => m.sidebar?.group === group)
}

export function getModulesByPackage(packageName: import('../Module').ModulePackage): Module[] {
  return MODULES.filter(m => m.boundary?.package === packageName)
}
