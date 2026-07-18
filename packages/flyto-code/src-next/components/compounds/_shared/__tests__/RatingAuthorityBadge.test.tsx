import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RatingAuthorityBadge } from '../RatingAuthorityBadge'
import type { ScoreAuthority } from '@lib/engine/scoring/scoring'

function authority(overrides: Partial<ScoreAuthority>): ScoreAuthority {
  return {
    level: 'local',
    mode: 'ce_local',
    label_key: 'rating.authority.localExternal',
    algorithm_version: '2.0',
    model_version: '2026.06',
    display_scale_id: 'flyto2-250-900.v1',
    source_manifest_version: 'flyto2.external-public.v1',
    calibration_version: 'local',
    evidence_completeness: 0,
    signature_status: 'not_required',
    comparable: false,
    scope: 'external',
    ...overrides,
  }
}

describe('RatingAuthorityBadge', () => {
  it('renders local external authority as non-comparable', () => {
    render(<RatingAuthorityBadge authority={authority({})} />)

    expect(screen.getByText('Local external rating')).toBeTruthy()
    expect(screen.queryByText('Verified external rating')).toBeNull()
  })

  it('renders verified authority through the same shared component', () => {
    render(
      <RatingAuthorityBadge
        authority={authority({
          level: 'verified',
          mode: 'flyto2_cloud',
          label_key: 'rating.authority.verifiedExternal',
          signature_status: 'valid',
          evidence_completeness: 100,
          comparable: true,
        })}
      />,
    )

    expect(screen.getByText('Verified external rating')).toBeTruthy()
  })
})
