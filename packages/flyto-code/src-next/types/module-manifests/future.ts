import { Database, FileSearch, Globe, Share2, ShieldCheck, Smartphone } from 'lucide-react'
import { defineModulePackage } from './boundary'

export const futureModules = defineModulePackage('future', {
  edition: 'internal',
  exportable: false,
  mergeSurface: 'hidden',
  moat: 'none',
  licenseTier: 'enterprise',
}, [
// ── Coming-soon surfaces (no backend yet — honest placeholders). All
  // route to the single ComingSoonPage, resolved by path via the
  // comingSoonSurfaces registry. They are kept routed for future wiring,
  // but hidden + gated on their own page ids until the backend can provide
  // real data. Borrowing `posture_overview`/`cspm` made users see nav rows
  // that only rendered placeholders, which lowered the workspace signal.
  {
    id: 'social_media', path: 'social-media', capability: 'social_media', fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/ComingSoonPage'),
    sidebar: { group: 'hidden', labelKey: 'soon.socialMedia.title', fallback: 'Social Media Monitoring', icon: Share2 },
  },
  {
    id: 'mobile_apps', path: 'mobile-apps', capability: 'mobile_apps', fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/ComingSoonPage'),
    sidebar: { group: 'hidden', labelKey: 'soon.mobileApps.title', fallback: 'Mobile App Monitoring', icon: Smartphone },
  },
  {
    id: 'newly_registered_domains', path: 'newly-registered-domains', capability: 'newly_registered_domains', fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/ComingSoonPage'),
    sidebar: { group: 'hidden', labelKey: 'soon.nrd.title', fallback: 'Newly Registered Domains', icon: Globe },
  },
  {
    id: 'website_watermarking', path: 'website-watermarking', capability: 'website_watermarking', fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/ComingSoonPage'),
    sidebar: { group: 'hidden', labelKey: 'soon.watermark.title', fallback: 'Website Watermarking', icon: ShieldCheck },
  },
  {
    id: 'detection_rules', path: 'detection-rules', capability: 'detection_rules', fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/ComingSoonPage'),
    sidebar: { group: 'hidden', labelKey: 'soon.detectionRules.title', fallback: 'Threat Detection Rules', icon: FileSearch },
  },
  {
    id: 'cloud_storage_exposure', path: 'cloud-storage-exposure', capability: 'cloud_storage_exposure', fullBleed: true,
    lazyImport: () => import('@/app/(control-panel)/flyto/workspace/components/pages/ComingSoonPage'),
    sidebar: { group: 'hidden', labelKey: 'soon.cloudStorage.title', fallback: 'Cloud Storage Exposure', icon: Database },
  },
])
