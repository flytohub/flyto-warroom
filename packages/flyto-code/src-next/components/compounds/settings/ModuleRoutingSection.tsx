/**
 * ModuleRoutingSection — the org-wide "which sources feed each capability"
 * control plane (the BYO convergence knob the audits flagged as missing).
 *
 * For each capability that the engine ACTUALLY gates on a source allowlist
 * (`external` / `code` — the modules checked by the scheduler + scan/ingest
 * paths via IsModuleSourceActiveForOrg), the operator toggles which sources run:
 * Flyto2's own engine and/or any wired external integration. Deselecting Flyto2
 * while keeping an integration writes an allowlist of just that integration —
 * which really suppresses Flyto2's scan (proven by sql_org_module_gate_test.go).
 *
 * Empty allowlist = "any source" (plain on). All-off = module disabled. This is
 * NOT cosmetic: the rows it writes are read at ingest/scan time.
 */
import { useMemo } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Switch from '@mui/material/Switch'
import { Globe, Code2, Layers, Plug, Check } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSnackbar } from 'notistack'

import { useOrg } from '@hooks/useOrg'
import { t, tOr } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import {
  listOrgModules, putOrgModules, listFusionIntegrations,
  type OrgModule, type FusionIntegration, type PutOrgModuleInput,
} from '@lib/engine/fusion/fusion'
import { LoadingState } from '@atoms/LoadingState'
import { QueryError } from '@atoms/QueryError'

const BRAND = '#7c3aed'

/** Only the modules the engine REALLY gates today (honest scope — others would
 *  write rows nothing reads). `accepts` = which integration source-system-types
 *  can feed this module. */
const GATED_MODULES: Array<{
  module: string
  label: string
  fallback: string
  icon: typeof Globe
  accepts: string[]
}> = [
  {
    module: 'external', label: 'integrations.module.external', fallback: 'External attack-surface (CTEM)',
    icon: Globe, accepts: ['external_posture', 'dark_web', 'vuln_mgmt', 'cloud_posture', 'identity'],
  },
  {
    module: 'code', label: 'integrations.module.code', fallback: 'Code scanning',
    icon: Code2, accepts: [],
  },
]

const FLYTO_KEY = 'flyto'
const intKey = (id: string) => `int:${id}`

interface SourceOpt { key: string; label: string; kind: 'flyto' | 'integration'; integrationId?: string }

export function ModuleRoutingSection() {
  const { org } = useOrg()
  const orgId = org?.id
  const qc = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()

  const modQ = useQuery({
    queryKey: qk.fusion.orgModules(orgId),
    queryFn: () => listOrgModules(orgId!),
    enabled: !!orgId,
    staleTime: 30_000,
  })
  const intQ = useQuery({
    queryKey: qk.fusion.integrations(orgId),
    queryFn: () => listFusionIntegrations(orgId!),
    enabled: !!orgId,
    staleTime: 30_000,
  })

  const policies = modQ.data?.modules ?? []
  const integrations = useMemo(
    () => (intQ.data?.integrations ?? []).filter((i) => i.enabled),
    [intQ.data],
  )

  const putM = useMutation({
    mutationFn: (input: PutOrgModuleInput) =>
      putOrgModules(orgId!, { modules: [input] }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.fusion.orgModules(orgId) })
    },
    onError: (e) => enqueueSnackbar(String((e as Error)?.message ?? e), { variant: 'error' }),
  })

  const loading = modQ.isLoading || intQ.isLoading

  return (
    <Box sx={{ mt: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <Plug size={15} style={{ color: BRAND, opacity: 0.9 }} />
        <Typography variant="subtitle2" color="text.secondary"
          sx={{ fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', fontSize: 12 }}>
          {t('integrations.routing.title')}
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.5 }}>
        {t('integrations.routing.desc')}
      </Typography>

      {loading ? (
        <LoadingState variant="spinner" py={3} />
      ) : modQ.isError ? (
        <QueryError error={modQ.error} onRetry={modQ.refetch} label={t('integrations.routing.title')} compact />
      ) : intQ.isError ? (
        <QueryError error={intQ.error} onRetry={intQ.refetch} label={t('integrations.routing.title')} compact />
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {GATED_MODULES.map((gm) => {
            const opts: SourceOpt[] = [
              { key: FLYTO_KEY, label: t('integrations.flytoEngine'), kind: 'flyto' },
              ...integrations
                .filter((i: FusionIntegration) => gm.accepts.includes(i.sourceSystemType))
                .map((i) => ({ key: intKey(i.integrationId), label: i.alias || i.providerId, kind: 'integration' as const, integrationId: i.integrationId })),
            ]
            const policy = policies.find((p: OrgModule) => p.module === gm.module)
            const { selected, enabled } = resolveSelection(policy, opts)

            const apply = (nextSelected: Set<string>) => {
              const allKeys = opts.map((o) => o.key)
              const sel = allKeys.filter((k) => nextSelected.has(k))
              let input: PutOrgModuleInput
              if (sel.length === 0) {
                input = { module: gm.module, enabled: false, allowedSources: [] }
              } else if (sel.length === allKeys.length) {
                input = { module: gm.module, enabled: true, allowedSources: [] } // any
              } else {
                input = {
                  module: gm.module, enabled: true,
                  allowedSources: sel.map((k) => {
                    const o = opts.find((x) => x.key === k)!
                    return o.kind === 'flyto' ? { kind: 'flyto' } : { kind: 'integration', integrationId: o.integrationId }
                  }),
                }
              }
              putM.mutate(input)
            }

            const toggle = (key: string) => {
              const next = new Set(selected)
              if (next.has(key)) next.delete(key); else next.add(key)
              apply(next)
            }
            const Icon = gm.icon
            const eff = effectiveLabel(opts, selected, enabled)

            return (
              <Box key={gm.module} sx={{ p: 2, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.25 }}>
                  <Icon size={17} style={{ color: BRAND }} />
                  <Typography variant="body2" fontWeight={700}>{tOr(gm.label, gm.fallback)}</Typography>
                  <Typography variant="caption" color={enabled ? 'text.secondary' : 'warning.main'} sx={{ ml: 'auto' }}>
                    {eff}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                  {opts.map((o) => {
                    const on = enabled && selected.has(o.key)
                    return (
                      <Box key={o.key} onClick={() => toggle(o.key)}
                        sx={{
                          display: 'inline-flex', alignItems: 'center', gap: 0.6, cursor: putM.isPending ? 'wait' : 'pointer', userSelect: 'none',
                          px: 1.25, py: 0.6, borderRadius: 2, border: 2,
                          borderColor: on ? BRAND : 'divider', bgcolor: on ? `${BRAND}14` : 'transparent',
                          color: on ? BRAND : 'text.secondary', opacity: putM.isPending ? 0.6 : 1,
                          '&:hover': { borderColor: BRAND },
                        }}>
                        {o.kind === 'flyto' ? <Layers size={13} /> : <Plug size={13} />}
                        <Typography variant="caption" fontWeight={700} sx={{ color: 'inherit' }}>{o.label}</Typography>
                        {on && <Check size={13} />}
                      </Box>
                    )
                  })}
                  {opts.length === 1 && (
                    <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center', fontStyle: 'italic', ml: 0.5 }}>
                      {t('integrations.routing.noExternal')}
                    </Typography>
                  )}
                </Box>
                {/* Master enable — lets you turn the whole capability off org-wide. */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                  <Switch size="small" checked={enabled}
                    onChange={(e) => {
                      if (e.target.checked) apply(new Set(opts.map((o) => o.key)))
                      else apply(new Set())
                    }} />
                  <Typography variant="caption" color="text.secondary">
                    {enabled ? t('integrations.routing.enabled') : t('integrations.routing.disabled')}
                  </Typography>
                </Box>
              </Box>
            )
          })}
        </Box>
      )}
    </Box>
  )
}

/** Derive the selected source-key set + enabled flag from a stored policy.
 *  No policy OR empty allowlist = "any" (all candidates on). */
function resolveSelection(policy: OrgModule | undefined, opts: SourceOpt[]): { selected: Set<string>; enabled: boolean } {
  if (!policy) return { selected: new Set(opts.map((o) => o.key)), enabled: true }
  if (!policy.enabled) return { selected: new Set(), enabled: false }
  const allow = policy.allowedSources ?? []
  if (allow.length === 0) return { selected: new Set(opts.map((o) => o.key)), enabled: true }
  const keys = new Set<string>()
  for (const s of allow) {
    if (s.sourceKind === 'flyto') keys.add(FLYTO_KEY)
    else if (s.integrationId) keys.add(intKey(s.integrationId))
  }
  return { selected: keys, enabled: true }
}

function effectiveLabel(opts: SourceOpt[], selected: Set<string>, enabled: boolean): string {
  if (!enabled || selected.size === 0) return t('integrations.routing.off')
  const names = opts.filter((o) => selected.has(o.key)).map((o) => o.label)
  const flytoOff = !selected.has(FLYTO_KEY) && opts.some((o) => o.key === FLYTO_KEY)
  const base = `${t('integrations.routing.fusing')}: ${names.join(' + ')}`
  return flytoOff ? `${base} (${t('integrations.routing.flytoSuppressed')})` : base
}
