#!/usr/bin/env node
/**
 * Verify that GitHub Actions actually started and passed for this HEAD.
 *
 * This is intentionally release-gate level, not a normal branch guard: local
 * unit/build checks can pass while GitHub rejects a workflow before creating
 * any jobs (`startup_failure`, jobs=[]). A release packet must not present
 * that state as green CI.
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { execFileSync, spawnSync } from 'node:child_process'

const root = process.cwd()
const outDir = path.join(root, 'out', 'release')
const reportPath = path.join(outDir, 'github-actions-startup.json')
const args = new Set(process.argv.slice(2))
const json = args.has('--json')
const soft = args.has('--soft') || process.env.FLYTO_GITHUB_ACTIONS_STARTUP_SOFT === '1'
const requiredWorkflows = parseCsv(process.env.FLYTO_RELEASE_REQUIRED_WORKFLOWS || 'CI')
const repo = process.env.GITHUB_REPOSITORY || inferGithubRepo()
const head = git(['rev-parse', 'HEAD'])

function parseCsv(raw) {
  return String(raw || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function git(argv) {
  return execFileSync('git', argv, { cwd: root, encoding: 'utf8' }).trim()
}

function inferGithubRepo() {
  const remote = git(['remote', 'get-url', 'origin'])
  const ssh = remote.match(/^git@github\.com:([^/]+\/[^/.]+)(?:\.git)?$/)
  if (ssh) return ssh[1]
  const https = remote.match(/^https:\/\/github\.com\/([^/]+\/[^/.]+)(?:\.git)?$/)
  if (https) return https[1]
  throw new Error(`cannot infer GitHub repository from origin remote: ${remote}`)
}

function ghApi(apiPath) {
  const result = spawnSync('gh', ['api', apiPath], {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim()
    throw new Error(`gh api ${apiPath} failed${detail ? `: ${detail}` : ''}`)
  }
  return JSON.parse(result.stdout || '{}')
}

function tryGhApi(apiPath) {
  try {
    return { ok: true, data: ghApi(apiPath) }
  } catch (error) {
    return { ok: false, error: error.message }
  }
}

function workflowMatches(run, workflowName) {
  return run.workflowName === workflowName || run.name === workflowName || run.displayTitle === workflowName
}

function summarizeRun(run) {
  return {
    id: run.id,
    workflowId: run.workflow_id,
    name: run.name || '',
    displayTitle: run.display_title || run.displayTitle || '',
    event: run.event,
    status: run.status,
    conclusion: run.conclusion,
    path: run.path,
    createdAt: run.created_at || run.createdAt,
    updatedAt: run.updated_at || run.updatedAt,
    url: run.html_url || run.url,
  }
}

function summarizeAnnotations(jobId) {
  if (!jobId) return { ok: false, error: 'job id missing' }
  const result = tryGhApi(`/repos/${repo}/check-runs/${jobId}/annotations`)
  if (!result.ok) return result
  return {
    ok: true,
    data: (Array.isArray(result.data) ? result.data : []).map((annotation) => ({
      path: annotation.path,
      level: annotation.annotation_level,
      message: annotation.message,
      startLine: annotation.start_line,
      endLine: annotation.end_line,
    })),
  }
}

function summarizeJob(job) {
  return {
    id: job.id,
    name: job.name,
    status: job.status,
    conclusion: job.conclusion,
    startedAt: job.started_at,
    completedAt: job.completed_at,
    runnerId: job.runner_id,
    runnerName: job.runner_name,
    runnerGroupId: job.runner_group_id,
    runnerGroupName: job.runner_group_name,
    labels: job.labels || [],
    steps: Array.isArray(job.steps) ? job.steps.length : 0,
    annotations: summarizeAnnotations(job.id),
  }
}

function startupFailureReason(run, jobs) {
  if (run.conclusion === 'startup_failure' && jobs.length === 0) return 'startup_failure_no_jobs_created'
  if (jobs.length === 0) return 'no_jobs_created'
  if (run.conclusion !== 'success') return `conclusion_${run.conclusion || 'missing'}`
  if (run.status !== 'completed') return `status_${run.status || 'missing'}`
  return undefined
}

function reportFailure(report, message) {
  report.ok = false
  report.failure = message
  writeReport(report)
  if (json) console.log(JSON.stringify(report, null, 2))
  else console.error(`GitHub Actions startup audit failed: ${message}. Report: ${reportPath}`)
  process.exit(soft ? 0 : 1)
}

function writeReport(report) {
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
}

const report = {
  schema: 'flyto-code.github-actions-startup-audit.v1',
  generatedAt: new Date().toISOString(),
  repo,
  head,
  requiredWorkflows,
  ok: true,
  diagnostics: {},
  observedRuns: [],
  workflows: [],
}

try {
  const runs = ghApi(`/repos/${repo}/actions/runs?head_sha=${encodeURIComponent(head)}&per_page=100`).workflow_runs || []
  report.observedRuns = runs.map(summarizeRun)
  report.diagnostics.repositoryActions = tryGhApi(`/repos/${repo}/actions/permissions`)
  report.diagnostics.workflowPermissions = tryGhApi(`/repos/${repo}/actions/permissions/workflow`)
  report.diagnostics.repositoryRunners = tryGhApi(`/repos/${repo}/actions/runners`)
  if (runs.length === 0) {
    reportFailure(report, `no GitHub Actions runs found for HEAD ${head}`)
  }

  for (const workflow of requiredWorkflows) {
    const matching = runs.filter((run) => workflowMatches(run, workflow))
    const latest = matching
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0]
    if (!latest) {
      const startupFailures = runs
        .filter((run) => run.conclusion === 'startup_failure' || run.path === 'BuildFailed' || !run.name)
        .map(summarizeRun)
      report.workflows.push({
        workflow,
        ok: false,
        reason: startupFailures.length ? 'missing_named_run_with_startup_failures_present' : 'missing_run',
        startupFailures,
      })
      continue
    }

    const jobs = ghApi(`/repos/${repo}/actions/runs/${latest.id}/jobs?per_page=100`).jobs || []
    const workflowMeta = latest.workflow_id
      ? tryGhApi(`/repos/${repo}/actions/workflows/${latest.workflow_id}`)
      : { ok: false, error: 'run did not include workflow_id' }
    const item = {
      workflow,
      id: latest.id,
      workflowId: latest.workflow_id,
      workflowMeta,
      url: latest.html_url,
      event: latest.event,
      status: latest.status,
      conclusion: latest.conclusion,
      path: latest.path,
      createdAt: latest.created_at,
      updatedAt: latest.updated_at,
      jobs: jobs.map(summarizeJob),
      ok: latest.status === 'completed' && latest.conclusion === 'success' && jobs.length > 0,
    }
    item.reason = startupFailureReason(latest, jobs)
    report.workflows.push(item)
  }

  const failures = report.workflows.filter((workflow) => !workflow.ok)
  if (failures.length) {
    reportFailure(
      report,
      failures.map((workflow) => `${workflow.workflow}: ${workflow.reason || workflow.conclusion || 'not_ok'}`).join('; '),
    )
  }

  writeReport(report)
  if (json) console.log(JSON.stringify(report, null, 2))
  else console.log(`GitHub Actions startup audit passed: ${requiredWorkflows.join(', ')} for ${head}`)
} catch (error) {
  reportFailure(report, error.message)
}
