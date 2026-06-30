import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSnackbar } from 'notistack'
import {
  Box, Typography, Button, TextField, Chip, IconButton,
} from '@mui/material'
import { Plus, Archive, Network, Save, X } from 'lucide-react'
import { useOrg } from '@hooks/useOrg'
import EmptyStateGuide from '@atoms/EmptyStateGuide'
import InlineErrorNotice from '@atoms/InlineErrorNotice'
import { LoadingState } from '@atoms/LoadingState'
import { QueryError } from '@atoms/QueryError'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import {
  listBusinessUnits, createBusinessUnit, archiveBusinessUnit,
  parseComplianceScope, COMPLIANCE_SCOPE_OPTIONS,
  type BusinessUnit, type UpsertBusinessUnitReq, type ComplianceScopeTag,
} from '@lib/engine'

// BusinessUnitsTab — Phase A enterprise governance. Per-org BU
// CRUD. Each BU carries (key, label, owner_email, compliance_scope).
// Assets (repos / attack_surface rows) get assigned to a BU
// elsewhere; this tab is just the BU catalogue.

const EMPTY_FORM: UpsertBusinessUnitReq = {
  key: '',
  label: '',
  owner_email: '',
  compliance_scope: [],
  description: '',
}

export function BusinessUnitsTab() {
  const qc = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()
  const { org } = useOrg()
  const orgId = org?.id
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<UpsertBusinessUnitReq>(EMPTY_FORM)

  const q = useQuery({
    queryKey: qk.platform.businessUnits(orgId),
    queryFn: () => listBusinessUnits(orgId!, false),
    enabled: !!orgId,
    staleTime: 30_000,
  })

  const createMut = useMutation({
    mutationFn: (req: UpsertBusinessUnitReq) => createBusinessUnit(orgId!, req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.platform.businessUnits(orgId) })
      enqueueSnackbar(t('bu.created'), { variant: 'success' })
      setAdding(false)
      setForm(EMPTY_FORM)
    },
    onError: (e) => enqueueSnackbar(String(e as Error), { variant: 'error' }),
  })

  const archiveMut = useMutation({
    mutationFn: (id: string) => archiveBusinessUnit(orgId!, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.platform.businessUnits(orgId) })
      enqueueSnackbar(t('bu.archived'), { variant: 'info' })
    },
    onError: (e) => enqueueSnackbar(String(e as Error), { variant: 'error' }),
  })

  const toggleScope = (tag: ComplianceScopeTag) => {
    setForm(prev => {
      const cur = prev.compliance_scope ?? []
      const has = cur.includes(tag)
      return {
        ...prev,
        compliance_scope: has ? cur.filter(t => t !== tag) : [...cur, tag],
      }
    })
  }

  return (
    <Box sx={{ p: 3, maxWidth: 900 }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t('bu.lede')}
      </Typography>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        {!adding && (
          <Button size="small" variant="contained" startIcon={<Plus size={14} />}
            onClick={() => setAdding(true)}
            sx={{ textTransform: 'none', bgcolor: '#7c3aed', '&:hover': { bgcolor: '#6d28d9' } }}>
            {t('bu.add')}
          </Button>
        )}
      </Box>

      {adding && (
        <Box sx={{ p: 2, mb: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 2, mb: 2 }}>
            <TextField label={t('bu.fieldKey')} size="small"
              value={form.key} onChange={e => setForm({ ...form, key: e.target.value.toLowerCase() })}
              placeholder="payments-platform" />
            <TextField label={t('bu.fieldLabel')} size="small" fullWidth
              value={form.label} onChange={e => setForm({ ...form, label: e.target.value })}
              placeholder={t('bu.fieldLabelPlaceholder')} />
          </Box>
          <TextField label={t('bu.fieldOwner')} size="small" fullWidth sx={{ mb: 2 }}
            value={form.owner_email} onChange={e => setForm({ ...form, owner_email: e.target.value })}
            placeholder="ops@acme.com" />
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              {t('bu.fieldScope')}
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {COMPLIANCE_SCOPE_OPTIONS.map(opt => {
                const active = (form.compliance_scope ?? []).includes(opt.value)
                return (
                  <Chip
                    key={opt.value}
                    size="small"
                    label={opt.label}
                    onClick={() => toggleScope(opt.value)}
                    sx={{
                      cursor: 'pointer', fontWeight: 600, fontSize: 13, height: 22,
                      bgcolor: active ? 'rgba(124,58,237,0.20)' : 'transparent',
                      color: active ? '#a78bfa' : 'text.secondary',
                      border: '1px solid', borderColor: active ? '#7c3aed' : 'divider',
                    }}
                  />
                )
              })}
            </Box>
          </Box>
          <TextField label={t('bu.fieldDesc')} size="small" fullWidth multiline minRows={2}
            value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
            sx={{ mb: 2 }} />
          {createMut.isError && (
            <Box sx={{ mb: 1 }}>
              <InlineErrorNotice error={createMut.error} title={t('bu.save')} />
            </Box>
          )}
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button size="small" variant="contained" startIcon={<Save size={13} />}
              disabled={!form.key || !form.label || createMut.isPending}
              onClick={() => createMut.mutate(form)}
              sx={{ textTransform: 'none', bgcolor: '#7c3aed', '&:hover': { bgcolor: '#6d28d9' } }}>
              {t('bu.save')}
            </Button>
            <Button size="small" variant="outlined" startIcon={<X size={13} />}
              onClick={() => { setAdding(false); setForm(EMPTY_FORM) }}
              sx={{ textTransform: 'none' }}>
              {t('bu.cancel')}
            </Button>
          </Box>
        </Box>
      )}

      {q.isLoading && <LoadingState variant="spinner" py={6} />}
      {q.isError && <QueryError error={q.error} onRetry={q.refetch} label={t('bu.lede')} compact />}
      {!q.isLoading && !q.isError && (q.data?.items?.length ?? 0) === 0 && !adding && (
        <EmptyStateGuide
          icon={<Network size={28} />}
          title={t('bu.empty')}
          description={t('bu.emptyHint')}
          py={6}
        />
      )}

      {(q.data?.items ?? []).map(bu => (
        <BURow key={bu.id} bu={bu} onArchive={() => archiveMut.mutate(bu.id)} />
      ))}
    </Box>
  )
}

function BURow({ bu, onArchive }: { bu: BusinessUnit; onArchive: () => void }) {
  const scopes = parseComplianceScope(bu.compliance_scope)
  return (
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: '180px 1fr auto',
      alignItems: 'center', gap: 2, p: 2, mb: 1,
      border: '1px solid', borderColor: 'divider', borderRadius: 1,
    }}>
      <Box>
        <Typography variant="body2" fontWeight={700}>{bu.label}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
          {bu.key}
        </Typography>
      </Box>
      <Box>
        {bu.owner_email && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {t('bu.ownerPrefix')}: {bu.owner_email}
          </Typography>
        )}
        <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
          {scopes.map(s => (
            <Chip key={s} size="small" label={String(s).toUpperCase()}
              sx={{ height: 18, fontSize: 12, bgcolor: 'rgba(124,58,237,0.15)', color: '#a78bfa' }} />
          ))}
        </Box>
        {bu.description && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            {bu.description}
          </Typography>
        )}
      </Box>
      <IconButton size="small" onClick={onArchive}
        title={t('bu.archiveTooltip')}>
        <Archive size={14} />
      </IconButton>
    </Box>
  )
}
