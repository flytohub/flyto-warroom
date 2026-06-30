import { useState, useRef, useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useOrg, useConnectedRepos } from '@hooks/useOrg'
import { getOrgChart, saveOrgChart } from '@lib/engine'
import { qk } from '@lib/queryKeys'
import { t } from '@lib/i18n'
import { querySucceeded, resolvedList } from '@lib/queryState'
import type { OrgNode, ToolItem } from './types'
import type { OrgMemberInfo } from '@hooks/useOrgMembers'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const NODE_W = 180
export const NODE_H = 52

let nextId = Date.now()
function newId() { return `n_${nextId++}` }

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useOrgChart() {
  const { org } = useOrg()
  const connectedReposQ = useConnectedRepos(org?.id)
  const orgId = org?.id ?? ''
  // Fetch from DB
  const { data: chartData } = useQuery({
    queryKey: qk.organization.chart(orgId),
    queryFn: () => getOrgChart(orgId),
    enabled: !!orgId,
  })

  // Local state — initialized from query data
  const [nodes, setNodes] = useState<OrgNode[]>([])
  const seededRef = useRef(false)

  // Sync query data into local state (one-time seed from server)
   
  useEffect(() => {
    if (!chartData || !orgId) return
    if (chartData.nodes.length > 0) {
      setNodes(chartData.nodes)
      seededRef.current = true
    } else if (!seededRef.current) {
      // Seed with root node when chart is empty
      seededRef.current = true
      const seed: OrgNode[] = [{
        id: 'root',
        parentId: null,
        type: 'company',
        label: org?.name ?? t('org.tool.company'),
        color: '#8b5cf6',
        icon: 'company',
        x: 100,
        y: 40,
      }]
      setNodes(seed)
      saveOrgChart(orgId, seed).catch(() => {})
    }
  }, [chartData, orgId, org?.name])

  // Debounced save to backend
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const debouncedSave = useCallback((nextNodes: OrgNode[]) => {
    if (!orgId) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveOrgChart(orgId, nextNodes).catch(() => {})
    }, 500)
  }, [orgId])

  const [selectedId, setSelectedId] = useState<string | null>('root')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [addMenuId, setAddMenuId] = useState<string | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState<string | null>(null)
  const [panning, setPanning] = useState(false)
  const dragStart = useRef({ x: 0, y: 0, nodeX: 0, nodeY: 0 })
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 })
  const editRef = useRef<HTMLInputElement>(null)

  // Persist: update local state + debounced save to DB
  function update(fn: (prev: OrgNode[]) => OrgNode[]) {
    setNodes((prev) => {
      const next = fn(prev)
      debouncedSave(next)
      return next
    })
  }

  // Add node as child of a given parent (or selected).
  // Children are centered under the parent, spaced evenly.
  function addNode(tool: ToolItem, parentId?: string) {
    const pid = parentId ?? selectedId ?? 'root'
    const parent = nodes.find((n) => n.id === pid)
    const px = parent?.x ?? 300
    const py = parent?.y ?? 40
    const gap = NODE_W + 24

    const newNode: OrgNode = {
      id: newId(),
      parentId: pid,
      type: tool.type,
      label: tool.label,
      color: tool.color,
      icon: tool.type,
      x: 0, // will be recalculated
      y: py + NODE_H + 80,
    }

    update((prev) => {
      const next = [...prev, newNode]
      // Recalculate all children positions to center under parent
      const siblings = next.filter((n) => n.parentId === pid)
      const totalWidth = (siblings.length - 1) * gap
      const startX = px + NODE_W / 2 - totalWidth / 2 - NODE_W / 2
      siblings.forEach((sib, i) => {
        const target = next.find((n) => n.id === sib.id)!
        target.x = startX + i * gap
      })
      return [...next]
    })
    setSelectedId(newNode.id)
    setAddMenuId(null)
  }

  // Delete node + descendants
  function deleteNode(id: string) {
    if (id === 'root') return
    update((prev) => {
      const toDelete = new Set<string>()
      function collect(nid: string) {
        toDelete.add(nid)
        prev.filter((n) => n.parentId === nid).forEach((n) => collect(n.id))
      }
      collect(id)
      return prev.filter((n) => !toDelete.has(n.id))
    })
    setSelectedId(null)
  }

  // Rename
  function startRename(id: string) {
    const node = nodes.find((n) => n.id === id)
    if (!node) return
    setEditingId(id)
    setEditText(node.label)
    setTimeout(() => editRef.current?.focus(), 0)
  }

  function confirmRename() {
    if (editingId && editText.trim()) {
      update((prev) => prev.map((n) =>
        n.id === editingId ? { ...n, label: editText.trim() } : n
      ))
    }
    setEditingId(null)
  }

  // Node drag
  function onNodeMouseDown(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    const node = nodes.find((n) => n.id === id)
    if (!node) return
    setDragging(id)
    setSelectedId(id)
    dragStart.current = { x: e.clientX, y: e.clientY, nodeX: node.x, nodeY: node.y }
  }

  // Canvas pan — any click that isn't on a node triggers panning
  function onCanvasMouseDown(e: React.MouseEvent) {
    const el = e.target as HTMLElement
    // Don't pan if clicking inside a node or menu
    if (el.closest('.org-node') || el.closest('.org-add-menu')) return
    setPanning(true)
    panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }
    setSelectedId(null)
    setAddMenuId(null)
  }

  function onMouseMove(e: React.MouseEvent) {
    if (dragging) {
      const dx = e.clientX - dragStart.current.x
      const dy = e.clientY - dragStart.current.y
      update((prev) => prev.map((n) =>
        n.id === dragging
          ? { ...n, x: dragStart.current.nodeX + dx, y: dragStart.current.nodeY + dy }
          : n
      ))
    }
    if (panning) {
      setPan({
        x: panStart.current.panX + (e.clientX - panStart.current.x),
        y: panStart.current.panY + (e.clientY - panStart.current.y),
      })
    }
  }

  function onMouseUp() {
    setDragging(null)
    setPanning(false)
  }

  // Fit all nodes into view
  function fitToView() {
    if (nodes.length === 0) return
    const canvas = canvasRef.current
    if (!canvas) return
    const cw = canvas.clientWidth
    const ch = canvas.clientHeight
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const n of nodes) {
      minX = Math.min(minX, n.x)
      minY = Math.min(minY, n.y)
      maxX = Math.max(maxX, n.x + NODE_W)
      maxY = Math.max(maxY, n.y + NODE_H)
    }
    const contentW = maxX - minX
    const contentH = maxY - minY
    const padX = Math.max(40, (cw - contentW) / 2)
    const padY = Math.max(40, (ch - contentH) / 2)
    setPan({ x: -minX + padX, y: -minY + padY })
  }

  // Auto-layout: arrange nodes in a clean tree structure
  function autoLayout() {
    const gap = NODE_W + 32
    const rowGap = NODE_H + 64

    const childrenOf = new Map<string, string[]>()
    const rootIds: string[] = []
    for (const n of nodes) {
      if (!n.parentId) {
        rootIds.push(n.id)
      } else {
        const list = childrenOf.get(n.parentId) ?? []
        list.push(n.id)
        childrenOf.set(n.parentId, list)
      }
    }

    const positions = new Map<string, { x: number; y: number }>()
    function layout(id: string, depth: number, leftSlot: number): number {
      const kids = childrenOf.get(id) ?? []
      if (kids.length === 0) {
        positions.set(id, { x: leftSlot * gap, y: depth * rowGap })
        return leftSlot + 1
      }
      let cursor = leftSlot
      for (const kid of kids) {
        cursor = layout(kid, depth + 1, cursor)
      }
      const firstChild = positions.get(kids[0])!
      const lastChild = positions.get(kids[kids.length - 1])!
      positions.set(id, { x: (firstChild.x + lastChild.x) / 2, y: depth * rowGap })
      return cursor
    }

    let cursor = 0
    for (const rid of rootIds) {
      cursor = layout(rid, 0, cursor)
    }

    update((prev) => prev.map((n) => {
      const pos = positions.get(n.id)
      if (!pos) return n
      return { ...n, x: pos.x + 60, y: pos.y + 40 }
    }))

    setTimeout(fitToView, 50)
  }

  // Jump to root node, centered in canvas
  function goToRoot() {
    const root = nodes.find((n) => !n.parentId)
    if (!root) return
    const canvas = canvasRef.current
    const cw = canvas?.clientWidth ?? 800
    const ch = canvas?.clientHeight ?? 400
    setPan({
      x: -(root.x - cw / 2 + NODE_W / 2),
      y: -(root.y - ch / 2 + NODE_H / 2),
    })
    setSelectedId(root.id)
  }

  // Sync from GitHub — auto-populate chart with org members + repos
  function syncFromGitHub(members: OrgMemberInfo[]) {
    const gap = NODE_W + 32
    const rowGap = NODE_H + 64

    const newNodes: OrgNode[] = [{
      id: 'root',
      parentId: null,
      type: 'company',
      label: org?.name ?? t('org.tool.company'),
      color: '#8b5cf6',
      icon: 'company',
      x: 0,
      y: 0,
    }]

    // Add members as children of root
    members.forEach((m, i) => {
      newNodes.push({
        id: `gh_${m.login}`,
        parentId: 'root',
        type: 'member',
        label: m.login,
        color: '#34d399',
        icon: 'member',
        x: i * gap,
        y: rowGap,
      })
    })

    // Add connected repos as children of root (separate branch)
    const repos = resolvedList(connectedReposQ.data, connectedReposQ, !!orgId)
    if (repos.length > 0) {
      const repoGroupId = 'gh_repos'
      newNodes.push({
        id: repoGroupId,
        parentId: 'root',
        type: 'group',
        label: t('nav.repos'),
        color: '#38bdf8',
        icon: 'group',
        x: (members.length + 1) * gap,
        y: rowGap,
      })
      repos.forEach((r, i) => {
        newNodes.push({
          id: `gh_repo_${r.id}`,
          parentId: repoGroupId,
          type: 'repo',
          label: r.repoName,
          color: '#4ade80',
          icon: 'repo',
          x: (members.length + 1) * gap + i * gap,
          y: rowGap * 2,
          repoId: r.id,
        })
      })
    }

    if (!querySucceeded(connectedReposQ, !!orgId)) return

    update(() => newNodes)
    setTimeout(() => {
      autoLayout()
    }, 50)
  }

  return {
    nodes,
    selectedId,
    setSelectedId,
    editingId,
    setEditingId,
    editText,
    setEditText,
    addMenuId,
    setAddMenuId,
    canvasRef,
    pan,
    panning,
    dragging,
    editRef,
    addNode,
    deleteNode,
    startRename,
    confirmRename,
    onNodeMouseDown,
    onCanvasMouseDown,
    onMouseMove,
    onMouseUp,
    fitToView,
    autoLayout,
    goToRoot,
    syncFromGitHub,
  }
}
