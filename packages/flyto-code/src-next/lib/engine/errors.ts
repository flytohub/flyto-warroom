import { EngineRequestError } from './client'

export interface EngineErrorDisplay {
  title: string
  description: string
  message: string
  status?: number
  code?: string
  requestId?: string
  reason?: string
  requiredAction?: string
  domain?: string
  recordName?: string
}

function detailString(details: Record<string, unknown> | undefined, key: string): string | undefined {
  const v = details?.[key]
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

export function describeEngineError(error: unknown, fallback = 'Operation failed'): EngineErrorDisplay {
  if (error instanceof EngineRequestError) {
    const reason = detailString(error.details, 'reason')
    const requiredAction = detailString(error.details, 'required_action')
    const domain = detailString(error.details, 'domain')
    const target = detailString(error.details, 'target')
    const recordName = detailString(error.details, 'record_name')
    const subject = domain || target

    if (reason === 'target_unattributed' || requiredAction === 'verify_domain_dns') {
      const description = subject
        ? `Verify ${subject} with DNS TXT before active scans.`
        : 'Verify domain ownership with DNS TXT before active scans.'
      const suffix = error.requestId ? ` Request ID: ${error.requestId}` : ''
      return {
        title: 'DNS verification required',
        description,
        message: `${description}${suffix}`,
        status: error.status,
        code: error.code,
        requestId: error.requestId,
        reason,
        requiredAction,
        domain,
        recordName,
      }
    }

    if (error.status === 403) {
      const suffix = error.requestId ? ` Request ID: ${error.requestId}` : ''
      return {
        title: 'Action blocked',
        description: error.message || 'The engine blocked this action.',
        message: `${error.message || fallback}${suffix}`,
        status: error.status,
        code: error.code,
        requestId: error.requestId,
        reason,
        requiredAction,
      }
    }

    const suffix = error.requestId ? ` Request ID: ${error.requestId}` : ''
    return {
      title: error.code || 'Engine error',
      description: error.message || fallback,
      message: `${error.message || fallback}${suffix}`,
      status: error.status,
      code: error.code,
      requestId: error.requestId,
      reason,
      requiredAction,
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return { title: fallback, description: error.message, message: error.message }
  }
  const message = String(error ?? '').trim() || fallback
  return { title: fallback, description: message, message }
}

export function formatEngineError(error: unknown, fallback = 'Operation failed'): string {
  return describeEngineError(error, fallback).message
}
