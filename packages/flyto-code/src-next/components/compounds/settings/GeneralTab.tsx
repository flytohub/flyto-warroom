import { useState, useEffect } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import FormControl from '@mui/material/FormControl'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import { Database, Building2, Save, Trash2, AlertTriangle } from 'lucide-react'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { useLocale } from '@hooks/useLocale'
import { useOrg } from '@hooks/useOrg'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateOrg, deleteOrg } from '@lib/engine'
import { GatedButton } from '@atoms/GatedButton'
import InlineErrorNotice from '@atoms/InlineErrorNotice'
import { sectionTitleSx, accentCardSx, rowSx, iconBoxSx, selectSx, inputSx } from './shared'

export function GeneralTab() {
  useLocale()
  const { org } = useOrg()
  const qc = useQueryClient()

  const [name, setName] = useState(org?.name ?? '')
  const [slug, setSlug] = useState(org?.slug ?? '')
  const [orgSaved, setOrgSaved] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (org) {
      setName(org.name)
      setSlug(org.slug)
    }
  }, [org])

  const saveMutation = useMutation({
    mutationFn: () => updateOrg(org!.id, { name, slug }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.platform.orgs() })
      setOrgSaved(true)
      setTimeout(() => setOrgSaved(false), 2000)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteOrg(org!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.platform.orgs() })
      window.location.href = '/projects'
    },
  })


  return (
    <>
      {/* Org Info */}
      <Box sx={sectionTitleSx}>
        <Building2 size={15} style={{ color: '#a78bfa', opacity: 0.9 }} />
        <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', fontSize: 12 }}>
          {t('settings.orgInfo')}
        </Typography>
      </Box>
      <Box sx={accentCardSx('#a78bfa')}>
        <Box sx={{ ...rowSx, flexDirection: 'column', alignItems: 'stretch', gap: 2 }}>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              size="small"
              label={t('settings.orgName')}
              value={name}
              onChange={e => setName(e.target.value)}
              fullWidth
              sx={inputSx}
            />
            <TextField
              size="small"
              label={t('settings.orgSlug')}
              value={slug}
              onChange={e => setSlug(e.target.value)}
              fullWidth
              sx={inputSx}
            />
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, alignItems: 'center' }}>
            {orgSaved && <Alert severity="success" sx={{ py: 0, borderRadius: 2 }}>{t('settings.saved')}</Alert>}
            {saveMutation.isError && <InlineErrorNotice error={saveMutation.error} title={t('settings.saveFailed')} />}
            <GatedButton
              action="org:settings"
              size="small"
              variant="contained"
              startIcon={<Save size={14} />}
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || (!name && !slug)}
              sx={{
                textTransform: 'none', fontWeight: 700, borderRadius: 2, px: 2.5,
                background: 'linear-gradient(135deg, #a78bfa, #8b5cf6)', boxShadow: 'none',
                '&:hover': { background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', boxShadow: 'none' },
              }}
            >
              {t('settings.save')}
            </GatedButton>
          </Box>
        </Box>
      </Box>

      {/* Data */}
      <Box sx={sectionTitleSx}>
        <Database size={15} style={{ color: '#fb923c', opacity: 0.9 }} />
        <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', fontSize: 12 }}>
          {t('settings.data')}
        </Typography>
      </Box>
      <Box sx={accentCardSx('#fb923c')}>
        <Box sx={rowSx}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
            <Box sx={iconBoxSx('#fb923c')}>
              <Database size={15} style={{ color: '#fb923c' }} />
            </Box>
            <Box>
              <Typography variant="body2" fontWeight={600} color="text.primary">
                {t('settings.dataRetention')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ display: 'block', mt: 0.25, lineHeight: 1.4 }}>
                {t('settings.dataRetentionDesc')}
              </Typography>
            </Box>
          </Box>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <Select value="365" size="small" sx={selectSx}>
              <MenuItem value="90">{t('settings.retention90d')}</MenuItem>
              <MenuItem value="365">{t('settings.retention1y')}</MenuItem>
              <MenuItem value="730">{t('settings.retention2y')}</MenuItem>
            </Select>
          </FormControl>
        </Box>
      </Box>

      {/* Danger Zone */}
      <Box sx={sectionTitleSx}>
        <AlertTriangle size={15} style={{ color: '#ef4444', opacity: 0.9 }} />
        <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', fontSize: 12 }}>
          {t('settings.dangerZone')}
        </Typography>
      </Box>
      <Box sx={accentCardSx('#ef4444')}>
        <Box sx={rowSx}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
            <Box sx={iconBoxSx('#ef4444')}>
              <Trash2 size={15} style={{ color: '#ef4444' }} />
            </Box>
            <Box>
              <Typography variant="body2" fontWeight={600} color="text.primary">
                {t('settings.deleteOrg')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ display: 'block', mt: 0.25, lineHeight: 1.4 }}>
                {t('settings.deleteOrgDesc')}
              </Typography>
            </Box>
          </Box>
          {!confirmDelete ? (
            <GatedButton
              action="org:delete"
              size="small"
              variant="outlined"
              color="error"
              onClick={() => setConfirmDelete(true)}
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
            >
              {t('settings.delete')}
            </GatedButton>
          ) : (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                size="small"
                variant="outlined"
                onClick={() => setConfirmDelete(false)}
                sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
              >
                {t('settings.cancel')}
              </Button>
              <GatedButton
                action="org:delete"
                size="small"
                variant="contained"
                color="error"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
              >
                {t('settings.confirmDelete')}
              </GatedButton>
            </Box>
          )}
        </Box>
      </Box>
    </>
  )
}
