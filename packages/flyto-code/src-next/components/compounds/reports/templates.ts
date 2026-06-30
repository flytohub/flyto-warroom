/**
 * Preset report templates — data-driven configs.
 * Each widget specifies: dataSourceId + chartType + fields + optional text content.
 *
 * Text blocks (chartType: 'text') provide fixed professional commentary
 * alongside charts. These are deterministic — no AI involved.
 */

import {
  ShieldCheck, TrendingUp, Scale, BookOpen,
  AlertTriangle, GitBranch, Radar, Award, Lock,
  Globe, Target, Activity, FileCheck, Server,
  Wrench, Network, Bug, Cloud, Radio, Eye,
  BarChart3, Code,
} from 'lucide-react'
import type { ReportTemplate } from './types'

export const REPORT_TEMPLATES: ReportTemplate[] = [

  // ════════════════════════════════════════════
  // SECURITY
  // ════════════════════════════════════════════

  {
    id: 'security-audit',
    name: 'Security Audit Report',
    nameKey: 'reports.tmpl.securityAudit',
    description: 'Comprehensive security posture with scoring breakdown, CVE findings, SLA tracking, and remediation priorities.',
    descKey: 'reports.tmpl.securityAuditDesc',
    category: 'security',
    icon: ShieldCheck,
    sections: [
      { id: 's1', widgets: [
        { id: 'w-intro', chartType: 'text', dataSourceId: '', cols: 12,
          title: 'Report Overview',
          content: 'Scores use the **250–900 posture scale** (A 740+ / B 640+ / C 500+ / D 380+ / F <380). Findings are cross-correlated across code, dependencies, and infrastructure.',
          textStyle: 'info' },
      ]},
      { id: 's2', widgets: [
        { id: 'w1', dataSourceId: 'computed-score', chartType: 'radialBar', labelField: 'grade', valueField: 'raw', cols: 4, title: 'Unified Score', titleKey: 'reports.wt.unifiedScore' },
        { id: 'w2', dataSourceId: 'health-summary', chartType: 'donut', labelField: 'project_type', cols: 4, title: 'Grade Distribution', titleKey: 'reports.wt.gradeDistribution' },
        { id: 'w3', dataSourceId: 'health-summary', chartType: 'kpi', valueField: 'cve_total', cols: 4, title: 'Total CVEs', titleKey: 'reports.wt.totalCves' },
      ]},
      { id: 's3', widgets: [
        { id: 'w4', dataSourceId: 'issues', chartType: 'bar', labelField: 'severity', cols: 6, title: 'Severity Distribution', titleKey: 'reports.wt.severityDistribution' },
        { id: 'w5', dataSourceId: 'issues', chartType: 'donut', labelField: 'type', cols: 6, title: 'Issue Types', titleKey: 'reports.wt.issueTypes' },
      ]},
      { id: 's4', widgets: [
        { id: 'w-risk-note', chartType: 'text', dataSourceId: '', cols: 12,
          title: 'Risk Assessment Methodology',
          content: 'Ranked by **blast radius**: severity + PR adjacency (+25) + taint reachability (+20) + pentest verified (+10) + AutoFix eligible (+5).',
          textStyle: 'neutral' },
      ]},
      { id: 's5', widgets: [
        { id: 'w6', dataSourceId: 'pulse', chartType: 'table', cols: 12, title: 'Top Findings by Blast Radius', titleKey: 'reports.wt.topFindings' },
      ]},
    ],
  },

  {
    id: 'security-trend',
    name: 'Security Trend Analysis',
    nameKey: 'reports.tmpl.trend',
    description: 'Historical score progression with scan-over-scan delta analysis.',
    descKey: 'reports.tmpl.trendDesc',
    category: 'security',
    icon: TrendingUp,
    sections: [
      { id: 's1', widgets: [
        { id: 'w-trend-intro', chartType: 'text', dataSourceId: '', cols: 12,
          content: 'Score changes driven by: **new CVE discoveries**, **remediation**, **scan coverage changes**, and **dependency updates**.',
          textStyle: 'info' },
      ]},
      { id: 's2', widgets: [
        { id: 'w1', dataSourceId: 'health-summary', chartType: 'gauge', valueField: 'cve_total', cols: 4, title: 'Current Score', titleKey: 'reports.wt.orgHealth' },
        { id: 'w2', dataSourceId: 'scan-diff', chartType: 'bar', labelField: 'new_cves_count', valueField: 'resolved_cves_count', cols: 8, title: 'Scan Delta', titleKey: 'reports.wt.scanDelta' },
      ]},
      { id: 's3', widgets: [
        { id: 'w3', dataSourceId: 'health-summary', chartType: 'bar', labelField: 'project_type', valueField: 'cve_total', cols: 12, title: 'Score by Repository', titleKey: 'reports.wt.healthByRepo' },
      ]},
    ],
  },

  {
    id: 'vulnerability-assessment',
    name: 'Vulnerability Assessment (VA)',
    nameKey: 'reports.tmpl.vaReport',
    description: 'Detailed vulnerability inventory with fix availability, SLA compliance, and evidence chain.',
    descKey: 'reports.tmpl.vaReportDesc',
    category: 'security',
    icon: Target,
    sections: [
      { id: 's1', widgets: [
        { id: 'w-va-scope', chartType: 'text', dataSourceId: '', cols: 12,
          title: 'Assessment Scope',
          content: 'CVEs identified via **OSV + EPSS + CISA KEV**. Reachability verified through taint analysis and import graph traversal.',
          textStyle: 'info' },
      ]},
      { id: 's2', widgets: [
        { id: 'w1', dataSourceId: 'issues', chartType: 'donut', labelField: 'severity', cols: 4, title: 'CVE Severity', titleKey: 'reports.wt.cveSeverity' },
        { id: 'w2', dataSourceId: 'issues', chartType: 'bar', labelField: 'repo_name', cols: 8, title: 'CVEs by Repository', titleKey: 'reports.wt.cveByRepo' },
      ]},
      { id: 's3', widgets: [
        { id: 'w3', dataSourceId: 'containers', chartType: 'bar', labelField: 'severity', cols: 6, title: 'Container Vulnerabilities', titleKey: 'reports.wt.containerVulns' },
        { id: 'w4', dataSourceId: 'enriched-deps', chartType: 'bar', labelField: 'name', valueField: 'blast_radius', cols: 6, title: 'Dependency Blast Radius', titleKey: 'reports.wt.depBlastRadius' },
      ]},
      { id: 's4', widgets: [
        { id: 'w-sla-note', chartType: 'text', dataSourceId: '', cols: 12,
          title: 'SLA Compliance',
          content: 'SLA targets: **Critical 24h** / **High 72h** / **Medium 30d** / **Low 90d**. Clock starts at detection, pauses on false positive, resets on regression.',
          textStyle: 'warning' },
      ]},
      { id: 's5', widgets: [
        { id: 'w5', dataSourceId: 'issues', chartType: 'table', cols: 12, title: 'All Vulnerabilities', titleKey: 'reports.wt.allCves' },
      ]},
    ],
  },

  // ════════════════════════════════════════════
  // CTEM (Continuous Threat Exposure Management)
  // ════════════════════════════════════════════

  {
    id: 'ctem-posture',
    name: 'CTEM Posture Report',
    nameKey: 'reports.tmpl.ctemPosture',
    description: 'External attack surface assessment with domain-level scoring, threat intelligence, and exposure trends.',
    descKey: 'reports.tmpl.ctemPostureDesc',
    category: 'ctem',
    icon: Globe,
    sections: [
      { id: 's1', widgets: [
        { id: 'w-ctem-intro', chartType: 'text', dataSourceId: '', cols: 12,
          title: 'CTEM Framework',
          content: '**CTEM** framework: 11 external dimensions scored. Production domains weighted 2x. Validated findings carry full weight (1.0x), unverified reduced (0.3x).',
          textStyle: 'info' },
      ]},
      { id: 's2', widgets: [
        { id: 'w1', dataSourceId: 'computed-score', chartType: 'radialBar', labelField: 'grade', valueField: 'raw', cols: 4, title: 'External Score' },
        { id: 'w2', dataSourceId: 'attack-surface', chartType: 'donut', labelField: 'asset_type', cols: 4, title: 'Asset Types' },
        { id: 'w3', dataSourceId: 'attack-surface', chartType: 'bar', labelField: 'status', cols: 4, title: 'Asset Status' },
      ]},
      { id: 's3', widgets: [
        { id: 'w4', dataSourceId: 'attack-surface', chartType: 'table', cols: 12, title: 'Discovered Assets' },
      ]},
      { id: 's4', widgets: [
        { id: 'w-validation', chartType: 'text', dataSourceId: '', cols: 12,
          title: 'Validation Status',
          content: 'Validation states: **Unverified** (0.3x) → **Verified** (1.0x) → **False Positive** (excluded). Each state change is timestamped and auditable.',
          textStyle: 'neutral' },
      ]},
    ],
  },

  {
    id: 'ctem-pentest',
    name: 'Pentest Campaign Report',
    nameKey: 'reports.tmpl.pentestReport',
    description: 'Red team campaign results with DAST findings, discovery timeline, and attack path analysis.',
    descKey: 'reports.tmpl.pentestReportDesc',
    category: 'ctem',
    icon: Radar,
    sections: [
      { id: 's1', widgets: [
        { id: 'w-pentest-scope', chartType: 'text', dataSourceId: '', cols: 12,
          title: 'Campaign Scope',
          content: '5-phase pipeline: **Baseline** → **Probe** → **Verify** → **Recheck** → **Report**. Non-destructive probes only.',
          textStyle: 'info' },
      ]},
      { id: 's2', widgets: [
        { id: 'w1', dataSourceId: 'attack-surface', chartType: 'donut', labelField: 'asset_type', cols: 4, title: 'Asset Types' },
        { id: 'w2', dataSourceId: 'attack-surface', chartType: 'bar', labelField: 'status', cols: 4, title: 'Finding Status' },
        { id: 'w3', dataSourceId: 'pulse', chartType: 'kpi', cols: 4, title: 'Active Findings' },
      ]},
      { id: 's3', widgets: [
        { id: 'w4', dataSourceId: 'attack-surface', chartType: 'table', cols: 12, title: 'Discovered Assets' },
      ]},
    ],
  },

  // ════════════════════════════════════════════
  // COMPLIANCE
  // ════════════════════════════════════════════

  {
    id: 'compliance-owasp',
    name: 'OWASP Top 10',
    nameKey: 'reports.tmpl.owasp',
    description: 'Map findings to OWASP Top 10 categories with taint flow analysis.',
    descKey: 'reports.tmpl.owaspDesc',
    category: 'compliance',
    icon: AlertTriangle,
    sections: [
      { id: 's1', widgets: [
        { id: 'w-owasp-intro', chartType: 'text', dataSourceId: '', cols: 12,
          content: 'Mapped to **OWASP Top 10 (2021)**. Taint analysis traces untrusted input → sensitive sinks. Unsanitized flows = potential injection.',
          textStyle: 'neutral' },
      ]},
      { id: 's2', widgets: [
        { id: 'w1', dataSourceId: 'issues', chartType: 'donut', labelField: 'severity', cols: 4, title: 'Severity Split' },
        { id: 'w2', dataSourceId: 'issues', chartType: 'bar', labelField: 'type', cols: 8, title: 'Finding Types' },
      ]},
      { id: 's3', widgets: [
        { id: 'w3', dataSourceId: 'taint-flows', chartType: 'treemap', labelField: 'category', cols: 6, title: 'Taint Categories' },
        { id: 'w4', dataSourceId: 'issues', chartType: 'radar', labelField: 'severity', valueField: 'blast_radius', cols: 6, title: 'Blast by Severity' },
      ]},
      { id: 's4', widgets: [
        { id: 'w5', dataSourceId: 'issues', chartType: 'table', cols: 12, title: 'All Findings' },
      ]},
    ],
  },

  {
    id: 'compliance-iso27001',
    name: 'ISO 27001:2022',
    nameKey: 'reports.tmpl.iso27001',
    description: 'Compliance status against ISO 27001 controls with IaC and container coverage.',
    descKey: 'reports.tmpl.iso27001Desc',
    category: 'compliance',
    icon: Award,
    sections: [
      { id: 's1', widgets: [
        { id: 'w-iso-intro', chartType: 'text', dataSourceId: '', cols: 12,
          content: '**ISO 27001:2022 Annex A**: A.8.8 Vulnerability Mgmt, A.8.9 Config, A.8.12 DLP, A.8.24 Crypto, A.8.25 Secure Dev. Automated pass/fail.',
          textStyle: 'info' },
      ]},
      { id: 's2', widgets: [
        { id: 'w1', dataSourceId: 'health-summary', chartType: 'radialBar', labelField: 'project_type', valueField: 'cve_total', cols: 4 },
        { id: 'w2', dataSourceId: 'iac', chartType: 'donut', labelField: 'severity', cols: 4, title: 'IaC by Severity' },
        { id: 'w3', dataSourceId: 'autofix', chartType: 'kpi', cols: 4, title: 'AutoFix Candidates' },
      ]},
      { id: 's3', widgets: [
        { id: 'w4', dataSourceId: 'iac', chartType: 'treemap', labelField: 'framework', cols: 6, title: 'IaC Frameworks' },
        { id: 'w5', dataSourceId: 'containers', chartType: 'bar', labelField: 'severity', cols: 6, title: 'Container Vulnerabilities' },
      ]},
      { id: 's4', widgets: [
        { id: 'w6', dataSourceId: 'iac', chartType: 'table', cols: 12, title: 'IaC Findings' },
      ]},
    ],
  },

  {
    id: 'compliance-soc2',
    name: 'SOC 2 Type II',
    nameKey: 'reports.tmpl.soc2',
    description: 'SOC 2 compliance coverage with CI gate enforcement and remediation tracking.',
    descKey: 'reports.tmpl.soc2Desc',
    category: 'compliance',
    icon: Lock,
    sections: [
      { id: 's1', widgets: [
        { id: 'w-soc2-intro', chartType: 'text', dataSourceId: '', cols: 12,
          content: '**SOC 2 Type II**: CC6 Logical Access, CC7 Monitoring, CC8 Change Management. CI gate provides automated evidence.',
          textStyle: 'info' },
      ]},
      { id: 's2', widgets: [
        { id: 'w1', dataSourceId: 'health-summary', chartType: 'radialBar', labelField: 'project_type', valueField: 'cve_total', cols: 6, title: 'Org Health' },
        { id: 'w2', dataSourceId: 'ci-checks', chartType: 'donut', labelField: 'status', cols: 6, title: 'CI Gate Results' },
      ]},
      { id: 's3', widgets: [
        { id: 'w3', dataSourceId: 'issues', chartType: 'bar', labelField: 'severity', cols: 6, title: 'Issue Severity' },
        { id: 'w4', dataSourceId: 'autofix', chartType: 'donut', labelField: 'patch_status', cols: 6, title: 'AutoFix Status' },
      ]},
    ],
  },

  {
    id: 'compliance-multi',
    name: 'Multi-Framework Compliance',
    nameKey: 'reports.tmpl.multiCompliance',
    description: 'Cross-framework compliance matrix: SOC2, ISO27001, PCI-DSS, OWASP mapped to findings.',
    descKey: 'reports.tmpl.multiComplianceDesc',
    category: 'compliance',
    icon: FileCheck,
    sections: [
      { id: 's1', widgets: [
        { id: 'w-multi-intro', chartType: 'text', dataSourceId: '', cols: 12,
          title: 'Compliance Matrix',
          content: '**Cross-framework mapping**: one remediation can resolve non-compliance across SOC2, ISO 27001, PCI-DSS, and OWASP simultaneously.',
          textStyle: 'info' },
      ]},
      { id: 's2', widgets: [
        { id: 'w1', dataSourceId: 'computed-score', chartType: 'radialBar', labelField: 'grade', valueField: 'raw', cols: 4, title: 'Unified Score' },
        { id: 'w2', dataSourceId: 'issues', chartType: 'donut', labelField: 'severity', cols: 4, title: 'Finding Severity' },
        { id: 'w3', dataSourceId: 'autofix', chartType: 'kpi', cols: 4, title: 'Auto-Remediable' },
      ]},
      { id: 's3', widgets: [
        { id: 'w4', dataSourceId: 'iac', chartType: 'bar', labelField: 'framework', cols: 6, title: 'By Framework' },
        { id: 'w5', dataSourceId: 'issues', chartType: 'bar', labelField: 'type', cols: 6, title: 'By Finding Type' },
      ]},
      { id: 's4', widgets: [
        { id: 'w-evidence', chartType: 'text', dataSourceId: '', cols: 12,
          title: 'Evidence Chain',
          content: 'Evidence chain per finding: **Detection** → **Verification** (L0/L1/L2) → **Status** (open/resolved/false-positive). Immutable and auditable.',
          textStyle: 'neutral' },
      ]},
    ],
  },

  // ════════════════════════════════════════════
  // OPEN SOURCE
  // ════════════════════════════════════════════

  {
    id: 'license-sbom',
    name: 'Licenses & SBOM',
    nameKey: 'reports.tmpl.licenseSbom',
    description: 'Open-source license risk analysis and software bill of materials.',
    descKey: 'reports.tmpl.licenseSbomDesc',
    category: 'opensource',
    icon: Scale,
    sections: [
      { id: 's1', widgets: [
        { id: 'w1', dataSourceId: 'licenses', chartType: 'donut', labelField: 'license_name', cols: 6, title: 'License Distribution' },
        { id: 'w2', dataSourceId: 'licenses', chartType: 'bar', labelField: 'risk_level', cols: 6, title: 'Risk Levels' },
      ]},
      { id: 's2', widgets: [
        { id: 'w3', dataSourceId: 'dependencies', chartType: 'treemap', labelField: 'name', valueField: 'total_uses', cols: 6, title: 'Dependency Usage' },
        { id: 'w4', dataSourceId: 'dependencies', chartType: 'bar', labelField: 'name', valueField: 'shared_count', cols: 6, title: 'Shared Packages' },
      ]},
      { id: 's3', widgets: [
        { id: 'w-license-note', chartType: 'text', dataSourceId: '', cols: 12,
          content: 'Risky licenses: **GPL, AGPL, LGPL, MPL, SSPL, BSL, Elastic**. Copyleft obligations or commercial restrictions. Undetected = flagged.',
          textStyle: 'warning' },
      ]},
      { id: 's4', widgets: [
        { id: 'w5', dataSourceId: 'licenses', chartType: 'table', cols: 12, title: 'License Issues' },
      ]},
    ],
  },

  {
    id: 'cve-database',
    name: 'CVE Database',
    nameKey: 'reports.tmpl.cveDatabase',
    description: 'Complete CVE inventory with reachability analysis and fix availability.',
    descKey: 'reports.tmpl.cveDatabaseDesc',
    category: 'opensource',
    icon: BookOpen,
    sections: [
      { id: 's1', widgets: [
        { id: 'w1', dataSourceId: 'issues', chartType: 'donut', labelField: 'severity', cols: 4, title: 'CVE Severity' },
        { id: 'w2', dataSourceId: 'issues', chartType: 'bar', labelField: 'repo_name', cols: 8, title: 'CVEs by Repo' },
      ]},
      { id: 's2', widgets: [
        { id: 'w3', dataSourceId: 'containers', chartType: 'treemap', labelField: 'image_ref', cols: 6, title: 'Container Images' },
        { id: 'w4', dataSourceId: 'enriched-deps', chartType: 'bar', labelField: 'name', valueField: 'blast_radius', cols: 6, title: 'Dependency Blast Radius' },
      ]},
      { id: 's3', widgets: [
        { id: 'w5', dataSourceId: 'issues', chartType: 'table', cols: 12, title: 'All CVEs' },
      ]},
    ],
  },

  // ════════════════════════════════════════════
  // ADVANCED
  // ════════════════════════════════════════════

  {
    id: 'ci-history',
    name: 'CI Scan History',
    nameKey: 'reports.tmpl.ciHistory',
    description: 'CI/CD pipeline security gate enforcement and scan history.',
    descKey: 'reports.tmpl.ciHistoryDesc',
    category: 'advanced',
    icon: GitBranch,
    sections: [
      { id: 's1', widgets: [
        { id: 'w1', dataSourceId: 'ci-checks', chartType: 'donut', labelField: 'status', cols: 4, title: 'Pass/Fail Ratio' },
        { id: 'w2', dataSourceId: 'ci-checks', chartType: 'bar', labelField: 'branch', valueField: 'total_count', cols: 8, title: 'Findings by Branch' },
      ]},
      { id: 's2', widgets: [
        { id: 'w3', dataSourceId: 'ci-checks', chartType: 'table', cols: 12, title: 'Check History' },
      ]},
    ],
  },

  // ════════════════════════════════════════════
  // ARCHITECTURE & CODE QUALITY
  // ════════════════════════════════════════════

  {
    id: 'arch-overview',
    name: 'Architecture Overview',
    nameKey: 'reports.tmpl.archOverview',
    description: 'Cross-repo architecture map with API routes, dependencies, dead code, and taint flow analysis.',
    descKey: 'reports.tmpl.archOverviewDesc',
    category: 'advanced',
    icon: Network,
    sections: [
      { id: 's1', widgets: [
        { id: 'w-arch-intro', chartType: 'text', dataSourceId: '', cols: 12,
          content: 'Architecture profile generated by **flyto-indexer**: dependency graph, API routes, dead code detection, complexity metrics, and taint flow analysis per repository.',
          textStyle: 'info' },
      ]},
      { id: 's2', widgets: [
        { id: 'w1', dataSourceId: 'arch-map', chartType: 'donut', labelField: 'project_type', cols: 4, title: 'Project Types' },
        { id: 'w2', dataSourceId: 'arch-map', chartType: 'bar', labelField: 'name', valueField: 'file_count', cols: 8, title: 'Repo Size Distribution' },
      ]},
      { id: 's3', widgets: [
        { id: 'w3', dataSourceId: 'dependencies', chartType: 'treemap', labelField: 'name', valueField: 'total_uses', cols: 6, title: 'Dependency Usage' },
        { id: 'w4', dataSourceId: 'api-definitions', chartType: 'donut', labelField: 'method', cols: 6, title: 'API Methods' },
      ]},
      { id: 's4', widgets: [
        { id: 'w5', dataSourceId: 'arch-map', chartType: 'table', cols: 12, title: 'Repository Architecture Map' },
      ]},
    ],
  },

  {
    id: 'code-quality',
    name: 'Code Quality Report',
    nameKey: 'reports.tmpl.codeQuality',
    description: 'Dead code analysis, code complexity, taint flow paths, and remediation candidates.',
    descKey: 'reports.tmpl.codeQualityDesc',
    category: 'advanced',
    icon: Code,
    sections: [
      { id: 's1', widgets: [
        { id: 'w1', dataSourceId: 'dead-code', chartType: 'donut', labelField: 'type', cols: 4, title: 'Dead Code by Type' },
        { id: 'w2', dataSourceId: 'dead-code', chartType: 'kpi', cols: 4, title: 'Dead Code Count' },
        { id: 'w3', dataSourceId: 'arch-map', chartType: 'bar', labelField: 'name', valueField: 'complex_functions', cols: 4, title: 'Complex Functions' },
      ]},
      { id: 's2', widgets: [
        { id: 'w4', dataSourceId: 'taint-flows', chartType: 'donut', labelField: 'category', cols: 4, title: 'Taint Categories' },
        { id: 'w5', dataSourceId: 'taint-flows', chartType: 'bar', labelField: 'severity', cols: 8, title: 'Taint Flows by Severity' },
      ]},
      { id: 's3', widgets: [
        { id: 'w6', dataSourceId: 'dead-code', chartType: 'table', cols: 12, title: 'Dead Code Inventory' },
      ]},
      { id: 's4', widgets: [
        { id: 'w7', dataSourceId: 'taint-flows', chartType: 'table', cols: 12, title: 'Taint Flow Paths' },
      ]},
    ],
  },

  // ════════════════════════════════════════════
  // CONTAINER & IAC & CSPM
  // ════════════════════════════════════════════

  {
    id: 'container-security',
    name: 'Container Security Report',
    nameKey: 'reports.tmpl.containerSecurity',
    description: 'Container image vulnerability analysis with Trivy scan results and fix availability.',
    descKey: 'reports.tmpl.containerSecurityDesc',
    category: 'security',
    icon: Server,
    sections: [
      { id: 's1', widgets: [
        { id: 'w-container-intro', chartType: 'text', dataSourceId: '', cols: 12,
          content: 'Container images scanned via **Trivy**: OS-package CVEs per `FROM` directive. UNKNOWN severity findings excluded to reduce noise.',
          textStyle: 'info' },
      ]},
      { id: 's2', widgets: [
        { id: 'w1', dataSourceId: 'containers', chartType: 'donut', labelField: 'severity', cols: 4, title: 'Severity Distribution' },
        { id: 'w2', dataSourceId: 'containers', chartType: 'bar', labelField: 'image_ref', cols: 8, title: 'Findings by Image' },
      ]},
      { id: 's3', widgets: [
        { id: 'w3', dataSourceId: 'containers', chartType: 'kpi', cols: 4, title: 'Total Container CVEs' },
        { id: 'w4', dataSourceId: 'containers', chartType: 'treemap', labelField: 'package_name', cols: 8, title: 'Affected Packages' },
      ]},
      { id: 's4', widgets: [
        { id: 'w5', dataSourceId: 'containers', chartType: 'table', cols: 12, title: 'All Container Findings' },
      ]},
    ],
  },

  {
    id: 'iac-security',
    name: 'Infrastructure as Code Report',
    nameKey: 'reports.tmpl.iacSecurity',
    description: 'IaC misconfigurations across Terraform, CloudFormation, Kubernetes, and Dockerfile.',
    descKey: 'reports.tmpl.iacSecurityDesc',
    category: 'compliance',
    icon: Lock,
    sections: [
      { id: 's1', widgets: [
        { id: 'w1', dataSourceId: 'iac', chartType: 'donut', labelField: 'severity', cols: 4, title: 'Severity Split' },
        { id: 'w2', dataSourceId: 'iac', chartType: 'donut', labelField: 'framework', cols: 4, title: 'By Framework' },
        { id: 'w3', dataSourceId: 'iac', chartType: 'bar', labelField: 'resource_type', cols: 4, title: 'By Resource Type' },
      ]},
      { id: 's2', widgets: [
        { id: 'w4', dataSourceId: 'iac', chartType: 'table', cols: 12, title: 'All IaC Findings' },
      ]},
    ],
  },

  {
    id: 'cspm-report',
    name: 'Cloud Security Posture',
    nameKey: 'reports.tmpl.cspm',
    description: 'CSPM findings across AWS, GCP, and Azure with CIS benchmark status.',
    descKey: 'reports.tmpl.cspmDesc',
    category: 'compliance',
    icon: Cloud,
    sections: [
      { id: 's1', widgets: [
        { id: 'w-cspm-intro', chartType: 'text', dataSourceId: '', cols: 12,
          content: 'Cloud Security Posture Management: policy rules evaluated against cloud resource configurations. Mapped to **CIS Benchmarks** per provider.',
          textStyle: 'info' },
      ]},
      { id: 's2', widgets: [
        { id: 'w1', dataSourceId: 'cspm', chartType: 'donut', labelField: 'provider', cols: 4, title: 'By Provider' },
        { id: 'w2', dataSourceId: 'cspm', chartType: 'bar', labelField: 'severity', cols: 4, title: 'By Severity' },
        { id: 'w3', dataSourceId: 'cspm', chartType: 'donut', labelField: 'resource_type', cols: 4, title: 'By Resource' },
      ]},
      { id: 's3', widgets: [
        { id: 'w4', dataSourceId: 'cspm', chartType: 'table', cols: 12, title: 'All CSPM Findings' },
      ]},
    ],
  },

  // ════════════════════════════════════════════
  // AUTOFIX & REMEDIATION
  // ════════════════════════════════════════════

  {
    id: 'autofix-report',
    name: 'AutoFix Status Report',
    nameKey: 'reports.tmpl.autofixReport',
    description: 'Automated remediation coverage, patch success rate, and PR creation history.',
    descKey: 'reports.tmpl.autofixReportDesc',
    category: 'security',
    icon: Wrench,
    sections: [
      { id: 's1', widgets: [
        { id: 'w-autofix-intro', chartType: 'text', dataSourceId: '', cols: 12,
          content: '**AutoFix** tiers: Tier 1 (deterministic dep bumps), Tier 2 (AI-proposed patches), Tier 3 (config changes). All PRs run gate checks before merge.',
          textStyle: 'info' },
      ]},
      { id: 's2', widgets: [
        { id: 'w1', dataSourceId: 'autofix', chartType: 'donut', labelField: 'patch_status', cols: 4, title: 'Patch Status' },
        { id: 'w2', dataSourceId: 'autofix', chartType: 'bar', labelField: 'severity', cols: 4, title: 'By Severity' },
        { id: 'w3', dataSourceId: 'autofix', chartType: 'kpi', cols: 4, title: 'AutoFix Candidates' },
      ]},
      { id: 's3', widgets: [
        { id: 'w4', dataSourceId: 'autofix-runs', chartType: 'table', cols: 12, title: 'AutoFix Run History' },
      ]},
      { id: 's4', widgets: [
        { id: 'w5', dataSourceId: 'autofix', chartType: 'table', cols: 12, title: 'All AutoFix Findings' },
      ]},
    ],
  },

  // ════════════════════════════════════════════
  // EXTERNAL / MONITORING
  // ════════════════════════════════════════════

  {
    id: 'external-posture',
    name: 'External Posture Report',
    nameKey: 'reports.tmpl.externalPosture',
    description: 'External attack surface, pentest projects, domain monitoring events, and score trends.',
    descKey: 'reports.tmpl.externalPostureDesc',
    category: 'ctem',
    icon: Globe,
    sections: [
      { id: 's1', widgets: [
        { id: 'w-ext-intro', chartType: 'text', dataSourceId: '', cols: 12,
          content: 'External posture assessed via **19 scanners per domain**: SSL/TLS, DNS, WAF, headers, ports, tech stack, subdomain discovery, threat intelligence.',
          textStyle: 'info' },
      ]},
      { id: 's2', widgets: [
        { id: 'w1', dataSourceId: 'attack-surface', chartType: 'donut', labelField: 'asset_type', cols: 4, title: 'Asset Types' },
        { id: 'w2', dataSourceId: 'pentest-projects', chartType: 'donut', labelField: 'project_type', cols: 4, title: 'Project Types' },
        { id: 'w3', dataSourceId: 'pentest-projects', chartType: 'bar', labelField: 'criticality', cols: 4, title: 'By Criticality' },
      ]},
      { id: 's3', widgets: [
        { id: 'w4', dataSourceId: 'pentest-projects', chartType: 'table', cols: 12, title: 'Pentest Projects' },
      ]},
      { id: 's4', widgets: [
        { id: 'w5', dataSourceId: 'attack-surface', chartType: 'table', cols: 12, title: 'Attack Surface Assets' },
      ]},
    ],
  },

  {
    id: 'monitoring-report',
    name: 'Monitoring & Alert Report',
    nameKey: 'reports.tmpl.monitoringReport',
    description: 'Domain monitoring events: certificate changes, DNS changes, score regressions, new subdomains.',
    descKey: 'reports.tmpl.monitoringReportDesc',
    category: 'ctem',
    icon: Eye,
    sections: [
      { id: 's1', widgets: [
        { id: 'w1', dataSourceId: 'monitoring-events', chartType: 'bar', labelField: 'severity', cols: 6, title: 'Events by Severity' },
        { id: 'w2', dataSourceId: 'monitoring-events', chartType: 'donut', labelField: 'event_type', cols: 6, title: 'Event Types' },
      ]},
      { id: 's2', widgets: [
        { id: 'w3', dataSourceId: 'monitoring-events', chartType: 'table', cols: 12, title: 'All Monitoring Events' },
      ]},
    ],
  },

  // ════════════════════════════════════════════
  // SCORING & TRENDS
  // ════════════════════════════════════════════

  {
    id: 'score-trends',
    name: 'Score Trend Report',
    nameKey: 'reports.tmpl.scoreTrends',
    description: 'Unified score history with grade changes, category breakdown, and scan delta analysis.',
    descKey: 'reports.tmpl.scoreTrendsDesc',
    category: 'advanced',
    icon: TrendingUp,
    sections: [
      { id: 's1', widgets: [
        { id: 'w1', dataSourceId: 'score-history', chartType: 'line', labelField: 'computed_at', valueField: 'overall_display', cols: 12, title: 'Score History (30d)' },
      ]},
      { id: 's2', widgets: [
        { id: 'w2', dataSourceId: 'computed-score', chartType: 'bar', labelField: 'label', valueField: 'raw', cols: 6, title: 'Score by Category' },
        { id: 'w3', dataSourceId: 'scan-diff', chartType: 'bar', labelField: 'new_cves_count', valueField: 'resolved_cves_count', cols: 6, title: 'Scan Delta' },
      ]},
      { id: 's3', widgets: [
        { id: 'w4', dataSourceId: 'score-events', chartType: 'table', cols: 12, title: 'Grade Change Events' },
      ]},
    ],
  },

  {
    id: 'scan-activity',
    name: 'Scan Activity Report',
    nameKey: 'reports.tmpl.scanActivity',
    description: 'Scan execution history with status distribution, trigger types, and timing analysis.',
    descKey: 'reports.tmpl.scanActivityDesc',
    category: 'advanced',
    icon: BarChart3,
    sections: [
      { id: 's1', widgets: [
        { id: 'w1', dataSourceId: 'scan-log', chartType: 'donut', labelField: 'status', cols: 4, title: 'Scan Status' },
        { id: 'w2', dataSourceId: 'scan-log', chartType: 'donut', labelField: 'trigger_type', cols: 4, title: 'Trigger Types' },
        { id: 'w3', dataSourceId: 'ci-checks', chartType: 'donut', labelField: 'status', cols: 4, title: 'CI Gate Results' },
      ]},
      { id: 's2', widgets: [
        { id: 'w4', dataSourceId: 'scan-log', chartType: 'table', cols: 12, title: 'Scan Activity Log' },
      ]},
    ],
  },

  // ════════════════════════════════════════════
  // RUNTIME & MALWARE
  // ════════════════════════════════════════════

  {
    id: 'runtime-security',
    name: 'Runtime Security Report',
    nameKey: 'reports.tmpl.runtimeSecurity',
    description: 'Runtime telemetry events: threat detection, path traversal, IP-based attacks.',
    descKey: 'reports.tmpl.runtimeSecurityDesc',
    category: 'security',
    icon: Radio,
    sections: [
      { id: 's1', widgets: [
        { id: 'w1', dataSourceId: 'runtime-events', chartType: 'donut', labelField: 'event_type', cols: 4, title: 'Event Types' },
        { id: 'w2', dataSourceId: 'runtime-events', chartType: 'bar', labelField: 'threat', cols: 8, title: 'Threats Detected' },
      ]},
      { id: 's2', widgets: [
        { id: 'w3', dataSourceId: 'runtime-events', chartType: 'table', cols: 12, title: 'Runtime Events' },
      ]},
    ],
  },

  {
    id: 'malware-report',
    name: 'Malware Detection Report',
    nameKey: 'reports.tmpl.malwareReport',
    description: 'Malware scan results from dependency analysis.',
    descKey: 'reports.tmpl.malwareReportDesc',
    category: 'security',
    icon: Bug,
    sections: [
      { id: 's1', widgets: [
        { id: 'w-malware-intro', chartType: 'text', dataSourceId: '', cols: 12,
          content: 'Dependencies checked against malware registries. Flagged packages include **typosquatting**, **dependency confusion**, and **known malicious packages**.',
          textStyle: 'warning' },
      ]},
      { id: 's2', widgets: [
        { id: 'w1', dataSourceId: 'malware', chartType: 'table', cols: 12, title: 'Malware Scan Results' },
      ]},
    ],
  },

  {
    id: 'risk-matrix',
    name: 'Risk Matrix Report',
    nameKey: 'reports.tmpl.riskMatrix',
    description: 'Two-dimensional risk assessment: likelihood vs impact across all finding categories.',
    descKey: 'reports.tmpl.riskMatrixDesc',
    category: 'advanced',
    icon: Activity,
    sections: [
      { id: 's1', widgets: [
        { id: 'w-matrix-intro', chartType: 'text', dataSourceId: '', cols: 12,
          title: 'Risk Assessment Framework',
          content: '**5-factor risk**: CVSS × EPSS × Reachability × Impact × Confidence. Score > 7.0 = immediate action required.',
          textStyle: 'warning' },
      ]},
      { id: 's2', widgets: [
        { id: 'w1', dataSourceId: 'issues', chartType: 'radar', labelField: 'severity', valueField: 'blast_radius', cols: 6, title: 'Risk by Severity' },
        { id: 'w2', dataSourceId: 'pulse', chartType: 'bar', labelField: 'severity', valueField: 'blast_radius', cols: 6, title: 'Blast Radius by Severity' },
      ]},
      { id: 's3', widgets: [
        { id: 'w3', dataSourceId: 'pulse', chartType: 'table', cols: 12, title: 'Highest Risk Findings' },
      ]},
    ],
  },
]

export const REPORT_CATEGORIES = [
  { id: 'security' as const, labelKey: 'reports.cat.security', fallback: 'Security', color: '#f87171' },
  { id: 'ctem' as const, labelKey: 'reports.cat.ctem', fallback: 'CTEM', color: '#8b5cf6' },
  { id: 'compliance' as const, labelKey: 'reports.cat.compliance', fallback: 'Compliance', color: '#a78bfa' },
  { id: 'opensource' as const, labelKey: 'reports.cat.opensource', fallback: 'Open Source', color: '#34d399' },
  { id: 'advanced' as const, labelKey: 'reports.cat.advanced', fallback: 'Advanced', color: '#38bdf8' },
] as const
