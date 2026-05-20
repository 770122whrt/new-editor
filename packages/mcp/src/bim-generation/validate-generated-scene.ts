import type { SceneGraph } from '@pascal-app/core/clone-scene-graph'
import { AnyNode, type AnyNode as CoreAnyNode } from '@pascal-app/core/schema'
import type { BimSpec } from './bim-spec-schema'

export type GeneratedSceneValidation = {
  valid: boolean
  errors: string[]
  warnings: string[]
  summary: {
    nodeCount: number
    levelCount: number
    zoneCount: number
    renderableNodeCount: number
  }
}

export function validateGeneratedScene(graph: SceneGraph, spec: BimSpec): GeneratedSceneValidation {
  const errors: string[] = []
  const warnings: string[] = []
  const nodes = Object.values(graph.nodes)

  for (const node of nodes) {
    const parsed = AnyNode.safeParse(node)
    if (!parsed.success) {
      errors.push(`invalid node ${node.id}: ${parsed.error.message}`)
    }
  }

  const levels = nodes.filter((node) => node.type === 'level')
  if (levels.length !== 1)
    errors.push(`expected exactly one occupied level, found ${levels.length}`)

  const exteriorWalls = nodes.filter(isExteriorWall)
  if (exteriorWalls.length !== 4)
    errors.push(`expected 4 exterior walls, found ${exteriorWalls.length}`)
  if (exteriorWalls.length === 4 && !isClosedWallLoop(exteriorWalls)) {
    errors.push('exterior wall shell is not closed')
  }

  const zones = nodes.filter((node) => node.type === 'zone')
  const requiredRoomNames = new Set(spec.rooms.map((room) => room.name))
  for (const zone of zones) requiredRoomNames.delete(zone.name)
  if (requiredRoomNames.size > 0) {
    errors.push(`missing required room zones: ${Array.from(requiredRoomNames).join(', ')}`)
  }

  const wallIds = new Set<string>(
    nodes.filter((node) => node.type === 'wall').map((node) => node.id),
  )
  for (const opening of nodes.filter((node) => node.type === 'door' || node.type === 'window')) {
    if (!opening.wallId || !wallIds.has(opening.wallId)) {
      errors.push(`opening ${opening.id} is not attached to a valid wall`)
    }
  }

  const renderableNodeCount = nodes.filter((node) =>
    ['wall', 'slab', 'ceiling', 'door', 'window'].includes(node.type),
  ).length
  if (renderableNodeCount === 0) errors.push('scene has no renderable geometry')
  if (spec.options.includeFurniture)
    warnings.push('furniture intent is recorded but not instantiated in MVP')

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: {
      nodeCount: nodes.length,
      levelCount: levels.length,
      zoneCount: zones.length,
      renderableNodeCount,
    },
  }
}

function isClosedWallLoop(
  walls: Array<{ start: [number, number]; end: [number, number] }>,
): boolean {
  const starts = new Set(walls.map((wall) => pointKey(wall.start)))
  const ends = new Set(walls.map((wall) => pointKey(wall.end)))
  if (starts.size !== ends.size) return false
  for (const start of starts) {
    if (!ends.has(start)) return false
  }
  return true
}

function pointKey(point: [number, number]): string {
  return `${point[0].toFixed(3)},${point[1].toFixed(3)}`
}

function isExteriorWall(node: CoreAnyNode): node is Extract<CoreAnyNode, { type: 'wall' }> {
  return (
    node.type === 'wall' &&
    typeof node.metadata === 'object' &&
    node.metadata !== null &&
    !Array.isArray(node.metadata) &&
    'role' in node.metadata &&
    node.metadata.role === 'exterior'
  )
}
