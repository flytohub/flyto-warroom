import { FileText, Settings } from 'lucide-react'
import { defineModulePackage } from './boundary'

export const adminModules = defineModulePackage('admin', {
  edition: 'ce',
  exportable: true,
  mergeSurface: 'admin',
  moat: 'none',
  licenseTier: 'community',
}, [
// ── ADMIN (bottom of sidebar) ─────────────────────────────────
  {
    id: 'reports',
    path: 'reports',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/ReportsPage'),
    sidebar: { group: 'admin', labelKey: 'nav.reports', fallback: 'Reports', icon: FileText },
  },
  {
    id: 'va_report',
    path: 'va-report',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/VAReportPage'),
    sidebar: { group: 'admin', labelKey: 'nav.vaReport', fallback: 'VA Report', icon: FileText },
  },
  {
    id: 'settings',
    path: 'settings',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/SettingsPage'),
    sidebar: { group: 'admin', labelKey: 'settings.title', fallback: 'Settings', icon: Settings },
  },
])
