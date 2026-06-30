/**
 * PRDialog — in-app modal for the "open PR touching this finding"
 * signal. Replaces the previous "open GitHub PR in a new tab"
 * behaviour for Pulse cards: the user wanted context inline rather
 * than a tab switch, so the dialog renders the PR list with an
 * explicit "Open on GitHub" link as the escape hatch.
 *
 * Render rules:
 *   - One card per PR. Most findings touch a single PR, but the same
 *     file can be edited by parallel branches; the engine surfaces
 *     all of them and we show all of them.
 *   - Draft PRs are visually emphasised — drafts are the *biggest*
 *     fix-before-ship window, so they belong at the top.
 *   - "Open on GitHub" is the escape hatch for the actual review
 *     flow (we don't try to recreate code review in-app).
 *   - No fetch — props carry everything from `correlate.PRRef`.
 */
import { ExternalLink, GitBranch, GitPullRequest } from 'lucide-react'
import {
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Link,
  List,
  ListItem,
  Paper,
  Typography,
} from '@mui/material'
import { X } from 'lucide-react'
import { t } from '@lib/i18n';
import type { PRRef } from './ContextStrip'

interface PRDialogProps {
  prs: PRRef[]
  /** Optional context strap line — e.g. the finding title that
   *  triggered the click. Helps the user know which row they came
   *  from when several PRs match across multiple findings. */
  contextLabel?: string
  onClose: () => void
}

export function PRDialog({ prs, contextLabel, onClose }: PRDialogProps) {
  // Drafts first — biggest leverage window for landing a fix.
  const sorted = [...prs].sort((a, b) => {
    if (!!a.is_draft !== !!b.is_draft) return a.is_draft ? -1 : 1
    return (b.opened_at ?? '').localeCompare(a.opened_at ?? '')
  })

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { bgcolor: 'background.paper' },
      }}
    >
      <DialogTitle className="flex items-center gap-2" sx={{ pb: 1 }}>
        <GitPullRequest size={16} style={{ color: '#a78bfa' }} />
        <Typography variant="subtitle1" component="span" sx={{ flex: 1 }}>
          {t('prDialog.title')}
        </Typography>
        <Chip label={sorted.length} size="small" variant="outlined" sx={{ ml: 1 }} />
        <IconButton
          size="small"
          onClick={onClose}
          edge="end"
          aria-label={t('common.close')}
          title={t('common.close')}
        >
          <X size={16} />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 0 }}>
        {contextLabel && (
          <Typography
            variant="caption"
            color="text.secondary"
            title={contextLabel}
            noWrap
            sx={{ display: 'block', mb: 1.5 }}
          >
            {contextLabel}
          </Typography>
        )}

        {sorted.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            {t('prDialog.empty')}
          </Typography>
        )}

        <List disablePadding>
          {sorted.map(pr => <PRCard key={`${pr.number}-${pr.head_branch ?? ''}`} pr={pr} />)}
        </List>
      </DialogContent>
    </Dialog>
  )
}

function PRCard({ pr }: { pr: PRRef }) {
  const opened = pr.opened_at
    ? new Date(pr.opened_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : ''
  return (
    <ListItem disablePadding sx={{ mb: 1 }}>
      <Paper
        variant="outlined"
        sx={{
          width: '100%',
          p: 1.5,
          borderColor: pr.is_draft ? 'warning.dark' : 'divider',
          borderLeftWidth: pr.is_draft ? 3 : 1,
        }}
      >
        <Box className="flex items-center gap-2">
          <Typography variant="body2" color="text.secondary" fontWeight={600}>
            #{pr.number}
          </Typography>
          {pr.is_draft && (
            <Chip
              label={t('prDialog.draft')}
              size="small"
              color="warning"
              variant="outlined"
            />
          )}
          <Typography variant="body2" color="text.primary" sx={{ flex: 1 }} noWrap>
            {pr.title ?? pr.head_branch ?? `PR #${pr.number}`}
          </Typography>
        </Box>

        <Box className="flex items-center gap-3 mt-1">
          {pr.head_branch && (
            <Box className="inline-flex items-center gap-1">
              <GitBranch size={11} />
              <Typography variant="caption" color="text.secondary">
                {pr.head_branch}
              </Typography>
            </Box>
          )}
          {opened && (
            <Typography variant="caption" color="text.secondary">
              {opened}
            </Typography>
          )}
        </Box>

        {pr.url && (
          <Link
            href={pr.url}
            target="_blank"
            rel="noopener noreferrer"
            underline="hover"
            className="inline-flex items-center gap-1 mt-1"
            sx={{ fontSize: 12 }}
          >
            <ExternalLink size={11} />
            {t('prDialog.openOnGithub')}
          </Link>
        )}
      </Paper>
    </ListItem>
  )
}
