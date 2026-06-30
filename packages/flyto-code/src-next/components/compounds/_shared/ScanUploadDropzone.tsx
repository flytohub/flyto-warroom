/**
 * ScanUploadDropzone — drag-and-drop upload of flyto-indexer export JSON.
 */

import { useState, useRef, useCallback } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Paper from '@mui/material/Paper'
import Alert from '@mui/material/Alert'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import { Upload, FileJson, Check } from 'lucide-react'
import { t } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { request } from '@lib/engine/client'
import { connectRepo } from '@lib/engine'
import { useOrg } from '@hooks/useOrg'
import { useCapabilities } from '@hooks/useCapabilities'
import { useProjectCapabilities } from '@hooks/useProjectCapabilities'
import { useQueryClient } from '@tanstack/react-query'

interface Props {
  repoId?: string
  onSuccess?: (repoId: string) => void
  compact?: boolean
}

interface ScanPreview {
  projectType: string
  fileCount: number
  depCount: number
  apiCount: number
  hasFull: boolean
}

function parseScanJson(data: unknown): { preview: ScanPreview; raw: unknown } | null {
  if (!data || typeof data !== 'object') return null
  const obj = data as Record<string, unknown>
  const profile = obj.profile as Record<string, unknown> | undefined
  if (!profile) return null
  return {
    preview: {
      projectType: String(profile.project_type || 'unknown'),
      fileCount: Number(profile.file_count || 0),
      depCount: Number(profile.dependency_count || 0),
      apiCount: Number(profile.api_definition_count || 0),
      hasFull: !!obj.index,
    },
    raw: data,
  }
}

export function ScanUploadDropzone({ repoId, onSuccess, compact }: Props) {
  const { org } = useOrg()
  const caps = useCapabilities(org?.id)
  const projectCaps = useProjectCapabilities(org?.id)
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [repoName, setRepoName] = useState('')
  const [preview, setPreview] = useState<ScanPreview | null>(null)
  const [rawData, setRawData] = useState<unknown>(null)
  const [uploading, setUploading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const needsRepoName = !repoId
  const canUploadScan = caps.canDoAction('scan:trigger_code') && projectCaps.canUseAction('scan:trigger_code')
  const canConnectRepo = repoId ? true : caps.canDoAction('repo:connect') && projectCaps.canUseAction('repo:connect')
  const capsPending = !!org?.id && ((!caps.ready && !caps.isError) || (!projectCaps.ready && !projectCaps.isError))
  const permissionDenied = !!org?.id && caps.ready && projectCaps.ready && (!canUploadScan || !canConnectRepo)
  const permissionDeniedMessage = !canUploadScan
    ? t('upload.permissionDenied')
    : t('upload.repoConnectDenied')

  const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100 MB

  const handleFile = useCallback((file: File) => {
    setError(null)
    setDone(false)
    if (!org?.id || !caps.ready || !projectCaps.ready || !canUploadScan || !canConnectRepo) {
      setError(permissionDeniedMessage)
      return
    }
    if (!file.name.endsWith('.json')) {
      setError(t('upload.notJson'))
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setError(t('upload.tooLarge'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string)
        const result = parseScanJson(data)
        if (!result) {
          setError(t('upload.noProfile'))
          return
        }
        setPreview(result.preview)
        setRawData(result.raw)
      } catch {
        setError(t('upload.parseError'))
      }
    }
    reader.readAsText(file)
  }, [canConnectRepo, canUploadScan, caps.ready, org?.id, permissionDeniedMessage, projectCaps.ready])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }, [handleFile])

  async function handleUpload() {
    if (!org || !rawData) return
    if (!caps.ready || !canUploadScan || !canConnectRepo) {
      setError(permissionDeniedMessage)
      return
    }
    setUploading(true)
    setError(null)
    try {
      let targetRepoId = repoId
      if (!targetRepoId) {
        if (!repoName.trim()) {
          setError(t('upload.needRepoName'))
          setUploading(false)
          return
        }
        const repo = await connectRepo(org.id, {
          provider: 'local', providerId: `local-${Date.now()}`,
          ownerName: org.name || 'local', repoName: repoName.trim(),
          fullName: `${org.name || 'local'}/${repoName.trim()}`,
          defaultBranch: 'main', isPrivate: true, htmlUrl: '', avatarUrl: '',
        })
        targetRepoId = repo.id
      }
      const uploadBody = rawData && typeof rawData === 'object' && !Array.isArray(rawData)
        ? { ...(rawData as Record<string, unknown>), source_mode: 'local_cli' }
        : rawData
      await request('POST', `/api/v1/code/repos/${targetRepoId}/scan-upload`, uploadBody)
      setDone(true)
      qc.invalidateQueries({ queryKey: qk.repos.healthSummary(org.id) })
      qc.invalidateQueries({ queryKey: qk.repos.connected(org.id) })
      onSuccess?.(targetRepoId!)
    } catch (e) {
      setError(e instanceof Error ? e.message: t('hardcoded.upload.failed.ad0d0603'))
    } finally {
      setUploading(false)
    }
  }

  if (!org?.id) {
    return (
      <Alert severity="warning" variant="outlined" className="rounded-lg">
        {t('upload.noOrg')}
      </Alert>
    )
  }

  if (capsPending) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, color: 'text.secondary' }}>
        <CircularProgress size={18} />
        <Typography variant="body2">{t('upload.loadingPermissions')}</Typography>
      </Box>
    )
  }

  if (caps.isError) {
    return (
      <Alert
        severity="error"
        variant="outlined"
        action={(
          <Button color="inherit" size="small" onClick={() => caps.refetch()}>
            {t('common.retry')}
          </Button>
        )}
        className="rounded-lg"
      >
        {t('upload.permissionsUnavailable')}
      </Alert>
    )
  }

  if (permissionDenied) {
    return (
      <Alert severity="warning" variant="outlined" className="rounded-lg">
        {permissionDeniedMessage}
      </Alert>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Dropzone */}
      <Paper
        elevation={0}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        sx={{
          border: 2,
          borderStyle: 'dashed',
          borderColor: dragging ? 'primary.main' : 'divider',
          borderRadius: 3,
          p: compact ? 3 : 5,
          textAlign: 'center',
          cursor: 'pointer',
          bgcolor: dragging ? 'action.hover' : 'transparent',
          transition: 'all 0.2s',
          '&:hover': {
            borderColor: 'primary.light',
            bgcolor: 'action.hover',
          },
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          onChange={handleSelect}
          style={{ display: 'none' }}
        />

        {!preview && !done && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{
              width: 56, height: 56, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              bgcolor: 'action.hover',
            }}>
              <Upload size={24} />
            </Box>
            <Typography variant="body1" fontWeight={500}>
              {t('upload.dropHint')}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
              flyto-index scan . && flyto-index export . &gt; scan.json
            </Typography>
          </Box>
        )}

        {preview && !done && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, textAlign: 'left' }}>
            <Box sx={{
              width: 44, height: 44, borderRadius: 2,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              bgcolor: 'action.hover',
            }}>
              <FileJson size={22} style={{ color: '#a78bfa' }} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" fontWeight={600}>{preview.projectType}</Typography>
                <Chip
                  label={`${preview.fileCount} files`}
                  size="small"
                  variant="outlined"
                  sx={{ fontWeight: 600 }}
                />
              </Box>
              <Typography variant="body2" color="text.secondary">
                {preview.fileCount} files, {preview.depCount} deps, {preview.apiCount} APIs
                {preview.hasFull && (
                  <Typography component="span" variant="caption" color="success.main" sx={{ ml: 1 }}>
                    + symbol graph
                  </Typography>
                )}
              </Typography>
            </Box>
            <Button
              size="small"
              onClick={(e) => { e.stopPropagation(); setPreview(null); setRawData(null) }}
              sx={{ textTransform: 'none' }}
            >
              {t('upload.change')}
            </Button>
          </Box>
        )}

        {done && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, justifyContent: 'center' }}>
            <Check size={20} style={{ color: '#22c55e' }} />
            <Typography variant="body2" color="success.main">
              {t('upload.success')}
            </Typography>
          </Box>
        )}
      </Paper>

      {/* Repo name input */}
      {needsRepoName && preview && !done && (
        <TextField
          label={t('upload.repoName')}
          placeholder="my-project"
          value={repoName}
          onChange={(e) => setRepoName(e.target.value)}
          size="small"
          fullWidth
        />
      )}

      {/* Error */}
      {error && (
        <Alert severity="error" variant="outlined" className="rounded-lg">
          {error}
        </Alert>
      )}

      {/* Upload button */}
      {preview && !done && (
        <Button
          startIcon={uploading ? <CircularProgress size={16} color="inherit" /> : <Upload size={16} />}
          variant="contained"
          onClick={handleUpload}
          disabled={uploading || (needsRepoName && !repoName.trim())}
          size={compact ? 'small' : 'medium'}
          sx={{
            textTransform: 'none', fontWeight: 600, borderRadius: 2, alignSelf: 'flex-start',
            background: 'linear-gradient(135deg, #7c3aed, #3b82f6)', boxShadow: 'none',
          }}
        >
          {t('upload.submit')}
        </Button>
      )}
    </Box>
  )
}
