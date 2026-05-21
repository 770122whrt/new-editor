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
  createInteriorWalls(spec, nodes, level.id)
  createSurfaces(spec, nodes, level.id)
  createZones(spec, nodes, level.id)
  createOpenings(spec, nodes, wallIdsBySide)

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
): void {
  for (let i = 1; i < spec.rooms.length; i++) {
    const room = spec.rooms[i]
    const firstPoint = room?.polygon[0]
    if (!firstPoint) continue
    const x = firstPoint[0]
    const wall = WallNode.parse({
      name: `Interior Partition ${i}`,
      parentId: levelId,
      start: [x, -spec.building.depthM / 2],
      end: [x, spec.building.depthM / 2],
      height: spec.building.wallHeightM,
      thickness: spec.building.wallThicknessM,
      interiorMaterialPreset: spec.materials.interiorWalls,
      exteriorMaterialPreset: spec.materials.interiorWalls,
      frontSide: 'interior',
      backSide: 'interior',
      metadata: { role: 'interior', source: 'bim-spec' },
    })
    nodes[wall.id] = wall
  }
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
      position: openingPositionOnWall(wall.start, wall.end, exteriorDoor.t, exteriorDoor.widthM, 1.05),
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
}

function openingPositionOnWall(
  start: [number, number],
  end: [number, number],
  t: number,
  width: number,
  height: number,
): [number, number, number] {
  const length = Math.hypot(end[0] - start[0], end[1] - start[1])
  const min = width / 2
  const max = length - width / 2
  const localX = max < min ? (min + max) / 2 : Math.max(min, Math.min(max, t * length))
  return [localX, height, 0]
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`
}
