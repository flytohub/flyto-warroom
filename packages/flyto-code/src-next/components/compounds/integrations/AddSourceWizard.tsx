/**
 * AddSourceWizard — the one no-code flow for wiring an external data source
 * into the kernel. Replaces the two parallel "Add custom source" / "Add fusion
 * source" entry points that confused Settings ▸ Data Sources.
 *
 * Three honest steps, every one backed by a real engine endpoint:
 *
 *   ① Source     — pick a category (source_system_type) then either a CERTIFIED
 *                  preset (Bitsight / Cyble / Tenable / Okta / Entra / Google)
 *                  or "Custom API".
 *   ② Connect    — preset: paste the vendor token. custom: enter URL + auth +
 *                  token and "Test connection" → POST /fusion/probe live-calls
 *                  the endpoint and returns the real field shape + a sample
 *                  (upload / paste are offline fallbacks).
 *   ③ Map        — custom only: auto-suggested field → kernel mapping with
 *                  severity normalisation. "Preview" runs POST /fusion/mappings/
 *                  dry-run (writes nothing); Finish authors the org-custom mapping
 *                  + wires the integration + seals the credential.
 *
 * Preset path is two steps (Source → Connect); custom is three. Nothing here is
 * a mock — a save that the engine can't validate fails loudly, not silently.
 */
import { useMemo, useState } from 'react'
import Dialog from '@mui/material/Dialog'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Alert from '@mui/material/Alert'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Stepper from '@mui/material/Stepper'
import Step from '@mui/material/Step'
import StepLabel from '@mui/material/StepLabel'
import CircularProgress from '@mui/material/CircularProgress'
import {
  ArrowRight, KeyRound, Cloud, Upload, ClipboardPaste,
  Plug, CheckCircle2, ShieldCheck, FlaskConical, Plus, Trash2,
} from 'lucide-react'
import { useSnackbar } from 'notistack'
import { SeverityChip, normalizeSeverity, type Severity } from '@atoms/SeverityChip'
import { t, tOr } from '@lib/i18n';
import {
  probeFusionEndpoint, dryRunCustomMapping, upsertCustomMapping,
  upsertFusionIntegration, sealIntegrationCredential,
  type ProbeFieldInfo, type DryRunResult,
} from '@lib/engine/fusion/fusion'
import {
  CATEGORIES, presetsForCategory, entityTypesFor,
  customMappingIds, buildCustomMappingYaml, deriveRecordShape,
  fieldPrefixForCategory, slugifyKernelFieldKey,
  type SourceSystemType, type CertifiedPreset, type SeverityLevel,
  type CustomExtraValueKind,
} from './sourceCatalog'
import { FieldMapCanvas } from './FieldMapCanvas'

/** Smart field-name → kernel-field suggestions for one-click auto-map. First
 *  matching candidate (substring, case-insensitive on the relative path) wins. */
const AUTO_HINTS: Record<keyof MapState['map'], string[]> = {
  canonicalKey: ['canonical', 'evidence_key', 'domain', 'host', 'fqdn', 'asset', 'email', 'url', 'ip', 'identifier', 'key', 'id', 'name'],
  title: ['title', 'name', 'summary', 'finding', 'description', 'headline', 'subject'],
  severity: ['severity', 'sev', 'criticality', 'risk_level', 'risk', 'level', 'priority'],
  sourceScore: ['score', 'rating', 'grade', 'cvss', 'rank', 'points'],
  observedAt: ['observed', 'last_seen', 'seen', 'timestamp', 'updated', 'modified', 'created', 'date', 'time'],
}

const PRIMARY_FIELD_HINTS = [
  ...AUTO_HINTS.canonicalKey,
  ...AUTO_HINTS.title,
  ...AUTO_HINTS.severity,
  ...AUTO_HINTS.observedAt,
]
function suggestMap(fields: { relative: string }[]): Partial<Record<keyof MapState['map'], string>> {
  const out: Partial<Record<keyof MapState['map'], string>> = {}
  const taken = new Set<string>()
  for (const kid of Object.keys(AUTO_HINTS) as (keyof MapState['map'])[]) {
    for (const hint of AUTO_HINTS[kid]) {
      const hit = fields.find((f) => !taken.has(f.relative) && f.relative.toLowerCase().includes(hint))
      if (hit) { out[kid] = hit.relative; taken.add(hit.relative); break }
    }
  }
  return out
}

const BRAND = '#7c3aed'

type AuthType = 'none' | 'bearer' | 'header'
type DataKind = 'api' | 'upload' | 'paste'

interface DiscoveredField { relative: string; absolute: string; type: string }

const KERNEL_FIELDS: Array<{ id: keyof MapState['map']; label: string; required?: boolean }> = [
  { id: 'canonicalKey', label: t('hardcoded.identity.key.8d79f750'), required: true },
  { id: 'title', label: 'Title' },
  { id: 'severity', label: 'Severity' },
  { id: 'sourceScore', label: t('integrations.field.sourceScore') },
  { id: 'observedAt', label: t('integrations.field.observedAt') },
]

interface MapState {
  entityType: string
  map: { canonicalKey: string; title: string; severity: string; sourceScore: string; observedAt: string }
  sevMap: Record<string, SeverityLevel>
  extras: ExtraClaimState[]
}

interface ExtraClaimState {
  id: string
  fieldKey: string
  sourcePath: string
  valueKind: CustomExtraValueKind
}

// ── Local sample → absolute path discovery (mirrors the engine probe shape) ──

function flattenToPaths(value: unknown, prefix = '$', out: DiscoveredField[] = []): DiscoveredField[] {
  if (value === null || value === undefined) return out
  if (Array.isArray(value)) {
    if (value.length) flattenToPaths(value[0], `${prefix}[*]`, out)
    return out
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      flattenToPaths(v, `${prefix}.${k}`, out)
    }
    return out
  }
  out.push({ relative: '', absolute: prefix, type: typeof value })
  return out
}

function getByRel(record: unknown, rel: string): unknown {
  // rel like "$.a.b" → ['a','b']
  const path = rel.replace(/^\$\.?/, '')
  if (!path) return record
  return path.split('.').reduce<unknown>(
    (acc, k) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[k] : undefined),
    record,
  )
}

/** Pull the records array out of a parsed sample given the derived match path. */
function recordsFromSample(parsed: unknown, recordsMatch: string): unknown[] {
  if (recordsMatch === '$') return [parsed]
  // "$.findings[*]" → first array under findings; "$[*]" → parsed itself.
  if (recordsMatch === '$[*]') return Array.isArray(parsed) ? parsed : []
  const key = recordsMatch.replace(/^\$\./, '').replace(/\[\*\]$/, '')
  const arr = getByRel(parsed, `$.${key}`)
  return Array.isArray(arr) ? arr : []
}

export interface AddSourceWizardProps {
  open: boolean
  onClose: () => void
  orgId: string
  onSaved?: () => void
}

export function AddSourceWizard({ open, onClose, orgId, onSaved }: AddSourceWizardProps) {
  const { enqueueSnackbar } = useSnackbar()

  // ── Step 1: category + choice ──
  const [category, setCategory] = useState<SourceSystemType | null>(null)
  const [preset, setPreset] = useState<CertifiedPreset | null>(null)
  const [custom, setCustom] = useState(false)

  // ── Step 2: connect ──
  const [name, setName] = useState('')
  const [alias, setAlias] = useState('')
  const [token, setToken] = useState('')
  const [dataKind, setDataKind] = useState<DataKind>('api')
  const [endpoint, setEndpoint] = useState('')
  const [authType, setAuthType] = useState<AuthType>('bearer')
  const [authHeader, setAuthHeader] = useState('Authorization')
  const [sampleText, setSampleText] = useState('')
  const [probing, setProbing] = useState(false)
  const [probeStatus, setProbeStatus] = useState<number | null>(null)
  const [probeFields, setProbeFields] = useState<ProbeFieldInfo[] | null>(null)
  const [connectError, setConnectError] = useState('')

  // ── Step 3: map ──
  const [mapState, setMapState] = useState<MapState>({
    entityType: 'domain',
    map: { canonicalKey: '', title: '', severity: '', sourceScore: '', observedAt: '' },
    sevMap: {},
    extras: [],
  })
  const [dryRun, setDryRun] = useState<DryRunResult | null>(null)
  const [dryRunError, setDryRunError] = useState('')
  const [dryRunning, setDryRunning] = useState(false)
  const [saving, setSaving] = useState(false)

  const [step, setStep] = useState(0)

  const isPreset = !!preset
  const steps = isPreset
    ? [t('integrations.step.source'), t('integrations.step.connect')]
    : [t('integrations.step.source'), t('integrations.step.connect'), t('integrations.step.map')]

  const reset = () => {
    setCategory(null); setPreset(null); setCustom(false)
    setName(''); setAlias(''); setToken(''); setDataKind('api'); setEndpoint('')
    setAuthType('bearer'); setAuthHeader('Authorization'); setSampleText('')
    setProbing(false); setProbeStatus(null); setProbeFields(null); setConnectError('')
    setMapState({ entityType: 'domain', map: { canonicalKey: '', title: '', severity: '', sourceScore: '', observedAt: '' }, sevMap: {}, extras: [] })
    setDryRun(null); setDryRunError(''); setDryRunning(false); setSaving(false)
    setStep(0)
  }
  const close = () => { reset(); onClose() }

  // ── Discovered field shape (probe OR local sample) ──
  const parsedSample = useMemo(() => {
    if (!sampleText.trim()) return undefined
    try { return JSON.parse(sampleText) } catch { return undefined }
  }, [sampleText])

  const discovered = useMemo<{ recordsMatch: string; fields: DiscoveredField[] }>(() => {
    if (dataKind === 'api' && probeFields && probeFields.length) {
      const shape = deriveRecordShape(probeFields.map((f) => f.path))
      const typeByAbs = new Map(probeFields.map((f) => [f.path, f.type]))
      return {
        recordsMatch: shape.recordsMatch,
        fields: shape.fields.map((f) => ({ ...f, type: typeByAbs.get(f.absolute) ?? 'string' })),
      }
    }
    if (parsedSample !== undefined) {
      const abs = flattenToPaths(parsedSample)
      const shape = deriveRecordShape(abs.map((f) => f.absolute))
      const typeByAbs = new Map(abs.map((f) => [f.absolute, f.type]))
      return {
        recordsMatch: shape.recordsMatch,
        fields: shape.fields.map((f) => ({ ...f, type: typeByAbs.get(f.absolute) ?? 'string' })),
      }
    }
    return { recordsMatch: '$', fields: [] }
  }, [dataKind, probeFields, parsedSample])

  // Distinct raw severity values from whatever sample we hold (best-effort).
  const sevValues = useMemo(() => {
    const sevRel = mapState.map.severity
    if (!sevRel || parsedSample === undefined) return []
    const recs = recordsFromSample(parsedSample, discovered.recordsMatch)
    const set = new Set<string>()
    for (const r of recs.slice(0, 100)) {
      const v = getByRel(r, sevRel)
      if (v !== undefined && v !== null) set.add(String(v))
    }
    return Array.from(set).slice(0, 16)
  }, [mapState.map.severity, parsedSample, discovered.recordsMatch])

  const setField = (id: keyof MapState['map'], v: string) =>
    setMapState((s) => ({ ...s, map: { ...s.map, [id]: v } }))

  const autoMap = () =>
    setMapState((s) => ({ ...s, map: { ...s.map, ...suggestMap(discovered.fields) } }))

  const addExtraClaim = () => {
    const reserved = new Set([
      ...Object.values(mapState.map).filter(Boolean),
      ...mapState.extras.map((e) => e.sourcePath).filter(Boolean),
    ])
    const candidate =
      discovered.fields.find((f) => !reserved.has(f.relative) && !isLikelyPrimaryField(f.relative)) ??
      discovered.fields.find((f) => !reserved.has(f.relative)) ??
      discovered.fields[0]
    const sourcePath = candidate?.relative ?? ''
    setMapState((s) => ({
      ...s,
      extras: [
        ...s.extras,
        {
          id: `extra-${Date.now().toString(36)}-${s.extras.length}`,
          fieldKey: slugifyKernelFieldKey(sourcePath || 'vendor_field'),
          sourcePath,
          valueKind: inferExtraValueKind(candidate?.type),
        },
      ],
    }))
  }

  const updateExtraClaim = (id: string, patch: Partial<ExtraClaimState>) =>
    setMapState((s) => ({
      ...s,
      extras: s.extras.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }))

  const removeExtraClaim = (id: string) =>
    setMapState((s) => ({ ...s, extras: s.extras.filter((e) => e.id !== id) }))

  // ── Live test-call (real probe) ──
  const runProbe = async () => {
    setConnectError(''); setProbing(true); setProbeStatus(null); setProbeFields(null)
    try {
      const res = await probeFusionEndpoint(orgId, {
        url: endpoint.trim(),
        token: authType === 'none' ? undefined : token,
        tokenHeader: authType === 'header' ? authHeader : undefined,
      })
      setProbeStatus(res.status)
      setProbeFields(res.fields ?? [])
      if (res.sampleRaw) setSampleText(res.sampleRaw)
      if (!res.fields || res.fields.length === 0) {
        setConnectError(t('integrations.probeNoFields'))
      }
    } catch (e) {
      setConnectError(e instanceof Error ? e.message : String(e))
    } finally {
      setProbing(false)
    }
  }

  // ── Dry-run preview (real, writes nothing) ──
  const candidateYaml = useMemo(() => {
    if (isPreset || !category || !mapState.map.canonicalKey) return ''
    return buildCustomMappingYaml({
      orgId, sourceName: name, sourceSystemType: category,
      recordsMatch: discovered.recordsMatch, entityType: mapState.entityType,
      map: {
        canonicalKey: mapState.map.canonicalKey,
        title: mapState.map.title || undefined,
        severity: mapState.map.severity || undefined,
        sourceScore: mapState.map.sourceScore || undefined,
        observedAt: mapState.map.observedAt || undefined,
      },
      extraClaims: mapState.extras
        .filter((e) => e.fieldKey.trim() && e.sourcePath)
        .map((e) => ({ fieldKey: e.fieldKey, sourcePath: e.sourcePath, valueKind: e.valueKind })),
      severityValueMap: mapState.map.severity ? mapState.sevMap : undefined,
    })
  }, [isPreset, category, orgId, name, discovered.recordsMatch, mapState])

  const runDryRun = async () => {
    if (!candidateYaml || parsedSample === undefined) {
      setDryRunError(t('integrations.dryRunNeedsSample'))
      return
    }
    setDryRunError(''); setDryRunning(true); setDryRun(null)
    try {
      setDryRun(await dryRunCustomMapping(orgId, { yaml: candidateYaml, samplePayload: parsedSample }))
    } catch (e) {
      setDryRunError(e instanceof Error ? e.message : String(e))
    } finally {
      setDryRunning(false)
    }
  }

  // ── Finish: wire it for real ──
  const integrationId = useMemo(() => {
    const slug = (preset?.providerId ?? name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    return `${slug || 'source'}-${category ?? 'src'}`.slice(0, 60)
  }, [preset, name, category])

  const finish = async () => {
    if (!category) return
    setSaving(true)
    try {
      let providerId = preset?.providerId ?? ''
      let mappingId = preset?.mappingId ?? ''

      if (!isPreset) {
        // Author the org-custom mapping first so the integration can bind it.
        const ids = customMappingIds(orgId, name)
        providerId = ids.providerId
        mappingId = ids.mappingId
        await upsertCustomMapping(orgId, {
          mappingId, providerId, sourceSystemType: category,
          yaml: candidateYaml, enabled: true,
        })
      }

      await upsertFusionIntegration(orgId, {
        integrationId, providerId, mappingId,
        alias: alias || name || preset?.label || providerId,
        sourceSystemType: category, enabled: true, freshnessSlaHours: 24,
      })

      // Seal the vendor token (custom api + any preset). Sealing requires the
      // engine's secrets manager — if it's not configured locally we keep the
      // wired source and surface an honest warning rather than faking success.
      if (token && (isPreset || dataKind === 'api')) {
        try {
          await sealIntegrationCredential(orgId, integrationId, { plaintext: token, label: alias || name })
        } catch (e) {
          enqueueSnackbar(
            t('integrations.credSealWarn') +
              (e instanceof Error ? e.message : String(e)),
            { variant: 'warning' },
          )
        }
      }

      enqueueSnackbar(t('integrations.sourceWired'), { variant: 'success' })
      onSaved?.()
      close()
    } catch (e) {
      enqueueSnackbar(e instanceof Error ? e.message : String(e), { variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  // ── Step gating ──
  const step1Valid = !!category && (isPreset || custom)
  const connectValid = isPreset
    ? token.trim().length > 0
    : name.trim().length >= 2 &&
      (dataKind !== 'api' ? discovered.fields.length > 0 : (probeStatus !== null && discovered.fields.length > 0))
  const mapValid = !!mapState.map.canonicalKey
  const lastStep = isPreset ? 1 : 2

  return (
    <Dialog open={open} onClose={saving ? undefined : close} maxWidth="md" fullWidth
      PaperProps={{ sx: { borderRadius: 3, backgroundImage: 'none' } }}>
      <Box sx={{ p: { xs: 3, sm: 4 }, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{
            width: 38, height: 38, borderRadius: 2.5, display: 'grid', placeItems: 'center',
            background: `linear-gradient(135deg, ${BRAND}33, ${BRAND}14)`, border: `1px solid ${BRAND}40`,
          }}>
            <Plug size={19} style={{ color: BRAND }} />
          </Box>
          <Box>
            <Typography variant="h6" fontWeight={800}>{t('integrations.wizard.title')}</Typography>
            <Typography variant="body2" color="text.secondary">
              {t('integrations.wizard.subtitle')}
            </Typography>
          </Box>
        </Box>

        <Stepper activeStep={step} alternativeLabel>
          {steps.map((s) => <Step key={s}><StepLabel>{s}</StepLabel></Step>)}
        </Stepper>

        {/* ── STEP 1 — category + provider choice ── */}
        {step === 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <Box>
              <SectionLabel>{t('integrations.pickCategory')}</SectionLabel>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' }, gap: 1.25 }}>
                {CATEGORIES.map((c) => {
                  const Icon = c.icon
                  const on = category === c.id
                  return (
                    <Paper key={c.id} elevation={0}
                      onClick={() => { setCategory(c.id); setPreset(null); setCustom(false); setMapState((s) => ({ ...s, entityType: entityTypesFor(c.id)[0] })) }}
                      sx={{
                        p: 1.75, cursor: 'pointer', borderRadius: 2.5, border: 2,
                        borderColor: on ? c.color : 'divider', bgcolor: on ? `${c.color}12` : 'transparent',
                        transition: 'all .15s', '&:hover': { borderColor: c.color, transform: 'translateY(-1px)' },
                      }}>
                      <Icon size={20} style={{ color: c.color }} />
                      <Typography variant="body2" fontWeight={700} sx={{ mt: 0.75 }}>{tOr(c.labelKey, c.label)}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25, lineHeight: 1.35 }}>
                        {tOr(c.descKey, c.desc)}
                      </Typography>
                    </Paper>
                  )
                })}
              </Box>
            </Box>

            {category && (
              <Box>
                <SectionLabel>{t('integrations.pickProvider')}</SectionLabel>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25 }}>
                  {presetsForCategory(category).map((p) => {
                    const on = preset?.providerId === p.providerId
                    return (
                      <Paper key={p.providerId} elevation={0}
                        onClick={() => { setPreset(p); setCustom(false) }}
                        sx={{
                          p: 1.75, cursor: 'pointer', borderRadius: 2.5, border: 2,
                          borderColor: on ? BRAND : 'divider', bgcolor: on ? `${BRAND}10` : 'transparent',
                          '&:hover': { borderColor: BRAND },
                        }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <ShieldCheck size={16} style={{ color: '#34d399' }} />
                          <Typography variant="body2" fontWeight={700}>{p.label}</Typography>
                          <Chip size="small" label={t('integrations.certified')}
                            sx={{ height: 18, fontSize: 12, fontWeight: 700, bgcolor: '#34d39920', color: '#34d399' }} />
                        </Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>{p.credentialHint}</Typography>
                      </Paper>
                    )
                  })}
                  <Paper elevation={0}
                    onClick={() => { setCustom(true); setPreset(null) }}
                    sx={{
                      p: 1.75, cursor: 'pointer', borderRadius: 2.5, border: 2, borderStyle: 'dashed',
                      borderColor: custom ? BRAND : 'divider', bgcolor: custom ? `${BRAND}10` : 'transparent',
                      '&:hover': { borderColor: BRAND },
                    }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Cloud size={16} style={{ color: BRAND }} />
                      <Typography variant="body2" fontWeight={700}>{t('integrations.customApi')}</Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                      {t('integrations.customApiDesc')}
                    </Typography>
                  </Paper>
                </Box>
                {presetsForCategory(category).length === 0 && !custom && (
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                    {t('integrations.noPreset')}
                  </Typography>
                )}
              </Box>
            )}
          </Box>
        )}

        {/* ── STEP 2 — connect ── */}
        {step === 1 && isPreset && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Alert severity="success" icon={<ShieldCheck size={18} />} sx={{ borderRadius: 2 }}>
              {t('integrations.presetNote')} <b>{preset!.credentialHint}</b>
            </Alert>
            <TextField label={t('integrations.alias')} value={alias} onChange={(e) => setAlias(e.target.value)}
              fullWidth placeholder={preset!.label} size="small" />
            <TextField label={t('integrations.token')} value={token} onChange={(e) => setToken(e.target.value)}
              type="password" fullWidth size="small"
              InputProps={{ startAdornment: <KeyRound size={15} style={{ marginRight: 8, opacity: 0.6 }} /> }}
              helperText={t('integrations.tokenSealNote')} />
          </Box>
        )}

        {step === 1 && !isPreset && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField label={t('integrations.name')} value={name} onChange={(e) => setName(e.target.value)}
              fullWidth autoFocus placeholder="e.g. Acme Risk Feed" size="small" />

            <Box sx={{ display: 'flex', gap: 1 }}>
              {([['api', Cloud, 'API'], ['upload', Upload, 'Upload'], ['paste', ClipboardPaste, 'Paste']] as const).map(([k, Icon, lbl]) => {
                const on = dataKind === k
                return (
                  <Button key={k} onClick={() => { setDataKind(k); setProbeFields(null); setProbeStatus(null) }}
                    startIcon={<Icon size={15} />}
                    sx={{
                      textTransform: 'none', fontWeight: 600, borderRadius: 2, flex: 1, border: 1,
                      borderColor: on ? BRAND : 'divider', color: on ? BRAND : 'text.secondary',
                      bgcolor: on ? `${BRAND}0d` : 'transparent',
                    }}>{tOr(`integrations.kind.${k}`, lbl)}</Button>
                )
              })}
            </Box>

            {dataKind === 'api' && (
              <>
                <TextField label={t('integrations.endpoint')} value={endpoint} onChange={(e) => setEndpoint(e.target.value)}
                  fullWidth size="small" placeholder="https://api.vendor.com/v1/findings" />
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <TextField select label={t('integrations.auth')} value={authType} onChange={(e) => setAuthType(e.target.value as AuthType)} size="small" sx={{ minWidth: 170 }}>
                    <MenuItem value="none">{t('integrations.auth.none')}</MenuItem>
                    <MenuItem value="bearer">{t('integrations.auth.bearer')}</MenuItem>
                    <MenuItem value="header">{t('integrations.auth.headerKey')}</MenuItem>
                  </TextField>
                  {authType === 'header' && (
                    <TextField label={t('integrations.authKeyName')} value={authHeader} onChange={(e) => setAuthHeader(e.target.value)} size="small" sx={{ flex: 1 }} />
                  )}
                </Box>
                {authType !== 'none' && (
                  <TextField label={t('integrations.token')} value={token} onChange={(e) => setToken(e.target.value)}
                    type="password" fullWidth size="small"
                    InputProps={{ startAdornment: <KeyRound size={15} style={{ marginRight: 8, opacity: 0.6 }} /> }} />
                )}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Button onClick={runProbe} disabled={probing || !/^https?:\/\//.test(endpoint.trim())}
                    variant="outlined" startIcon={probing ? <CircularProgress size={14} /> : <FlaskConical size={15} />}
                    sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}>
                    {probing ? t('integrations.testing') : t('integrations.testConn')}
                  </Button>
                  {probeStatus !== null && (
                    <Chip size="small" icon={<CheckCircle2 size={14} />}
                      label={`HTTP ${probeStatus} · ${discovered.fields.length} ${t('integrations.fields')}`}
                      sx={{ bgcolor: probeStatus < 400 ? '#34d39920' : '#ef444420', color: probeStatus < 400 ? '#34d399' : '#ef4444', fontWeight: 700 }} />
                  )}
                </Box>
              </>
            )}

            {dataKind === 'upload' && (
              <Button variant="outlined" component="label" startIcon={<Upload size={16} />} sx={{ textTransform: 'none', borderRadius: 2, alignSelf: 'flex-start' }}>
                {t('integrations.uploadFile')}
                <input type="file" hidden accept=".json,application/json"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) { const rd = new FileReader(); rd.onload = () => setSampleText(String(rd.result ?? '')); rd.readAsText(f) } }} />
              </Button>
            )}

            {(dataKind !== 'api' || probeStatus !== null) && (
              <TextField
                label={dataKind === 'api' ? t('integrations.sampleProbed') : t('integrations.sample')}
                value={sampleText} onChange={(e) => setSampleText(e.target.value)}
                fullWidth multiline minRows={6} maxRows={14}
                sx={{ '& textarea': { fontFamily: 'monospace', fontSize: 12 } }}
                helperText={
                  parsedSample === undefined && sampleText.trim()
                    ? (dataKind === 'api'
                        ? t('integrations.sampleTruncated')
                        : t('integrations.invalidJson'))
                    : ' '
                }
                // Truncated probe samples are expected (≤4KB cap) and not an
                // error — only flag invalid JSON the operator pasted/uploaded.
                error={parsedSample === undefined && !!sampleText.trim() && dataKind !== 'api'}
              />
            )}

            {connectError && <Alert severity="warning" sx={{ borderRadius: 2 }}>{connectError}</Alert>}
          </Box>
        )}

        {/* ── STEP 3 — map (custom only) ── */}
        {step === 2 && !isPreset && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
              <TextField select label={t('integrations.entityType')} value={mapState.entityType}
                onChange={(e) => setMapState((s) => ({ ...s, entityType: e.target.value }))} size="small" sx={{ minWidth: 220 }}>
                {entityTypesFor(category!).map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              </TextField>
              <Chip size="small" variant="outlined" label={`${t('integrations.recordsAt')}: ${discovered.recordsMatch}`} />
            </Box>

            <FieldMapCanvas
              sourceFields={discovered.fields.map((f) => ({ relative: f.relative, type: f.type }))}
              kernelFields={KERNEL_FIELDS}
              mapping={mapState.map}
              onConnect={(kid, rel) => setField(kid as keyof MapState['map'], rel)}
              onDisconnect={(kid) => setField(kid as keyof MapState['map'], '')}
              onAutoMap={autoMap}
            />

            {sevValues.length > 0 && (
              <Box>
                <SectionLabel>{t('integrations.severityMap')}</SectionLabel>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                  {sevValues.map((v) => (
                    <Box key={v} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip size="small" label={v} sx={{ maxWidth: 130 }} />
                      <ArrowRight size={13} style={{ opacity: 0.4 }} />
                      <TextField select size="small" value={mapState.sevMap[v] ?? normalizeSeverity(v)}
                        onChange={(e) => setMapState((s) => ({ ...s, sevMap: { ...s.sevMap, [v]: e.target.value as SeverityLevel } }))} sx={{ minWidth: 120 }}>
                        {(['critical', 'high', 'medium', 'low'] as Severity[]).map((sv) => <MenuItem key={sv} value={sv}>{sv}</MenuItem>)}
                      </TextField>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <SectionLabel>{t('integrations.extraEvidenceFields')}</SectionLabel>
                <Button
                  onClick={addExtraClaim}
                  disabled={discovered.fields.length === 0}
                  startIcon={<Plus size={14} />}
                  size="small"
                  sx={{ ml: 'auto', textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
                >
                  {t('integrations.addField')}
                </Button>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ mt: -1, mb: 0.25 }}>
                {t('integrations.extraEvidenceFieldsDesc')}
              </Typography>
              {mapState.extras.map((extra) => {
                const selected = discovered.fields.find((f) => f.relative === extra.sourcePath)
                return (
                  <Paper key={extra.id} variant="outlined" sx={{
                    p: 1.25,
                    borderRadius: 2,
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: '1.2fr 1fr 120px 36px' },
                    gap: 1,
                    alignItems: 'center',
                  }}>
                    <TextField
                      select
                      label={t('integrations.sourceField')}
                      value={extra.sourcePath}
                      onChange={(e) => {
                        const next = discovered.fields.find((f) => f.relative === e.target.value)
                        updateExtraClaim(extra.id, {
                          sourcePath: e.target.value,
                          valueKind: inferExtraValueKind(next?.type),
                          fieldKey: extra.fieldKey || slugifyKernelFieldKey(e.target.value),
                        })
                      }}
                      size="small"
                    >
                      {discovered.fields.map((f) => (
                        <MenuItem key={f.relative} value={f.relative}>{f.relative}</MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      label={t('integrations.kernelField')}
                      value={extra.fieldKey}
                      onChange={(e) => updateExtraClaim(extra.id, { fieldKey: slugifyKernelFieldKey(e.target.value) })}
                      size="small"
                      helperText={category ? `${fieldPrefixForCategory(category)}.${extra.fieldKey || 'field'}` : ' '}
                    />
                    <TextField
                      select
                      label={t('integrations.valueKind')}
                      value={extra.valueKind}
                      onChange={(e) => updateExtraClaim(extra.id, { valueKind: e.target.value as CustomExtraValueKind })}
                      size="small"
                      helperText={selected?.type ?? ' '}
                    >
                      <MenuItem value="string">string</MenuItem>
                      <MenuItem value="scalar">scalar</MenuItem>
                      <MenuItem value="bool">bool</MenuItem>
                      <MenuItem value="enum">enum</MenuItem>
                    </TextField>
                    <IconButton aria-label={t('integrations.removeField')} onClick={() => removeExtraClaim(extra.id)} size="small">
                      <Trash2 size={16} />
                    </IconButton>
                  </Paper>
                )
              })}
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Button onClick={runDryRun} disabled={dryRunning || !mapValid}
                variant="outlined" startIcon={dryRunning ? <CircularProgress size={14} /> : <FlaskConical size={15} />}
                sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}>
                {t('integrations.dryRunPreview')}
              </Button>
              {dryRun && (
                <Typography variant="caption" sx={{ color: BRAND, fontWeight: 700 }}>
                  {dryRun.drift.recordsMatched} {t('integrations.recordsMatched')} → {dryRun.drift.claimsEmitted} {t('integrations.claims')}
                  {dryRun.drift.canonicalKeyMissing ? ` · ${dryRun.drift.canonicalKeyMissing} ${t('integrations.missingKey')}` : ''}
                </Typography>
              )}
            </Box>
            {dryRunError && <Alert severity="error" sx={{ borderRadius: 2 }}>{dryRunError}</Alert>}

            {dryRun?.drafts && dryRun.drafts.length > 0 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                {dryRun.drafts.slice(0, 5).map((d, i) => (
                  <Paper key={i} variant="outlined" sx={{ p: 1.25, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 1.25 }}>
                    <Chip size="small" label={d.Type} sx={{ bgcolor: `${BRAND}18`, color: BRAND, fontWeight: 700 }} />
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="body2" fontWeight={600} noWrap>{d.Field} = {d.Value || '—'}</Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>{d.CanonicalKey}</Typography>
                    </Box>
                    {d.ValueKind === 'severity' && d.Value && <SeverityChip severity={normalizeSeverity(d.Value)} />}
                  </Paper>
                ))}
              </Box>
            )}
          </Box>
        )}

        {/* ── Footer ── */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mr: 'auto', maxWidth: 360 }}>
            {isPreset
              ? t('integrations.trustCertified')
              : t('integrations.trustCustom')}
          </Typography>
          {step > 0 && <Button onClick={() => setStep((i) => i - 1)} disabled={saving} sx={{ textTransform: 'none' }}>{t('common.back')}</Button>}
          <Button onClick={close} disabled={saving} sx={{ textTransform: 'none' }}>{t('common.cancel')}</Button>
          {step < lastStep ? (
            <Button variant="contained"
              disabled={step === 0 ? !step1Valid : !connectValid}
              onClick={() => setStep((i) => i + 1)}
              sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2, background: `linear-gradient(135deg, ${BRAND}, #3b82f6)`, boxShadow: 'none' }}>
              {t('common.next')}
            </Button>
          ) : (
            <Button variant="contained" disabled={saving || (isPreset ? !connectValid : !mapValid)}
              onClick={finish} startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <CheckCircle2 size={15} />}
              sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2, background: `linear-gradient(135deg, ${BRAND}, #3b82f6)`, boxShadow: 'none' }}>
              {saving ? t('integrations.wiring') : t('integrations.wireSource')}
            </Button>
          )}
        </Box>
      </Box>
    </Dialog>
  )
}

function inferExtraValueKind(type?: string): CustomExtraValueKind {
  const t = (type ?? '').toLowerCase()
  if (t === 'number' || t === 'integer' || t === 'float') return 'scalar'
  if (t === 'boolean' || t === 'bool') return 'bool'
  return 'string'
}

function isLikelyPrimaryField(path: string): boolean {
  const p = path.toLowerCase()
  return PRIMARY_FIELD_HINTS.some((hint) => p.includes(hint))
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="caption" color="text.secondary" fontWeight={800}
      sx={{ display: 'block', mb: 1, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {children}
    </Typography>
  )
}
