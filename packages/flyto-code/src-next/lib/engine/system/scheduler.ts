import { request } from '../client'

// scheduler.ts — operator control plane for scheduled scanner jobs.
// Backend: api/handlers_scheduler_controls.go. These are platform-admin
// gated (requirePlatformAdmin), so a non-allowlisted operator gets a 403
// which the UI surfaces as an error toast / inline alert.
//
// Wired endpoints:
//   GET  /api/v1/system/scheduler/configs            — durable job configs
//   POST /api/v1/system/scheduler/jobs/{id}/pause    — durable disable
//   POST /api/v1/system/scheduler/jobs/{id}/resume   — durable enable

export interface ScheduledJobConfig {
  job_id: string
  org_id?: string
  enabled: boolean
  cron?: string
  updated_by?: string
  updated_at?: string
}

export interface ListSchedulerConfigsResponse {
  configs: ScheduledJobConfig[] | null
}

export interface SchedulerToggleResponse {
  ok: boolean
  job_id: string
  enabled: boolean
}

export function listSchedulerConfigs(filter?: { job?: string; org?: string }): Promise<ListSchedulerConfigsResponse> {
  const qs = new URLSearchParams()
  if (filter?.job) qs.set('job', filter.job)
  if (filter?.org) qs.set('org', filter.org)
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  return request('GET', `/api/v1/system/scheduler/configs${suffix}`)
}

export function pauseSchedulerJob(jobId: string): Promise<SchedulerToggleResponse> {
  return request('POST', `/api/v1/system/scheduler/jobs/${encodeURIComponent(jobId)}/pause`)
}

export function resumeSchedulerJob(jobId: string): Promise<SchedulerToggleResponse> {
  return request('POST', `/api/v1/system/scheduler/jobs/${encodeURIComponent(jobId)}/resume`)
}
