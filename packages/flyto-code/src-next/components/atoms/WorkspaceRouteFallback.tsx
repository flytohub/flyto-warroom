import Box from '@mui/material/Box'
import { ArrowLeft, FolderOpen, SearchX } from 'lucide-react'
import { useNavigate } from 'react-router'
import EmptyStateGuide from './EmptyStateGuide'
import { PageShell } from './PageShell'
import { t } from '@lib/i18n';

type RouteFallbackKind = 'workspace' | 'repo' | 'section'

export interface WorkspaceRouteFallbackProps {
  kind?: RouteFallbackKind
  orgId?: string
}

export function WorkspaceRouteFallback({ kind = 'workspace', orgId }: WorkspaceRouteFallbackProps) {
  const navigate = useNavigate()
  const copy = getCopy(kind)
  const target = kind === 'repo' && orgId ? `/projects/${orgId}/repos` : '/projects'

  return (
    <PageShell padded={false} scroll="host">
      <Box sx={{ height: '100%', minHeight: 360, display: 'grid', placeItems: 'center', p: 3 }}>
        <EmptyStateGuide
          icon={copy.icon}
          title={copy.title}
          description={copy.description}
          primaryAction={{
            label: copy.actionLabel,
            icon: <ArrowLeft size={16} />,
            onClick: () => navigate(target),
          }}
        />
      </Box>
    </PageShell>
  )
}

function getCopy(kind: RouteFallbackKind) {
  if (kind === 'repo') {
    return {
      icon: <SearchX size={28} />,
      title: t('routeFallback.repoTitle'),
      description: t('routeFallback.repoDesc'),
      actionLabel: t('routeFallback.openRepos'),
    }
  }
  if (kind === 'section') {
    return {
      icon: <SearchX size={28} />,
      title: t('routeFallback.sectionTitle'),
      description: t('routeFallback.sectionDesc'),
      actionLabel: t('routeFallback.openProjects'),
    }
  }
  return {
    icon: <FolderOpen size={28} />,
    title: t('routeFallback.workspaceTitle'),
    description: t('routeFallback.workspaceDesc'),
    actionLabel: t('routeFallback.openProjects'),
  }
}

export default WorkspaceRouteFallback
