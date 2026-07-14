import { Building } from 'lucide-react'
import { defineModulePackage } from './boundary'

export const enterpriseModules = defineModulePackage('enterprise', {
  edition: 'enterprise',
  exportable: false,
  mergeSurface: 'enterprise',
  moat: 'enterprise-control-plane',
  licenseTier: 'enterprise',
}, [
{
    id: 'enterprise_control_plane',
    path: 'enterprise-control-plane',
    capability: 'compliance',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/EnterpriseControlPlanePage'),
    sidebar: { group: 'enterprise', labelKey: 'nav.enterpriseControlPlane', fallback: 'Enterprise Control', icon: Building },
  },
])
