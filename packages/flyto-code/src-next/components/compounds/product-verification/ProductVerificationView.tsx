import { useMemo, useState, type ReactNode } from 'react'
import {
  Alert,
  Box,
  Chip,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import { Activity, AlertTriangle, Clock, FileJson, GitBranch, Image, Network, Play, ScrollText, ShieldCheck } from 'lucide-react'
import { FlytoPageHeader } from '@atoms/FlytoPageHeader'
import { TabBar } from '@atoms/TabBar'
import { InlineErrorNotice } from '@atoms/InlineErrorNotice'
import { QueryError } from '@atoms/QueryError'
import { t } from '@lib/i18n';
import {
  type WarroomCampaignExecution,
} from '@lib/engine'
import {
  ghostApiCount,
  compactScope,
  formatVerificationDate as formatDate,
} from './productVerificationModel'
import { useProductVerificationController } from './useProductVerificationController'
import { SectionHeader } from './productVerificationPrimitives'
import {
  verificationStatusColor as statusColor,
} from './productVerificationPresentation'
import {
  AutomationTestPanel,
} from './AutomationTestPanel'
import {
  GhostApisPanel,
  RbacEntitlementPanel,
  ReplayTimelinePanel,
  YamlScenariosPanel,
} from './ProductVerificationEvidenceTabs'
import {
  DeterministicRulesPanel,
  EvidenceImage,
  GraphEvidencePanel,
  ProductVerificationEvidencePanel,
} from './ProductVerificationEvidencePanel'
import { buildVerificationMatrix } from './productVerificationMatrix'
import { VerificationCommandPanel } from './ProductVerificationCommandPanel'
import { ProductVerificationOverview } from './ProductVerificationOverview'
import { ProductVerificationSchedulerPanel } from './ProductVerificationSchedulerPanel'

type VerificationTab =
  | 'overview'
  | 'testing'
  | 'discovery'
  | 'intent'
  | 'yaml'
  | 'replay'
  | 'screenshots'
  | 'network'
  | 'contradictions'
  | 'ghost'
  | 'rbac'
  | 'scheduler'
  | 'evidence'

export function ProductVerificationView() {
  const [tab, setTab] = useState<VerificationTab>('overview')
  const {
    org,
    targetUrl,
    setTargetUrl,
    repoId,
    setRepoId,
    dryRun,
    setDryRun,
    setSelectedRunId,
    runsQuery: runsQ,
    scopeQuery: scopeQ,
    scannerQuery: scannerQ,
    evidenceQuery: evidenceQ,
    createRun,
    patchScanner,
    runScannerNow,
    runs,
    selectedRun,
    contract,
    evidencePack,
    evidenceGate,
    evidenceFindings,
    stateContradictions,
    deterministicRuleSummary,
    screenshotArtifacts,
    summary,
    productScanner,
    isPlatformAdmin,
    canRun,
  } = useProductVerificationController()
  const primaryTabValue: VerificationTab = tab === 'overview' || tab === 'testing' || tab === 'scheduler' ? tab : 'evidence'
  const primaryTabItems = useMemo(() => [
    {
      value: 'overview',
      label: t('productVerification.tabOverview'),
      icon: <Activity size={14} />,
      count: runs.length,
    },
    {
      value: 'testing',
      label: t('productVerification.tabTestingMatrix'),
      icon: <ShieldCheck size={14} />,
      count: evidencePack ? buildVerificationMatrix(selectedRun, evidencePack, evidenceQ.data?.artifacts ?? [], evidenceGate).filter((row) => row.status === 'blocked' || row.status === 'missing').length : undefined,
    },
    {
      value: 'evidence',
      label: t('productVerification.tabEvidencePack'),
      icon: <FileJson size={14} />,
      count: summary.withEvidence,
    },
    {
      value: 'scheduler',
      label: t('productVerification.tabSchedulerRuns'),
      icon: <Clock size={14} />,
      count: productScanner?.currently_running ? 1 : undefined,
    },
  ], [evidencePack, productScanner?.currently_running, runs.length, screenshotArtifacts.length, stateContradictions.length, summary.withEvidence])
  const evidenceTabItems = useMemo(() => [
    {
      value: 'evidence',
      label: t('productVerification.tabEvidencePack'),
      icon: <FileJson size={14} />,
      count: summary.withEvidence,
    },
    {
      value: 'discovery',
      label: t('productVerification.tabDiscovery'),
      icon: <Activity size={14} />,
      count: evidencePack?.site_graph?.pages?.length,
    },
    {
      value: 'intent',
      label: t('productVerification.tabIntentGraph'),
      icon: <GitBranch size={14} />,
      count: evidencePack?.site_graph?.intents?.length ?? evidencePack?.automation_test_model?.intent_graph?.count,
    },
    {
      value: 'yaml',
      label: t('productVerification.tabYamlScenarios'),
      icon: <ScrollText size={14} />,
      count: evidencePack?.scenarios?.steps?.length,
    },
    {
      value: 'replay',
      label: t('productVerification.tabReplayTimeline'),
      icon: <Play size={14} />,
      count: evidencePack?.run?.results?.length ?? evidencePack?.automation_test_model?.replay?.steps?.length,
    },
    {
      value: 'screenshots',
      label: t('productVerification.tabScreenshots'),
      icon: <Image size={14} />,
      count: screenshotArtifacts.length,
    },
    {
      value: 'network',
      label: t('productVerification.tabNetworkApi'),
      icon: <Network size={14} />,
      count: evidencePack?.site_graph?.apis?.length,
    },
    {
      value: 'contradictions',
      label: t('productVerification.tabStateContradictions'),
      icon: <AlertTriangle size={14} />,
      count: stateContradictions.length,
    },
    {
      value: 'ghost',
      label: t('productVerification.tabGhostApis'),
      icon: <AlertTriangle size={14} />,
      count: ghostApiCount(evidencePack),
    },
    {
      value: 'rbac',
      label: t('productVerification.tabRbacEntitlement'),
      icon: <ShieldCheck size={14} />,
    },
  ], [evidencePack, screenshotArtifacts.length, stateContradictions.length, summary.withEvidence])

  return (
    <Box sx={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Box sx={{ flexShrink: 0, px: { xs: 2, md: 4 }, pt: { xs: 2, md: 2.5 } }}>
        <FlytoPageHeader
          title={t('productVerification.title')}
          subtitle={t('productVerification.subtitle')}
          bottomGap={4}
        />
      </Box>

      <Box sx={{ flexShrink: 0, px: { xs: 2, md: 4 }, pb: 1 }}>
        <VerificationCommandPanel
          targetUrl={targetUrl}
          repoId={repoId}
          dryRun={dryRun}
          canRun={canRun}
          createPending={createRun.isPending}
          createError={createRun.isError ? createRun.error : null}
          onTargetUrlChange={setTargetUrl}
          onRepoIdChange={setRepoId}
          onDryRunChange={setDryRun}
          onRun={() => createRun.mutate()}
        />
      </Box>

      <Box sx={{ flexShrink: 0, px: { xs: 2, md: 4 }, pb: 0.75 }}>
        <TabBar
          value={primaryTabValue}
          onChange={(value) => setTab(value as VerificationTab)}
          items={primaryTabItems}
          noDivider
          sx={{ bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 1, px: 1 }}
        />
      </Box>

      {primaryTabValue === 'evidence' && (
        <Box sx={{ flexShrink: 0, px: { xs: 2, md: 4 }, pb: 0.75 }}>
          <TabBar
            value={tab}
            onChange={(value) => setTab(value as VerificationTab)}
            items={evidenceTabItems}
            noDivider
            sx={{
              minHeight: 36,
              bgcolor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.13 : 0.06),
              border: 1,
              borderColor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.28 : 0.18),
              borderRadius: 1,
              px: 1,
              '& .MuiTab-root': { minHeight: 36 },
            }}
          />
        </Box>
      )}

      <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden', px: { xs: 2, md: 4 }, pb: 3 }}>
        {runsQ.isLoading && <LinearProgress sx={{ mb: 1 }} />}
        {runsQ.isError && (
          <Box sx={{ mb: 1 }}>
            <QueryError compact error={runsQ.error} onRetry={() => { void runsQ.refetch() }} label={t('productVerification.title')} />
          </Box>
        )}
        {!org?.id && (
          <Alert severity="info" sx={{ mb: 1 }}>
            {t('productVerification.orgLoading')}
          </Alert>
        )}

        <ScrollTabPanel active={tab === 'overview'} value="overview">
          <ProductVerificationOverview
            runs={runs}
            selectedRun={selectedRun}
            contract={contract}
            evidenceGate={evidenceGate}
            evidencePack={evidencePack}
            artifacts={evidenceQ.data?.artifacts ?? []}
            inputTargetUrl={targetUrl}
            inputRepoId={repoId}
            onSelectRun={(run) => {
              setSelectedRunId(run.id)
              setTab('evidence')
            }}
          />
        </ScrollTabPanel>

        <ScrollTabPanel active={tab === 'testing'} value="testing">
          <AutomationTestPanel
            run={selectedRun}
            pack={evidencePack}
            artifacts={evidenceQ.data?.artifacts ?? []}
            gate={evidenceGate}
          />
        </ScrollTabPanel>

        <ScrollTabPanel active={tab === 'scheduler'} value="scheduler">
          <ProductVerificationSchedulerPanel
            isPlatformAdmin={isPlatformAdmin}
            scopeLoading={scopeQ.isLoading}
            scanner={productScanner}
            loading={scannerQ.isLoading}
            error={scannerQ.error as Error | null}
            patchPending={patchScanner.isPending}
            runPending={runScannerNow.isPending}
            latestEvidenceRun={runs.find((run) => !!run.evidenceSig) ?? null}
            onToggle={(enabled) => patchScanner.mutate({ enabled })}
            onInterval={(interval) => patchScanner.mutate({ interval })}
            onRunNow={() => runScannerNow.mutate()}
          />
        </ScrollTabPanel>

        <ScrollTabPanel active={tab === 'evidence'} value="evidence">
          <ProductVerificationEvidencePanel
            selectedRun={selectedRun}
            evidencePack={evidencePack}
            artifacts={evidenceQ.data?.artifacts ?? []}
            evidenceSig={evidenceQ.data?.evidenceSig ?? undefined}
            gate={evidenceGate}
            findings={evidenceFindings}
            loading={evidenceQ.isLoading}
            error={evidenceQ.isError ? evidenceQ.error : null}
            success={evidenceQ.isSuccess}
            onRetry={() => { void evidenceQ.refetch() }}
          />
        </ScrollTabPanel>

        <ScrollTabPanel active={tab === 'yaml'} value="yaml">
          <YamlScenariosPanel run={selectedRun} pack={evidencePack} />
        </ScrollTabPanel>

        <ScrollTabPanel active={tab === 'replay'} value="replay">
          <ReplayTimelinePanel
            run={selectedRun}
            pack={evidencePack}
            artifacts={evidenceQ.data?.artifacts ?? []}
            gate={evidenceGate}
          />
        </ScrollTabPanel>

        <ScrollTabPanel active={tab === 'screenshots'} value="screenshots">
          <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
            <SectionHeader icon={<Image size={16} />} title={t('productVerification.screenshots')} />
            {screenshotArtifacts.length === 0 ? (
              <Alert severity="info" sx={{ m: 2 }}>
                {t('productVerification.noScreenshots')}
              </Alert>
            ) : (
              <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25 }}>
                {screenshotArtifacts.map((artifact) => (
                  <EvidenceImage key={artifact.id} artifact={artifact} />
                ))}
              </Box>
            )}
          </Paper>
        </ScrollTabPanel>

        <ScrollTabPanel active={tab === 'discovery'} value="discovery">
          <GraphEvidencePanel pack={evidencePack} artifacts={evidenceQ.data?.artifacts ?? []} mode="discovery" />
        </ScrollTabPanel>

        <ScrollTabPanel active={tab === 'intent'} value="intent">
          <GraphEvidencePanel pack={evidencePack} artifacts={evidenceQ.data?.artifacts ?? []} mode="intent" />
        </ScrollTabPanel>

        <ScrollTabPanel active={tab === 'network'} value="network">
          <GraphEvidencePanel pack={evidencePack} artifacts={evidenceQ.data?.artifacts ?? []} mode="network" />
        </ScrollTabPanel>

        <ScrollTabPanel active={tab === 'contradictions'} value="contradictions">
          <DeterministicRulesPanel summary={deterministicRuleSummary} findings={stateContradictions} />
        </ScrollTabPanel>

        <ScrollTabPanel active={tab === 'ghost'} value="ghost">
          <GhostApisPanel pack={evidencePack} artifacts={evidenceQ.data?.artifacts ?? []} gate={evidenceGate} />
        </ScrollTabPanel>

        <ScrollTabPanel active={tab === 'rbac'} value="rbac">
          <RbacEntitlementPanel run={selectedRun} pack={evidencePack} artifacts={evidenceQ.data?.artifacts ?? []} gate={evidenceGate} />
        </ScrollTabPanel>
      </Box>
    </Box>
  )
}

function ScrollTabPanel({ active, value, children, scroll = true }: { active: boolean; value: VerificationTab; children: ReactNode; scroll?: boolean }) {
  if (!active) return null

  return (
    <Box
      role="tabpanel"
      id={`product-verification-panel-${value}`}
      aria-labelledby={`product-verification-tab-${value}`}
      sx={{
        height: '100%',
        minHeight: 0,
        overflowY: scroll ? 'auto' : 'hidden',
        overflowX: 'hidden',
        pr: 0.5,
        display: 'flex',
        flexDirection: 'column',
        gap: scroll ? 2 : 0,
      }}
    >
      {children}
    </Box>
  )
}

export function LegacyProductVerificationRunRow({ run, selected, onSelect }: { run: WarroomCampaignExecution; selected: boolean; onSelect: () => void }) {
  const status = run.verdict ?? run.status
  return (
    <Paper
      variant="outlined"
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onSelect()
      }}
      sx={{
        p: 2,
        borderRadius: 1,
        cursor: 'pointer',
        borderColor: selected ? 'primary.main' : 'divider',
        bgcolor: selected ? 'action.hover' : 'background.paper',
      }}
    >
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Typography variant="subtitle2" noWrap>{run.targetUrl}</Typography>
            <Chip size="small" color={statusColor[status] ?? statusColor[run.status] ?? 'default'} label={status} />
            {run.dryRun && <Chip size="small" variant="outlined" label={t('productVerification.dryRun')} />}
          </Stack>
          <Typography variant="caption" color="text.secondary">
            {formatDate(run.createdAt)} · {run.playbookId ?? 'warroom-deterministic-audit'}
          </Typography>
          {run.allowedTargets && (
            <Typography variant="body2" color="text.secondary" noWrap>
              {compactScope(run.allowedTargets)}
            </Typography>
          )}
          {run.errorMessage && (
            <Box sx={{ mt: 1 }}>
              <InlineErrorNotice error={run.errorMessage} />
            </Box>
          )}
        </Box>
        <Stack direction="row" spacing={1} justifyContent={{ xs: 'flex-start', md: 'flex-end' }} flexWrap="wrap">
          <Chip size="small" label={`P0 ${run.criticalCount}`} color={run.criticalCount > 0 ? 'error' : 'default'} />
          <Chip size="small" label={`${run.findingsCount} findings`} />
          {run.runnerExecutionId && <Chip size="small" variant="outlined" label={run.runnerExecutionId} />}
        </Stack>
      </Stack>
    </Paper>
  )
}
