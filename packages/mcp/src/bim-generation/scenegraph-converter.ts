import type { SceneGraph } from '@pascal-app/core/clone-scene-graph'
import type { AnyNode, AnyNodeId } from '@pascal-app/core/schema'
import {
  BuildingNode,
  CeilingNode,
  DoorNode,
  LevelNode,
  SiteNode,
  SlabNode,
  WallNode,
  WindowNode,
  ZoneNode,
} from '@pascal-app/core/schema'
import type { BimSpec } from './bim-spec-schema'

type CardinalWall = 'north' | 'east' | 'south' | 'west'

const ZONE_COLORS: Record<string, string> = {
  living: '#7dd3fc',
  kitchen: '#fde68a',
  bedroom: '#c4b5fd',
  bathroom: '#99f6e4',
  circulation: '#d1d5db',
}

export function convertBimSpecToSceneGraph(spec: BimSpec): SceneGraph {
  const nodes = {} as Record<AnyNodeId, AnyNode>
  const building = BuildingNode.parse({
    name: 'Generated Building',
    metadata: { source: 'bim-spec', sampleId: spec.id },
  })
  const site = SiteNode.parse({
    name: 'Generated Site',
    children: [building],
    metadata: { source: 'bim-spec', sampleId: spec.id },
  })
  const level = LevelNode.parse({
    name: 'Ground Floor',
    parentId: building.id,
    level: 0,
    children: [],
    metadata: { occupied: true, source: 'bim-spec' },
  })

  building.parentId = site.id
  building.children = [level.id]
  site.children = [building]

  nodes[site.id] = site
  nodes[building.id] = building
  nodes[level.id] = level

  const wallIdsBySide = createExteriorWalls(spec, nodes, level.id)
  const interiorWallIds = createInteriorWalls(spec, nodes, level.id)
  createSurfaces(spec, nodes, level.id)
  createZones(spec, nodes, level.id)
  createOpenings(spec, nodes, wallIdsBySide, interiorWallIds)

  ;(level as unknown as { children: AnyNodeId[] }).children = Object.values(nodes)
    .filter((node) => node.parentId === level.id)
    .map((node) => node.id)

  return {
    nodes,
    rootNodeIds: [site.id],
    collections: {},
  }
}

function createExteriorWalls(
  spec: BimSpec,
  nodes: Record<AnyNodeId, AnyNode>,
  levelId: AnyNodeId,
): Record<CardinalWall, AnyNodeId> {
  const southWest = spec.footprint[0]
  const southEast = spec.footprint[1]
  const northEast = spec.footprint[2]
  const northWest = spec.footprint[3]
  if (!southWest || !southEast || !northEast || !northWest) {
    throw new Error(`BIM Spec ${spec.id} must contain a rectangular footprint`)
  }
  const walls: Array<[CardinalWall, [number, number], [number, number]]> = [
    ['south', southWest, southEast],
    ['east', southEast, northEast],
    ['north', northEast, northWest],
    ['west', northWest, southWest],
  ]
  const bySide = {} as Record<CardinalWall, AnyNodeId>

  for (const [side, start, end] of walls) {
    const wall = WallNode.parse({
      name: `${capitalize(side)} Exterior Wall`,
      parentId: levelId,
      start,
      end,
      height: spec.building.wallHeightM,
      thickness: spec.building.wallThicknessM,
      exteriorMaterialPreset: spec.materials.exteriorWalls,
      interiorMaterialPreset: spec.materials.interiorWalls,
      frontSide: 'exterior',
      backSide: 'interior',
      metadata: { role: 'exterior', side, source: 'bim-spec' },
    })
    nodes[wall.id] = wall
    bySide[side] = wall.id
  }

  return bySide
}

function createInteriorWalls(
  spec: BimSpec,
  nodes: Record<AnyNodeId, AnyNode>,
  levelId: AnyNodeId,
): AnyNodeId[] {
  const interiorWallIds: AnyNodeId[] = []
  const seen = new Set<string>()
  let index = 1

  for (const room of spec.rooms) {
    if (room.type === 'circulation') continue
    for (let i = 0; i < room.polygon.length; i++) {
      const start = room.polygon[i]
      const end = room.polygon[(i + 1) % room.polygon.length]
      if (!start || !end || isFootprintBoundaryEdge(start, end, spec.footprint)) continue
      const key = edgeKey(start, end)
      if (seen.has(key)) continue
      seen.add(key)

      const wall = WallNode.parse({
        name: `Interior Partition ${index}`,
        parentId: levelId,
        start,
        end,
        height: spec.building.wallHeightM,
        thickness: spec.building.wallThicknessM,
        interiorMaterialPreset: spec.materials.interiorWalls,
        exteriorMaterialPreset: spec.materials.interiorWalls,
        frontSide: 'interior',
        backSide: 'interior',
        metadata: { role: 'interior', source: 'bim-spec' },
      })
      nodes[wall.id] = wall
      interiorWallIds.push(wall.id)
      index += 1
    }
  }

  return interiorWallIds
}

function createSurfaces(
  spec: BimSpec,
  nodes: Record<AnyNodeId, AnyNode>,
  levelId: AnyNodeId,
): void {
  const slab = SlabNode.parse({
    name: 'Generated Slab',
    parentId: levelId,
    polygon: spec.footprint,
    materialPreset: spec.materials.floor,
    metadata: { role: 'story-slab', source: 'bim-spec' },
  })
  const ceiling = CeilingNode.parse({
    name: 'Generated Ceiling',
    parentId: levelId,
    polygon: spec.footprint,
    height: spec.building.wallHeightM,
    materialPreset: spec.materials.ceiling,
    metadata: { role: 'story-ceiling', source: 'bim-spec' },
  })
  nodes[slab.id] = slab
  nodes[ceiling.id] = ceiling
}

function createZones(spec: BimSpec, nodes: Record<AnyNodeId, AnyNode>, levelId: AnyNodeId): void {
  for (const room of spec.rooms) {
    const zone = ZoneNode.parse({
      name: room.name,
      parentId: levelId,
      polygon: room.polygon,
      color: ZONE_COLORS[room.type] ?? '#93c5fd',
      metadata: {
        source: 'bim-spec',
        roomId: room.id,
        roomType: room.type,
        targetAreaM2: room.targetAreaM2,
      },
    })
    nodes[zone.id] = zone
  }
}

function createOpenings(
  spec: BimSpec,
  nodes: Record<AnyNodeId, AnyNode>,
  wallIdsBySide: Record<CardinalWall, AnyNodeId>,
  interiorWallIds: AnyNodeId[],
): void {
  for (const exteriorDoor of spec.openings.exteriorDoors) {
    const wall = nodes[wallIdsBySide[exteriorDoor.wall]]
    if (!wall || wall.type !== 'wall') continue
    const door = DoorNode.parse({
      name: 'Exterior Door',
      parentId: wall.id,
      wallId: wall.id,
      width: exteriorDoor.widthM,
      height: 2.1,
      position: openingPositionOnWall(
        wall.start,
        wall.end,
        exteriorDoor.t,
        exteriorDoor.widthM,
        1.05,
      ),
      doorCategory: 'interior',
      swingDirection: 'inward',
      metadata: { source: 'bim-spec', openingRole: 'entry' },
    })
    wall.children = [...wall.children, door.id]
    nodes[door.id] = door
  }

  for (const windowSpec of spec.openings.windows) {
    const wall = nodes[wallIdsBySide[windowSpec.wall]]
    if (!wall || wall.type !== 'wall') continue
    const windowNode = WindowNode.parse({
      name: 'Generated Window',
      parentId: wall.id,
      wallId: wall.id,
      width: windowSpec.widthM,
      height: windowSpec.heightM,
      position: openingPositionOnWall(
        wall.start,
        wall.end,
        windowSpec.t,
        windowSpec.widthM,
        windowSpec.sillHeightM + windowSpec.heightM / 2,
      ),
      metadata: { source: 'bim-spec' },
    })
    wall.children = [...wall.children, windowNode.id]
    nodes[windowNode.id] = windowNode
  }

  for (const wallId of interiorWallIds) {
    const wall = nodes[wallId]
    if (!wall || wall.type !== 'wall') continue
    const width = 0.85
    if (!isHorizontalWall(wall.start, wall.end)) continue
    if (wallLength(wall.start, wall.end) < width) continue
    const door = DoorNode.parse({
      name: 'Interior Door',
      parentId: wall.id,
      wallId: wall.id,
      width,
      height: 2.05,
      position: openingPositionOnWall(wall.start, wall.end, 0.5, width, 1.025),
      doorCategory: 'interior',
      swingDirection: 'inward',
      metadata: { source: 'bim-spec', openingRole: 'interior' },
    })
    wall.children = [...wall.children, door.id]
    nodes[door.id] = door
  }
}

function openingPositionOnWall(
  start: [number, number],
  end: [number, number],
  t: number,
  width: number,
  height: number,
): [number, number, number] {
  const length = wallLength(start, end)
  const min = width / 2
  const max = length - width / 2
  const localX = max < min ? (min + max) / 2 : Math.max(min, Math.min(max, t * length))
  return [localX, height, 0]
}

function wallLength(start: [number, number], end: [number, number]): number {
  return Math.hypot(end[0] - start[0], end[1] - start[1])
}

function isFootprintBoundaryEdge(
  start: [number, number],
  end: [number, number],
  footprint: [number, number][],
): boolean {
  for (let i = 0; i < footprint.length; i++) {
    const boundaryStart = footprint[i]
    const boundaryEnd = footprint[(i + 1) % footprint.length]
    if (!boundaryStart || !boundaryEnd) continue
    if (
      pointOnSegment(start, boundaryStart, boundaryEnd) &&
      pointOnSegment(end, boundaryStart, boundaryEnd)
    )
      return true
  }
  return false
}

function isHorizontalWall(start: [number, number], end: [number, number]): boolean {
  return Math.abs(start[1] - end[1]) < 1e-6
}

function edgeKey(start: [number, number], end: [number, number]): string {
  const a = pointKey(start)
  const b = pointKey(end)
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

function pointKey(point: [number, number]): string {
  return `${point[0].toFixed(3)},${point[1].toFixed(3)}`
}

function pointsEqual(a: [number, number], b: [number, number]): boolean {
  return Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6
}

function pointOnSegment(
  point: [number, number],
  start: [number, number],
  end: [number, number],
): boolean {
  const cross =
    (point[1] - start[1]) * (end[0] - start[0]) - (point[0] - start[0]) * (end[1] - start[1])
  if (Math.abs(cross) > 1e-6) return false
  const dot =
    (point[0] - start[0]) * (end[0] - start[0]) + (point[1] - start[1]) * (end[1] - start[1])
  if (dot < -1e-6) return false
  const lengthSq = (end[0] - start[0]) ** 2 + (end[1] - start[1]) ** 2
  return dot <= lengthSq + 1e-6
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`
}
