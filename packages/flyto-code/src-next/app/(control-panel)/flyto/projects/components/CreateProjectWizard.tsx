/**
 * CreateProjectWizard — guided multi-step project onboarding.
 *
 * Replaces the old single cramped dialog. A project is a SET OF
 * MODULES; the wizard walks three (optionally four) focused steps:
 *
 *   ① Modules   — pick what to monitor (free during preview).
 *   ② Sources   — for each module that supports it, turn on Flyto2's
 *                 engine AND/OR any external providers (multi-select,
 *                 not either-or — the kernel fuses every source).
 *                 Skipped when nothing on the selection can add sources.
 *   ③ Review    — module × sources summary, name it, create. Surfaces
 *                 the "connect next" continuity so a fresh project isn't
 *                 a dead end.
 *
 * BYO providers map to fusion org_integrations; the API key is added in
 * Settings → Integrations after creating (no secret collected here).
 */
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Dialog from '@mui/material/Dialog'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import Stepper from '@mui/material/Stepper'
import Step from '@mui/material/Step'
import StepLabel from '@mui/material/StepLabel'
import { Check, Cloud, Code2, Globe, Layers, Wrench, FileText, GitBranch, KeyRound, Plug, Package, Bot, Eye, Bug, Fingerprint, ClipboardCheck } from 'lucide-react'
import {
  createOrg,
  getGlobalModuleRegistry,
  putProjectModules,
  type Organization,
  type ProjectType,
  type PutProjectModule,
} from '@lib/engine'
import { qk } from '@lib/queryKeys'
import { t, tOr } from '@lib/i18n';
import { queryFailed, queryUnresolved, resolvedList } from '@lib/queryState'
import {
  PROJECT_MODULES,
  deriveProjectType,
  deriveCustomFeatures,
  buildModuleSources,
  canonicalModuleId,
  defaultModuleConfig,
  configFor,
  modulesFromRegistry,
  billingOf,
  type ModuleConfig,
  type ProjectModule,
} from './projectModules'

const BRAND = '#7c3aed'

const MODULE_ICON: Record<string, typeof Layers> = {
  code: Code2,
  code_audit: Code2,
  external: Globe,
  product_verification: ClipboardCheck,
  ctem: Globe,
  cloud: Cloud,
  cspm: Cloud,
  container: Package,
  ai_gate: Bot,
  mcp: Bot,
  dark_web: Eye,
  vuln_mgmt: Bug,
  identity: Fingerprint,
  addons: Wrench,
  reporting: FileText,
}

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
}

function moduleIdFor(modules: ProjectModule[], canonical: string): string {
  return modules.find((m) => canonicalModuleId(m.id) === canonical)?.id ?? canonical
}

/** Map a quick-create preset to the modules it pre-enables. */
function presetModules(preset?: ProjectType, modules: ProjectModule[] = PROJECT_MODULES): Set<string> {
  const id = (canonical: string) => moduleIdFor(modules, canonical)
  const existing = (canonicals: string[]) => new Set(
    canonicals.map(id).filter((moduleId) => modules.some((m) => m.id === moduleId)),
  )
  switch (preset) {
    case 'code':  return existing(['code', 'product_verification', 'autofix'])
    case 'ctem':  return existing(['external'])
    case 'cloud': return existing(['cloud', 'container'])
    case 'all':   return existing(['code', 'product_verification', 'external', 'cloud', 'container', 'autofix'])
    default:      return existing(['code', 'product_verification', 'external'])
  }
}

function initialEnabledModules(
  initialPreset: ProjectType | undefined,
  initialModule: string | undefined,
  modules: ProjectModule[],
): Set<string> {
  if (initialModule) {
    const canonical = canonicalModuleId(initialModule)
    const id = moduleIdFor(modules, canonical)
    if (modules.some((m) => m.id === id)) return new Set([id])
  }
  return presetModules(initialPreset, modules)
}

export interface CreateProjectWizardProps {
  open: boolean
  onClose: () => void
  onCreated: (org: Organization) => void
  /** Quick-create preset; remount (via `key`) to re-seed on reopen. */
  initialPreset?: ProjectType
  /** Pre-select exactly this module id (overrides initialPreset). Used by
   *  the Platform Coverage tiles so clicking e.g. MCP seeds MCP, not the
   *  coarse 'all'/'code'/'ctem'/'cloud' preset which can't name it. */
  initialModule?: string
}

export function CreateProjectWizard({ open, onClose, onCreated, initialPreset, initialModule }: CreateProjectWizardProps) {
  const qc = useQueryClient()
  const registryQ = useQuery({
    queryKey: qk.platform.moduleRegistry(),
    queryFn: getGlobalModuleRegistry,
    enabled: open,
    staleTime: 10 * 60_000,
  })
  const registryEnabled = open
  const registryModules = resolvedList(registryQ.data?.modules, registryQ, registryEnabled)
  const registryLoading = queryUnresolved(registryQ, registryEnabled)
  const registryFailed = queryFailed(registryQ, registryEnabled)
  const modules = useMemo(
    () => modulesFromRegistry(registryModules) ?? PROJECT_MODULES,
    [registryModules],
  )

  // ── State ──
  // A specific module click wins over the coarse ProjectType preset; only
  // seed the named module (guard against an unknown id falling through to
  // an empty selection by validating against the catalogue).
  const [enabled, setEnabled] = useState<Set<string>>(() => {
    return initialEnabledModules(initialPreset, initialModule, modules)
  })
  const [selectionTouched, setSelectionTouched] = useState(false)
  const [cfg, setCfg] = useState<Record<string, ModuleConfig>>({})
  const [name, setName] = useState('')
  const [stepIdx, setStepIdx] = useState(0)

  const nameValid = name.trim().length >= 3 && name.trim().length <= 64

  useEffect(() => {
    if (!registryQ.data?.modules?.length) return
    setEnabled((prev) => {
      if (!selectionTouched) return initialEnabledModules(initialPreset, initialModule, modules)
      return new Set(
        Array.from(prev)
          .map((id) => moduleIdFor(modules, canonicalModuleId(id)))
          .filter((id) => modules.some((m) => m.id === id)),
      )
    })
  }, [initialModule, initialPreset, modules, registryQ.data?.modules?.length, selectionTouched])

  const selectableEnabled = useMemo(
    () => modules.filter((m) => enabled.has(m.id) && m.sourceSelectable),
    [enabled, modules],
  )

  const steps = useMemo(() => {
    const base = [
      { key: 'modules', label: t('projects.wizard.step.modules') },
      { key: 'review', label: t('projects.wizard.step.review') },
    ]
    if (selectableEnabled.length > 0) {
      base.splice(1, 0, { key: 'sources', label: t('projects.wizard.step.sources') })
    }
    return base
  }, [selectableEnabled.length])

  const clampedIdx = Math.min(stepIdx, steps.length - 1)
  const step = steps[clampedIdx]?.key ?? 'modules'

  const reset = () => {
    setEnabled(initialEnabledModules(initialPreset, initialModule, modules))
    setSelectionTouched(false)
    setCfg({})
    setName('')
    setStepIdx(0)
  }
  const handleClose = () => { reset(); onClose() }

  const toggleModule = (id: string) => {
    setSelectionTouched(true)
    setEnabled((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
    // Seed a default source config the first time a selectable module
    // is turned on (Flyto2 engine on iff it has one, no providers yet).
    setCfg((prev) => {
      if (prev[id]) return prev
      const m = modules.find((x) => x.id === id)
      return { ...prev, [id]: defaultModuleConfig(m?.flytoNative !== false) }
    })
  }

  const toggleFlyto = (id: string) => {
    setCfg((prev) => {
      const c = prev[id] ?? defaultModuleConfig()
      return { ...prev, [id]: { ...c, flyto: !c.flyto } }
    })
  }
  const createMut = useMutation({
    mutationFn: async () => {
      const projectType = deriveProjectType(enabled)
      const org = await createOrg(name.trim(), slugify(name.trim()), {
        projectType,
        customFeatures: projectType === 'custom' ? deriveCustomFeatures(enabled, modules) : undefined,
        moduleSources: buildModuleSources(enabled, cfg, modules),
      })
      await putProjectModules(org.id, org.id, buildProjectModulePayload(enabled, cfg, modules))
      return org
    },
    onSuccess: async (org) => {
      await qc.invalidateQueries({ queryKey: qk.platform.orgs() })
      reset()
      onCreated(org)
    },
  })

  const createError = createMut.error
    ? (createMut.error instanceof Error ? createMut.error.message : String(createMut.error))
    : null

  const canNext = step === 'modules' ? enabled.size > 0 : true
  const isLast = clampedIdx === steps.length - 1

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3, backgroundImage: 'none' } }}
    >
      <Box sx={{ p: { xs: 3, sm: 4 }, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Typography variant="h5" fontWeight={700}>{t('projects.create')}</Typography>

        <Stepper activeStep={clampedIdx} alternativeLabel>
          {steps.map((s) => (
            <Step key={s.key}><StepLabel>{s.label}</StepLabel></Step>
          ))}
        </Stepper>

        {registryLoading && (
          <Alert icon={<CircularProgress size={16} />} severity="info" sx={{ borderRadius: 2 }}>
            {t('projects.wizard.catalogLoading')}
          </Alert>
        )}
        {registryFailed && (
          <Alert severity="warning" sx={{ borderRadius: 2 }}>
            {t('projects.wizard.catalogFallback')}
          </Alert>
        )}

        {step === 'modules' && (
          <ModulesStep
            enabled={enabled}
            modules={modules}
            toggle={toggleModule}
          />
        )}

        {step === 'sources' && (
          <SourcesStep modules={selectableEnabled} cfg={cfg} toggleFlyto={toggleFlyto} />
        )}

        {step === 'review' && (
          <ReviewStep
            enabled={enabled}
            modules={modules}
            cfg={cfg}
            name={name}
            setName={setName}
            nameValid={nameValid}
            onSubmit={() => { if (nameValid) createMut.mutate() }}
          />
        )}

        {createError && <Alert severity="error" sx={{ borderRadius: 2 }}>{createError}</Alert>}

        {/* ── Footer ── */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mr: 'auto' }}>
            {t('projects.wizard.freeNote')}
          </Typography>
          {clampedIdx > 0 && (
            <Button onClick={() => setStepIdx((i) => i - 1)} sx={{ textTransform: 'none' }}>
              {t('projects.wizard.back')}
            </Button>
          )}
          <Button onClick={handleClose} sx={{ textTransform: 'none' }}>
            {t('common.cancel')}
          </Button>
          {!isLast ? (
            <Button
              variant="contained"
              disabled={!canNext}
              onClick={() => setStepIdx((i) => i + 1)}
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2, background: 'linear-gradient(135deg, #7c3aed, #3b82f6)', boxShadow: 'none' }}
            >
              {t('projects.wizard.next')}
            </Button>
          ) : (
            <Button
              variant="contained"
              disabled={!nameValid || enabled.size === 0 || createMut.isPending}
              onClick={() => createMut.mutate()}
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2, background: 'linear-gradient(135deg, #7c3aed, #3b82f6)', boxShadow: 'none' }}
            >
              {createMut.isPending ? <CircularProgress size={20} /> : t('projects.create')}
            </Button>
          )}
        </Box>
      </Box>
    </Dialog>
  )
}

/* ── Step 1: module selection ── */
function ModulesStep({
  enabled, modules, toggle,
}: {
  enabled: Set<string>
  modules: ProjectModule[]
  toggle: (id: string) => void
}) {
  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('projects.wizard.modulesHint')}
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
        {modules.map((m) => {
          const Icon = MODULE_ICON[m.id] ?? Layers
          const on = enabled.has(m.id)
          return (
            <Paper
              key={m.id}
              elevation={0}
              onClick={() => toggle(m.id)}
              sx={{
                p: 2, cursor: 'pointer', borderRadius: 2.5, border: 2,
                borderColor: on ? BRAND : 'divider',
                bgcolor: on ? `${BRAND}10` : 'transparent',
                transition: 'all 0.15s', '&:hover': { borderColor: BRAND },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 0.75 }}>
                <Icon size={18} style={{ color: BRAND }} />
                <Typography variant="body2" fontWeight={600}>{tOr(m.titleKey, m.titleFallback)}</Typography>
                <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  {(m.status ?? 'live') !== 'live' && (
                    <Chip
                      size="small"
                      label={m.status === 'soon'
                        ? t('projects.coverage.soon')
                        : t('projects.coverage.beta')}
                      sx={{ height: 20, fontSize: 12, fontWeight: 700,
                        bgcolor: m.status === 'soon' ? 'action.hover' : `${BRAND}1a`,
                        color: m.status === 'soon' ? 'text.secondary' : BRAND }}
                    />
                  )}
                  <BillingChip module={m} active={on} />
                  {on && <Check size={16} style={{ color: BRAND }} />}
                </Box>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.35, display: 'block' }}>
                {tOr(m.descKey, m.descFallback)}
              </Typography>
              {m.sourceSelectable && (
                <Typography variant="caption" sx={{ color: BRAND, mt: 0.5, display: 'block', fontWeight: 600 }}>
                  {t('projects.wizard.byoCapable')}
                </Typography>
              )}
            </Paper>
          )
        })}
      </Box>
    </Box>
  )
}

/* ── Step 2: per-module sources ──
 * Project creation only decides whether Flyto2's OWN engine runs for a module.
 * External providers (Bitsight / Cyble / Tenable / Okta / …) and custom APIs are
 * NOT picked here — they are wired afterwards in Settings → Data Sources, where
 * the connect → test-call → map flow lives. This keeps "what Flyto2 scans" separate
 * from "which vendor feeds we fuse in", and avoids a half-configured vendor (a
 * checked box with no credential) at creation time. */
function SourcesStep({
  modules, cfg, toggleFlyto,
}: {
  modules: ProjectModule[]
  cfg: Record<string, ModuleConfig>
  toggleFlyto: (id: string) => void
}) {
  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('projects.wizard.sourcesHint2')}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {modules.map((m) => {
          const Icon = MODULE_ICON[m.id] ?? Layers
          const c = configFor(cfg, m)
          const flytoNative = m.flytoNative !== false
          return (
            <Paper key={m.id} variant="outlined" sx={{ p: 2, borderRadius: 2.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.5 }}>
                <Icon size={18} style={{ color: BRAND }} />
                <Typography variant="body2" fontWeight={700}>{tOr(m.titleKey, m.titleFallback)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
                {flytoNative ? (
                  <SourceToggle
                    icon={<Layers size={14} />}
                    label={t('projects.wizard.source.flyto')}
                    on={c.flyto}
                    onClick={() => toggleFlyto(m.id)}
                  />
                ) : (
                  <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                    {t('projects.wizard.byoOnlyNote')}
                  </Typography>
                )}
                {m.sourceSelectable && (
                  <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: 'text.secondary', px: 1, py: 0.5, borderRadius: 2, border: '1px dashed', borderColor: 'divider' }}>
                    <Plug size={13} />
                    <Typography variant="caption" sx={{ color: 'inherit' }}>
                      {t('projects.wizard.externalLater')}
                    </Typography>
                  </Box>
                )}
              </Box>
            </Paper>
          )
        })}
      </Box>
    </Box>
  )
}

function SourceToggle({ icon, label, on, onClick }: { icon: React.ReactNode; label: string; on: boolean; onClick: () => void }) {
  return (
    <Box
      onClick={onClick}
      sx={{
        display: 'flex', alignItems: 'center', gap: 0.6, cursor: 'pointer',
        px: 1.25, py: 0.6, borderRadius: 2, border: 2, userSelect: 'none',
        borderColor: on ? BRAND : 'divider',
        bgcolor: on ? `${BRAND}14` : 'transparent',
        color: on ? BRAND : 'text.secondary',
        '&:hover': { borderColor: BRAND },
      }}
    >
      {icon}
      <Typography variant="caption" fontWeight={700} sx={{ color: 'inherit' }}>{label}</Typography>
      {on && <Check size={13} />}
    </Box>
  )
}

/** Price badge — reads billingOf(module) off the registry (catalog.yaml's
 *  per-module `billing` field) instead of a hardcoded "free" literal, so
 *  charging for a capability later is a backend catalog change, not a JSX
 *  edit. `active` tints it when the module is selected. */
function BillingChip({ module: m, active }: { module: ProjectModule; active?: boolean }) {
  const label = billingOf(m) === 'paid'
    ? tOr('projects.wizard.paid', 'Paid')
    : tOr('projects.wizard.free', 'Free')
  return (
    <Chip
      size="small"
      label={label}
      sx={{ height: 20, fontSize: 12, fontWeight: 700,
        bgcolor: active ? `${BRAND}22` : 'action.hover',
        color: active ? BRAND : 'text.secondary' }}
    />
  )
}

/* ── Step 3: review + create ── */
function ReviewStep({
  enabled, modules, cfg, name, setName, nameValid, onSubmit,
}: {
  enabled: Set<string>
  modules: ProjectModule[]
  cfg: Record<string, ModuleConfig>
  name: string
  setName: (v: string) => void
  nameValid: boolean
  onSubmit: () => void
}) {
  const chosen = modules.filter((m) => enabled.has(m.id))
  const hasModule = (canonical: string) => Array.from(enabled).some((id) => canonicalModuleId(id) === canonical)
  const sourcesLabel = (m: ProjectModule): string => {
    if (!m.sourceSelectable) return t('projects.wizard.source.flyto')
    const c = configFor(cfg, m)
    // External providers are wired post-creation in Settings → Data Sources, so
    // the only creation-time source decision is whether Flyto2's own engine runs.
    if (c.flyto) return t('projects.wizard.source.flyto')
    return t('projects.wizard.externalLater')
  }
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Paper variant="outlined" sx={{ borderRadius: 2.5, overflow: 'hidden' }}>
        {chosen.map((m, i) => {
          const Icon = MODULE_ICON[m.id] ?? Layers
          return (
            <Box key={m.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 2, py: 1.25, borderTop: i === 0 ? 0 : 1, borderColor: 'divider' }}>
              <Icon size={16} style={{ color: BRAND }} />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="body2" fontWeight={600} noWrap>{tOr(m.titleKey, m.titleFallback)}</Typography>
                <Typography variant="caption" color="text.secondary">{sourcesLabel(m)}</Typography>
              </Box>
              <BillingChip module={m} />
            </Box>
          )
        })}
      </Paper>

      <TextField
        label={t('projects.name')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
        fullWidth
        onKeyDown={(e) => { if (e.key === 'Enter' && nameValid) onSubmit() }}
        error={name.trim().length > 0 && !nameValid}
        helperText={
          name.trim().length > 0 && name.trim().length < 3 ? t('projects.nameTooShort') :
          name.trim().length > 64 ? t('projects.nameTooLong') :
          name.trim() ? `slug: ${slugify(name.trim())}` : ' '
        }
      />

      {/* Onboarding continuity — what to connect right after creating. */}
      <Box>
        <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ display: 'block', mb: 1, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {t('projects.wizard.nextSteps')}
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {hasModule('code') && (
            <NextStep icon={<GitBranch size={14} />} label={t('projects.wizard.connectRepo')} />
          )}
          {hasModule('external') && (
            <NextStep icon={<Globe size={14} />} label={t('projects.wizard.addDomain')} />
          )}
          {chosen.some((m) => m.sourceSelectable) && (
            <NextStep icon={<KeyRound size={14} />} label={t('projects.wizard.addKey2')} />
          )}
          {hasModule('product_verification') && (
            <NextStep icon={<ClipboardCheck size={14} />} label={t('projects.wizard.runProductVerification')} />
          )}
        </Box>
      </Box>
    </Box>
  )
}

function buildProjectModulePayload(
  enabled: Set<string>,
  cfg: Record<string, ModuleConfig>,
  modules: ProjectModule[],
): PutProjectModule[] {
  const byModule = new Map<string, PutProjectModule>()
  const normalized = new Set(Array.from(enabled).map(canonicalModuleId))
  for (const m of modules) {
    const moduleId = canonicalModuleId(m.id)
    if (!normalized.has(moduleId)) continue
    byModule.set(moduleId, { module: moduleId, enabled: true, sources: [] })
  }
  for (const row of buildModuleSources(enabled, cfg, modules)) {
    const target = byModule.get(row.module) ?? { module: row.module, enabled: true, sources: [] }
    target.sources.push(
      row.source === 'flyto'
        ? { kind: 'flyto' }
        : { kind: 'integration', integrationId: row.provider },
    )
    byModule.set(row.module, target)
  }
  return Array.from(byModule.values())
}

function NextStep({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
      <Box sx={{ color: BRAND, display: 'flex' }}>{icon}</Box>
      <Typography variant="caption">{label}</Typography>
    </Box>
  )
}
