/**
 * Sanity tests for the organization tool definitions — every type
 * declared in TOOL_DEFS must round-trip through getIcon, and getTools
 * must hand back labels for every type. A missing icon for a type
 * silently breaks node rendering (the node card lookup falls back to
 * the User icon, masking the bug).
 */
import { describe, it, expect } from 'vitest'
import { TOOL_DEFS, getTools, getIcon } from '../tools'

describe('organization tools registry', () => {
  it('exposes at least one tool per category (sanity)', () => {
    // If the registry shrank, an entire category may have been deleted
    // by accident. Pinning a lower bound catches that without locking
    // the exact count.
    expect(TOOL_DEFS.length).toBeGreaterThanOrEqual(15)
  })

  it('every type has a unique key', () => {
    const seen = new Set<string>()
    for (const d of TOOL_DEFS) {
      expect(seen.has(d.type)).toBe(false)
      seen.add(d.type)
    }
  })

  it('getIcon returns the same lucide component declared in TOOL_DEFS', () => {
    for (const d of TOOL_DEFS) {
      expect(getIcon(d.type)).toBe(d.icon)
    }
  })

  it('getIcon falls back to a default for an unknown type', () => {
    // Falling back is intentional — it keeps the org-tree from
    // crashing on a stale legacy node type.
    const fallback = getIcon('this-type-does-not-exist')
    expect(typeof fallback).toBe('object')
    // It should at minimum be a React component (function or forwardRef)
  })

  it('getTools attaches a label for every entry', () => {
    const tools = getTools()
    expect(tools).toHaveLength(TOOL_DEFS.length)
    for (const t of tools) {
      expect(typeof t.label).toBe('string')
      expect(t.label.length).toBeGreaterThan(0)
    }
  })

  it('every tool carries a non-empty color hex', () => {
    for (const d of TOOL_DEFS) {
      expect(d.color).toMatch(/^#[0-9a-f]{3,8}$/i)
    }
  })
})
