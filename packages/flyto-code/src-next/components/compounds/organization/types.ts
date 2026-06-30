import type { LucideIcon } from 'lucide-react'

export interface OrgNode {
  id: string
  parentId: string | null
  type: string
  label: string
  color: string
  icon: string
  x: number
  y: number
  repoId?: string  // links to connected_repos for type='repo'
}

export interface ToolItem {
  type: string
  label: string
  icon: LucideIcon
  color: string
}
