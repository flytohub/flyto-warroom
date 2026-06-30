/**
 * Tests for the verify/ sub-components split from VerifyFindingModal.
 *
 * Pure render tests — no Mantine wrapper needed for non-Mantine components.
 * ConfidenceBadge uses Mantine Badge so it's tested via verdictConfig.test.ts
 * instead (config coverage without DOM dependency).
 */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock i18n
vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_key: string, fallback: string) => fallback,
  getLocale: () => 'en',
}))

// Mock useLocale hook
vi.mock('@hooks/useLocale', () => ({
  useLocale: () => 'en',
}))

import { VerificationMethodBox } from '../verify/VerificationMethodBox'
import { VerifyProgress } from '../verify/VerifyProgress'
import { VerdictEvidenceBox } from '../verify/VerdictEvidenceBox'
import type { VerdictEvidence } from '@lib/engine'

describe('VerificationMethodBox', () => {
  it('renders the method text and title', () => {
    render(<VerificationMethodBox method="Static import graph analysis" />)
    expect(screen.getByText('How we determined this')).toBeDefined()
    expect(screen.getByText('Static import graph analysis')).toBeDefined()
  })
})

describe('VerifyProgress', () => {
  it('renders hint text', () => {
    render(<VerifyProgress />)
    // Should show one of the rotating hints
    const hints = ['Sending baseline request…', 'Sending payload request…', 'Comparing responses…']
    const found = hints.some(h => {
      try { return !!screen.getByText(h) } catch { return false }
    })
    expect(found).toBe(true)
  })

  it('renders the timing hint', () => {
    render(<VerifyProgress />)
    expect(screen.getByText('Usually completes within 10 seconds.')).toBeDefined()
  })
})

describe('VerdictEvidenceBox', () => {
  // Wire shape mirrors the engine's `verdictEvidence` struct (no json
  // tags → capitalized Go field names). CVEMetaConfidence is a 0..1 float.
  const evidence: VerdictEvidence = {
    CVEMetaConfidence: 0.85,
    L1Imported: true,
    L2HasVulnFunctions: true,
    L3DirectMatchCount: 3,
    L3IndirectMatchCount: 2,
    L3ReflectionGuard: false,
    L3AllNonPublic: false,
  }

  it('renders the core signals with human-readable values', () => {
    render(<VerdictEvidenceBox evidence={evidence} />)
    expect(screen.getByText('Evidence signals')).toBeDefined()
    expect(screen.getByText('Package imported')).toBeDefined()
    expect(screen.getByText('Direct call-site matches')).toBeDefined()
    expect(screen.getByText('3')).toBeDefined()
    expect(screen.getByText('Indirect call-site matches')).toBeDefined()
    expect(screen.getByText('2')).toBeDefined()
  })

  it('formats the 0..1 CVE-metadata confidence as a percentage', () => {
    render(<VerdictEvidenceBox evidence={evidence} />)
    expect(screen.getByText('CVE-metadata confidence')).toBeDefined()
    expect(screen.getByText('85%')).toBeDefined()
  })

  it('hides reflection-guard / non-public rows when they carry no signal', () => {
    render(<VerdictEvidenceBox evidence={evidence} />)
    expect(screen.queryByText('Dynamic dispatch present')).toBeNull()
    expect(screen.queryByText('All matches non-public scope')).toBeNull()
  })

  it('surfaces reflection-guard / non-public rows only when they fire', () => {
    render(
      <VerdictEvidenceBox
        evidence={{ ...evidence, L3ReflectionGuard: true, L3AllNonPublic: true }}
      />,
    )
    expect(screen.getByText('Dynamic dispatch present')).toBeDefined()
    expect(screen.getByText('All matches non-public scope')).toBeDefined()
  })
})
