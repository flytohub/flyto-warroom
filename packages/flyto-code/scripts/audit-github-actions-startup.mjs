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

function workflowMatches(run, workflowName) {
  return run.workflowName === workflowName || run.name === workflowName || run.displayTitle === workflowName
}

function reportFailure(report, message) {
  report.ok = false
  report.failure = message
  writeReport(report)
  if (json) console.log(JSON.stringify(report, null, 2))
  else console.error(`GitHub Actions startup audit failed: ${message}. Report: ${reportPath}`)
  if (!soft) process.exit(1)
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
  workflows: [],
}

try {
  const runs = ghApi(`/repos/${repo}/actions/runs?head_sha=${encodeURIComponent(head)}&per_page=100`).workflow_runs || []
  if (runs.length === 0) {
    reportFailure(report, `no GitHub Actions runs found for HEAD ${head}`)
  }

  for (const workflow of requiredWorkflows) {
    const matching = runs.filter((run) => workflowMatches(run, workflow))
    const latest = matching
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0]
    if (!latest) {
      report.workflows.push({ workflow, ok: false, reason: 'missing_run' })
      continue
    }

    const jobs = ghApi(`/repos/${repo}/actions/runs/${latest.id}/jobs?per_page=100`).jobs || []
    const item = {
      workflow,
      id: latest.id,
      url: latest.html_url,
      event: latest.event,
      status: latest.status,
      conclusion: latest.conclusion,
      path: latest.path,
      createdAt: latest.created_at,
      updatedAt: latest.updated_at,
      jobs: jobs.map((job) => ({
        name: job.name,
        status: job.status,
        conclusion: job.conclusion,
        startedAt: job.started_at,
        completedAt: job.completed_at,
      })),
      ok: latest.status === 'completed' && latest.conclusion === 'success' && jobs.length > 0,
    }
    if (jobs.length === 0) item.reason = 'no_jobs_created'
    else if (latest.conclusion !== 'success') item.reason = `conclusion_${latest.conclusion || 'missing'}`
    else if (latest.status !== 'completed') item.reason = `status_${latest.status || 'missing'}`
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
