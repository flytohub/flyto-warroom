/**
 * ReportCatalog — left sidebar with 3 fixed zones:
 *
 *  ┌─────────────────┐
 *  │ Search (pinned)  │  ← 頂部固定
 *  ├─────────────────┤
 *  │ Preset reports   │  ← 中間獨立滾動
 *  │  Security        │
 *  │  Compliance      │
 *  │  Open Source     │
 *  │  Advanced        │
 *  ├─────────────────┤
 *  │ My Reports       │  ← 底部浮動固定
 *  │  [saved custom]  │
 *  │  + New Custom    │
 *  └─────────────────┘
 */

import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Collapse from '@mui/material/Collapse'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'
import Tooltip from '@mui/material/Tooltip'
import { ChevronDown, Plus, Search, FileText, Trash2 } from 'lucide-react'
import { t, tOr } from '@lib/i18n';
import { REPORT_TEMPLATES, REPORT_CATEGORIES } from './templates'

export interface SavedCustomReport {
  id: string
  name: string
  savedAt: string
}

interface Props {
  selected: string | null
  onSelect: (templateId: string) => void
  onCustomNew: () => void
  onCustomLoad: (id: string) => void
  onCustomDelete: (id: string) => void
  savedReports: SavedCustomReport[]
}

export function ReportCatalog({ selected, onSelect, onCustomNew, onCustomLoad, onCustomDelete, savedReports }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['security', 'compliance', 'opensource', 'advanced']))
  const [search, setSearch] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<{ id: string } | null>(null)

  useEffect(() => {
    if (!deleteTarget) return undefined
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDeleteTarget(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [deleteTarget])

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // Filter templates by search
  const searchLower = search.toLowerCase()
  const filteredTemplates = search
    ? REPORT_TEMPLATES.filter(t => t.name.toLowerCase().includes(searchLower) || t.description.toLowerCase().includes(searchLower))
    : REPORT_TEMPLATES

  return (
    <Box sx={{
      width: { xs: 220, xl: 240 }, flexShrink: 0,
      borderRight: '1px solid', borderColor: 'divider',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* ── Zone 1: Search (pinned top) ── */}
      <Box sx={{ px: 1.5, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
        <TextField
          placeholder={t('reports.searchReports')}
          size="small" fullWidth
          value={search} onChange={e => setSearch(e.target.value)}
          InputProps={{
            startAdornment: <InputAdornment position="start"><Search size={14} /></InputAdornment>,
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 2, fontSize: 13,
              bgcolor: 'action.hover',
            },
          }}
        />
      </Box>

      {/* ── Zone 2: Preset reports (independent scroll) ── */}
      <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {REPORT_CATEGORIES.map(cat => {
          const templates = filteredTemplates.filter(t => t.category === cat.id)
          if (templates.length === 0) return null
          const isOpen = expanded.has(cat.id)
          return (
            <Box key={cat.id}>
              <ListItemButton onClick={() => toggle(cat.id)} sx={{ px: 2, py: 0.5 }}>
                <ListItemText
                  primary={tOr(cat.labelKey, cat.fallback)}
                  primaryTypographyProps={{
                    variant: 'caption', fontWeight: 700,
                    sx: { color: cat.color, textTransform: 'uppercase', letterSpacing: '0.05em' },
                  }}
                />
                <ChevronDown size={14} style={{
                  color: cat.color,
                  transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.15s',
                }} />
              </ListItemButton>
              <Collapse in={isOpen}>
                <List dense disablePadding>
                  {templates.map(tmpl => {
                    const Icon = tmpl.icon
                    const active = selected === tmpl.id
                    return (
                      <ListItemButton
                        key={tmpl.id}
                        selected={active}
                        onClick={() => onSelect(tmpl.id)}
                        sx={{
                          px: 2, py: 0.5, mx: 1, borderRadius: 1,
                          '&.Mui-selected': { bgcolor: 'rgba(139,92,246,0.12)' },
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: 28, color: active ? '#c4b5fd' : 'text.secondary' }}>
                          <Icon size={14} />
                        </ListItemIcon>
                        <ListItemText
                          primary={tmpl.nameKey ? tOr(tmpl.nameKey, tmpl.name) : tmpl.name}
                          primaryTypographyProps={{ variant: 'body2', fontSize: 12, fontWeight: active ? 600 : 400, noWrap: true }}
                        />
                      </ListItemButton>
                    )
                  })}
                </List>
              </Collapse>
            </Box>
          )
        })}
      </Box>

      {/* ── Zone 3: My Custom Reports (pinned bottom) ── */}
      <Box sx={{
        flexShrink: 0,
        borderTop: '1px solid', borderColor: 'divider',
        bgcolor: 'action.hover',
      }}>
        <Box sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center' }}>
          <Typography variant="caption" fontWeight={700} sx={{ color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.05em', flex: 1 }}>
            {t('reports.myReports')}
          </Typography>
        </Box>

        {/* Saved custom reports */}
        {savedReports.length > 0 && (
          <List dense disablePadding sx={{ maxHeight: 120, overflow: 'auto' }}>
            {savedReports.map(r => (
              <ListItemButton
                key={r.id}
                selected={selected === r.id}
                onClick={() => onCustomLoad(r.id)}
                sx={{
                  px: 2, py: 0.4, mx: 1, borderRadius: 1,
                  '&.Mui-selected': { bgcolor: 'rgba(34,197,94,0.12)' },
                }}
              >
                <ListItemIcon sx={{ minWidth: 24 }}>
                  <FileText size={12} style={{ color: '#22c55e' }} />
                </ListItemIcon>
                <ListItemText
                  primary={r.name}
                  primaryTypographyProps={{ variant: 'body2', fontSize: 13, noWrap: true }}
                />
                <Tooltip title={t('common.delete')}>
                  <IconButton
                    size="small" sx={{ p: 0.25 }}
                    aria-label={t('common.delete')}
                    onClick={e => {
                      e.stopPropagation()
                      setDeleteTarget({ id: r.id })
                    }}
                  >
                    <Trash2 size={10} style={{ color: '#ef4444' }} />
                  </IconButton>
                </Tooltip>
              </ListItemButton>
            ))}
          </List>
        )}

        {/* New custom report button */}
        <Box sx={{ px: 1.5, py: 1 }}>
          <ListItemButton
            onClick={onCustomNew}
            sx={{
              px: 1.5, py: 0.75, borderRadius: 1.5,
              border: '1px dashed', borderColor: 'rgba(34,197,94,0.3)',
              justifyContent: 'center', gap: 0.75,
              '&:hover': { bgcolor: 'rgba(34,197,94,0.08)', borderColor: '#22c55e' },
            }}
          >
            <Plus size={14} style={{ color: '#22c55e' }} />
            <Typography variant="caption" fontWeight={600} sx={{ color: '#22c55e' }}>
              {t('reports.newCustom')}
            </Typography>
          </ListItemButton>
        </Box>
      </Box>
      {/* Delete confirmation */}
      {deleteTarget && (
        <Box sx={{
          position: 'fixed', inset: 0, zIndex: 1300,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          bgcolor: 'rgba(0,0,0,0.5)',
        }} role="presentation" onClick={() => setDeleteTarget(null)}>
          <Paper
            role="dialog"
            aria-modal="true"
            aria-label={t('reports.confirmDeleteTitle')}
            sx={{ p: 3, maxWidth: 360, borderRadius: 3 }}
            onClick={e => e.stopPropagation()}
          >
            <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
              {t('reports.confirmDeleteTitle')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              {t('reports.confirmDelete')}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
              <Button size="small" onClick={() => setDeleteTarget(null)} sx={{ textTransform: 'none' }}>
                {t('common.cancel')}
              </Button>
              <Button size="small" variant="contained" color="error" sx={{ textTransform: 'none' }}
                onClick={() => { onCustomDelete(deleteTarget.id); setDeleteTarget(null) }}>
                {t('common.delete')}
              </Button>
            </Box>
          </Paper>
        </Box>
      )}
    </Box>
  )
}
