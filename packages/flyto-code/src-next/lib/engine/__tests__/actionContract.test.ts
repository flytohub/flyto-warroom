import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/**
 * RBAC action-gate contract guard.
 *
 * Frontend gates a mutation with <GatedButton action="x:y"> /
 * canDoAction('x:y') / canUseAction('x:y') / actionAccess('x.y') /
 * useActionAllowed('x:y'). canDoAction checks
 * caps.permissions — the set resolved from the role's grants in
 * capabilities.yaml plus additive system RBAC capabilities from the engine's
 * authz registry. If the action string is NOT one of those granted
 * permissions, canDoAction returns false for EVERY role once caps load, so the
 * button is permanently disabled and no type check or build catches it. We
 * shipped exactly this: `autofix:run` (no such permission — the real one is
 * `autofix:open_pr`) left the Run AutoFix button dead for all users.
 *
 * This pins every gate action to the backend permission vocabulary. The
 * snapshot is regenerated from capabilities.yaml roles plus
 * api/authz_routes_registry.go capSystem* constants:
 *
 *   awk '/^roles:/{f=1} /^[a-z_]+:/{if(f && !/^roles:/ && !/^  /)exit} f' \
 *     ../flyto-engine/internal/permission/capabilities.yaml \
 *     | grep -oE '^\s+- [a-z_]+:[a-z_]+' | sed 's/.*- //' | sort -u > backend-actions.txt
 */
const here = dirname(fileURLToPath(import.meta.url))
const srcRoot = join(here, '..', '..', '..') // src-next/

const VALID_ACTIONS = new Set(
  readFileSync(join(here, '..', '__generated__', 'backend-actions.txt'), 'utf8')
    .split('\n').map((l) => l.trim()).filter(Boolean),
)

function collectProjectRegistryActions(): Set<string> {
  const catalog = readFileSync(join(here, '..', '..', '..', '..', '..', 'flyto-engine', 'internal', 'modulecatalog', 'catalog.yaml'), 'utf8')
  const actions = new Set<string>()
  for (const match of catalog.matchAll(/^\s+(?:permissions|commercial_actions):\s*\[([^\]]*)\]/gm)) {
    for (const raw of match[1].split(',')) {
      const action = raw.trim()
      if (action) actions.add(action)
    }
  }
  return actions
}

const PROJECT_REGISTRY_ACTIONS = collectProjectRegistryActions()
const VALID_GATE_ACTIONS = new Set([...VALID_ACTIONS, ...PROJECT_REGISTRY_ACTIONS])

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__generated__' || name === '__tests__') continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) out.push(p)
  }
  return out
}

/** Collect RBAC action strings actually fed to the gate helpers. We only
 *  accept the `resource:action` colon form, which excludes unrelated
 *  `action=` props (e.g. the tiptap editor's action="undo"). */
function collectGateActions(): { action: string; file: string }[] {
  const found: { action: string; file: string }[] = []
  const patterns = [
    /\baction=["']([a-z_]+[.:][a-z_]+)["']/g,       // <GatedButton action="x:y" / action="x.y">
    /\bcanDoAction\(\s*["']([^"']+)["']/g,         // canDoAction('x:y')
    /\bcanUseAction\(\s*["']([^"']+)["']/g,        // canUseAction('x:y')
    /\bactionAccess\(\s*["']([^"']+)["']/g,        // actionAccess('x.y')
    /\buseActionAllowed\(\s*["']([^"']+)["']/g,    // useActionAllowed('x:y')
  ]
  for (const file of walk(srcRoot)) {
    const src = readFileSync(file, 'utf8')
    for (const re of patterns) {
      for (const m of src.matchAll(re)) {
        found.push({ action: m[1], file: file.slice(srcRoot.length + 1) })
      }
    }
  }
  return found
}

describe('RBAC action-gate contract', () => {
  it('snapshot is non-empty (regen guard)', () => {
    expect(VALID_ACTIONS.size).toBeGreaterThan(20)
  })

  const actions = collectGateActions()

  it('finds the gates it is meant to protect', () => {
    expect(actions.length).toBeGreaterThan(10)
  })

  it('every gated action is a real backend permission (no dead buttons)', () => {
    const bad = actions.filter((a) => !VALID_GATE_ACTIONS.has(a.action))
    expect(
      bad.map((b) => `${b.action}  (${b.file})`),
      `These gate actions are NOT granted by capabilities.yaml or system RBAC, so ` +
        `canDoAction() denies them for everyone → permanently disabled buttons. ` +
        `Use a real permission string (e.g. autofix:open_pr, mcp:configure).`,
      ).toEqual([])
  })

  it('every gated action is registered in the project module catalog', () => {
    const bad = actions.filter((a) => !PROJECT_REGISTRY_ACTIONS.has(a.action))
    expect(
      bad.map((b) => `${b.action}  (${b.file})`),
      `These gate actions exist in the org/RBAC vocabulary but are not declared by any ` +
        `modulecatalog permissions/commercial_actions entry. The project capability gate ` +
        `will fail closed, so add the action to the owning module or remove the UI gate.`,
    ).toEqual([])
  })
})
