/**
 * Scoring UI definitions — pure metadata for rendering.
 * No scoring functions, no data dependencies.
 *
 * The scoring engine lives in flyto-engine/internal/scoring (Go).
 * This file only defines the icon/label/color/mode/weight used to
 * render categories and sub-vectors in the frontend.
 */

import { t } from '@lib/i18n';
import {
  ShieldAlert, Key, Bug, Zap, Trash2, Radar, Clock, FileText,
  Lock, Globe, Shield, Server, FolderOpen, Flame, Copy,
  Scale, ListChecks, Network as NetworkIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type ScoringMode = 'scored' | 'observing' | 'context'

/** UI-only sub-vector definition — no scoring functions. */
export interface SubVectorDef {
  id: string
  label: string
  icon: LucideIcon
  weight: number
  color: string
  mode: ScoringMode
  drillDownType: 'repo' | 'domain'
  drillDownSection?: string
}

/** UI-only category definition. */
export interface CategoryDef {
  id: string
  label: string
  weight: number
  color: string
  subVectors: SubVectorDef[]
}

// ── Computed result types (rendered by UI, populated by backend) ─────────

export interface DrillScore {
  id: string
  name: string
  raw: number | null
  display: number | null
  grade: string | null
  gradeColor: string
  label: string
}

export interface ComputedSubVector {
  def: SubVectorDef
  raw: number | null
  display: number | null
  grade: string | null
  gradeColor: string
  repoScores?: DrillScore[]
  domainScores?: DrillScore[]
}

export interface ComputedCategory {
  def: CategoryDef
  subVectors: ComputedSubVector[]
  raw: number | null
  display: number | null
  grade: string | null
  gradeColor: string
  effectiveWeight: number
}

export interface CrossDimDetail {
  blastRadiusPenalty: number
  prAdjacencyPenalty: number
  taintAdjacencyPenalty: number
  pentestVerdictModifier: number
  autofixCoverageBonus: number
  total: number
}

export interface ScoringExplanation {
  findingId: string
  subVectorId: string
  description: string
  basePenalty: number
  confidenceLevel: 'L0' | 'L1' | 'L2'
  multiplier: number
  effectivePenalty: number
  reason: string
}

export interface ScoringResult {
  categories: ComputedCategory[]
  overallRaw: number | null
  overallDisplay: number | null
  /** A3: `null` when `score_available === false` on the wire. */
  overallGrade: string | null
  overallGradeColor: string
  activeCount: number
  totalCount: number
  crossDim: CrossDimDetail
  explanations: ScoringExplanation[]
}

/** Returns the UI rendering definitions for all categories and sub-vectors. */
export function getCategoryDefs(): CategoryDef[] {
  return [
    // ── CODE SECURITY (35%) ──
    {
      id: 'code-security',
      label: t('scoring.cat.codeSecurity'),
      weight: 0.35,
      color: '#ef4444',
      subVectors: [
        { id: 'vuln-cve', label: t('scoring.sv.cveFindings'), icon: ShieldAlert, weight: 0.45, color: '#ef4444', mode: 'scored', drillDownType: 'repo', drillDownSection: 'sec-overview' },
        { id: 'vuln-secrets', label: t('scoring.sv.exposedSecrets'), icon: Key, weight: 0.25, color: '#f97316', mode: 'scored', drillDownType: 'repo', drillDownSection: 'sec-overview' },
        { id: 'vuln-taint', label: t('scoring.sv.taintFlows'), icon: Flame, weight: 0.15, color: '#dc2626', mode: 'scored', drillDownType: 'repo', drillDownSection: 'sec-reachability' },
        { id: 'vuln-sast', label: t('scoring.sv.codeFindings'), icon: Bug, weight: 0.10, color: '#fb923c', mode: 'scored', drillDownType: 'repo', drillDownSection: 'sec-overview' },
        { id: 'vuln-malware', label: t('scoring.sv.malwarePackages'), icon: Bug, weight: 0.05, color: '#b91c1c', mode: 'scored', drillDownType: 'repo' },
      ],
    },

    // ── ATTACK SURFACE (30%) ──
    {
      id: 'attack-surface',
      label: t('scoring.cat.attackSurface'),
      weight: 0.30,
      color: '#8b5cf6',
      subVectors: [
        { id: 'surface-ssl', label: t('scoring.sv.sslTls'), icon: Lock, weight: 0.15, color: '#22c55e', mode: 'scored', drillDownType: 'domain' },
        { id: 'surface-headers', label: t('scoring.sv.webHeaders'), icon: Globe, weight: 0.13, color: '#38bdf8', mode: 'scored', drillDownType: 'domain' },
        { id: 'surface-dns', label: t('scoring.sv.dnsSecurity'), icon: Shield, weight: 0.10, color: '#06b6d4', mode: 'scored', drillDownType: 'domain' },
        { id: 'surface-ports', label: t('scoring.sv.openPorts'), icon: Server, weight: 0.10, color: '#f97316', mode: 'scored', drillDownType: 'domain' },
        { id: 'surface-sensitive', label: t('scoring.sv.sensitiveFiles'), icon: FolderOpen, weight: 0.10, color: '#ef4444', mode: 'scored', drillDownType: 'domain' },
        { id: 'surface-api', label: t('scoring.sv.apiSecurity'), icon: NetworkIcon, weight: 0.07, color: '#a78bfa', mode: 'scored', drillDownType: 'domain' },
        { id: 'surface-waf', label: t('scoring.sv.wafProtection'), icon: Shield, weight: 0.05, color: '#22c55e', mode: 'scored', drillDownType: 'domain' },
        { id: 'surface-email', label: t('scoring.sv.emailSecurity'), icon: Shield, weight: 0.10, color: '#06b6d4', mode: 'scored', drillDownType: 'domain' },
        { id: 'surface-breach', label: t('scoring.sv.breachExposure'), icon: ShieldAlert, weight: 0.08, color: '#ef4444', mode: 'scored', drillDownType: 'domain' },
        { id: 'surface-threat-intel', label: t('scoring.sv.threatIntel'), icon: Radar, weight: 0.07, color: '#dc2626', mode: 'scored', drillDownType: 'domain' },
        { id: 'surface-ip-intel', label: t('scoring.sv.ipIntel'), icon: Radar, weight: 0.05, color: '#94a3b8', mode: 'scored', drillDownType: 'domain' },
        { id: 'surface-whois', label: t('scoring.sv.whois'), icon: FileText, weight: 0.0, color: '#94a3b8', mode: 'context', drillDownType: 'domain' },
        { id: 'surface-pagespeed', label: t('scoring.sv.pagespeed'), icon: Zap, weight: 0.0, color: '#94a3b8', mode: 'context', drillDownType: 'domain' },
        { id: 'surface-tech', label: t('scoring.sv.techStack'), icon: Server, weight: 0.0, color: '#94a3b8', mode: 'context', drillDownType: 'domain' },
        { id: 'surface-js-bundle', label: t('scoring.sv.jsBundle'), icon: FileText, weight: 0.0, color: '#94a3b8', mode: 'context', drillDownType: 'domain' },
      ],
    },

    // ── DILIGENCE (20%) ──
    {
      id: 'diligence',
      label: t('scoring.cat.diligence'),
      weight: 0.20,
      color: '#06b6d4',
      subVectors: [
        { id: 'diligence-coverage', label: t('scoring.sv.scanCoverage'), icon: Radar, weight: 0.30, color: '#22c55e', mode: 'scored', drillDownType: 'repo' },
        { id: 'diligence-license', label: t('scoring.sv.licenseCompliance'), icon: Scale, weight: 0.20, color: '#eab308', mode: 'scored', drillDownType: 'repo' },
        { id: 'diligence-triage', label: t('scoring.sv.triageEffort'), icon: ListChecks, weight: 0.15, color: '#38bdf8', mode: 'scored', drillDownType: 'repo' },
        { id: 'diligence-supply-chain', label: t('scoring.sv.supplyChainRisk'), icon: NetworkIcon, weight: 0.20, color: '#8b5cf6', mode: 'scored', drillDownType: 'domain' },
        { id: 'diligence-patching', label: t('scoring.sv.patchingSpeed'), icon: Clock, weight: 0.15, color: '#22c55e', mode: 'scored', drillDownType: 'repo' },
      ],
    },

    // ── CODE QUALITY (10%, all context) ──
    {
      id: 'code-quality',
      label: t('scoring.cat.codeQuality'),
      weight: 0.10,
      color: '#f97316',
      subVectors: [
        { id: 'quality-complexity', label: t('scoring.sv.complexFunctions'), icon: Zap, weight: 0.0, color: '#eab308', mode: 'context', drillDownType: 'repo', drillDownSection: 'arch-complexity' },
        { id: 'quality-dead-code', label: t('scoring.sv.deadCode'), icon: Trash2, weight: 0.0, color: '#a78bfa', mode: 'context', drillDownType: 'repo', drillDownSection: 'arch-dead-code' },
        { id: 'quality-duplicates', label: t('scoring.sv.duplicateCode'), icon: Copy, weight: 0.0, color: '#8b5cf6', mode: 'context', drillDownType: 'repo' },
      ],
    },
  ]
}
