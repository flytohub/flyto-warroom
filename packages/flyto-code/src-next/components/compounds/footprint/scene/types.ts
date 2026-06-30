/**
 * Footprint scene — entity kind + display metadata.
 *
 * Extracted from FootprintGraphView.tsx as part of REFACTOR_PLAN
 * Phase 5 (split the 4100-line monolith). Pure data + tiny lookup
 * helpers; zero React/three dependency so anything in the scene
 * can import these without circular hazard.
 */

import {
  AtSign, Briefcase, Building2, Cpu, FileText, GitBranch, GitFork,
  Globe, Mail, Network as NetworkIcon, Newspaper, Server, Smartphone,
} from 'lucide-react'
import type { FootprintEntity } from '@lib/engine/code/footprintGraph'

/** Two ways an entity can render in the 3D scene.
 *  `chain` — attack-graph hop, lives on a depth shell + has edges.
 *  `standalone` — indicator / fingerprint / context. Floats
 *    independently, no edges drawn. */
export type EntityKind = 'chain' | 'standalone'

const ENTITY_KIND: Record<string, EntityKind> = {
  organization:  'chain',
  domain:        'chain',
  subdomain:     'chain',
  ip:            'chain',
  repo:          'chain',
  handle:        'chain',
  email_domain:  'chain',
  document:      'chain',
  lookalike:     'chain',
  sec_filing:    'chain',
  social_handle: 'chain',
  // Standalone — independent universe planets. Operators want to
  // SEE these so they know what tech the target uses, but they're
  // NOT part of any single attack-chain trace.
  technology:    'standalone',
  vendor:        'standalone',
  news_mention:  'standalone',
  app:           'standalone',
}

export function entityKind(t: string): EntityKind {
  return ENTITY_KIND[t] ?? 'chain'
}

export const TYPE_META: Record<string, { Icon: typeof Globe; label: string }> = {
  organization: { Icon: Building2,   label: 'Organization' },
  domain:       { Icon: Globe,       label: 'Domain' },
  subdomain:    { Icon: GitFork,     label: 'Subdomain' },
  ip:           { Icon: NetworkIcon, label: 'IP' },
  asn:          { Icon: Server,      label: 'ASN' },
  repo:         { Icon: GitBranch,   label: 'Repo' },
  handle:       { Icon: AtSign,      label: 'Handle' },
  email_domain: { Icon: Mail,        label: 'Email domain' },
  vendor:       { Icon: Briefcase,   label: 'Vendor' },
  app:          { Icon: Smartphone,  label: 'App' },
  document:     { Icon: FileText,    label: 'Document' },
  news_mention: { Icon: Newspaper,   label: 'News mention' },
  technology:   { Icon: Cpu,         label: 'Technology' },
}

export function typeMeta(t: string) {
  return TYPE_META[t] ?? { Icon: Globe, label: t }
}

/** Legacy attack_surface rows mirrored when an API key was missing
 *  (e.g. HIBP). Backend filter drops them on new runs but old rows
 *  persist; hide client-side so customers don't see them. */
export function isInconclusiveDocument(e: FootprintEntity): boolean {
  if (e.type !== 'document') return false
  const n = e.canonical_name.toLowerCase()
  return n.includes('not assessed') || n.includes('missing:') || n.includes('api_key)')
}
