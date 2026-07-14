import { AlertTriangle, Bug, Cpu, Database, KeyRound, Map, Shield } from 'lucide-react'
import { defineModulePackage } from './boundary'

export const darkwebModules = defineModulePackage('darkweb', {
  edition: 'ce',
  exportable: true,
  mergeSurface: 'darkweb',
  moat: 'none',
  licenseTier: 'community',
}, [
// ── DARKWEB & THREAT INTEL ────────────────────────────────────
  {
    id: 'threat_actors',
    path: 'threat-actors',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/ThreatActorsPage'),
    sidebar: { group: 'darkweb', labelKey: 'nav.threatActors', fallback: 'Threat Actors', icon: Bug },
  },
  {
    id: 'malware_families',
    path: 'malware-families',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/MalwareFamiliesPage'),
    sidebar: { group: 'darkweb', labelKey: 'nav.malwareFamilies', fallback: 'Malware Families', icon: Cpu },
  },
  {
    id: 'ransomware_incidents',
    path: 'ransomware-incidents',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/RansomwarePage'),
    sidebar: { group: 'darkweb', labelKey: 'nav.ransomware', fallback: 'Ransomware', icon: AlertTriangle },
  },
  {
    // Data Leaks — leaked-credential / breach exposure (HIBP). Promoted
    // from a buried Posture-Overview tab to a first-class page. Gated on the
    // existing `posture_overview` page id (external posture data) so no
    // backend change is needed.
    id: 'data_leaks',
    path: 'data-leaks',
    capability: 'posture_overview',
    fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/DataLeaksPage'),
    sidebar: { group: 'darkweb', labelKey: 'nav.dataLeaks', fallback: 'Data Leaks', icon: KeyRound },
  },
  {
    id: 'ioc_lookup',
    path: 'ioc-lookup',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/IoCLookupPage'),
    sidebar: { group: 'darkweb', labelKey: 'nav.iocLookup', fallback: 'IoC Lookup', icon: Database },
  },
  {
    id: 'sensor_map',
    path: 'sensor-map',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/SensorMapPage'),
    sidebar: { group: 'darkweb', labelKey: 'nav.sensorMap', fallback: 'Sensor Map', icon: Map },
  },
  {
    id: 'brand_protection',
    path: 'brand-protection',
    fullBleed: true,
    dualMode: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/BrandProtectionPage'),
    sidebar: { group: 'darkweb', labelKey: 'nav.brandProtection', fallback: 'Brand Protection', icon: Shield },
  },
  {
    // BotShield — botnet/C2 indicators (real: IoC view pinned to kind=c2).
    id: 'botshield', path: 'botshield', capability: 'ioc_lookup', fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/BotShieldPage'),
    sidebar: { group: 'darkweb', labelKey: 'botshield.title', fallback: 'BotShield', icon: Bug },
  },
])
