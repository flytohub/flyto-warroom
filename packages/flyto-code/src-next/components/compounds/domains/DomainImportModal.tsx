/**
 * DomainImportModal -- CSV/text import for bulk domain creation.
 *
 * Accepts a list of domains (one per line or CSV), shows a preview
 * of how they'll be grouped (root domains + subdomains), then
 * calls POST /domains/import.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import CircularProgress from '@mui/material/CircularProgress'
import { Upload, FileText, ChevronDown, ChevronRight } from 'lucide-react'
import { t, tOr } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { request } from '@lib/engine/client'
import { useOrg } from '@hooks/useOrg'
import { useQueryClient } from '@tanstack/react-query'
import { ENV_COLORS, ROLE_COLORS } from './types'

interface Props {
  opened: boolean
  onClose: () => void
}

interface DomainGroup {
  root: string
  subs: string[]
}

function parseDomains(text: string): string[] {
  return text.split(/[\n,]/)
    .map(s => s.trim().toLowerCase())
    .filter(s => s && s.includes('.') && !s.startsWith('#'))
    .map(s => s.replace(/^https?:\/\//, '').replace(/[/:?#].*/, ''))
    .filter((v, i, a) => a.indexOf(v) === i) // dedup
}

function groupDomains(domains: string[]): DomainGroup[] {
  const sorted = [...domains].sort((a, b) => a.length - b.length)
  const set = new Set(sorted)
  const roots: Record<string, string[]> = {}

  for (const d of sorted) {
    const parts = d.split('.')
    let isChild = false
    for (let i = 1; i < parts.length - 1; i++) {
      const parent = parts.slice(i).join('.')
      if (set.has(parent) && parent !== d) {
        if (!roots[parent]) roots[parent] = []
        roots[parent].push(d)
        isChild = true
        break
      }
    }
    if (!isChild && !roots[d]) {
      roots[d] = []
    }
  }

  return Object.entries(roots)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([root, subs]) => ({ root, subs }))
}

export function DomainImportModal({ opened, onClose }: Props) {
  const { org } = useOrg()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [env, setEnv] = useState<string>('production')
  const [role, setRole] = useState<string>('primary')
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<{ created: number; already_exist: number; subdomains: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Warn before unload when the modal has unsaved content.
  useEffect(() => {
    if (!opened || !text.trim()) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [opened, text])

  const domains = parseDomains(text)
  const groups = groupDomains(domains)

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setText(reader.result as string)
    reader.readAsText(file)
  }, [])

  async function handleImport() {
    if (!org || domains.length === 0) return
    setUploading(true)
    setError(null)
    try {
      const res = await request<{ created: number; already_exist: number; subdomains: number }>(
        'POST', `/api/v1/code/orgs/${org.id}/domains/import`,
        { domains, environment: env, role },
      )
      setResult(res)
      qc.invalidateQueries({ queryKey: qk.pentest.projects(org.id) })
      qc.invalidateQueries({ queryKey: qk.attackSurface(org.id) })
      qc.invalidateQueries({ queryKey: qk.externalPosture(org.id) })
      qc.invalidateQueries({ queryKey: qk.externalPostureKernel(org.id) })
      qc.invalidateQueries({ queryKey: qk.externalIssues(org.id) })
      qc.invalidateQueries({ queryKey: qk.assetMapKernel(org.id) })
    } catch (e) {
      setError(e instanceof Error ? e.message: t('hardcoded.import.failed.fbae8929'))
    } finally {
      setUploading(false)
    }
  }

  function handleClose() {
    setText('')
    setResult(null)
    setError(null)
    onClose()
  }

  return (
    <Dialog
      open={opened}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { bgcolor: 'background.paper', backgroundImage: 'none' } }}
    >
      <DialogTitle sx={{ fontWeight: 700, fontSize: 16, borderBottom: 1, borderColor: 'divider' }}>
        {t('domains.importTitle')}
      </DialogTitle>
      <DialogContent sx={{ p: 3 }}>
        {!result ? (
          <Box className="flex flex-col gap-4 pt-2">
            {/* Text input */}
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                {t('domains.importHint')}
              </Typography>
              <textarea
                className="w-full rounded-md p-3 text-sm font-mono"
                rows={8}
                placeholder={"example.com\napi.example.com\nstg.example.com\napp.example.com"}
                value={text}
                onChange={e => setText(e.target.value)}
                spellCheck={false}
                style={{
                  background: 'var(--mui-palette-background-default, #111)',
                  color: 'var(--mui-palette-text-primary, #eee)',
                  border: '1px solid var(--mui-palette-divider, #333)',
                }}
              />
              <Box className="flex justify-between mt-2">
                <Button
                  variant="text"
                  size="small"
                  onClick={() => fileRef.current?.click()}
                  startIcon={<FileText size={12} />}
                  sx={{ textTransform: 'none', fontSize: 12 }}
                >
                  {t('domains.uploadCsv')}
                </Button>
                <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} style={{ display: 'none' }} />
                <Typography variant="body2" color="text.secondary">{domains.length} domains</Typography>
              </Box>
            </Box>

            {/* Options */}
            <Box className="flex gap-3">
              <FormControl size="small" sx={{ flex: 1 }}>
                <InputLabel>{t('domains.environment')}</InputLabel>
                <Select
                  value={env}
                  onChange={e => setEnv(e.target.value)}
                  label={t('domains.environment')}
                  size="small"
                  sx={{ fontSize: 13 }}
                >
                  {Object.entries(ENV_COLORS).map(([k, v]) => (
                    <MenuItem key={k} value={k}>{v.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ flex: 1 }}>
                <InputLabel>{t('domains.role')}</InputLabel>
                <Select
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  label={t('domains.role')}
                  size="small"
                  sx={{ fontSize: 13 }}
                >
                  {Object.entries(ROLE_COLORS).map(([k, v]) => (
                    <MenuItem key={k} value={k}>{v.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            {/* Preview */}
            {groups.length > 0 && (
              <Box>
                <Typography variant="body2" fontWeight={700} color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                  {t('domains.preview')} -- {groups.length} root domains, {domains.length - groups.length} subdomains
                </Typography>
                <Box
                  sx={{
                    maxHeight: 200,
                    overflow: 'auto',
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 2,
                    p: 1,
                  }}
                >
                  {groups.map(g => (
                    <PreviewGroup key={g.root} group={g} env={env} />
                  ))}
                </Box>
              </Box>
            )}

            {error && <Typography variant="body2" color="error">{error}</Typography>}

            <Button
              variant="contained"
              onClick={handleImport}
              disabled={domains.length === 0 || uploading}
              startIcon={uploading ? <CircularProgress size={14} /> : <Upload size={14} />}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              {tOr('domains.importBtn', `Import ${domains.length} domains`)}
            </Button>
          </Box>
        ) : (
          <Box className="flex flex-col items-center gap-4 py-6">
            <Typography variant="h6" fontWeight={700} color="success.main">
              {t('domains.importSuccess')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {result.created} created, {result.already_exist} already existed, {result.subdomains} subdomains grouped
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('domains.importDiscovery')}
            </Typography>
            <Button variant="outlined" onClick={handleClose} sx={{ textTransform: 'none' }}>
              {t('common.close')}
            </Button>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  )
}

function PreviewGroup({ group, env }: { group: DomainGroup; env: string }) {
  const [open, setOpen] = useState(group.subs.length <= 3)
  const envInfo = ENV_COLORS[env] || ENV_COLORS.production
  return (
    <Box sx={{ mb: 0.5 }}>
      <Box
        className="flex items-center gap-2 cursor-pointer rounded px-2 py-1"
        onClick={() => setOpen(!open)}
        sx={{ '&:hover': { bgcolor: 'action.hover' }, fontSize: 14 }}
      >
        {group.subs.length > 0
          ? (open ? <ChevronDown size={12} /> : <ChevronRight size={12} />)
          : <Box sx={{ width: 12 }} />
        }
        <Typography variant="body2" fontWeight={600}>{group.root}</Typography>
        <Box
          aria-hidden
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: envInfo.color,
          }}
        />
        <Typography variant="caption" sx={{ color: envInfo.color }}>{envInfo.label}</Typography>
        {group.subs.length > 0 && (
          <Typography variant="body2" color="text.secondary">{group.subs.length} sub</Typography>
        )}
      </Box>
      {open && group.subs.map(sub => (
        <Typography key={sub} variant="body2" color="text.secondary" sx={{ display: 'block', pl: 4, py: 0.25 }}>
          {sub}
        </Typography>
      ))}
    </Box>
  )
}
