/**
 * Map old section IDs (used by compound views' onNavigate prop)
 * to new URL paths in the Fuse routing system.
 */
/**
 * Convert a section ID (with optional query params) to a URL path.
 *
 * Supports query params after `?`:
 *   "sec-overview?repo=xxx&highlight=secrets"
 *   "_autofix?repo=xxx"
 */
export function sectionToPath(section: string, orgId: string): string {
  const base = `/projects/${orgId}`;

  // Split section from query params
  const [sectionId, query] = section.split('?');
  const suffix = query ? `?${query}` : '';

  if (sectionId === '_dashboard') return `${base}/dashboard${suffix}`;
  if (sectionId === '_issues') return `${base}/issues${suffix}`;
  if (sectionId === '_repos') return `${base}/repos${suffix}`;
  if (sectionId === '_domains') return `${base}/domains${suffix}`;
  if (sectionId === '_pentest') return `${base}/pentest${suffix}`;
  if (sectionId === '_mcp') return `${base}/mcp${suffix}`;
  if (sectionId === '_autofix') return `${base}/autofix${suffix}`;
  if (sectionId === '_pulse') return `${base}/pulse${suffix}`;
  if (sectionId === '_attack_paths') return `${base}/attack-paths${suffix}`;
  if (sectionId === '_settings') return `${base}/settings${suffix}`;
  if (sectionId === '_asset-map') return `${base}/asset-map${suffix}`;
  if (sectionId === '_cloud-posture') return `${base}/cloud-posture${suffix}`;
  if (sectionId === '_cloud-findings') return `${base}/cloud-findings${suffix}`;
  if (sectionId.startsWith('_repo:')) return `${base}/repos/${sectionId.replace('_repo:', '')}${suffix}`;
  if (sectionId.startsWith('_org')) return `${base}/org${suffix}`;
  // Architecture + Code Scans technical views are now first-class
  // modules with an inner sub-tab nav (the legacy war-room accordion
  // was collapsed 2026-06-05). The deep section id rides the URL
  // splat: /architecture/arch-deps, /code-scans/sec-iac.
  if (sectionId.startsWith('arch-')) return `${base}/architecture/${sectionId}${suffix}`;
  if (sectionId.startsWith('sec-')) return `${base}/code-scans/${sectionId}${suffix}`;
  // Anything else still in the registry (e.g. history-va / cicd-*)
  // resolves through the war-room bookmark-compat shim.
  return `${base}/warroom/${sectionId}${suffix}`;
}
