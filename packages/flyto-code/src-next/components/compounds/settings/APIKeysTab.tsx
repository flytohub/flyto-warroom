import { accentCardSx } from './shared'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import ButtonGroup from '@mui/material/ButtonGroup'
import TextField from '@mui/material/TextField'
import IconButton from '@mui/material/IconButton'
import Chip from '@mui/material/Chip'
import { Key, Copy, Check, Trash2, Plus, AlertTriangle, Shield } from 'lucide-react'
import { t, tOr } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { useOrg } from '@hooks/useOrg'
import EmptyStateGuide from '@atoms/EmptyStateGuide'
import {
  ciCheckEndpoint,
  createAPIKey,
  listAPIKeys,
  mcpIngestEndpoint,
  revokeAPIKey,
  runtimeEventsEndpoint,
  scanUploadEndpoint,
} from '@lib/engine'
import { GatedButton, GatedIconButton } from '@atoms/GatedButton'
import InlineErrorNotice from '@atoms/InlineErrorNotice'
import { LoadingState } from '@atoms/LoadingState'
import { QueryError } from '@atoms/QueryError'

const API_KEY_SCOPE_OPTIONS = [
  { value: 'read,write', label: t('hardcoded.read.write.7c0d355c') },
  { value: 'read', label: t('hardcoded.read.only.9b19a5a2') },
  { value: 'runtime:ingest', label: t('hardcoded.runtime.ingest.6954bea0') },
  { value: 'ci:check', label: t('hardcoded.ci.check.16736ccb') },
  { value: 'mcp:invoke', label: t('nav.agentFirewall') },
] as const

type APIKeyScopeOption = typeof API_KEY_SCOPE_OPTIONS[number]['value']

const API_KEY_SCOPE_LABEL_KEYS: Record<string, string> = {
  'read': 'settings.apiKeyScopeReadOnly',
  'runtime:ingest': 'settings.apiKeyScopeRuntimeIngest',
  'ci:check': 'settings.apiKeyScopeCiCheck',
  'mcp:invoke': 'settings.apiKeyScopeAgentFirewall',
}

const sectionTitleSx = {
  display: 'flex',
  alignItems: 'center',
  gap: 1,
  mb: 1.5,
  mt: 0.5,
}

export function APIKeysTab() {
  const { org } = useOrg()
  const qc = useQueryClient()
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyScope, setNewKeyScope] = useState<APIKeyScopeOption>('read,write')
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [createdScope, setCreatedScope] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; name: string } | null>(null)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.platform.apiKeys(org?.id),
    queryFn: () => listAPIKeys(org!.id),
    enabled: !!org?.id,
  })

  const createMut = useMutation({
    mutationFn: () => createAPIKey(org!.id, newKeyName, newKeyScope),
    onSuccess: (resp) => {
      setCreatedKey(resp.key)
      setCreatedScope(resp.scopes)
      setNewKeyName('')
      qc.invalidateQueries({ queryKey: qk.platform.apiKeys(org?.id) })
    },
  })

  const revokeMut = useMutation({
    mutationFn: (keyId: string) => revokeAPIKey(org!.id, keyId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.platform.apiKeys(org?.id) })
    },
  })

  const keys = data?.keys ?? []

  function handleCopy() {
    if (createdKey) {
      navigator.clipboard.writeText(createdKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  function usageSnippet() {
    if (!createdKey) return ''
    const scopes = createdScope?.split(',').map(s => s.trim()) ?? []
    if (scopes.includes('mcp:invoke') && org?.id) {
      return `curl -X POST \\
  -H "X-Flyto2-API-Key: $FLYTO_MCP_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"sessionKey":"manual-test","agentId":"local-mcp","serverId":"flyto-security-mcp","toolName":"connection_probe","verb":"READ","dataClass":"metadata","dataDirection":"internal"}' \\
  ${mcpIngestEndpoint(org.id)}`
    }
    if (scopes.includes('runtime:ingest')) {
      return `curl -X POST \\
  -H "X-Flyto2-API-Key: $FLYTO_RUNTIME_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"events":[{"type":"info","path":"/health","timestamp":"2026-06-07T00:00:00Z"}]}' \\
  ${runtimeEventsEndpoint()}`
    }
    if (scopes.includes('ci:check')) {
      return `curl -X POST \\
  -H "X-Flyto2-API-Key: $FLYTO_CI_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"sha":"HEAD","status":"passed"}' \\
  ${ciCheckEndpoint()}`
    }
    return `flyto-index export . --full | curl -X POST \\
  -H "X-API-Key: $FLYTO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d @- ${scanUploadEndpoint()}`
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Description */}
      <Box sx={sectionTitleSx}>
        <Key size={15} style={{ color: '#a78bfa', opacity: 0.9 }} />
        <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', fontSize: 12 }}>
          {t('settings.apiKeysTitle')}
        </Typography>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6, mt: -1.5 }}>
        {t('settings.apiKeysDesc')}
      </Typography>

      {/* Create new key */}
      <Box sx={accentCardSx('#06b6d4')}>
        <Box
          sx={{
            display: 'flex',
            gap: 1.5,
            alignItems: 'center',
            px: 2.5,
            py: 2,
            borderBottom: createdKey ? 1 : 0,
            borderColor: 'divider',
            bgcolor: 'action.hover',
          }}
        >
          <Box sx={{
            width: 32,
            height: 32,
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'rgba(167,139,250,0.12)',
            flexShrink: 0,
          }}>
            <Plus size={15} style={{ color: '#a78bfa' }} />
          </Box>
          <TextField
            value={newKeyName}
            onChange={e => setNewKeyName(e.target.value)}
            placeholder={t('settings.apiKeyName')}
            size="small"
            sx={{
              flex: 1,
              '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(167,139,250,0.2)' },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(167,139,250,0.4)' },
            }}
            slotProps={{ input: { sx: { fontSize: 13, borderRadius: 2 } } }}
          />
          <ButtonGroup size="small" variant="outlined" sx={{ flexWrap: 'wrap', alignSelf: 'stretch' }}>
            {API_KEY_SCOPE_OPTIONS.map(({ value, label }) => (
              <Button
                key={value}
                variant={newKeyScope === value ? 'contained' : 'outlined'}
                onClick={() => setNewKeyScope(value)}
                sx={{
                  textTransform: 'none', fontWeight: 600, fontSize: 13,
                  borderColor: 'rgba(167,139,250,0.3)',
                  ...(newKeyScope === value && {
                    background: 'linear-gradient(135deg, #a78bfa, #8b5cf6)', boxShadow: 'none',
                    borderColor: '#8b5cf6',
                    '&:hover': { background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', boxShadow: 'none' },
                  }),
                  ...(newKeyScope !== value && {
                    color: 'text.secondary',
                    '&:hover': { borderColor: '#a78bfa' },
                  }),
                }}
              >
                {API_KEY_SCOPE_LABEL_KEYS[value] ? tOr(API_KEY_SCOPE_LABEL_KEYS[value], label) : label}
              </Button>
            ))}
          </ButtonGroup>
          <GatedButton
            action="org:settings"
            variant="contained"
            size="small"
            startIcon={<Key size={14} />}
            onClick={() => createMut.mutate()}
            disabled={!newKeyName.trim() || createMut.isPending}
            sx={{
              textTransform: 'none',
              fontWeight: 700,
              borderRadius: 2,
              px: 2.5,
              background: 'linear-gradient(135deg, #a78bfa, #8b5cf6)', boxShadow: 'none',
              '&:hover': { background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', boxShadow: 'none' },
            }}
          >
            {t('settings.createKey')}
          </GatedButton>
        </Box>

        {/* Show created key ONCE */}
        {createdKey && (
          <Box sx={{ px: 2.5, py: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <AlertTriangle size={14} style={{ color: '#fbbf24' }} />
              <Typography variant="body2" fontWeight={700} color="warning.main">
                {t('settings.copyKeyWarning')}
              </Typography>
            </Box>
            <Box
              sx={{
                display: 'flex',
                gap: 1,
                alignItems: 'center',
                p: 1.5,
                borderRadius: 2,
                bgcolor: 'rgba(52,211,153,0.06)',
                border: '1px solid rgba(52,211,153,0.15)',
              }}
            >
              <Box
                component="code"
                sx={{
                  flex: 1,
                  px: 1.5,
                  py: 0.5,
                  borderRadius: 1.5,
                  bgcolor: '#0f172a',
                  fontSize: 12,
                  fontFamily: 'monospace',
                  color: '#34d399',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  letterSpacing: '0.02em',
                }}
              >
                {createdKey}
              </Box>
              <IconButton
                size="small"
                onClick={handleCopy}
                aria-label={t('common.copy')}
                title={t('common.copy')}
                sx={{
                  color: copied ? '#34d399' : 'text.secondary',
                  bgcolor: 'action.hover',
                  '&:hover': { bgcolor: 'rgba(167,139,250,0.1)' },
                }}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </IconButton>
            </Box>

            {/* Usage snippet */}
            <Box sx={{ mt: 1.5 }}>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                {t('settings.usage')}
              </Typography>
              <Box
                component="pre"
                sx={{
                  mt: 0.75,
                  px: 1.5,
                  py: 1.25,
                  borderRadius: 2,
                  bgcolor: '#0f172a',
                  border: '1px solid',
                  borderColor: 'divider',
                  fontSize: 12,
                  lineHeight: 1.6,
                  overflow: 'auto',
                  fontFamily: 'monospace',
                  color: '#cbd5e1',
                }}
              >
{usageSnippet()}
              </Box>
            </Box>

            <Button
              size="small"
              variant="text"
              onClick={() => { setCreatedKey(null); setCreatedScope(null) }}
              sx={{ mt: 1, textTransform: 'none', color: 'text.secondary', fontSize: 12, '&:hover': { color: '#a78bfa' } }}
            >
              {t('common.dismiss')}
            </Button>
          </Box>
        )}

        {createMut.isError && (
          <Box sx={{ px: 2.5, pb: 2 }}>
            <InlineErrorNotice error={createMut.error} title={t('settings.createKey')} />
          </Box>
        )}
      </Box>

      {/* Existing keys */}
      {isLoading && (
        <LoadingState variant="spinner" py={5} />
      )}

      {!isLoading && isError && (
        <QueryError error={error} onRetry={refetch} label={t('settings.apiKeysTitle')} compact />
      )}

      {!isLoading && !isError && keys.length === 0 && !createdKey && (
        <EmptyStateGuide
          icon={<Shield size={28} />}
          title={t('settings.noKeys')}
          py={5}
        />
      )}

      {revokeMut.isError && (
        <InlineErrorNotice error={revokeMut.error} title={t('settings.revokeKey')} />
      )}

      {!isError && keys.length > 0 && (
        <Box sx={accentCardSx('#06b6d4')}>
          {keys.map((k, idx) => (
            <Box
              key={k.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                px: 2.5,
                py: 2,
                borderBottom: idx < keys.length - 1 ? 1 : 0,
                borderColor: 'divider',
                transition: 'background 0.15s ease',
                '&:hover': { bgcolor: 'rgba(167,139,250,0.03)' },
              }}
            >
              <Box sx={{
                width: 32,
                height: 32,
                borderRadius: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'rgba(167,139,250,0.1)',
                flexShrink: 0,
              }}>
                <Key size={14} style={{ color: '#a78bfa', opacity: 0.7 }} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" fontWeight={700} color="text.primary" sx={{ fontSize: 13 }}>
                  {k.name}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.5, flexWrap: 'wrap' }}>
                  <Chip
                    label={`${k.key_prefix}...`}
                    size="small"
                    sx={{
                      height: 24,
                      fontSize: 12,
                      fontWeight: 600,
                      fontFamily: 'monospace',
                      bgcolor: 'action.hover',
                      color: 'text.secondary',
                    }}
                  />
                  {k.scopes.split(',').map(scope => (
                    <Chip
                      key={scope}
                      label={scope.trim()}
                      size="small"
                      sx={{
                        height: 24,
                        fontSize: 12,
                        fontWeight: 600,
                        bgcolor: 'rgba(167,139,250,0.08)',
                        color: '#a78bfa',
                      }}
                    />
                  ))}
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12, ml: 0.5 }}>
                    {new Date(k.created_at).toLocaleDateString()}
                    {k.last_used_at && ` | last used ${new Date(k.last_used_at).toLocaleDateString()}`}
                  </Typography>
                </Box>
              </Box>
              <GatedIconButton
                action="org:settings"
                size="small"
                onClick={() => setRevokeTarget({ id: k.id, name: k.name })}
                sx={{
                  color: 'text.secondary',
                  '&:hover': { color: '#ef4444', bgcolor: 'rgba(248,113,113,0.08)' },
                }}
              >
                <Trash2 size={14} />
              </GatedIconButton>
            </Box>
          ))}
        </Box>
      )}
      {/* Revoke confirmation */}
      {revokeTarget && (
        <Box sx={{
          position: 'fixed', inset: 0, zIndex: 1300,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          bgcolor: 'rgba(0,0,0,0.5)',
        }} onClick={() => setRevokeTarget(null)}>
          <Box sx={{ p: 3, maxWidth: 400, borderRadius: 3, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }} onClick={e => e.stopPropagation()}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
              {t('settings.revokeKeyTitle')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              {tOr('settings.revokeKeyDesc', `Key "${revokeTarget.name}" will be permanently revoked. Any CI/CD pipelines using it will stop working.`)}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
              <Button size="small" onClick={() => setRevokeTarget(null)} sx={{ textTransform: 'none' }}>
                {t('common.cancel')}
              </Button>
              <GatedButton action="org:settings" size="small" variant="contained" color="error" sx={{ textTransform: 'none' }}
                onClick={() => { revokeMut.mutate(revokeTarget.id); setRevokeTarget(null) }}>
                {t('settings.revokeKey')}
              </GatedButton>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  )
}
