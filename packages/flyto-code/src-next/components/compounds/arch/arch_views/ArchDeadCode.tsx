import { useEffect, useMemo, useState } from 'react'
import { useRepoFilter } from '@hooks/useRepoFilter'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ChevronRight, Trash2, Search, Copy } from 'lucide-react'
import { FlytoPageHeader } from '@atoms/FlytoPageHeader'
import { JellyCard } from '@atoms/JellyCard'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import { t, tOr } from '@lib/i18n';
import { qk } from '@lib/queryKeys'
import { getOrgDeadCode, type DeadSymbol } from '@lib/engine'
import { useOrg } from '@hooks/useOrg'
import { Pagination } from '@atoms/Pagination'
import { FlytoSelect } from '@atoms/FlytoSelect'
import { formatCount } from './shared'

const DEAD_ACTION: Record<string, { hint: string; verify: string }> = {
  class: {
    hint: t('arch.deadCode.class.hint'),
    verify: 'grep -r "ClassName(" src/ && grep -r "globals()\\[" src/ && grep -r "getattr.*ClassName" src/',
  },
  function: {
    hint: t('arch.deadCode.function.hint'),
    verify: 'grep -r "function_name" src/ # check templates / configs / decorators too',
  },
  method: {
    hint: t('arch.deadCode.method.hint'),
    verify: 'grep -rE "(def|abstract|@abstractmethod)\\s+method_name" src/',
  },
  variable: {
    hint: 'Check __all__ / re-exports / config wiring. Otherwise safe to delete.',
    verify: 'grep -r "VAR_NAME" src/ # check string keys + JSON configs',
  },
}

function actionFor(type: string): { hint: string; verify: string } {
  return DEAD_ACTION[type] ?? {
    hint: t('hardcoded.no.automatic.suggestion.for.this.symbol.type.manual.1ac4dbfa'),
    verify: 'grep -r "<symbol>" src/',
  }
}

const DEAD_PAGE_SIZE = 50

const TYPE_CHIP_COLORS: Record<string, string> = {
  class: '#3b82f6',
  function: '#22c55e',
  method: '#eab308',
  variable: '#94a3b8',
}

export function ArchDeadCode() {
  const { org } = useOrg()
  const { data, isLoading, isError } = useQuery({
    queryKey: qk.repos.deadCode(org?.id),
    queryFn: () => getOrgDeadCode(org!.id),
    enabled: !!org?.id,
    staleTime: 5 * 60_000,
  })
  const symbols = data?.symbols ?? []

  const [search, setSearch] = useState('')
  const { repoId: repoFilter, setRepo } = useRepoFilter()
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [page, setPage] = useState(1)

  const repoOptions = useMemo(
    () => Array.from(new Set(symbols.map(s => s.repo_name))).sort(),
    [symbols],
  )
  const typeOptions = useMemo(
    () => Array.from(new Set(symbols.map(s => s.type))).sort(),
    [symbols],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return symbols.filter(s => {
      if (repoFilter && s.repo_name !== repoFilter) return false
      if (typeFilter && s.type !== typeFilter) return false
      if (q && !s.name.toLowerCase().includes(q) && !s.path.toLowerCase().includes(q)) return false
      return true
    })
  }, [symbols, search, repoFilter, typeFilter])

  useEffect(() => { setPage(1) }, [search, repoFilter, typeFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / DEAD_PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pagedRows = filtered.slice((safePage - 1) * DEAD_PAGE_SIZE, safePage * DEAD_PAGE_SIZE)

  function copyVisible() {
    const text = filtered.map(s => s.line > 0 ? `${s.path}:${s.line} ${s.name}` : `${s.path} ${s.name}`).join('\n')
    void navigator.clipboard.writeText(text)
  }

  return (
    <Box sx={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 2, p: 3 }}>
      <FlytoPageHeader
        title={t('warroom.deadCodeTitle')}
        subtitle={t('warroom.deadCodeSub')}
      />

      {/* Filters — pinned */}
      <JellyCard delay={0} noHover>
      <Paper
        elevation={1}
        className="rounded-xl"
        sx={{ bgcolor: 'background.paper', flexShrink: 0 }}
      >
        <Box className="p-4">
          <Box className="flex items-center gap-2 mb-2">
            <Trash2 size={14} />
            <Typography variant="subtitle2" color="text.primary">
              {t('warroom.deadCodeTitle')}
            </Typography>
            <Chip
              label={`${formatCount(filtered.length)} / ${formatCount(symbols.length)} symbols`}
              size="small"
              sx={{ height: 20, fontSize: 12 }}
            />
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            {t('warroom.archDeadHint')}
          </Typography>
          <Box className="flex flex-wrap gap-2">
            <TextField
              size="small"
              placeholder={t('warroom.findingSearch')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search size={14} />
                    </InputAdornment>
                  ),
                  sx: { fontSize: 13 },
                },
              }}
              sx={{ flex: 1, minWidth: 180 }}
            />
            <FlytoSelect
              value={repoFilter}
              onChange={(val) => { setRepo(val, val) }}
              placeholder={`${t('warroom.findingAllRepos')} (${repoOptions.length})`}
              options={[
                { value: '', label: `${t('warroom.findingAllRepos')} (${repoOptions.length})` },
                ...repoOptions.map(r => ({ value: r, label: r })),
              ]}
              minWidth={180}
              maxWidth={260}
              aria-label={t('warroom.findingAllRepos')}
            />
            <FlytoSelect
              value={typeFilter}
              onChange={setTypeFilter}
              placeholder={t('warroom.findingAllTypes')}
              options={[
                { value: '', label: t('warroom.findingAllTypes') },
                ...typeOptions.map(t => ({ value: t, label: t })),
              ]}
              minWidth={140}
              maxWidth={180}
              aria-label={t('warroom.findingAllTypes')}
            />
            <Button
              size="small"
              variant="outlined"
              onClick={copyVisible}
              disabled={filtered.length === 0}
              startIcon={<Copy size={12} />}
              sx={{ textTransform: 'none', fontSize: 12 }}
            >
              {t('warroom.findingCopyVisible')}
            </Button>
          </Box>
        </Box>
      </Paper>
      </JellyCard>

      {/* Body */}
      {isLoading && (
        <Box className="flex items-center justify-center py-12">
          <CircularProgress size={20} />
        </Box>
      )}
      {isError && (
        <Box className="flex flex-col items-center gap-3 py-12">
          <AlertTriangle size={40} style={{ opacity: 0.4, color: '#ef4444' }} />
          <Typography variant="body2" color="text.secondary">{t('common.loadError')}</Typography>
        </Box>
      )}
      {!isLoading && !isError && filtered.length === 0 && symbols.length === 0 && (
        <Box className="flex flex-col items-center gap-3 py-12">
          <Trash2 size={40} style={{ opacity: 0.15 }} />
          <Typography variant="body2" color="text.secondary">{t('warroom.deadCodeNone')}</Typography>
        </Box>
      )}
      {!isLoading && !isError && filtered.length === 0 && symbols.length > 0 && (
        <Box className="flex flex-col items-center gap-3 py-12">
          <Trash2 size={40} style={{ opacity: 0.15 }} />
          <Typography variant="body2" color="text.secondary">{t('warroom.findingNoMatch')}</Typography>
        </Box>
      )}

      {pagedRows.length > 0 && (
        <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          <Box className="flex flex-col gap-1.5">
            {pagedRows.map((s, i) => (
              <DeadFindingRow key={`${s.repo_id}-${s.path}-${s.name}-${(safePage - 1) * DEAD_PAGE_SIZE + i}`} sym={s} />
            ))}
          </Box>
        </Box>
      )}

      <Pagination
        page={safePage}
        totalPages={totalPages}
        total={filtered.length}
        pageSize={DEAD_PAGE_SIZE}
        onPageChange={setPage}
      />
    </Box>
  )
}

function DeadFindingRow({ sym }: { sym: DeadSymbol }) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const action = actionFor(sym.type)
  const verify = action.verify
    .replace('ClassName', sym.name)
    .replace('function_name', sym.name)
    .replace('method_name', sym.name)
    .replace('VAR_NAME', sym.name)
    .replace('<symbol>', sym.name)

  function copyPath() {
    const text = sym.line > 0 ? `${sym.path}:${sym.line}` : sym.path
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    })
  }
  function copyVerify() {
    void navigator.clipboard.writeText(verify)
  }

  return (
    <Paper
      elevation={0}
      className="rounded-xl"
      sx={{ bgcolor: 'background.paper', border: 1, borderColor: expanded ? 'primary.main' : 'divider' }}
    >
      <Box
        component="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left p-3"
        sx={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          '&:hover': { bgcolor: 'action.hover' },
          borderRadius: '12px',
        }}
      >
        <Typography variant="body2" color="text.secondary" sx={{ minWidth: 80 }} noWrap>
          {sym.repo_name}
        </Typography>
        <Chip
          label={sym.type}
          size="small"
          sx={{
            height: 18,
            fontSize: 12,
            fontWeight: 700,
            bgcolor: (TYPE_CHIP_COLORS[sym.type] ?? '#94a3b8') + '22',
            color: TYPE_CHIP_COLORS[sym.type] ?? '#94a3b8',
          }}
        />
        <Typography variant="caption" color="text.primary" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
          {sym.name}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto', fontFamily: 'monospace', fontSize: 12 }} noWrap>
          {sym.path}{sym.line > 0 ? `:${sym.line}` : ''}
        </Typography>
        <ChevronRight
          size={12}
          style={{
            transform: expanded ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.15s',
            flexShrink: 0,
          }}
        />
      </Box>
      {expanded && (
        <Box sx={{ px: 3, pb: 2 }} className="flex flex-col gap-2">
          <Box>
            <Typography variant="body2" color="text.secondary" fontWeight={600} sx={{ display: 'block', mb: 0.5 }}>
              {t('warroom.findingActionTitle')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {tOr(`arch.deadCode.${sym.type}.hint`, action.hint)}
            </Typography>
          </Box>
          <Box>
            <Typography variant="body2" color="text.secondary" fontWeight={600} sx={{ display: 'block', mb: 0.5 }}>
              {t('warroom.findingVerifyTitle')}
            </Typography>
            <Box className="flex items-center gap-2">
              <Box
                sx={{ flex: 1, fontFamily: 'monospace', fontSize: 13, p: 1, borderRadius: 1, bgcolor: 'action.hover', overflow: 'auto' }}
              >
                {verify}
              </Box>
              <Button size="small" variant="outlined" onClick={copyVerify} sx={{ textTransform: 'none', fontSize: 13, minWidth: 50 }}>
                {t('warroom.findingCopyCmd')}
              </Button>
            </Box>
          </Box>
          <Box>
            <Button size="small" variant="outlined" onClick={copyPath} sx={{ textTransform: 'none', fontSize: 13 }}>
              {copied ? t('warroom.archCopied') : t('warroom.findingCopyLocation')}
            </Button>
          </Box>
        </Box>
      )}
    </Paper>
  )
}
