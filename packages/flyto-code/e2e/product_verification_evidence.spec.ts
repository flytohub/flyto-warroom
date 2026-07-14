/**
 * Product Verification full-stack smoke.
 *
 * This is intentionally stronger than the component-level mock tests:
 * it creates a real org + connected repo, writes repo verify-target scope,
 * presses Run in flyto-code, waits for flyto-engine -> flyto-verification ->
 * flyto-core browser replay -> callback, and then verifies the evidence pack
 * is complete and visible in the Product Verification cockpit.
 *
 * Required local stack:
 *   - flyto-engine on :8080 with FLYTO_DEV_AUTH=1
 *   - flyto-verification on :8344, reachable by engine
 *   - vite dev server on :5180 (started by Playwright webServer)
 *
 * Run explicitly:
 *   FLYTO_PRODUCT_VERIFY_FULL_STACK=1 npm run smoke:product-verification
 */
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const ENGINE = process.env.FLYTO_ENGINE_URL ?? 'http://127.0.0.1:8080'
const TARGET_URL = process.env.FLYTO_PRODUCT_VERIFY_TARGET_URL ?? 'http://host.docker.internal:5180'
const EXISTING_ORG_ID = process.env.FLYTO_PRODUCT_VERIFY_ORG_ID ?? ''
const EXISTING_REPO_ID = process.env.FLYTO_PRODUCT_VERIFY_REPO_ID ?? ''
const RUN_TIMEOUT_MS = Number(process.env.FLYTO_PRODUCT_VERIFY_TIMEOUT_MS ?? 120_000)
const STRICT_SCHEDULER_SMOKE = process.env.FLYTO_PRODUCT_VERIFY_SCHEDULER_SMOKE === '1'
const REQUIRED_ARTIFACT_KINDS = ['screenshot', 'dom_snapshot', 'network_log'] as const

test.skip(process.env.FLYTO_PRODUCT_VERIFY_FULL_STACK !== '1', 'Set FLYTO_PRODUCT_VERIFY_FULL_STACK=1 to run the real engine + verification smoke.')
test.setTimeout(Math.max(RUN_TIMEOUT_MS + 60_000, 120_000))
test.describe.configure({ mode: 'serial' })
test.afterEach(async ({ request }) => {
  await cleanupVerifiedRepoScopes(request)
})

type CampaignRun = {
  id: string
  runnerExecutionId?: string | null
  targetUrl: string
  status: string
  verdict?: string | null
  evidenceSig?: string | null
  errorMessage?: string | null
}

type EvidenceArtifact = {
  id: string
  kind: string
  name: string
  mimeType: string
  previewDataUrl?: string
}

type EvidenceResponse = {
  evidenceSig?: string | null
  gateVerdict?: string
  gateScore?: number
  gateBlockers?: string[]
  scoreBreakdown?: Record<string, { points?: number; max?: number }>
  artifactCompleteness?: {
    required?: string[]
    present?: string[]
    missing?: string[]
    complete?: boolean
    score?: number
  }
  evidencePack?: Record<string, unknown> | null
  artifacts: EvidenceArtifact[]
}

type VerifiedRepoScope = {
  orgId: string
  repoId: string
  ownsOrg: boolean
  ownsRepo: boolean
  targetUrl: string
  stamp: string
}

type OrgLiveEvent = {
  id?: number
  workspaceId?: string
  type?: string
  payload?: Record<string, unknown>
  timestamp?: string
}

const cleanupQueue: VerifiedRepoScope[] = []

test('manual Run produces runner id, complete evidence pack and screenshots in flyto-code', async ({ page, request }) => {
  const consoleWatch = watchConsole(page)
  await assertEngineHealthy(request)
  await assertVerificationTargetServesApp(request)
  const fixture = await ensureVerifiedRepoScope(request)
  let expectedRunId = ''
  let expectedRunnerId = ''
  const liveStream = observeOrgEvent(fixture.orgId, (event) => {
    const payload = event.payload ?? {}
    return event.type === 'campaign_execution.updated' &&
      payload.campaign_execution_id === expectedRunId &&
      payload.runner_execution_id === expectedRunnerId &&
      payload.status === 'complete' &&
      payload.has_evidence === true
  }, RUN_TIMEOUT_MS)
  await liveStream.ready

  await page.goto(`/projects/${fixture.orgId}/product-verification`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: /Automated Security Testing/i })).toBeVisible({ timeout: 30_000 })

  await page.getByLabel(/Approved target URL/i).fill(TARGET_URL)
  await page.getByLabel(/Repo scope/i).fill(fixture.repoId)
  await page.getByLabel(/Preview only/i).uncheck()
  await expect(page.getByText('Next action').first()).toBeVisible()
  await expect(page.getByText(TARGET_URL).first()).toBeVisible()
  await expect(page.getByText('Gate score').first()).toBeVisible()
  await expect(page.getByText('Evidence').first()).toBeVisible()
  await expect(page.getByText('Runner execution').first()).toBeVisible()

  const createResponse = page.waitForResponse((res) =>
    res.url().includes(`/api/v1/code/orgs/${fixture.orgId}/warroom-verification/runs`) &&
    res.request().method() === 'POST',
  )
  await page.getByRole('button', { name: /^Start scan$/i }).click()
  const created = await createResponse
  expect(created.ok(), `Run POST failed: ${created.status()} ${await created.text()}`).toBeTruthy()
  const createdBody = await created.json() as { run: CampaignRun }
  const runId = createdBody.run.id
  expectedRunId = runId
  expectedRunnerId = createdBody.run.runnerExecutionId ?? ''
  expect(createdBody.run.runnerExecutionId, 'runner execution id should be returned after dispatch').toBeTruthy()

  await expect(page.getByText(createdBody.run.runnerExecutionId!).first()).toBeVisible({ timeout: 20_000 })

  const { run, evidence } = await waitForEvidence(request, fixture.orgId, runId)
  const liveEvent = await liveStream.event
  assertEvidenceClosedLoop(run, evidence, liveEvent)

  await page.getByRole('tab', { name: /Evidence Pack/i }).click()
  await expect(page.getByText(run.evidenceSig ?? evidence.evidenceSig!)).toBeVisible({ timeout: 45_000 })
  await expect(page.getByText(run.runnerExecutionId!).first()).toBeVisible()
  expect(evidence.gateVerdict, 'evidence API should expose the 90-point gate verdict').toBeTruthy()
  expect(typeof evidence.gateScore, 'evidence API should expose the 90-point gate score').toBe('number')
  await expect(page.getByText('Gate verdict').first()).toBeVisible()
  await expect(page.getByText('Gate score').first()).toBeVisible()
  await expect(page.getByText(`${evidence.gateScore} / 100`).first()).toBeVisible()
  await captureProductVerificationPage(page, 'e2e/__screenshots__/product-verification-gate.png')

  await page.getByRole('tab', { name: /Testing Matrix/i }).click()
  const testingPanel = page.locator('#product-verification-panel-testing')
  await expect(testingPanel.getByText('Security testing matrix')).toBeVisible({ timeout: 45_000 })
  await expect(testingPanel.getByText('Backend authority')).toBeVisible()
  await expect(testingPanel.getByText('UI interaction coverage')).toBeVisible()
  await expect(testingPanel.getByText('Evidence artifacts')).toBeVisible()
  await captureProductVerificationPage(page, 'e2e/__screenshots__/product-verification-testing-matrix.png')

  await page.getByRole('tab', { name: /Evidence Pack/i }).click()
  await page.getByRole('tab', { name: /YAML Scenarios/i }).click()
  const yamlPanel = page.locator('#product-verification-panel-yaml')
  await expect(yamlPanel.getByText('YAML Scenarios')).toBeVisible({ timeout: 45_000 })
  await expect(yamlPanel.getByText(/browser\./).first()).toBeVisible()
  await captureProductVerificationPage(page, 'e2e/__screenshots__/product-verification-yaml-scenarios.png')

  await page.getByRole('tab', { name: /Replay Timeline/i }).click()
  const replayPanel = page.locator('#product-verification-panel-replay')
  await expect(replayPanel.getByText('Replay Timeline')).toBeVisible({ timeout: 45_000 })
  await captureProductVerificationPage(page, 'e2e/__screenshots__/product-verification-replay-timeline.png')

  await page.getByRole('tab', { name: /Discovery/i }).click()
  const discoveryPanel = page.locator('#product-verification-panel-discovery')
  await expect(discoveryPanel.getByText('Discovery')).toBeVisible({ timeout: 45_000 })
  await captureProductVerificationPage(page, 'e2e/__screenshots__/product-verification-discovery.png')

  await page.getByRole('tab', { name: /Intent Graph/i }).click()
  const intentPanel = page.locator('#product-verification-panel-intent')
  await expect(intentPanel.getByText('Intent Graph')).toBeVisible({ timeout: 45_000 })

  await page.getByRole('tab', { name: new RegExp('Network / API', 'i') }).click()
  const networkPanel = page.locator('#product-verification-panel-network')
  await expect(networkPanel.getByText('Network/API')).toBeVisible({ timeout: 45_000 })
  await expect(networkPanel.getByText('DOM snapshot')).toBeVisible()
  await captureProductVerificationPage(page, 'e2e/__screenshots__/product-verification-network-api.png')

  await page.getByRole('tab', { name: /State Contradictions/i }).click()
  await expect(page.locator('#product-verification-panel-contradictions').getByRole('heading', { name: 'State contradictions' })).toBeVisible({ timeout: 45_000 })

  await page.getByRole('tab', { name: /Ghost APIs/i }).click()
  await expect(page.locator('#product-verification-panel-ghost').getByRole('heading', { name: 'Ghost APIs' })).toBeVisible({ timeout: 45_000 })

  await page.getByRole('tab', { name: /RBAC \/ Entitlement/i }).click()
  const rbacPanel = page.locator('#product-verification-panel-rbac')
  await expect(rbacPanel.getByRole('heading', { name: 'Verifier authorization evidence' })).toBeVisible({ timeout: 45_000 })
  await expect(rbacPanel.getByText('Target under verification').first()).toBeVisible()
  await expect(rbacPanel.getByText('Verifier provenance').first()).toBeVisible()
  await expect(rbacPanel.getByText('Verifier authorization evidence')).toBeVisible()
  await expect(rbacPanel.getByText('Verifier authority')).toBeVisible()
  await captureProductVerificationPage(page, 'e2e/__screenshots__/product-verification-rbac-entitlement.png')

  await page.getByRole('tab', { name: /Screenshots/i }).click()
  const screenshotPanel = page.locator('#product-verification-panel-screenshots')
  await expect(screenshotPanel.locator('img').first()).toBeVisible({ timeout: 45_000 })
  await captureProductVerificationPage(page, 'e2e/__screenshots__/product-verification-evidence.png')

  await page.getByRole('tab', { name: /Scheduler Runs/i }).click()
  const schedulerPanel = page.locator('#product-verification-panel-scheduler')
  await expect(schedulerPanel.getByText('Scheduled Automated Security Testing')).toBeVisible({ timeout: 45_000 })
  await captureProductVerificationPage(page, 'e2e/__screenshots__/product-verification-scheduler-runs.png')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/projects/${fixture.orgId}/product-verification`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: /Automated Security Testing/i })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('tab', { name: /Evidence Pack/i }).click()
  await expect(page.getByText(run.evidenceSig ?? evidence.evidenceSig!).first()).toBeVisible({ timeout: 45_000 })
  await captureProductVerificationPage(page, 'e2e/__screenshots__/product-verification-mobile.png')

  expect(consoleWatch.errors, `browser console/page errors: ${consoleWatch.errors.join(' | ')}`).toHaveLength(0)
})

test('backend fail-closed scope gates do not create hidden product verification runs', async ({ request }) => {
  await assertEngineHealthy(request)

  const emptyScope = await ensureVerifiedRepoScope(request, { forceNew: true, verifyTargets: false })
  const emptyBefore = await listVerificationRuns(request, emptyScope.orgId)
  const emptyRejected = await apiRaw(request, 'POST', `/api/v1/code/orgs/${emptyScope.orgId}/warroom-verification/runs`, {
    target_url: TARGET_URL,
    repo_id: emptyScope.repoId,
    dry_run: false,
  }, [403])
  expect(emptyRejected.text).toContain('scope is empty')
  const emptyAfter = await listVerificationRuns(request, emptyScope.orgId)
  expect(emptyAfter.runs).toHaveLength(emptyBefore.runs.length)

  const scoped = await ensureVerifiedRepoScope(request, { forceNew: true })
  const forbiddenTarget = 'https://outside-product-verification-scope.flyto.invalid'
  const scopedBefore = await listVerificationRuns(request, scoped.orgId)
  const scopedRejected = await apiRaw(request, 'POST', `/api/v1/code/orgs/${scoped.orgId}/warroom-verification/runs`, {
    target_url: forbiddenTarget,
    repo_id: scoped.repoId,
    dry_run: false,
    allowed_targets: ['*'],
  }, [403])
  expect(scopedRejected.text).toContain('target_url is outside the engine-computed verification scope')
  const scopedAfter = await listVerificationRuns(request, scoped.orgId)
  expect(scopedAfter.runs).toHaveLength(scopedBefore.runs.length)
  expect(scopedAfter.runs.filter((run) => run.targetUrl === forbiddenTarget)).toHaveLength(0)
})

test('scheduler control plane is explicit and never reports fake run-now success', async ({ request }) => {
  await assertEngineHealthy(request)

  const listExpected = STRICT_SCHEDULER_SMOKE ? [200] : [200, 403, 503]
  const list = await apiRaw(request, 'GET', '/api/v1/system/scanners', undefined, listExpected)
  if (list.status !== 200) {
    expect(STRICT_SCHEDULER_SMOKE, `strict scheduler smoke expected scanner list 200, got ${list.status}: ${list.text}`).toBeFalsy()
    expect(list.text).toMatch(/forbidden|admin|scheduler|unavailable|unauthorized/i)
    return
  }

  const parsed = JSON.parse(list.text) as { scanners?: Array<{ id: string }> }
  expect((parsed.scanners ?? []).some((scanner) => scanner.id === 'product_verification'), 'product_verification scanner must be listed before run-now can be trusted').toBeTruthy()

  const runExpected = STRICT_SCHEDULER_SMOKE ? [200] : [200, 403, 503]
  const runNow = await apiRaw(request, 'POST', '/api/v1/system/scanners/product_verification/run-now', undefined, runExpected)
  if (runNow.status !== 200) {
    expect(STRICT_SCHEDULER_SMOKE, `strict scheduler smoke expected run-now 200, got ${runNow.status}: ${runNow.text}`).toBeFalsy()
    expect(runNow.text).toMatch(/forbidden|admin|scheduler|unavailable|not configured/i)
    return
  }

  const runBody = JSON.parse(runNow.text) as { ok?: boolean; scanner?: string }
  expect(runBody).toMatchObject({ ok: true, scanner: 'product_verification' })
})

function observeOrgEvent(
  orgId: string,
  match: (event: OrgLiveEvent) => boolean,
  timeoutMs: number,
): { ready: Promise<void>; event: Promise<OrgLiveEvent> } {
  const controller = new AbortController()
  let readyResolve!: () => void
  let readyReject!: (reason?: unknown) => void
  const ready = new Promise<void>((resolve, reject) => {
    readyResolve = resolve
    readyReject = reject
  })
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const event = (async () => {
    try {
      const res = await fetch(`${ENGINE}/api/v1/code/orgs/${orgId}/events`, {
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${makeDevToken()}`,
        },
        signal: controller.signal,
      })
      if (!res.ok || !res.body) {
        throw new Error(`SSE connect failed: ${res.status} ${await res.text()}`)
      }
      readyResolve()
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const frames = buffer.split(/\n\n/)
        buffer = frames.pop() ?? ''
        for (const frame of frames) {
          const parsed = parseSseFrame(frame)
          if (!parsed?.data) continue
          const candidate = JSON.parse(parsed.data) as OrgLiveEvent
          if ((parsed.eventName === '' || parsed.eventName === candidate.type) && match(candidate)) {
            return candidate
          }
        }
      }
      throw new Error('SSE stream closed before matching event')
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        const timeoutError = new Error(`Timed out waiting for campaign_execution.updated SSE event for org ${orgId}`)
        readyReject(timeoutError)
        throw timeoutError
      }
      readyReject(err)
      throw err
    } finally {
      clearTimeout(timer)
      controller.abort()
    }
  })()
  event.catch(() => undefined)
  return { ready, event }
}

function parseSseFrame(frame: string): { eventName: string; data: string } | null {
  let eventName = ''
  const data: string[] = []
  for (const line of frame.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue
    if (line.startsWith('event:')) {
      eventName = line.slice('event:'.length).trim()
    } else if (line.startsWith('data:')) {
      data.push(line.slice('data:'.length).trim())
    }
  }
  if (data.length === 0) return null
  return { eventName, data: data.join('\n') }
}

async function assertEngineHealthy(request: APIRequestContext) {
  const res = await request.get(`${ENGINE}/health`, { timeout: 10_000 })
  expect(res.ok(), `engine /health failed at ${ENGINE}`).toBeTruthy()
}

async function assertVerificationTargetServesApp(request: APIRequestContext) {
  const target = new URL(TARGET_URL)
  const preflightUrl = target.hostname === 'host.docker.internal'
    ? `${target.protocol}//127.0.0.1:${target.port || (target.protocol === 'https:' ? '443' : '80')}${target.pathname}${target.search}`
    : TARGET_URL
  const headers = {
    Accept: 'text/html',
    ...(target.hostname === 'host.docker.internal'
      ? { Host: `${target.hostname}${target.port ? `:${target.port}` : ''}` }
      : {}),
  }
  const res = await request.get(preflightUrl, { headers, timeout: 10_000 })
  const body = await res.text()
  expect(res.ok(), `verification target failed before runner dispatch: ${TARGET_URL} -> ${res.status()}`).toBeTruthy()
  expect(body, `verification target is Vite blocked-host page for ${TARGET_URL}`).not.toContain('Blocked request.')
  expect(body, `verification target rejected host for ${TARGET_URL}`).not.toContain('This host (')
  expect(body, `verification target should serve the flyto-code app shell for ${TARGET_URL}`).toContain('root')
}

async function ensureVerifiedRepoScope(
  request: APIRequestContext,
  options: { forceNew?: boolean; verifyTargets?: boolean; targetUrl?: string } = {},
): Promise<VerifiedRepoScope> {
  const stamp = Date.now().toString(36)
  const targetUrl = options.targetUrl ?? TARGET_URL
  const useExistingOrg = !options.forceNew && EXISTING_ORG_ID
  const useExistingRepo = !options.forceNew && EXISTING_REPO_ID
  const orgId = useExistingOrg || (await apiJSON<{ id: string }>(request, 'POST', '/api/v1/code/orgs', {
    name: `PV Smoke ${stamp}`,
    slug: `pv-smoke-${stamp}`,
    project_type: 'all',
  }, [201])).id
  await ensureProductVerificationModule(request, orgId)

  const repoId = useExistingRepo || (await apiJSON<{ id: string }>(request, 'POST', `/api/v1/code/orgs/${orgId}/repos`, {
    provider: 'github',
    providerId: `pv-smoke-${stamp}`,
    ownerName: 'flyto2',
    repoName: `product-verification-smoke-${stamp}`,
    fullName: `flyto2/product-verification-smoke-${stamp}`,
    defaultBranch: 'main',
    htmlUrl: 'https://github.com/flytohub/flyto-code',
    homepage: targetUrl,
  }, [201])).id

  if (options.verifyTargets !== false) {
    await apiJSON(request, 'PUT', `/api/v1/code/repos/${repoId}/verify-targets`, {
      targets: [targetUrl],
    })
  }

  const fixture = {
    orgId,
    repoId,
    ownsOrg: !useExistingOrg,
    ownsRepo: !useExistingRepo,
    targetUrl,
    stamp,
  }
  cleanupQueue.push(fixture)
  return fixture
}

async function ensureProductVerificationModule(request: APIRequestContext, orgId: string) {
  await apiJSON(request, 'PUT', `/api/v1/code/orgs/${orgId}/fusion/projects/${orgId}/modules`, {
    modules: [
      {
        module: 'product_verification',
        enabled: true,
        sources: [],
      },
    ],
  })
}

async function waitForEvidence(request: APIRequestContext, orgId: string, runId: string): Promise<{ run: CampaignRun; evidence: EvidenceResponse }> {
  const deadline = Date.now() + RUN_TIMEOUT_MS
  let lastRun: CampaignRun | undefined
  let lastEvidence: EvidenceResponse | undefined

  while (Date.now() < deadline) {
    const list = await apiJSON<{ runs: CampaignRun[] }>(request, 'GET', `/api/v1/code/orgs/${orgId}/warroom-verification/runs`)
    lastRun = list.runs.find((candidate) => candidate.id === runId)
    if (lastRun?.status === 'failed') {
      throw new Error(`Product Verification failed: ${lastRun.errorMessage ?? 'no error message'}`)
    }
    if (lastRun?.runnerExecutionId) {
      lastEvidence = await apiJSON<EvidenceResponse>(request, 'GET', `/api/v1/code/orgs/${orgId}/warroom-verification/runs/${runId}/evidence`)
      if (lastRun.status === 'complete' && (lastRun.evidenceSig || lastEvidence.evidenceSig) && hasRequiredArtifacts(lastEvidence)) {
        return { run: lastRun, evidence: lastEvidence }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 2500))
  }

  throw new Error(`Timed out waiting for Product Verification evidence. Last run=${JSON.stringify(lastRun)} evidence=${JSON.stringify(lastEvidence)}`)
}

function assertEvidenceClosedLoop(run: CampaignRun, evidence: EvidenceResponse, liveEvent: OrgLiveEvent) {
  expect(run.status, `run ended with ${run.status}: ${run.errorMessage ?? ''}`).toBe('complete')
  expect(run.evidenceSig ?? evidence.evidenceSig, 'callback must persist evidence signature').toMatch(/^sha256:[a-f0-9]{64}$/)
  expect(liveEvent.payload?.gate_verdict, 'SSE event should carry Product Verification gate verdict').toBe('pass')
  expect(typeof liveEvent.payload?.gate_score, 'SSE event should carry Product Verification gate score').toBe('number')
  expect(Array.isArray(liveEvent.payload?.artifacts), 'SSE event should carry artifact summaries').toBeTruthy()

  const artifactKinds = new Set((evidence.artifacts ?? []).map((artifact) => artifact.kind))
  expect([...artifactKinds], 'evidence API must expose screenshot, DOM and network artifacts').toEqual(expect.arrayContaining([...REQUIRED_ARTIFACT_KINDS]))
  const screenshot = evidence.artifacts.find((artifact) => artifact.kind === 'screenshot')
  expect(screenshot?.mimeType, 'screenshot artifact must be an image').toMatch(/^image\//)
  expect(screenshot?.previewDataUrl, 'screenshot artifact must expose a safe preview URL').toMatch(/^data:image\/[a-z0-9.+-]+;base64,/i)
  expect(evidence.artifacts.find((artifact) => artifact.kind === 'dom_snapshot')?.mimeType, 'DOM snapshot artifact must be structured or textual').toMatch(/json|html|text/i)
  expect(evidence.artifacts.find((artifact) => artifact.kind === 'network_log')?.mimeType, 'network log artifact must be structured JSON').toMatch(/json/i)

  expect(evidence.gateVerdict, 'evidence API should expose Product Verification gate verdict').toBe('pass')
  expect(typeof evidence.gateScore, 'evidence API should expose Product Verification gate score').toBe('number')
  expect(evidence.gateScore ?? 0, 'passing live smoke should meet the Product Verification gate floor').toBeGreaterThanOrEqual(90)
  expect(Object.keys(evidence.scoreBreakdown ?? {}).length, 'score breakdown should be persisted for auditability').toBeGreaterThan(0)
  expect(evidence.artifactCompleteness?.required ?? [], 'artifact completeness should declare required evidence').toEqual(expect.arrayContaining([...REQUIRED_ARTIFACT_KINDS]))
  expect(evidence.artifactCompleteness?.present ?? [], 'artifact completeness should list captured evidence').toEqual(expect.arrayContaining([...REQUIRED_ARTIFACT_KINDS]))
  expect(evidence.artifactCompleteness?.missing ?? [], 'live smoke should not miss required Product Verification artifacts').toHaveLength(0)
  expect(evidence.artifactCompleteness?.complete, 'artifact completeness should be complete').toBe(true)
  expect(evidence.evidencePack, 'evidence pack should be persisted, not just artifact summaries').toBeTruthy()
  expect(evidencePackHasReplayModel(evidence.evidencePack), 'evidence pack should include replay/discovery model data').toBeTruthy()

  const eventArtifacts = (liveEvent.payload?.artifacts ?? []) as Array<Record<string, unknown>>
  for (const kind of REQUIRED_ARTIFACT_KINDS) {
    expect(eventArtifacts.some((artifact) => artifact.kind === kind), `SSE event should include ${kind} summary`).toBeTruthy()
  }
}

function hasRequiredArtifacts(evidence: EvidenceResponse): boolean {
  const artifacts = evidence.artifacts ?? []
  return REQUIRED_ARTIFACT_KINDS.every((kind) => artifacts.some((artifact) => artifact.kind === kind)) &&
    artifacts.some((artifact) => artifact.kind === 'screenshot' && artifact.mimeType.startsWith('image/') && !!artifact.previewDataUrl)
}

function evidencePackHasReplayModel(pack: EvidenceResponse['evidencePack']): boolean {
  if (!pack || typeof pack !== 'object') return false
  return Boolean(
    pack.site_graph ||
    pack.scenarios ||
    pack.run ||
    pack.automation_test_model ||
    pack.evidence_chain,
  )
}

async function listVerificationRuns(request: APIRequestContext, orgId: string): Promise<{ runs: CampaignRun[] }> {
  return apiJSON<{ runs: CampaignRun[] }>(request, 'GET', `/api/v1/code/orgs/${orgId}/warroom-verification/runs`)
}

async function apiJSON<T = Record<string, unknown>>(
  request: APIRequestContext,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  data?: unknown,
  expected: number[] = [200],
): Promise<T> {
  const res = await apiRaw(request, method, path, data, expected)
  return res.text ? JSON.parse(res.text) as T : ({} as T)
}

async function apiRaw(
  request: APIRequestContext,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  data?: unknown,
  expected: number[] = [200],
): Promise<{ status: number; text: string }> {
  const res = await request.fetch(`${ENGINE}${path}`, {
    method,
    headers: {
      ...authHeaders(),
      'Content-Type': 'application/json',
    },
    data,
    timeout: 120_000,
  })
  const text = await res.text()
  if (!expected.includes(res.status())) {
    throw new Error(`${method} ${path} returned ${res.status()}: ${text}`)
  }
  return { status: res.status(), text }
}

async function cleanupVerifiedRepoScopes(request: APIRequestContext) {
  const fixtures = cleanupQueue.splice(0).reverse()
  const seen = new Set<string>()
  for (const fixture of fixtures) {
    if (fixture.ownsRepo && fixture.repoId && !seen.has(`repo:${fixture.repoId}`)) {
      seen.add(`repo:${fixture.repoId}`)
      await cleanupAPI(request, 'DELETE', `/api/v1/code/repos/${fixture.repoId}`)
    }
    if (fixture.ownsOrg && fixture.orgId && !seen.has(`org:${fixture.orgId}`)) {
      seen.add(`org:${fixture.orgId}`)
      await cleanupAPI(request, 'DELETE', `/api/v1/code/orgs/${fixture.orgId}`)
    }
  }
}

async function cleanupAPI(request: APIRequestContext, method: 'DELETE', path: string) {
  try {
    await apiJSON(request, method, path, undefined, [200, 404])
  } catch (err) {
    console.warn(`Product Verification smoke cleanup failed for ${method} ${path}: ${(err as Error).message}`)
  }
}

function authHeaders(): Record<string, string> {
  const bearer = process.env.FLYTO_PRODUCT_VERIFY_AUTH_BEARER
  return {
    Authorization: `Bearer ${bearer || makeDevToken()}`,
  }
}

async function captureProductVerificationPage(page: Page, path: string) {
  await page.screenshot({ path, fullPage: true })
}

function makeDevToken(): string {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${enc({ alg: 'none', typ: 'JWT' })}.${enc({
    sub: 'chester',
    email: 'dev@flyto2.com',
    name: 'Chester',
    aud: 'flyto',
  })}.`
}

function watchConsole(page: Page): { errors: string[] } {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (text.includes('[vite]') || text.includes('react-refresh')) return
    if (text.includes('hooks.js')) return
    errors.push(`console: ${text}`)
  })
  return { errors }
}
