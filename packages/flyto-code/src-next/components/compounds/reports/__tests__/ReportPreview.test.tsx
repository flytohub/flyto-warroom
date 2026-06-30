import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FileText } from 'lucide-react'
import { ReportPreview } from '../ReportPreview'
import type { ReportTemplate } from '../types'

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_key: string, fallback: string) => fallback,
}))

vi.mock('../DataWidget', () => ({
  DataWidget: ({ config }: { config: { title?: string } }) => <div>{config.title}</div>,
}))

const template: ReportTemplate = {
  id: 'tpl',
  name: 'Executive Risk Report',
  description: 'Summary',
  category: 'security',
  icon: FileText,
  sections: [
    {
      id: 'sec',
      name: 'Risk',
      widgets: [
        { id: 'w1', dataSourceId: 'issues', chartType: 'kpi', title: 'Critical Findings', cols: 12 },
      ],
    },
  ],
}

describe('ReportPreview AI polish', () => {
  it('renders executive summary, recommendations, and matched widget insights', () => {
    render(
      <ReportPreview
        template={template}
        orgId="org-1"
        polishData={{
          status: 'ok',
          executive_summary: 'Critical exposure is concentrated in two services.',
          recommendations: ['Prioritize internet-facing critical fixes.'],
          sections: [{ widget_title: 'Critical Findings', insight: 'Critical findings increased week over week.' }],
          generated_at: '2026-06-20T00:00:00Z',
        }}
      />,
    )

    expect(screen.getByTestId('report-ai-polish-summary')).toBeTruthy()
    expect(screen.getByText('Critical exposure is concentrated in two services.')).toBeTruthy()
    expect(screen.getByText('Prioritize internet-facing critical fixes.')).toBeTruthy()
    expect(screen.getByTestId('report-ai-polish-insight-w1').textContent).toContain('Critical findings increased')
  })

  it('does not render unavailable polish as report content', () => {
    render(
      <ReportPreview
        template={template}
        orgId="org-1"
        polishData={{
          status: 'unavailable',
          reason: 'AI polish is unavailable because no AI provider is configured.',
          reason_key: 'ai_provider_unavailable',
          executive_summary: '',
          recommendations: [],
          sections: [],
          generated_at: '2026-06-20T00:00:00Z',
        }}
      />,
    )

    expect(screen.queryByTestId('report-ai-polish-summary')).toBeNull()
    expect(screen.queryByText('AI polish is unavailable because no AI provider is configured.')).toBeNull()
  })
})
