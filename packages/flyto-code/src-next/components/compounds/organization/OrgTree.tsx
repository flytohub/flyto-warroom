import { useState, useMemo } from 'react'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import { Users } from 'lucide-react'
import { t } from '@lib/i18n';
import { useOrgChart } from './useOrgChart'
import { OrgToolbar } from './OrgToolbar'
import { OrgCanvas } from './OrgCanvas'
import { useGitHubOrg, useGitHubOrgMembers } from '@hooks/useOrgMembers'
import { useRepoScores } from '@hooks/useRepoScores'
import { QueryError } from '@atoms/QueryError'
import { EmptyStateGuide } from '@atoms/EmptyStateGuide'

export function OrgTree() {
  const chart = useOrgChart()
  const ghOrgsQ = useGitHubOrg()
  const { data: ghOrgs, isLoading: orgsLoading, isError: orgsError, error: orgsErr, refetch: refetchOrgs } = ghOrgsQ
  const firstOrg = ghOrgs?.[0]?.login
  const membersQ = useGitHubOrgMembers(firstOrg)
  const { data: members, isError: membersError, error: membersErr, refetch: refetchMembers } = membersQ
  const [syncing, setSyncing] = useState(false)
  const scoreMap = useRepoScores()

  const repoHealthMap = useMemo(() => {
    const map = new Map<string, { grade: string; score: number }>()
    for (const [repoId, rs] of scoreMap) {
      // A3: only put scorable repos in the chart's overlay map.
      // Unscored repos render without a grade badge instead of
      // appearing as "grade --, score 0".
      if (!rs.scorable || rs.grade == null || rs.raw == null) continue
      map.set(repoId, { grade: rs.grade, score: rs.raw })
    }
    return map
  }, [scoreMap])

  function handleSyncGitHub() {
    if (!members || members.length === 0) return
    setSyncing(true)
    chart.syncFromGitHub(members)
    setTimeout(() => setSyncing(false), 500)
  }

  // ── Loading / error / empty for upstream data ─────────
  // GitHub orgs is the gating query — if it's still loading or
  // failed, the canvas would render with no member data and the
  // operator would assume there's nothing to sync. Surfacing the
  // state explicitly avoids that silent-empty failure mode.
  if (orgsLoading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <CircularProgress size={24} />
      </Box>
    )
  }

  if (orgsError) {
    return (
      <Box sx={{ height: '100%', overflowY: 'auto' }}>
        <QueryError
          error={orgsErr}
          onRetry={refetchOrgs}
          label={t('orgTree.orgLabel')}
        />
      </Box>
    )
  }

  if (membersError) {
    return (
      <Box sx={{ height: '100%', overflowY: 'auto' }}>
        <QueryError
          error={membersErr}
          onRetry={refetchMembers}
          label={t('orgTree.membersLabel')}
        />
      </Box>
    )
  }

  // No GitHub org connected yet — canvas is still usable for
  // manual node creation, but surface a hint so first-run operators
  // know the "Sync from GitHub" button isn't broken, it's just
  // waiting for an OAuth connection.
  const showConnectHint = !firstOrg && chart.nodes.length === 0

  if (showConnectHint) {
    return (
      <Box sx={{ height: '100%', overflowY: 'auto', p: 4 }}>
        <EmptyStateGuide
          icon={<Users size={28} />}
          title={t('orgTree.emptyTitle')}
          description={t('orgTree.emptyDesc')}
          steps={[
            { label: t('orgTree.step1') },
            { label: t('orgTree.step2') },
          ]}
        />
      </Box>
    )
  }

  return (
    <div style={{ display: 'flex', position: 'relative', width: '100%', height: '100%' }}>
      <OrgToolbar
        selectedId={chart.selectedId}
        onAddNode={(tool) => chart.addNode(tool)}
        onDelete={() => chart.selectedId && chart.deleteNode(chart.selectedId)}
        onFitToView={chart.fitToView}
      />
      <OrgCanvas
        nodes={chart.nodes}
        selectedId={chart.selectedId}
        repoHealthMap={repoHealthMap}
        editingId={chart.editingId}
        editText={chart.editText}
        addMenuId={chart.addMenuId}
        canvasRef={chart.canvasRef}
        pan={chart.pan}
        panning={chart.panning}
        dragging={chart.dragging}
        editRef={chart.editRef}
        onEditTextChange={(text) => chart.setEditText(text)}
        onConfirmRename={chart.confirmRename}
        onCancelRename={() => chart.setEditingId(null)}
        onNodeMouseDown={chart.onNodeMouseDown}
        onStartRename={chart.startRename}
        onDelete={chart.deleteNode}
        onToggleAddMenu={(id) => {
          chart.setAddMenuId(chart.addMenuId === id ? null : id)
          chart.setSelectedId(id)
        }}
        onAddChild={(tool, parentId) => chart.addNode(tool, parentId)}
        onCanvasMouseDown={chart.onCanvasMouseDown}
        onMouseMove={chart.onMouseMove}
        onMouseUp={chart.onMouseUp}
        onAutoLayout={chart.autoLayout}
        onFitToView={chart.fitToView}
        onGoToRoot={chart.goToRoot}
        onSyncGitHub={members && members.length > 0 ? handleSyncGitHub : undefined}
        syncing={syncing}
      />
    </div>
  )
}
