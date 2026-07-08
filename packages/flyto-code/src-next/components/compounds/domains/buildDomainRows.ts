import { t, tOr } from '@lib/i18n'
import type { AttackSurfaceAsset, PentestProject } from '@lib/engine'
import type { PRRef, PentestRef } from '@lib/engine'
import { extractHostFromAssetValue, type ExternalFinding, type KernelAsset } from '@compounds/_shared/externalPosture'
import { PROJECT_TYPES, type DomainRow } from './types'

/** Per-domain score/grade row from `external-posture.domains[]`.
 *  Kept minimal so the caller can pass either the full DomainPosture
 *  shape or a stripped lookup map. */
export interface DomainScoreLookup {
  domain: string
  score: number
  grade: string
  pending_score?: number
  pending_grade?: string
}

export function flattenAttackSurfaceAssets(rows: AttackSurfaceAsset[]): AttackSurfaceAsset[] {
  const out: AttackSurfaceAsset[] = []
  const seen = new Set<string>()
  const add = (asset: AttackSurfaceAsset | undefined) => {
    if (!asset) return
    const key = asset.id || `${asset.resource_id ?? ''}|${asset.asset_type}|${asset.value}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(asset)
  }
  for (const row of rows) {
    add(row)
    for (const child of row.assets ?? []) add(child)
  }
  return out
}

function parseAssetScope(asset?: AttackSurfaceAsset): Pick<DomainRow, 'scopeBucket' | 'activeGateStatus' | 'requiredAction'> {
  if (!asset?.metadata) return {}
  try {
    const meta = JSON.parse(asset.metadata) as { scope_bucket?: string; active_gate_status?: string; required_action?: string }
    return {
      scopeBucket: meta.scope_bucket,
      activeGateStatus: meta.active_gate_status,
      requiredAction: meta.required_action,
    }
  } catch {
    return {}
  }
}

function isConfirmedKernelAsset(asset: KernelAsset): boolean {
  const tier = asset.current_tier?.toLowerCase()
  // /external-posture/kernel is already the confirmed external-surface
  // read model. Confidence is evidence strength, not an inventory gate:
  // the engine can legitimately return active domains at 85/92 confidence.
  // Only hide rows the backend explicitly marks as non-promoted leads.
  if (!tier || tier === 'unranked' || tier === 'confirmed') return true
  return !['candidate', 'lead', 'weak', 'rejected', 'suppressed', 'noise'].includes(tier)
}

/** Aggregate assets into domain-level rows with generated security issues.
 *  `postureDomains` is optional — when provided, each row gets the
 *  backend's authoritative score/grade so the UI doesn't recompute
 *  (which historically drifted from the unified scoring engine and
 *  produced rows where the same domain showed `D 50` in the list and
 *  `A 89` on Scoring Overview). */
export function buildDomainRows(
  assets: AttackSurfaceAsset[],
  projects: PentestProject[],
  postureDomains?: DomainScoreLookup[],
  kernelAssets?: KernelAsset[],
  // When true (operator toggled "show unverified candidates"), keep
  // Footprint-discovered rows that the ghost-defense below would
  // normally drop, marking them 'inconclusive' so they render with the
  // unverified "?" chip instead of vanishing.
  includeCandidates = false,
): DomainRow[] {
  const domainMap = new Map<string, Omit<DomainRow, 'domain'>>()

  // Start with projects
  for (const p of projects) {
    const domain = p.target_url.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    domainMap.set(domain, {
      url: p.target_url,
      type: PROJECT_TYPES.find(t => t.id === p.project_type)?.nameKey ?? 'pentest.frontend',
      project: p,
      assets: [],
      issues: [],
      lastScan: '',
      scopeBucket: p.scope_bucket,
      activeGateStatus: p.active_gate_status,
      requiredAction: p.required_action,
    })
  }

  // Add resolving subdomains. Each discovered subdomain inherits its
  // parent's pentest project so the AI / pentest / verify tabs that
  // need a projectId have one to query — without this, clicking a
  // discovered subdomain landed on "尚未綁定專案" because the row
  // was constructed without a project ref. Lookup is by the asset's
  // project_id; falls back to nil when the asset somehow lacks one
  // (older row, race, etc.) and the AI tab will still show the
  // not-bound message for that single subdomain.
  const projectsByID = new Map<string, PentestProject>()
  for (const p of projects) projectsByID.set(p.id, p)
  const projectsByDomain = new Map<string, PentestProject>()
  for (const p of projects) projectsByDomain.set(extractHostFromAssetValue(p.target_url), p)

  for (const a of assets) {
    if (a.asset_type === 'subdomain') {
      // Verification-ledger status takes precedence over the legacy
      // metadata.resolves check (Phase 3 bridge writes 'active' for
      // confirmed, 'inconclusive' for unverified, 'refuted' for
      // ghosts). Skip refuted entirely; surface inconclusive with
      // a flag so the table can render a "?" chip. Legacy rows
      // (pre-Phase 3) carry no asset.status at all — treat as active.
      const status = (a.status as 'active' | 'inconclusive' | 'refuted' | undefined) ?? 'active'
      if (status === 'refuted') continue

      let meta: { resolves?: boolean } = {}
      try { meta = JSON.parse(a.metadata) } catch { /* invalid JSON */ }
      // For inconclusive rows from the bridge there's no `resolves`
      // field — accept them too. The .resolves gate was the pre-Phase-3
      // ghost defense and is now superseded by the engine consensus.
      let effectiveStatus = status
      if (status === 'active' && !meta.resolves) {
        // Old-shape active row with explicit non-resolving metadata —
        // normally a pre-fix ghost we skip. When the operator opts into
        // candidates, surface it instead, marked 'inconclusive' so the
        // table renders the unverified "?" chip rather than dropping it.
        if (!includeCandidates) continue
        effectiveStatus = 'inconclusive'
      }
      if (!domainMap.has(a.value)) {
        const parent = a.project_id ? projectsByID.get(a.project_id) : undefined
        domainMap.set(a.value, {
          url: `https://${a.value}`,
          type: 'pentest.frontend',
          project: parent,
          assets: [],
          issues: [],
          lastScan: '',
          verifierStatus: effectiveStatus,
          ...(parent?.scope_bucket
            ? { scopeBucket: parent.scope_bucket, activeGateStatus: parent.active_gate_status, requiredAction: parent.required_action }
            : parseAssetScope(a)),
        })
      }
    }
  }

  const kernelByDomain = new Map<string, KernelAsset>()
  if (kernelAssets) {
    for (const asset of kernelAssets) {
      const domain = extractHostFromAssetValue(asset.canonical_value)
      if (!domain) continue
      kernelByDomain.set(domain, asset)
      if (!domainMap.has(domain)) {
        const project = projectsByDomain.get(domain)
        const confirmed = Boolean(project) || isConfirmedKernelAsset(asset)
        if (!confirmed && !includeCandidates) continue
        domainMap.set(domain, {
          url: asset.type === 'ip' ? `http://${domain}` : `https://${domain}`,
          type: project ? PROJECT_TYPES.find(t => t.id === project.project_type)?.nameKey ?? 'pentest.frontend' : 'pentest.attackSurface',
          project,
          assets: [],
          issues: [],
          lastScan: '',
          verifierStatus: confirmed ? undefined : 'inconclusive',
          scopeBucket: project?.scope_bucket ?? (confirmed ? undefined : 'candidate'),
          activeGateStatus: project?.active_gate_status,
          requiredAction: project?.required_action,
        })
      }
    }
  }

  // Assign assets to domains by EXACT host match.
  //
  // The previous logic used `a.value.includes(domain)` — substring
  // matching. That bled blog.flyto2.com's http_endpoint asset into
  // flyto2.com's row (because "https://blog.flyto2.com".includes(
  // "flyto2.com") is true), which made `buildHeadersTile` read the
  // wrong domain's headers and report HSTS missing when the apex
  // actually had it set. Now: parse the host out of the asset
  // value and compare exactly.
  for (const a of assets) {
    const host = extractHostFromAssetValue(a.value)
    if (!host) continue
    const row = domainMap.get(host)
    if (row) row.assets.push(a)
  }

  for (const [, row] of domainMap) {
    if (!row.scopeBucket) {
      const scoped = row.assets.map(parseAssetScope).find(s => s.scopeBucket)
      if (scoped) {
        row.scopeBucket = scoped.scopeBucket
        row.activeGateStatus = scoped.activeGateStatus
        row.requiredAction = scoped.requiredAction
      }
    }
  }

  if (kernelAssets) {
    for (const [domain, row] of domainMap) {
      row.issues = findingsToDomainIssues(kernelByDomain.get(domain)?.findings ?? [])
    }
  } else {
    // Legacy fallback for tests/offline callers that have not been
    // migrated to /external-posture/kernel yet.
    for (const [, row] of domainMap) {
      generateHTTPIssues(row)
      generateDNSIssues(row)
      generatePortIssues(row)
      generateSSLIssues(row)
      generateSensitiveFileIssues(row)
    }
  }

  // Compute last scan time
  for (const [domain, row] of domainMap) {
    let latest = ''
    for (const a of row.assets) {
      if (a.discovered_at > latest) latest = a.discovered_at
    }
    const kernelScan = kernelByDomain.get(domain)?.last_scanned ?? ''
    row.lastScan = [latest, kernelScan, row.project?.last_scan_at ?? ''].filter(Boolean).sort().at(-1) ?? ''
  }

  // Propagate cross-dim signals from enriched assets to domain rows.
  // Each asset may carry signals from ?enrich=true; we aggregate per domain.
  for (const [, row] of domainMap) {
    const allPRs: PRRef[] = []
    let bestPentest: PentestRef | null = null
    let maxBlast = 0

    for (const a of row.assets) {
      const ea = a as AttackSurfaceAsset & {
        open_prs_touching?: PRRef[]
        pentest_verdict?: PentestRef | null
        blast_radius?: number
      }
      if (ea.open_prs_touching) allPRs.push(...ea.open_prs_touching)
      if (ea.pentest_verdict) {
        if (!bestPentest || (ea.pentest_verdict.critical_count ?? 0) > (bestPentest.critical_count ?? 0)) {
          bestPentest = ea.pentest_verdict
        }
      }
      if (typeof ea.blast_radius === 'number' && ea.blast_radius > maxBlast) {
        maxBlast = ea.blast_radius
      }
    }

    // Dedupe PRs by number
    const seen = new Set<number>()
    const dedupedPRs = allPRs.filter(p => { if (seen.has(p.number)) return false; seen.add(p.number); return true })
    if (dedupedPRs.length > 0) row.open_prs_touching = dedupedPRs
    if (bestPentest) row.pentest_verdict = bestPentest
    if (maxBlast > 0) row.blast_radius = maxBlast
  }

  // Merge backend score/grade into each row. The lookup is by exact
  // domain match — if a row has no posture entry (e.g. a freshly-
  // added subdomain whose first scan hasn't completed), score stays
  // undefined and the UI shows "scoring…" rather than a fake number.
  const scoreByDomain = new Map<string, DomainScoreLookup>()
  if (postureDomains) {
    for (const d of postureDomains) scoreByDomain.set(d.domain, d)
  }

  return Array.from(domainMap.entries())
    .map(([domain, row]) => {
      const hit = scoreByDomain.get(domain)
      const kernel = kernelByDomain.get(domain)
      return {
        domain,
        ...row,
        // Carry the kernel resource_id so the Domains UI can scan a
        // footprint-discovered domain (project-less) via the per-asset
        // scan endpoint, which resolves kernel-first.
        resourceId: kernel?.resource_id,
        score: kernel?.score ?? hit?.score,
        grade: kernel?.grade ?? hit?.grade,
        pending_score: hit?.pending_score,
        pending_grade: hit?.pending_grade,
      }
    })
    .sort((a, b) => {
      const ai = a.issues.length, bi = b.issues.length
      if (ai !== bi) return bi - ai
      return a.domain.localeCompare(b.domain)
    })
}

function findingsToDomainIssues(findings: ExternalFinding[]) {
  return findings.map(finding => ({
    title: tOr(finding.title_key, finding.title_key),
    desc: tOr(finding.desc_key, finding.desc_key),
    severity: finding.severity,
    category: finding.category,
  }))
}

function generateHTTPIssues(row: Omit<DomainRow, 'domain'>) {
  const httpAssets = row.assets.filter(a => a.asset_type === 'http_endpoint')
  const httpsAsset = httpAssets.find(a => { try { return JSON.parse(a.metadata).scheme === 'https' } catch { return false } })
  const httpAsset = httpAssets.find(a => { try { return JSON.parse(a.metadata).scheme === 'http' } catch { return false } })

  if (httpsAsset) {
    let meta: { headers?: Record<string, string> } = {}
    try { meta = JSON.parse(httpsAsset.metadata) } catch { /* invalid JSON */ }
    const h = meta.headers ?? {}

    if (!h['Strict-Transport-Security']) row.issues.push({ title: t('dast.hstsNotSet'), desc: t('dast.hstsNotSetDesc'), severity: 'HIGH', category: 'frontend' })
    if (!h['Content-Security-Policy']) row.issues.push({ title: t('dast.cspNotSet'), desc: t('dast.cspNotSetDesc'), severity: 'HIGH', category: 'frontend' })
    if (h['Server']) row.issues.push({ title: t('dast.serverLeak'), desc: `${t('dast.serverLeakDesc')}: ${h['Server']}`, severity: 'LOW', category: 'frontend' })
    if (h['X-Powered-By']) row.issues.push({ title: t('dast.poweredByLeak'), desc: `${t('dast.poweredByLeakDesc')}: ${h['X-Powered-By']}`, severity: 'MEDIUM', category: 'frontend' })
    if (!h['X-Content-Type-Options']) row.issues.push({ title: t('dast.noSniff'), desc: t('dast.noSniffDesc'), severity: 'MEDIUM', category: 'frontend' })
    if (!h['X-Frame-Options'] && !h['Content-Security-Policy']?.includes('frame-ancestors'))
      row.issues.push({ title: t('dast.clickjacking'), desc: t('dast.clickjackingDesc'), severity: 'MEDIUM', category: 'frontend' })
  }

  if (httpAsset) {
    let meta: { status?: number } = {}
    try { meta = JSON.parse(httpAsset.metadata) } catch { /* invalid JSON */ }
    if (meta.status && meta.status !== 301 && meta.status !== 302)
      row.issues.push({ title: t('dast.httpOnly'), desc: t('dast.httpOnlyDesc'), severity: 'HIGH', category: 'frontend' })
  }
}

function generateDNSIssues(row: Omit<DomainRow, 'domain'>) {
  const dnsSecAsset = row.assets.find(a => a.asset_type === 'dns_security')
  if (!dnsSecAsset) return
  let m: { spf?: boolean; dmarc?: boolean; dnssec?: boolean; caa?: boolean; axfr_vulnerable?: boolean } = {}
  try { m = JSON.parse(dnsSecAsset.metadata) } catch { /* invalid JSON */ }
  // SPF/DMARC only apply to a mail domain. Mirror the backend scoring's
  // mx_count>0 gate so non-mail subdomains aren't flagged as noise.
  let hasMail = true
  const emailAsset = row.assets.find(a => a.asset_type === 'email_security')
  if (emailAsset) {
    try { const em = JSON.parse(emailAsset.metadata); if (typeof em.mx_count === 'number' && em.mx_count === 0) hasMail = false } catch { /* keep default */ }
  }
  if (hasMail && !m.spf) row.issues.push({ title: t('dast.noSpf'), desc: t('dast.noSpfDesc'), severity: 'MEDIUM', category: 'attack_surface' })
  if (hasMail && !m.dmarc) row.issues.push({ title: t('dast.noDmarc'), desc: t('dast.noDmarcDesc'), severity: 'MEDIUM', category: 'attack_surface' })
  if (!m.dnssec) row.issues.push({ title: t('dast.noDnssec'), desc: t('dast.noDnssecDesc'), severity: 'LOW', category: 'attack_surface' })
  if (m.caa === false) row.issues.push({ title: t('dast.noCaa'), desc: t('dast.noCaaDesc'), severity: 'LOW', category: 'attack_surface' })
  if (m.axfr_vulnerable) row.issues.push({ title: t('dast.axfrVulnerable'), desc: t('dast.axfrVulnerableDesc'), severity: 'HIGH', category: 'attack_surface' })
}

function generatePortIssues(row: Omit<DomainRow, 'domain'>) {
  const portAsset = row.assets.find(a => a.asset_type === 'port_scan')
  if (!portAsset) return
  let pm: { open_ports?: Array<{ port: number; service: string }> } = {}
  try { pm = JSON.parse(portAsset.metadata) } catch { /* invalid JSON */ }
  const dangerous = (pm.open_ports ?? []).filter(p =>
    [21, 23, 25, 445, 1433, 3306, 3389, 5432, 5900, 6379, 9200, 27017].includes(p.port)
  )
  for (const dp of dangerous) {
    row.issues.push({
      title: `${t('dast.openPort')}: ${dp.port} (${dp.service})`,
      desc: t('dast.openPortDesc'),
      severity: [6379, 27017, 9200, 3306, 5432, 1433].includes(dp.port) ? 'CRITICAL' : 'HIGH',
      category: 'attack_surface',
    })
  }
}

function generateSSLIssues(row: Omit<DomainRow, 'domain'>) {
  const sslAsset = row.assets.find(a => a.asset_type === 'ssl_cert')
  if (!sslAsset) return
  let ssl: { hsts_preload?: boolean } = {}
  try { ssl = JSON.parse(sslAsset.metadata) } catch { /* invalid JSON */ }
  if (ssl.hsts_preload === false) {
    row.issues.push({
      title: t('dast.noHstsPreload'),
      desc: t('dast.noHstsPreloadDesc'),
      severity: 'LOW',
      category: 'frontend',
    })
  }
}

function generateSensitiveFileIssues(row: Omit<DomainRow, 'domain'>) {
  const asset = row.assets.find(a => a.asset_type === 'sensitive_files')
  if (!asset) return
  let meta: { files?: Array<{ path: string; risk: string }> } = {}
  try { meta = JSON.parse(asset.metadata) } catch { /* invalid JSON */ }
  const files = meta.files ?? []
  if (files.length === 0) return
  const critical = files.filter(f => f.risk === 'critical')
  const high = files.filter(f => f.risk === 'high')
  if (critical.length > 0) {
    row.issues.push({
      title: t('dast.sensitiveFilesCritical'),
      desc: `${t('dast.sensitiveFilesCriticalDesc')}: ${critical.map(f => f.path).join(', ')}`,
      severity: 'CRITICAL',
      category: 'attack_surface',
    })
  }
  if (high.length > 0) {
    row.issues.push({
      title: t('dast.sensitiveFilesHigh'),
      desc: `${t('dast.sensitiveFilesHighDesc')}: ${high.map(f => f.path).join(', ')}`,
      severity: 'HIGH',
      category: 'attack_surface',
    })
  }
}
