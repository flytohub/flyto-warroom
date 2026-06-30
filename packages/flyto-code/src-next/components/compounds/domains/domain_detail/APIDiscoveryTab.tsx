import { Search } from 'lucide-react'
import { t } from '@lib/i18n';
import { type AttackSurfaceAsset } from '@lib/engine'
import { DiscoveryEmptyState } from './_shared'

/**
 * APIDiscoveryTab — shows results from the 4 blind API discovery passes:
 *   api_docs, error_fingerprint, graphql, js_bundle
 */
export function APIDiscoveryTab({
  assets, projectId, orgId, domain,
}: {
  assets: AttackSurfaceAsset[]
  projectId?: string
  orgId: string
  domain?: string
}) {
  const docsAsset = assets.find(a => a.asset_type === 'api_docs')
  const fpAsset = assets.find(a => a.asset_type === 'error_fingerprint')
  const gqlAsset = assets.find(a => a.asset_type === 'graphql')
  const jsAsset = assets.find(a => a.asset_type === 'js_bundle')
  const sensitiveAsset = assets.find(a => a.asset_type === 'sensitive_files')

  const hasSomething = docsAsset || fpAsset || gqlAsset || jsAsset || sensitiveAsset

  if (!hasSomething) {
    return (
      <DiscoveryEmptyState
        icon={Search}
        message={t('dast.apiDiscoveryEmpty')}
        projectId={projectId} orgId={orgId} domain={domain} assetType="api_docs"
      />
    )
  }

  function parseMetadata(asset?: AttackSurfaceAsset): Record<string, unknown> {
    if (!asset?.metadata) return {}
    try { return JSON.parse(asset.metadata) } catch { return {} }
  }

  const docsMeta = parseMetadata(docsAsset) as { docs_found?: Array<{ path: string; format: string; url: string; endpoint_count?: string; title?: string }> }
  const fpMeta = parseMetadata(fpAsset) as { frameworks?: string[]; server_header?: string; powered_by?: string }
  const gqlMeta = parseMetadata(gqlAsset) as { found?: boolean; path?: string; type_count?: number; query_count?: number; mutation_count?: number }
  const jsMeta = parseMetadata(jsAsset) as { endpoints?: Array<{ path: string; source: string; file: string }>; bundles_scanned?: number }
  const sensMeta = parseMetadata(sensitiveAsset) as { files?: Array<{ path: string; status: number; size?: number; risk: string }> }

  return (
    <div className="flex flex-col gap-5 p-4">
      {fpMeta.frameworks && fpMeta.frameworks.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <div className="text-sm font-semibold text-text-primary">{t('dast.frameworkDetected')}</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            {fpMeta.frameworks.map((fw: string) => (
              <span key={fw} style={{ padding: '4px 12px', borderRadius: 6, background: 'rgba(167,139,250,0.1)', color: '#a78bfa', fontSize: 13, fontWeight: 600 }}>
                {fw}
              </span>
            ))}
          </div>
          {fpMeta.server_header && (
            <div className="text-sm text-text-tertiary">{t('dast.serverHeaderLabel')}: {fpMeta.server_header}</div>
          )}
        </div>
      )}

      {sensMeta.files && sensMeta.files.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <div className="text-sm font-semibold" style={{ color: '#ef4444' }}>
            {t('dast.sensitiveFilesFound')}
            <span className="text-sm text-text-tertiary ml-2">({sensMeta.files.length})</span>
          </div>
          <div className="text-sm text-text-tertiary mb-1">
            {t('dast.sensitiveFilesDesc')}
          </div>
          <div className="flex flex-col">
            {sensMeta.files.map((f, i) => {
              const riskColor = f.risk === 'critical' ? '#ef4444' : f.risk === 'high' ? '#f97316' : '#eab308'
              return (
                <div key={i} className="flex items-center gap-3 px-3 py-2 border-b border-white/5 hover:bg-white/[0.02]">
                  <span className="font-mono text-sm flex-1">{f.path}</span>
                  <span className="text-xs text-text-tertiary">HTTP {f.status}</span>
                  {f.size !== undefined && <span className="text-xs text-text-tertiary">{f.size} B</span>}
                  <span className="px-2 py-0.5 text-xs font-semibold rounded" style={{ background: riskColor + '18', color: riskColor }}>
                    {f.risk}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {docsMeta.docs_found && docsMeta.docs_found.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <div className="text-sm font-semibold text-text-primary">{t('dast.apiDocsFound')}</div>
          {docsMeta.docs_found.map((doc, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--color-card-hover)' }}>
              <span style={{ color: '#22c55e', fontSize: 13, fontWeight: 600 }}>{doc.format.toUpperCase()}</span>
              <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-sm" style={{ color: 'var(--color-brand-light)' }}>
                {doc.path}
              </a>
              {doc.endpoint_count && <span className="text-sm text-text-tertiary">{doc.endpoint_count} endpoints</span>}
              {doc.title && <span className="text-sm text-text-tertiary">({doc.title})</span>}
            </div>
          ))}
        </div>
      )}

      {gqlMeta.found && (
        <div className="flex flex-col gap-2.5">
          <div className="text-sm font-semibold text-text-primary" style={{ color: '#ef4444' }}>
            {t('dast.graphqlIntrospection')}
          </div>
          <div className="text-sm text-text-tertiary mb-2">
            {t('dast.graphqlWarning')}
          </div>
          <div style={{ display: 'flex', gap: 20 }}>
            <div className="text-sm"><span className="text-text-tertiary">{t('dast.gqlPath')}: </span><span className="font-mono">{gqlMeta.path}</span></div>
            <div className="text-sm"><span className="text-text-tertiary">{t('dast.gqlTypes')}: </span>{gqlMeta.type_count}</div>
            <div className="text-sm"><span className="text-text-tertiary">{t('dast.gqlQueries')}: </span>{gqlMeta.query_count}</div>
            <div className="text-sm"><span className="text-text-tertiary">{t('dast.gqlMutations')}: </span>{gqlMeta.mutation_count}</div>
          </div>
        </div>
      )}

      {jsMeta.endpoints && jsMeta.endpoints.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <div className="text-sm font-semibold text-text-primary">
            {t('dast.jsBundleEndpoints')}
            <span className="text-sm text-text-tertiary ml-2">({jsMeta.endpoints.length} found from {jsMeta.bundles_scanned} bundles)</span>
          </div>
          <div className="flex flex-col">
            <div className="grid grid-cols-3 gap-3 px-3 py-2 text-xs font-semibold text-text-tertiary uppercase border-b border-white/10" style={{ fontSize: 14, backgroundColor: 'rgba(255,255,255,0.03)' }}>
              <div>{t('dast.colPath')}</div>
              <div>{t('dast.colSource')}</div>
              <div>{t('dast.colFile')}</div>
            </div>
            {jsMeta.endpoints.slice(0, 30).map((ep, i) => (
              <div key={i} className="grid grid-cols-3 gap-3 px-3 py-2 border-b border-white/5 hover:bg-white/[0.02]">
                <div><span className="font-mono text-sm">{ep.path}</span></div>
                <div><span className="text-sm text-text-tertiary">{ep.source}</span></div>
                <div><span className="text-sm text-text-tertiary">{ep.file}</span></div>
              </div>
            ))}
          </div>
          {jsMeta.endpoints.length > 30 && (
            <div className="text-sm text-text-tertiary mt-2">+{jsMeta.endpoints.length - 30} more</div>
          )}
        </div>
      )}

      {(!docsMeta.docs_found || docsMeta.docs_found.length === 0) &&
       (!fpMeta.frameworks || fpMeta.frameworks.length === 0) &&
       !gqlMeta.found &&
       (!jsMeta.endpoints || jsMeta.endpoints.length === 0) && (
        <div className="flex flex-col items-center justify-center py-14 text-text-tertiary">
          <Search size={36} className="mb-4 opacity-20" />
          <div className="text-base">{t('dast.noApiFindings')}</div>
        </div>
      )}
    </div>
  )
}
