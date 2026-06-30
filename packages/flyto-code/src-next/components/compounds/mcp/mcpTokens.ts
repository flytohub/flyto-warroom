/**
 * mcpTokens — shared decision/egress severity mapping for the MCP Guardian
 * insight surfaces. Keeps the verdict→token translation in one place so the
 * egress table, event explanation drawer and session timeline stay consistent.
 * No inline hex — everything maps onto the canonical severity tokens.
 *
 * Shared by the legacy `components/compounds/mcp/*` panels (egress table /
 * explanation drawer / session timeline / policy simulate) embedded in the
 * settings MCP Guardian tab. The strings mapped here mirror the backend
 * NetClass values (private_ip / metadata_ip / internal / public_external /
 * unknown_external) and the sensitive-data classes (secret / credential / pii /
 * customer / source_code).
 */

import type { Severity } from '@lib/tokens/severity'

// A guardian "effective" / "verdict" string mapped to a severity token. block /
// hold is the hard stop (critical), warn is a soft signal (medium), allow /
// observe / proceed is benign (low). Unknown → neutral ('').
export function decisionSeverity(value?: string): Severity {
  switch ((value ?? '').toLowerCase()) {
    case 'block':
      return 'critical'
    case 'hold':
      return 'high'
    case 'warn':
      return 'medium'
    case 'allow':
    case 'proceed':
    case 'observe':
      return 'low'
    default:
      return ''
  }
}

// Sensitive data classes get a severity tint in the egress table so the riskier
// classes (secret/credential) read hotter than customer/source_code.
export function dataClassSeverity(value?: string): Severity {
  switch ((value ?? '').toLowerCase()) {
    case 'secret':
    case 'credential':
      return 'critical'
    case 'pii':
      return 'high'
    case 'customer':
      return 'medium'
    case 'source_code':
      return 'medium'
    default:
      return ''
  }
}

// Network trust of the egress target. public/unknown external is the worst case.
export function targetTrustSeverity(value?: string): Severity {
  switch ((value ?? '').toLowerCase()) {
    case 'unknown_external':
    case 'public_external':
      return 'high'
    case 'metadata_ip':
      return 'critical'
    case 'private_ip':
    case 'internal':
      return 'low'
    default:
      return ''
  }
}
