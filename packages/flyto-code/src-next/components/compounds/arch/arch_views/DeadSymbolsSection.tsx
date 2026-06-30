import { useMemo, useState } from 'react'
import { ChevronRight, Trash2, Copy } from 'lucide-react'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Button from '@mui/material/Button'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import { t } from '@lib/i18n';

// Per-repo dead-symbol entry
export type RepoDeadEntry = { line: number; name: string; path: string; type: string }

const TYPE_CHIP_COLORS: Record<string, string> = {
  class: '#3b82f6',
  function: '#22c55e',
  method: '#eab308',
  variable: '#94a3b8',
}

// Dead-symbol section with file grouping + bulk copy + per-file expand.
export function DeadSymbolsSection({ symbols }: { symbols: RepoDeadEntry[] }) {
  const [openFile, setOpenFile] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const byFile = useMemo(() => {
    const m = new Map<string, RepoDeadEntry[]>()
    for (const s of symbols) {
      const arr = m.get(s.path) ?? []
      arr.push(s)
      m.set(s.path, arr)
    }
    return Array.from(m.entries()).sort(([, a], [, b]) => b.length - a.length)
  }, [symbols])

  function copyAllPaths() {
    const lines = symbols.map(s => s.line > 0 ? `${s.path}:${s.line}` : s.path)
    const uniq = Array.from(new Set(lines))
    navigator.clipboard.writeText(uniq.join('\n')).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <Box>
      <Box className="flex items-center gap-2 mb-1 flex-wrap">
        <Trash2 size={12} />
        <Typography variant="caption" color="text.primary" fontWeight={600}>
          {t('warroom.archDeadSymbols')}
        </Typography>
        <Chip label={symbols.length} size="small" sx={{ height: 22, fontSize: 12 }} />
        <Chip
          label={`${byFile.length} ${t('warroom.archFilesShort')}`}
          size="small"
          sx={{ height: 22, fontSize: 12, bgcolor: 'info.main', color: 'info.contrastText' }}
        />
        <Box sx={{ flex: 1 }} />
        <Button
          size="small"
          variant="outlined"
          onClick={copyAllPaths}
          startIcon={<Copy size={10} />}
          sx={{ textTransform: 'none', fontSize: 12, height: 22 }}
        >
          {copied
            ? t('warroom.archCopied')
            : t('warroom.archCopyPaths')}
        </Button>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        {t('warroom.archDeadHint')}
      </Typography>
      <List dense disablePadding>
        {byFile.slice(0, 30).map(([path, syms]) => {
          const isOpen = openFile === path
          return (
            <Paper
              key={path}
              elevation={0}
              sx={{ mb: 0.5, bgcolor: 'background.default', border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}
            >
              <ListItemButton
                onClick={() => setOpenFile(isOpen ? null : path)}
                sx={{ py: 0.5, px: 1.5, gap: 1 }}
              >
                <ChevronRight
                  size={12}
                  style={{
                    transform: isOpen ? 'rotate(90deg)' : 'none',
                    transition: 'transform 0.15s',
                    flexShrink: 0,
                  }}
                />
                <Typography variant="caption" color="text.primary" sx={{ fontFamily: 'monospace', flex: 1 }} noWrap>
                  {path}
                </Typography>
                <Chip label={syms.length} size="small" sx={{ height: 20, fontSize: 13 }} />
              </ListItemButton>
              {isOpen && (
                <Box sx={{ px: 2, pb: 1 }}>
                  {syms.map((s, i) => (
                    <Box key={i} className="flex items-center gap-2 py-0.5">
                      <Chip
                        label={s.type}
                        size="small"
                        sx={{
                          height: 20,
                          fontSize: 13,
                          fontWeight: 700,
                          bgcolor: (TYPE_CHIP_COLORS[s.type] ?? '#94a3b8') + '22',
                          color: TYPE_CHIP_COLORS[s.type] ?? '#94a3b8',
                        }}
                      />
                      <Typography variant="caption" color="text.primary" sx={{ fontFamily: 'monospace' }}>
                        {s.name}
                      </Typography>
                      {s.line > 0 && (
                        <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12 }}>
                          L{s.line}
                        </Typography>
                      )}
                    </Box>
                  ))}
                </Box>
              )}
            </Paper>
          )
        })}
      </List>
      {byFile.length > 30 && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          +{byFile.length - 30} {t('warroom.archMoreFiles')}
        </Typography>
      )}
    </Box>
  )
}
