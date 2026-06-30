/**
 * Minimal block-YAML parser (no dependency) shared by the platform-loop tools.
 *
 * Supports exactly the subset the platform-loop recipes use: block mappings,
 * block sequences of scalars, and block sequences of mappings, nested by
 * indentation, with optionally quoted scalar values. Anything it cannot parse
 * surfaces as a recipe gap rather than silently passing.
 *
 * This is intentionally the same grammar enforced by audit-platform-loops.mjs;
 * the runtime runner reuses it so a recipe that the static guard accepts is the
 * same document the runner plans/executes.
 */
export function parseYaml(text) {
  const lines = []
  for (const raw of text.split('\n')) {
    if (/^\s*#/.test(raw)) continue
    if (raw.trim() === '') continue
    lines.push(raw.replace(/\s+$/, ''))
  }
  let pos = 0
  const indentOf = (l) => l.length - l.replace(/^ +/, '').length

  function parseScalar(v) {
    const t = v.trim()
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
      return t.slice(1, -1)
    }
    return t
  }

  function parseBlock(minIndent) {
    if (pos >= lines.length) return null
    const ind = indentOf(lines[pos])
    if (ind < minIndent) return null
    return lines[pos].trim().startsWith('- ') ? parseSeq(ind) : parseMapAt(ind)
  }

  function parseMapAt(indent) {
    const obj = {}
    while (pos < lines.length) {
      const line = lines[pos]
      const ind = indentOf(line)
      if (ind !== indent) break
      const trimmed = line.trim()
      if (trimmed.startsWith('- ')) break
      const m = trimmed.match(/^([^:]+):\s*(.*)$/)
      if (!m) break
      const key = m[1].trim()
      const val = m[2]
      pos++
      obj[key] = val === '' ? parseBlock(indent + 1) : parseScalar(val)
    }
    return obj
  }

  function parseSeq(indent) {
    const arr = []
    while (pos < lines.length) {
      const line = lines[pos]
      const ind = indentOf(line)
      if (ind !== indent) break
      const trimmed = line.trim()
      if (!trimmed.startsWith('- ')) break
      const rest = trimmed.slice(2)
      const mm = rest.match(/^([^:]+):\s*(.*)$/)
      if (mm) {
        const itemIndent = ind + 2
        const obj = {}
        const key = mm[1].trim()
        const val = mm[2]
        pos++
        obj[key] = val === '' ? parseBlock(itemIndent + 1) : parseScalar(val)
        Object.assign(obj, parseMapAt(itemIndent))
        arr.push(obj)
      } else {
        arr.push(parseScalar(rest))
        pos++
      }
    }
    return arr
  }

  return parseBlock(0) ?? {}
}
