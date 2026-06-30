/**
 * lib/autofix/diff.ts — pure line-diff for the AutoFix preview (arch Phase 5:
 * extracted from AutofixPreviewModal so the god component shrinks and the diff
 * algorithm is unit-testable in isolation). LCS dynamic-programming diff with
 * 3-line context grouping into hunks. No React, no I/O.
 */
export interface DiffLine {
  type: 'context' | 'add' | 'del' | 'hunk'
  text: string
  oldNo?: number
  newNo?: number
}

export interface DiffHunk {
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  lines: DiffLine[]
}

export function computeLineDiff(before: string, after: string): DiffHunk[] {
  const a = before.split('\n')
  const b = after.split('\n')
  const n = a.length
  const m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  type Op = { kind: 'eq' | 'add' | 'del'; aIdx?: number; bIdx?: number; text: string }
  const ops: Op[] = []
  let i = 0, j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ kind: 'eq', aIdx: i, bIdx: j, text: a[i] })
      i++; j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ kind: 'del', aIdx: i, text: a[i] })
      i++
    } else {
      ops.push({ kind: 'add', bIdx: j, text: b[j] })
      j++
    }
  }
  while (i < n) { ops.push({ kind: 'del', aIdx: i, text: a[i] }); i++ }
  while (j < m) { ops.push({ kind: 'add', bIdx: j, text: b[j] }); j++ }

  const CONTEXT = 3
  const hunks: DiffHunk[] = []
  let bufStart = -1
  let bufLines: DiffLine[] = []
  let lastChangeAt = -1
  let oldNo = 1, newNo = 1
  let curOldStart = 0, curOldCount = 0, curNewStart = 0, curNewCount = 0

  const flush = () => {
    if (bufLines.length === 0) return
    hunks.push({
      oldStart: curOldStart,
      oldCount: curOldCount,
      newStart: curNewStart,
      newCount: curNewCount,
      lines: bufLines,
    })
    bufLines = []
    bufStart = -1
    lastChangeAt = -1
    curOldCount = 0
    curNewCount = 0
  }

  for (let k = 0; k < ops.length; k++) {
    const op = ops[k]
    const isChange = op.kind !== 'eq'
    if (isChange) {
      if (bufStart === -1) {
        const start = Math.max(0, k - CONTEXT)
        for (let p = start; p < k; p++) {
          const pop = ops[p]
          if (pop.kind === 'eq') {
            bufLines.push({
              type: 'context', text: pop.text,
              oldNo: oldNo - (k - p),
              newNo: newNo - (k - p),
            })
          }
        }
        curOldStart = oldNo
        curNewStart = newNo
      }
      lastChangeAt = k
    }
    if (bufStart !== -1 && op.kind === 'eq' && lastChangeAt >= 0 && k - lastChangeAt > CONTEXT) {
      flush()
    }
    if (op.kind === 'eq') {
      if (bufStart !== -1) {
        bufLines.push({ type: 'context', text: op.text, oldNo, newNo })
        curOldCount++
        curNewCount++
        if (lastChangeAt < 0) bufStart = k
      } else {
        bufStart = -1
      }
      oldNo++; newNo++
    } else if (op.kind === 'del') {
      if (bufStart === -1) bufStart = k
      bufLines.push({ type: 'del', text: op.text, oldNo })
      curOldCount++
      oldNo++
    } else {
      if (bufStart === -1) bufStart = k
      bufLines.push({ type: 'add', text: op.text, newNo })
      curNewCount++
      newNo++
    }
  }
  flush()
  return hunks
}
