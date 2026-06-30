import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSnackbar } from 'notistack'
import { Box, Typography, Button, Alert, Chip } from '@mui/material'
import { Image, Upload, Eye } from 'lucide-react'
import { useOrg } from '@hooks/useOrg'
import { t, tOr } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { uploadCanonicalLogin, uploadBrandReference, getVisualSimilarity, type BrandReferenceKind } from '@lib/engine'
import { queryFailed, querySucceeded, queryUnresolved, resolvedList } from '@lib/queryState'

// CanonicalLoginTab — operator uploads their real login page
// screenshot. The discovery pipeline fingerprints every captured
// lookalike; this tab anchors the comparison reference.
//
// Honesty rule: "X% similar" is a triage signal, not a verdict.
// Takedown letter still requires brand-rights proof.

export function CanonicalLoginTab() {
  const qc = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()
  const { org } = useOrg()
  const orgId = org?.id
  const fileRef = useRef<HTMLInputElement>(null)
  const referenceFileRef = useRef<HTMLInputElement>(null)
  const referenceKindRef = useRef<BrandReferenceKind>('logo')
  const [referenceKind, setReferenceKind] = useState<BrandReferenceKind>('logo')

  const q = useQuery({
    queryKey: qk.pentest.visualSimilarity(orgId),
    queryFn: () => getVisualSimilarity(orgId!),
    enabled: !!orgId,
    staleTime: 30_000,
  })

  const uploadMut = useMutation({
    mutationFn: async (file: File) => uploadCanonicalLogin(orgId!, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.pentest.visualSimilarity(orgId) })
      enqueueSnackbar(t('canonical.uploaded'),
        { variant: 'success' })
    },
    onError: (e) => enqueueSnackbar(String(e as Error), { variant: 'error' }),
  })

  const referenceUploadMut = useMutation({
    mutationFn: async ({ file, kind }: { file: File; kind: BrandReferenceKind }) =>
      uploadBrandReference(orgId!, file, kind),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: qk.pentest.visualSimilarity(orgId) })
      qc.invalidateQueries({ queryKey: qk.exposure.brandProtection(orgId) })
      enqueueSnackbar(tOr('canonical.referenceUploaded',
        `${brandReferenceLabel(vars.kind)} reference stored — brand evidence scoring enabled`),
        { variant: 'success' })
    },
    onError: (e) => enqueueSnackbar(String(e as Error), { variant: 'error' }),
  })

  const visualReady = querySucceeded(q, !!orgId)
  const visualLoading = queryUnresolved(q, !!orgId)
  const visualFailed = queryFailed(q, !!orgId)
  const matches = resolvedList(q.data?.matches, q, !!orgId)
  const hasCanonical = visualReady && !!q.data?.canonical

  return (
    <Box sx={{ p: 3, maxWidth: 900 }}>
      <Alert severity="info" sx={{ mb: 2, fontSize: 13 }}>
        <strong>{t('canonical.title')}:</strong>{' '}
        {t('canonical.body')}
      </Alert>

      <Box sx={{ p: 3, mb: 2, border: '1px dashed', borderColor: 'divider', borderRadius: 1.5, textAlign: 'center' }}>
        {visualLoading ? (
          <Box>
            <Image size={32} style={{ opacity: 0.4, marginBottom: 8 }} />
            <Typography variant="body2" color="text.secondary">
              {t('canonical.loading')}
            </Typography>
          </Box>
        ) : visualFailed ? (
          <Box>
            <Image size={32} style={{ opacity: 0.4, marginBottom: 8 }} />
            <Typography variant="body2" color="error.main">
              {t('canonical.loadError')}
            </Typography>
          </Box>
        ) : hasCanonical ? (
          <Box>
            <Chip icon={<Image size={14} />} label={t('canonical.set')}
              sx={{ mb: 1, bgcolor: 'rgba(34,197,94,0.18)', color: '#22c55e' }} />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {t('canonical.referenceStored')}
            </Typography>
          </Box>
        ) : (
          <Box>
            <Image size={32} style={{ opacity: 0.4, marginBottom: 8 }} />
            <Typography variant="body2" color="text.secondary">
              {q.data?.hint || t('canonical.empty')}
            </Typography>
          </Box>
        )}
        <Box sx={{ mt: 2 }}>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg" style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) uploadMut.mutate(f)
            }} />
          <Button size="small" variant="contained" startIcon={<Upload size={14} />}
            onClick={() => fileRef.current?.click()}
            disabled={uploadMut.isPending}
            sx={{ textTransform: 'none', bgcolor: '#7c3aed', '&:hover': { bgcolor: '#6d28d9' } }}>
            {uploadMut.isPending ? 'Uploading…'
              : hasCanonical ? t('canonical.replace')
              : t('canonical.upload')}
          </Button>
        </Box>
      </Box>

      <Box sx={{ p: 2, mb: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
        <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>
          {t('canonical.brandReferencesTitle')}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
          {t('canonical.brandReferencesBody')}
        </Typography>
        <input ref={referenceFileRef} type="file" accept="image/png,image/jpeg" style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) referenceUploadMut.mutate({ file: f, kind: referenceKindRef.current })
            e.currentTarget.value = ''
          }} />
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {(['logo', 'homepage', 'canonical_login'] as const).map(kind => (
            <Button
              key={kind}
              size="small"
              variant="outlined"
              startIcon={<Upload size={14} />}
              onClick={() => {
                referenceKindRef.current = kind
                setReferenceKind(kind)
                referenceFileRef.current?.click()
              }}
              disabled={referenceUploadMut.isPending}
              sx={{ textTransform: 'none', borderRadius: 1.5 }}
            >
              {referenceUploadMut.isPending && referenceKind === kind
                ? t('canonical.uploading')
                : tOr(`canonical.reference.${kind}`, `Upload ${brandReferenceLabel(kind)}`)}
            </Button>
          ))}
        </Box>
      </Box>

      {hasCanonical && (
        <Box>
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
            {tOr('canonical.matchesTitle',
              `Visually similar lookalikes (≥${q.data?.threshold ?? 80}% similarity)`)}
          </Typography>
          {matches.length === 0 ? (
            <Typography variant="caption" color="text.secondary">
              {t('canonical.matchesEmpty')}
            </Typography>
          ) : (
            matches.map(m => (
              <Box key={m.asset_id} sx={{
                display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 1.5, alignItems: 'center',
                p: 1.5, mb: 0.5, border: '1px solid', borderColor: 'divider', borderRadius: 1,
              }}>
                <Box>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{m.value}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {m.asset_type} · visual evidence candidate
                  </Typography>
                </Box>
                <Chip size="small" label={`${m.similarity}%`}
                  sx={{
                    height: 22, fontSize: 13, fontWeight: 800,
                    bgcolor: m.similarity >= 92 ? 'rgba(239,68,68,0.20)' : 'rgba(249,115,22,0.18)',
                    color: m.similarity >= 92 ? '#ef4444' : '#f97316',
                  }} />
                <Button size="small" variant="text" startIcon={<Eye size={12} />}
                  sx={{ textTransform: 'none', fontSize: 13 }}>
                  {t('canonical.review')}
                </Button>
              </Box>
            ))
          )}
        </Box>
      )}
    </Box>
  )
}

function brandReferenceLabel(kind: BrandReferenceKind): string {
  switch (kind) {
    case 'canonical_login': return 'login'
    case 'homepage': return 'homepage'
    case 'logo': return 'logo'
    default: return kind
  }
}
