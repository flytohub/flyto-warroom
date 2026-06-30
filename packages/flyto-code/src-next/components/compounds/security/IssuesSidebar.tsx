/**
 * IssuesSidebar — left sidebar category filter for IssuesView.
 * Extracted from IssuesView.tsx to reduce file size.
 *
 * Colour rule (per feedback_ui_grounded_palette): category/repo kind
 * isn't severity, so dots are neutral; selection state alone uses the
 * brand purple. Only Vulnerabilities + Exposed Secrets retain a
 * severity-aligned tint because those types ARE severity-bearing.
 */

import { Shield, Key, Bug, Code, FolderGit2 } from 'lucide-react'
import { t, tOr } from '@lib/i18n';
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import ListItemButton from '@mui/material/ListItemButton'
import type { SecurityIssue } from '@lib/engine'

export interface CategoryDef {
  key: string
  label: string
  /** Optional accent. Omit to render the row in the neutral palette
   *  (only the selection state shows brand colour). */
  color?: string
  icon: React.ReactNode
  match: (issue: SecurityIssue) => boolean
}

export const CATEGORIES: CategoryDef[] = [
  {
    key: 'all',
    label: t('issues.category.all'),
    icon: <Shield size={16} />,
    match: () => true,
  },
  {
    key: 'cve',
    label: 'Vulnerabilities',
    color: '#ef4444', // severity red — vulnerabilities ARE alarming
    icon: <Bug size={16} />,
    match: (i) => i.type === 'cve',
  },
  {
    key: 'secret',
    label: t('issues.category.secret'),
    color: '#f97316', // severity orange — exposed credential = real risk
    icon: <Key size={16} />,
    match: (i) => i.type === 'secret',
  },
  {
    key: 'security_finding',
    label: t('issues.title'),
    icon: <Code size={16} />,
    match: (i) => i.type === 'security_finding',
  },
]

/** Build dynamic repo-based categories from the issue list. Repos
 *  are neutral — repo identity isn't a severity, so we don't dye
 *  each row a different colour (the old REPO_COLORS rainbow). */
export function buildRepoCategories(issues: SecurityIssue[]): CategoryDef[] {
  const repos = new Map<string, { id: string; name: string; count: number }>()
  for (const i of issues) {
    const existing = repos.get(i.repo_id)
    if (existing) {
      existing.count++
    } else {
      repos.set(i.repo_id, { id: i.repo_id, name: i.repo_name, count: 0 })
    }
  }
  return Array.from(repos.values()).map((r) => ({
    key: `repo:${r.id}`,
    label: r.name,
    icon: <FolderGit2 size={16} />,
    match: (i: SecurityIssue) => i.repo_id === r.id,
  }))
}

const BRAND = '#8b5cf6'

export function CategoryItem({
  category,
  count,
  selected,
  onClick,
}: {
  category: CategoryDef
  count: number
  selected: boolean
  onClick: () => void
}) {
  // accentColor drives both the (optional) severity dot and the
  // selection highlight. When the category carries no severity
  // (`category.color` omitted), we fall back to the brand purple
  // on selection — so the user still gets visual feedback without
  // dyeing every row a different hue.
  const accent = category.color ?? BRAND
  const showDot = !!category.color

  return (
    <ListItemButton
      selected={selected}
      onClick={onClick}
      sx={{
        borderRadius: 1.5,
        mb: 0.25,
        px: 1.5,
        py: 1,
        minHeight: 40,
        '&.Mui-selected': {
          bgcolor: 'rgba(139, 92, 246, 0.10)',
          '&:hover': { bgcolor: 'rgba(139, 92, 246, 0.16)' },
        },
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      {/* Severity dot — only rendered for severity-bearing categories.
          Repos and "All / Code Issues" get a fixed-width spacer instead
          so labels still align. */}
      {showDot ? (
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: accent,
            flexShrink: 0,
            mr: 1.5,
          }}
        />
      ) : (
        <Box sx={{ width: 8, mr: 1.5, flexShrink: 0 }} />
      )}
      {/* Icon */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          color: selected ? accent : 'text.secondary',
          mr: 1.25,
          flexShrink: 0,
        }}
      >
        {category.icon}
      </Box>
      {/* Label */}
      <Typography
        sx={{
          flex: 1,
          fontWeight: selected ? 600 : 500,
          color: selected ? 'text.primary' : 'text.secondary',
          fontSize: 14,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {tOr(`issues.category.${category.key}`, category.label)}
      </Typography>
      {/* Count badge */}
      {count > 0 && (
        <Chip
          label={count}
          size="small"
          sx={{
            height: 24,
            minWidth: 30,
            fontSize: 12,
            fontWeight: 700,
            bgcolor: selected ? `${accent}22` : 'action.selected',
            color: selected ? accent : 'text.secondary',
            borderRadius: '10px',
          }}
        />
      )}
    </ListItemButton>
  )
}
