import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Typography,
} from '@mui/material'
import { Activity, ChevronDown, ChevronUp, RotateCcw, ShieldCheck } from 'lucide-react'

import { env } from '@lib/env'
import { t } from '@lib/i18n'
import { qk } from '@lib/queryKeys'
import {
  getCEProductLoop,
  type CEProductLoopResponse,
  type CEProductSurface,
} from '@lib/engine/platform/community'
import {
  LoopActions,
  LoopCopy,
  LoopDescription,
  LoopDetails,
  LoopHeader,
  LoopIcon,
  LoopIdentity,
  LoopList,
  LoopLoading,
  LoopMetric,
  LoopMetrics,
  LoopRoot,
  LoopSafeMode,
  LoopSurfaces,
} from './CommunityProductLoopPanel.styles'

const SURFACE_KEYS: Record<CEProductSurface, string> = {
  code: 'communityLoop.surface.code',
  container: 'communityLoop.surface.container',
  cloud: 'communityLoop.surface.cloud',
  runtime: 'communityLoop.surface.runtime',
  external: 'communityLoop.surface.external',
}

const EVIDENCE_KIND_KEYS: Record<string, string> = {
  package_graph: 'communityLoop.evidence.packageGraph',
  dockerfile_snapshot: 'communityLoop.evidence.dockerfileSnapshot',
  http_header_probe: 'communityLoop.evidence.httpHeaderProbe',
}

const OVERLAY_KEYS: Record<string, string> = {
  live_cloud_remediation: 'communityLoop.overlay.liveCloudRemediation',
  commercial_threat_intel: 'communityLoop.overlay.commercialThreatIntel',
  autofix_promotion_rollback: 'communityLoop.overlay.autofixPromotionRollback',
  immutable_audit_export: 'communityLoop.overlay.immutableAuditExport',
}

type MetricKey = keyof Pick<
  CEProductLoopResponse['summary'],
  | 'asset_count'
  | 'finding_count'
  | 'attack_path_count'
  | 'evidence_count'
  | 'remediation_count'
  | 'validation_count'
>

const METRICS: Array<{ key: MetricKey; labelKey: string }> = [
  { key: 'asset_count', labelKey: 'communityLoop.metric.assets' },
  { key: 'finding_count', labelKey: 'communityLoop.metric.findings' },
  { key: 'attack_path_count', labelKey: 'communityLoop.metric.attackPaths' },
  { key: 'evidence_count', labelKey: 'communityLoop.metric.evidence' },
  { key: 'remediation_count', labelKey: 'communityLoop.metric.remediations' },
  { key: 'validation_count', labelKey: 'communityLoop.metric.verifications' },
]

export interface CommunityProductLoopPanelProps {
  enabled?: boolean
}

export function CommunityProductLoopPanel({
  enabled = env.authMode === 'community',
}: CommunityProductLoopPanelProps) {
  if (!enabled) return null

  return <EnabledCommunityProductLoopPanel />
}

function EnabledCommunityProductLoopPanel() {
  const [expanded, setExpanded] = useState(false)
  const loopQ = useQuery({
    queryKey: qk.platform.communityProductLoop(),
    queryFn: getCEProductLoop,
    retry: false,
    staleTime: 10 * 60_000,
  })

  if (loopQ.isLoading) {
    return (
      <LoopLoading aria-busy="true">
        <CircularProgress size={18} />
        <Typography variant="body2">{t('communityLoop.loading')}</Typography>
      </LoopLoading>
    )
  }

  if (loopQ.isError) {
    return (
      <Alert
        severity="error"
        action={(
          <Button
            color="inherit"
            size="small"
            startIcon={<RotateCcw size={15} />}
            onClick={() => void loopQ.refetch()}
          >
            {t('communityLoop.retry')}
          </Button>
        )}
      >
        {t('communityLoop.loadFailed')}
      </Alert>
    )
  }

  const loop = loopQ.data
  if (!loop) {
    return (
      <Alert severity="info">{t('communityLoop.empty')}</Alert>
    )
  }

  return (
    <LoopRoot>
      <LoopHeader>
        <LoopIdentity>
          <LoopIcon>
            <ShieldCheck size={18} />
          </LoopIcon>
          <LoopCopy>
            <Typography variant="overline" color="success.main" fontWeight={800}>
              {t('communityLoop.eyebrow')}
            </Typography>
            <Typography variant="h6" fontWeight={800}>
              {t('communityLoop.title')}
            </Typography>
            <LoopDescription variant="body2" color="text.secondary">
              {t('communityLoop.description')}
            </LoopDescription>
          </LoopCopy>
        </LoopIdentity>
        <Chip size="small" color="success" label={t('communityLoop.ready')} />
      </LoopHeader>

      <LoopSurfaces>
        {loop.scope.surfaces.map((surface) => (
          <Chip key={surface} size="small" variant="outlined" label={t(SURFACE_KEYS[surface])} />
        ))}
      </LoopSurfaces>

      <LoopMetrics>
        {METRICS.map((metric) => (
          <LoopMetric key={metric.key}>
            <Typography variant="h6" fontWeight={800}>{loop.summary[metric.key]}</Typography>
            <Typography variant="caption" color="text.secondary">{t(metric.labelKey)}</Typography>
          </LoopMetric>
        ))}
      </LoopMetrics>

      <LoopActions>
        <LoopSafeMode>
          <Activity size={15} />
          <Typography variant="caption" color="text.secondary">
            {t('communityLoop.safeMode')}
          </Typography>
        </LoopSafeMode>
        <Button
          size="small"
          variant="outlined"
          onClick={() => setExpanded((value) => !value)}
          endIcon={expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          aria-expanded={expanded}
        >
          {t(expanded ? 'communityLoop.hideDetails' : 'communityLoop.inspectEvidence')}
        </Button>
      </LoopActions>

      <Collapse in={expanded} unmountOnExit>
        <LoopDetails>
          <div>
            <Typography variant="subtitle2" fontWeight={800}>{t('communityLoop.evidenceTitle')}</Typography>
            <LoopList>
              {loop.evidence.map((evidence) => (
                <Typography component="li" variant="body2" key={evidence.id}>
                  {t(EVIDENCE_KIND_KEYS[evidence.kind] ?? 'communityLoop.evidence.other')}
                  {' · '}
                  {t(evidence.replayable ? 'communityLoop.replayable' : 'communityLoop.notReplayable')}
                </Typography>
              ))}
            </LoopList>
          </div>
          <div>
            <Typography variant="subtitle2" fontWeight={800}>{t('communityLoop.enterpriseBoundary')}</Typography>
            <LoopList>
              {loop.enterprise_overlay.map((overlay) => (
                <Typography component="li" variant="body2" key={overlay.capability}>
                  {t(OVERLAY_KEYS[overlay.capability] ?? 'communityLoop.overlay.other')}
                </Typography>
              ))}
            </LoopList>
          </div>
        </LoopDetails>
      </Collapse>
    </LoopRoot>
  )
}
