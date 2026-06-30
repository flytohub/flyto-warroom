// Shared color constants for repository views.
// Consolidated from RepoListView + RepoDetailView to avoid duplication.

export const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3178c6', JavaScript: '#f1e05a', Python: '#3572A5',
  Go: '#00ADD8', Rust: '#dea584', Java: '#b07219', Ruby: '#701516',
  Vue: '#41b883', CSS: '#563d7c', HTML: '#e34c26', C: '#555555',
  Dart: '#00B4AB', Kotlin: '#A97BFF', Swift: '#F05138', SCSS: '#c6538c',
  Shell: '#89e051', Makefile: '#427819', Dockerfile: '#384d54',
  JSON: '#292929', YAML: '#cb171e', Markdown: '#083fa1', TOML: '#9c4221',
}

export const REPO_GRADE_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  A: { bg: 'rgba(34, 197, 94, 0.12)', color: '#22c55e', border: 'rgba(34, 197, 94, 0.3)' },
  B: { bg: 'rgba(132, 204, 22, 0.12)', color: '#84cc16', border: 'rgba(132, 204, 22, 0.3)' }, // canonical LETTER_GRADE_TONE.B (lime) — was #34d399 mint
  C: { bg: 'rgba(234, 179, 8, 0.12)', color: '#eab308', border: 'rgba(234, 179, 8, 0.3)' },
  D: { bg: 'rgba(249, 115, 22, 0.12)', color: '#f97316', border: 'rgba(249, 115, 22, 0.3)' },
  F: { bg: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', border: 'rgba(239, 68, 68, 0.3)' },
}

export const REPO_LIST_GRADE_COLORS: Record<string, { bg: string; color: string }> = {
  A: { bg: 'rgba(34, 197, 94, 0.15)', color: '#22c55e' },
  B: { bg: 'rgba(132, 204, 22, 0.15)', color: '#84cc16' }, // canonical LETTER_GRADE_TONE.B (lime) — was #34d399 mint
  C: { bg: 'rgba(234, 179, 8, 0.15)', color: '#eab308' },
  D: { bg: 'rgba(249, 115, 22, 0.15)', color: '#f97316' },
  F: { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' },
}
