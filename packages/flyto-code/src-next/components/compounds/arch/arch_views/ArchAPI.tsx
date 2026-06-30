import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Layers, Network } from 'lucide-react'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'
import { Search } from 'lucide-react'
import { t } from '@lib/i18n';
import { type ConnectedRepo } from '@lib/engine'
import type { OrgWarRoomData } from '@compounds/_shared/warroom'
import { FlytoPageHeader } from '@atoms/FlytoPageHeader'
import { JellyCard } from '@atoms/JellyCard'
import { METHOD_COLORS, formatCount } from './shared'

// API Route Tree — left: repo list, right: route tree for selected repo.

interface TreeNode { segment: string; children: Map<string, TreeNode>; methods: Set<string> }

function buildTree(apis: { method: string; path: string }[]): TreeNode {
  const root: TreeNode = { segment: '/', children: new Map(), methods: new Set() }
  for (const api of apis) {
    const parts = api.path.split('/').filter(Boolean)
    let n = root
    for (const p of parts) { if (!n.children.has(p)) n.children.set(p, { segment: p, children: new Map(), methods: new Set() }); n = n.children.get(p)! }
    n.methods.add(api.method)
  }
  return root
}

function countR(n: TreeNode): number { let c = n.methods.size; for (const ch of n.children.values()) c += countR(ch); return c }

function TNode({ node, depth }: { node: TreeNode; depth: number }) {
  const [open, setOpen] = useState(depth < 2)
  const kids = Array.from(node.children.values()).sort((a, b) => a.segment.localeCompare(b.segment))
  return (
    <Box sx={{ pl: depth * 2 }}>
      <Box
        component="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 w-full text-left py-0.5"
        sx={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          '&:hover': { bgcolor: 'action.hover' },
          borderRadius: 1,
          px: 1,
        }}
      >
        {kids.length > 0 ? (
          <ChevronRight
            size={12}
            style={{
              transform: open ? 'rotate(90deg)' : 'none',
              transition: 'transform 0.15s',
              flexShrink: 0,
            }}
          />
        ) : (
          <Box sx={{ width: 14, flexShrink: 0 }} />
        )}
        <Typography variant="caption" color="text.primary" sx={{ fontFamily: 'monospace' }}>
          /{node.segment === '/' ? '' : node.segment}
        </Typography>
        {node.methods.size > 0 && (
          <Box className="flex gap-1 ml-2">
            {Array.from(node.methods).sort().map(m => (
              <Chip
                key={m}
                label={m}
                size="small"
                sx={{
                  height: 18,
                  fontSize: 12,
                  fontWeight: 700,
                  bgcolor: (METHOD_COLORS[m] ?? '#94a3b8') + '22',
                  color: METHOD_COLORS[m] ?? '#94a3b8',
                }}
              />
            ))}
          </Box>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto', fontSize: 13 }}>
          {countR(node)}
        </Typography>
      </Box>
      {open && kids.length > 0 && (
        <Box>
          {kids.map(ch => <TNode key={ch.segment} node={ch} depth={depth + 1} />)}
        </Box>
      )}
    </Box>
  )
}

export function ArchAPI({ data, repoNameMap }: { data: OrgWarRoomData; repoNameMap: Record<string, ConnectedRepo> }) {
  const { apis, apiTotal } = data
  const total = apiTotal || apis.length

  const [search, setSearch] = useState('')
  const [methodFilter, setMethodFilter] = useState<string>('')
  const [selectedRepo, setSelectedRepo] = useState<string>('')

  const byRepo = useMemo(() => {
    const m = new Map<string, typeof apis>()
    for (const api of apis) {
      const arr = m.get(api.repo_id) ?? []
      arr.push(api)
      m.set(api.repo_id, arr)
    }
    return Array.from(m.entries())
      .map(([repoId, list]) => ({
        repo_id: repoId,
        repo_name: repoNameMap[repoId]?.repoName ?? repoNameMap[repoId]?.fullName ?? repoId,
        apis: list,
      }))
      .sort((a, b) => b.apis.length - a.apis.length)
  }, [apis, repoNameMap])

  // Auto-select first repo
  useEffect(() => {
    if (!selectedRepo && byRepo.length > 0) setSelectedRepo(byRepo[0].repo_id)
  }, [byRepo, selectedRepo])

  // Method distribution across all repos
  const methodDist = useMemo(() => {
    const c: Record<string, number> = {}
    for (const a of apis) c[a.method] = (c[a.method] ?? 0) + 1
    return Object.entries(c).sort(([, a], [, b]) => b - a)
  }, [apis])

  // Filtered APIs for selected repo
  const selectedApis = useMemo(() => {
    const repo = byRepo.find(r => r.repo_id === selectedRepo)
    if (!repo) return []
    const q = search.trim().toLowerCase()
    return repo.apis.filter(api => {
      if (methodFilter && api.method !== methodFilter) return false
      if (q && !api.path.toLowerCase().includes(q)) return false
      return true
    })
  }, [byRepo, selectedRepo, search, methodFilter])

  const selectedTree = useMemo(() => buildTree(selectedApis), [selectedApis])
  const selectedRepoName = byRepo.find(r => r.repo_id === selectedRepo)?.repo_name ?? ''

  if (total === 0) {
    return (
      <Box sx={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 2, p: 3 }}>
        <FlytoPageHeader
          title={t('warroom.apiTree')}
          subtitle={t('warroom.apiTreeSub')}
        />
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 12 }}>
          <Box sx={{
            width: 80, height: 80, borderRadius: '50%', mb: 3,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            bgcolor: 'action.hover',
          }}>
            <Layers size={36} style={{ opacity: 0.3 }} />
          </Box>
          <Typography variant="h6" fontWeight={600} color="text.primary" sx={{ mb: 1 }}>
            {t('warroom.noApiDataTitle')}
          </Typography>
          <Typography variant="body2" color="text.secondary">{t('warroom.noApiData')}</Typography>
        </Box>
      </Box>
    )
  }

  return (
    <Box sx={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', p: 3, gap: 2 }}>
      <FlytoPageHeader
        title={t('warroom.apiTree')}
        subtitle={`${formatCount(total)} ${t('warroom.routes')} · ${byRepo.length} repos`}
        action={
          <TextField
            size="small"
            placeholder={t('warroom.apiSearch')}
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
            sx={{ width: 200 }}
          />
        }
      />

      {/* Left-right split — fills remaining space */}
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', gap: 2 }}>

        {/* Left — repo list + method dist */}
        <JellyCard delay={0} noHover style={{ width: 260, flexShrink: 0, display: 'flex' }}>
        <Paper
          elevation={0}
          className="rounded-xl"
          sx={{
            bgcolor: 'background.paper', border: 1, borderColor: 'divider',
            width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}
        >
          {/* Method distribution — compact */}
          <Box sx={{ px: 2, pt: 2, pb: 1.5, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
              {t('warroom.apiMethodDist')}
            </Typography>
            <Box className="flex flex-wrap gap-1">
              {methodDist.map(([m, c]) => (
                <Chip
                  key={m}
                  label={`${m} ${c}`}
                  size="small"
                  onClick={() => setMethodFilter(methodFilter === m ? '' : m)}
                  sx={{
                    height: 20,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    bgcolor: methodFilter === m
                      ? (METHOD_COLORS[m] ?? '#94a3b8')
                      : (METHOD_COLORS[m] ?? '#94a3b8') + '22',
                    color: methodFilter === m ? '#fff' : (METHOD_COLORS[m] ?? '#94a3b8'),
                  }}
                />
              ))}
            </Box>
          </Box>

          {/* Repo list — scrollable */}
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            {byRepo.map(r => {
              const isSelected = r.repo_id === selectedRepo
              const repoMethodCounts = r.apis.reduce((acc, a) => {
                acc[a.method] = (acc[a.method] ?? 0) + 1
                return acc
              }, {} as Record<string, number>)
              const topMethods = Object.entries(repoMethodCounts).sort(([, a], [, b]) => b - a).slice(0, 3)

              return (
                <Box
                  key={r.repo_id}
                  component="button"
                  onClick={() => setSelectedRepo(r.repo_id)}
                  sx={{
                    display: 'flex', flexDirection: 'column', gap: 0.5,
                    width: '100%', textAlign: 'left',
                    px: 2, py: 1.5,
                    background: 'none', border: 'none', cursor: 'pointer',
                    bgcolor: isSelected ? 'action.selected' : 'transparent',
                    borderLeft: isSelected ? '3px solid' : '3px solid transparent',
                    borderColor: isSelected ? 'primary.main' : 'transparent',
                    '&:hover': { bgcolor: isSelected ? 'action.selected' : 'action.hover' },
                  }}
                >
                  <Box className="flex items-center gap-2">
                    <Typography
                      variant="body2"
                      fontWeight={isSelected ? 700 : 500}
                      color="text.primary"
                      noWrap
                      sx={{ flex: 1, minWidth: 0, fontSize: 13 }}
                    >
                      {r.repo_name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                      {r.apis.length}
                    </Typography>
                  </Box>
                  <Box className="flex gap-1">
                    {topMethods.map(([m, c]) => (
                      <Typography
                        key={m}
                        variant="caption"
                        sx={{ color: METHOD_COLORS[m] ?? '#94a3b8', fontSize: 12, fontWeight: 600 }}
                      >
                        {m} {c}
                      </Typography>
                    ))}
                  </Box>
                </Box>
              )
            })}
          </Box>
        </Paper>
        </JellyCard>

        {/* Right — route tree */}
        <JellyCard delay={0.04} noHover style={{ flex: 1, minWidth: 0, display: 'flex' }}>
        <Paper
          elevation={0}
          className="rounded-xl"
          sx={{
            bgcolor: 'background.paper', border: 1, borderColor: 'divider',
            flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}
        >
          {/* Tree header */}
          <Box sx={{ px: 3, py: 1.5, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
            <Box className="flex items-center gap-2">
              <Network size={14} style={{ opacity: 0.6 }} />
              <Typography variant="subtitle2" color="text.primary" fontWeight={700}>
                {selectedRepoName || '—'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {selectedApis.length} {selectedApis.length === 1 ? 'route' : 'routes'}
              </Typography>
            </Box>
          </Box>

          {/* Tree body — scrollable */}
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 2 }}>
            {selectedApis.length === 0 ? (
              <Box className="flex flex-col items-center gap-2 py-8">
                <Network size={32} style={{ opacity: 0.15 }} />
                <Typography variant="body2" color="text.secondary">
                  {search || methodFilter
                    ? t('warroom.findingNoMatch')
                    : t('warroom.apiSelectRepo')}
                </Typography>
              </Box>
            ) : (
              Array.from(selectedTree.children.values())
                .sort((a, b) => a.segment.localeCompare(b.segment))
                .map(ch => <TNode key={ch.segment} node={ch} depth={0} />)
            )}
          </Box>
        </Paper>
        </JellyCard>
      </Box>
    </Box>
  )
}
