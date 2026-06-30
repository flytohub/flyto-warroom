// Shared helpers for finding panel tabs

export const SEV_CONFIG: Record<string, { color: string; bg: string; score: number }> = {
  CRITICAL: { color: '#ef4444', bg: '#ef444418', score: 98 },
  HIGH:     { color: '#f97316', bg: '#f9731618', score: 75 },
  MODERATE: { color: '#eab308', bg: '#eab30818', score: 50 },
  LOW:      { color: '#22c55e', bg: '#22c55e18', score: 25 },
}

export function sevCfg(s: string) {
  return SEV_CONFIG[s] ?? { color: '#94a3b8', bg: '#94a3b818', score: 10 }
}

export function typeLabel(t: string) {
  if (t === 'cve') return 'CVE'
  if (t === 'secret') return 'Secret'
  if (t === 'security_finding') return 'SAST'
  return t.toUpperCase()
}
