/**
 * comingSoonSurfaces — registry of advertised surfaces whose backend
 * isn't built yet. Each renders an honest "coming soon" placeholder
 * (never a fake page with empty data). Extensible: add a surface =
 * one entry here + one MODULES entry pointing at ComingSoonPage.
 *
 * When a surface's backend ships, delete its entry here and point its
 * MODULES route at the real page instead.
 */
import type { LucideIcon } from 'lucide-react'
import { Share2, Smartphone, Globe, ShieldCheck, FileSearch, Database } from 'lucide-react'

export interface ComingSoonSurface {
  /** Route path under /projects/:orgId/ (last segment is the lookup key). */
  path: string
  Icon: LucideIcon
  titleKey: string
  titleFallback: string
  descKey: string
  descFallback: string
  /** Why it's not live yet (the honest note). */
  noteKey: string
  noteFallback: string
}

export const COMING_SOON_SURFACES: ComingSoonSurface[] = [
  {
    path: 'social-media',
    Icon: Share2,
    titleKey: 'soon.socialMedia.title', titleFallback: 'Social Media Monitoring',
    descKey: 'soon.socialMedia.desc', descFallback: 'Detect impersonating profiles, brand abuse and leaked content across social platforms.',
    noteKey: 'soon.socialMedia.note', noteFallback: 'Social-platform collectors are not connected yet.',
  },
  {
    path: 'mobile-apps',
    Icon: Smartphone,
    titleKey: 'soon.mobileApps.title', titleFallback: 'Mobile App Monitoring',
    descKey: 'soon.mobileApps.desc', descFallback: 'Find rogue and cloned apps impersonating your brand across app stores.',
    noteKey: 'soon.mobileApps.note', noteFallback: 'App-store enumeration is not wired yet.',
  },
  {
    path: 'newly-registered-domains',
    Icon: Globe,
    titleKey: 'soon.nrd.title', titleFallback: 'Newly Registered Domains',
    descKey: 'soon.nrd.desc', descFallback: 'Watch newly registered domains that look like yours, before they go live for phishing.',
    noteKey: 'soon.nrd.note', noteFallback: 'A domain-registration feed needs to be connected first.',
  },
  {
    path: 'website-watermarking',
    Icon: ShieldCheck,
    titleKey: 'soon.watermark.title', titleFallback: 'Website Watermarking',
    descKey: 'soon.watermark.desc', descFallback: 'Watermark your pages to detect cloned/scraped copies hosted elsewhere.',
    noteKey: 'soon.watermark.note', noteFallback: 'Watermark injection + match scanning is not built yet.',
  },
  {
    path: 'detection-rules',
    Icon: FileSearch,
    titleKey: 'soon.detectionRules.title', titleFallback: 'Threat Detection Rules',
    descKey: 'soon.detectionRules.desc', descFallback: 'Author and manage custom detection rules over the threat feeds and your assets.',
    noteKey: 'soon.detectionRules.note', noteFallback: 'MITRE technique mappings exist; the custom-rule engine isn’t exposed yet.',
  },
  {
    path: 'cloud-storage-exposure',
    Icon: Database,
    titleKey: 'soon.cloudStorage.title', titleFallback: 'Cloud Storage Exposure',
    descKey: 'soon.cloudStorage.desc', descFallback: 'Discover public buckets and exposed object storage leaking your data.',
    noteKey: 'soon.cloudStorage.note', noteFallback: 'Object-storage enumeration connectors are not wired yet.',
  },
]

export function comingSoonByPath(path: string): ComingSoonSurface | undefined {
  return COMING_SOON_SURFACES.find((s) => s.path === path)
}
