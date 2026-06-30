#!/usr/bin/env node
/**
 * Deterministic guard for platform-depth closure added around BOY reports,
 * org-scoped notifications, and Launchpad routing. This does not call live
 * vendors and does not require credentials; it only verifies that frontend and
 * backend contracts cannot silently drift back into dashboard-only islands.
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const engineRoot = path.resolve(root, '..', 'flyto-engine')

function read(rel, base = root) {
  return fs.readFileSync(path.join(base, rel), 'utf8')
}

function readApiSources() {
  const apiDir = path.join(engineRoot, 'api')
  return fs
    .readdirSync(apiDir)
    .filter((name) => name.endsWith('.go') && !name.endsWith('_test.go'))
    .sort()
    .map((name) => fs.readFileSync(path.join(apiDir, name), 'utf8'))
    .join('\n')
}

function requireIncludes(label, text, needles) {
  const missing = needles.filter((needle) => !text.includes(needle))
  if (missing.length) {
    throw new Error(`${label} missing: ${missing.join(', ')}`)
  }
}

const reportEngine = read('api/report_engine.go', engineRoot)
const reportSources = read('api/report_engine_sources.go', engineRoot)
const reportCatalog = read('api/handlers_report_sources.go', engineRoot)
const orgNotifications = read('api/handlers_org_notifications.go', engineRoot)
const launchpad = read('api/handlers_launchpad.go', engineRoot)
const router = readApiSources()
const authzRegistry = read('api/authz_routes_registry.go', engineRoot)
const manualVendorSmoke = read('scripts/manual-vendor-smoke.mjs', engineRoot)
const notificationsTab = read('src-next/components/compounds/settings/NotificationsTab.tsx')
const notificationsClient = read('src-next/lib/engine/platform/notifications.ts')
const reportSourceClient = read('src-next/lib/engine/reports/report-sources.ts')
const queryKeys = read('src-next/lib/queryKeys.ts')

requireIncludes('backend report registry', reportEngine, [
  '"research-footprints"',
  'dsResearchFootprints',
  'surface_external',
])
requireIncludes('backend research-footprints data source', reportSources, [
  'func dsResearchFootprints',
  'buildResearchFootprint',
  'weighted_confidence',
  'conflict_count',
  'bundle_sha256',
])
requireIncludes('backend report source catalog', reportCatalog, [
  'handleListReportSources',
  'required_feature',
  'available',
  'research-footprints',
])
requireIncludes('org notification API', orgNotifications, [
  'handleOrgNotificationChannelCreate',
  'resolveNotificationTargetRef',
  'handleOrgNotificationChannelTest',
  '"dry_run"',
  'filterKnownOrgChannelIDs',
])
requireIncludes('launchpad routed notifications', launchpad, [
  'NotificationChannels',
  'NotificationChannelTypeSystemEvent',
  'ChannelIDs',
  'lp_notifch',
])
requireIncludes('router contracts', router, [
  '/notification-channels',
  '/notification-rules',
  '/report-sources',
])
requireIncludes('authz route inventory', authzRegistry, [
  'handleOrgNotificationChannelCreate',
  'handleOrgNotificationRuleCreate',
  'handleListReportSources',
])
requireIncludes('manual vendor smoke', manualVendorSmoke, [
  'BITSIGHT_API_TOKEN',
  'CYBLE_API_TOKEN',
  'nanshanlife.com.tw',
  'persisted: false',
  'ci_safe: false',
])
requireIncludes('settings notification UI', notificationsTab, [
  'settings.notificationRouting',
  'sealed destination',
  'settings.dryRunNotification',
  'createOrgNotificationChannel',
  'createOrgNotificationRule',
])
requireIncludes('org notification frontend client', notificationsClient, [
  '/notification-channels',
  '/notification-rules',
  'testOrgNotificationChannel',
])
requireIncludes('report source frontend client', reportSourceClient, [
  'listBackendReportSources',
  '/report-sources',
  'BackendReportSource',
])
requireIncludes('query key closure', queryKeys, [
  'orgNotificationChannels',
  'orgNotificationRules',
  'report-sources',
])

console.log('platform depth audit: PASS (BOY reports, org notifications, Launchpad routing, report-source catalog)')
