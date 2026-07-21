import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useOrg } from '@hooks/useOrg'
import { qk } from '@lib/queryKeys'
import {
  createWarroomVerificationRun,
  getEventScope,
  getWarroomVerificationEvidence,
  listProductVerificationScanner,
  listWarroomVerificationRuns,
  patchProductVerificationScanner,
  runProductVerificationScannerNow,
} from '@lib/engine'
import {
  normalizeEvidenceFindings,
  normalizeEvidenceGate,
  summarizeDeterministicRules,
  summarizeRuns,
} from './productVerificationModel'

export function useProductVerificationController() {
  const { org } = useOrg()
  const queryClient = useQueryClient()
  const [targetUrl, setTargetUrl] = useState('')
  const [repoId, setRepoId] = useState('')
  const [dryRun, setDryRun] = useState(true)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)

  const runsQuery = useQuery({
    queryKey: qk.warroomVerification.runs(org?.id),
    queryFn: () => listWarroomVerificationRuns(org!.id),
    enabled: !!org?.id,
    staleTime: 15_000,
  })
  const scopeQuery = useQuery({
    queryKey: qk.platform.eventScope(),
    queryFn: getEventScope,
    staleTime: 5 * 60_000,
  })
  const isPlatformAdmin = !!scopeQuery.data?.is_platform_admin
  const scannerQuery = useQuery({
    queryKey: qk.platform.systemScanners(),
    queryFn: listProductVerificationScanner,
    enabled: isPlatformAdmin,
    staleTime: 5000,
  })

  const createRun = useMutation({
    mutationFn: () => createWarroomVerificationRun(org!.id, {
      target_url: targetUrl.trim(),
      repo_id: repoId.trim() || undefined,
      dry_run: dryRun,
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.warroomVerification.runs(org?.id) })
    },
  })
  const patchScanner = useMutation({
    mutationFn: (body: Partial<{ enabled: boolean; interval: string; notes: string }>) => patchProductVerificationScanner(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.platform.systemScanners() })
    },
  })
  const runScannerNow = useMutation({
    mutationFn: runProductVerificationScannerNow,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.platform.systemScanners() })
      void queryClient.invalidateQueries({ queryKey: qk.warroomVerification.runs(org?.id) })
    },
  })

  const runs = useMemo(() => runsQuery.data?.runs ?? [], [runsQuery.data?.runs])
  const latestRun = runs[0]
  const selectedRun = useMemo(
    () => (selectedRunId ? runs.find((run) => run.id === selectedRunId) ?? latestRun : latestRun),
    [latestRun, runs, selectedRunId],
  )
  const evidenceQuery = useQuery({
    queryKey: qk.warroomVerification.evidence(org?.id, selectedRun?.id),
    queryFn: () => getWarroomVerificationEvidence(org!.id, selectedRun!.id),
    enabled: !!org?.id && !!selectedRun?.id && !!selectedRun?.runnerExecutionId,
    staleTime: 5000,
  })

  const contract = runsQuery.data?.graph_contract ?? createRun.data?.graph_contract ?? 'warroom.product_verification.v1'
  const evidencePack = evidenceQuery.data?.evidencePack ?? null
  const evidenceGate = useMemo(
    () => normalizeEvidenceGate(evidenceQuery.data, evidencePack),
    [evidencePack, evidenceQuery.data],
  )
  const evidenceFindings = useMemo(() => normalizeEvidenceFindings(evidencePack), [evidencePack])
  const stateContradictions = useMemo(
    () => evidenceFindings.filter((finding) => (finding.code ?? finding.type) === 'state_contradiction'),
    [evidenceFindings],
  )
  const deterministicRuleSummary = useMemo(
    () => summarizeDeterministicRules(evidencePack),
    [evidencePack],
  )
  const screenshotArtifacts = useMemo(
    () => (evidenceQuery.data?.artifacts ?? []).filter((artifact) => artifact.kind === 'screenshot' || artifact.mimeType.startsWith('image/')),
    [evidenceQuery.data?.artifacts],
  )

  return {
    org,
    targetUrl,
    setTargetUrl,
    repoId,
    setRepoId,
    dryRun,
    setDryRun,
    setSelectedRunId,
    runsQuery,
    scopeQuery,
    scannerQuery,
    evidenceQuery,
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
    summary: summarizeRuns(runs),
    productScanner: scannerQuery.data?.scanner ?? null,
    isPlatformAdmin,
    canRun: !!org?.id && targetUrl.trim().length > 0 && !createRun.isPending,
  }
}
