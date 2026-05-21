import { type BimRoom, type BimSpec, BimSpecSchema, type RoomType } from './bim-spec-schema'
import type { NormalizedManifestRow } from './manifest-schema'

const WALL_HEIGHT_M = 2.8
const WALL_THICKNESS_M = 0.16

type RoomPlan = {
  type: RoomType
  name: string
  weight: number
}

export function generateBimSpec(input: NormalizedManifestRow): BimSpec {
  const width = roundToTenth(
    Math.min(input.constraints.maxWidthM, Math.sqrt(input.target.grossAreaM2 * 1.25)),
  )
  const depth = roundToTenth(
    Math.min(input.constraints.maxDepthM, input.target.grossAreaM2 / Math.max(width, 1)),
  )
  const footprint = rectanglePolygon(width, depth)
  const roomPlans = buildRoomPlans(input.target.bedrooms, input.target.bathrooms)
  const rooms = layoutRooms(roomPlans, width, depth)

  return BimSpecSchema.parse({
    kind: 'pascal-bim-spec',
    version: 1,
    id: input.id,
    seed: input.seed,
    brief: input.brief,
    sceneGraphRenderable: false,
    generator: {
      name: 'pascal-bim-batch',
      version: 1,
    },
    building: {
      buildingType: input.target.buildingType,
      stories: input.target.stories,
      style: input.target.style,
      grossAreaM2: input.target.grossAreaM2,
      widthM: width,
      depthM: depth,
      wallHeightM: WALL_HEIGHT_M,
      wallThicknessM: WALL_THICKNESS_M,
    },
    footprint,
    rooms,
    openings: {
      exteriorDoors: [{ wall: 'south', t: 0.5, widthM: 0.95 }],
      windows: [
        { wall: 'north', t: 0.25, widthM: 1.2, heightM: 1.1, sillHeightM: 0.9 },
        { wall: 'north', t: 0.75, widthM: 1.2, heightM: 1.1, sillHeightM: 0.9 },
        { wall: 'east', t: 0.5, widthM: 1.0, heightM: 1.0, sillHeightM: 0.95 },
        { wall: 'west', t: 0.5, widthM: 1.0, heightM: 1.0, sillHeightM: 0.95 },
      ],
    },
    materials: {
      exteriorWalls: 'white',
      interiorWalls: 'white',
      floor: 'wood',
      ceiling: 'white',
      roof: 'roof-dark',
    },
    options: {
      includeRoof: input.constraints.includeRoof,
      includeFurniture: input.constraints.includeFurniture,
    },
  })
}

function buildRoomPlans(bedrooms: number, bathrooms: number): RoomPlan[] {
  const rooms: RoomPlan[] = [
    { type: 'living', name: 'Living Room', weight: 2.2 },
    { type: 'kitchen', name: 'Kitchen', weight: 1.2 },
  ]

  for (let i = 0; i < bedrooms; i++) {
    rooms.push({
      type: 'bedroom',
      name: bedrooms === 1 ? 'Bedroom' : `Bedroom ${i + 1}`,
      weight: 1.4,
    })
  }

  for (let i = 0; i < bathrooms; i++) {
    rooms.push({
      type: 'bathroom',
      name: bathrooms === 1 ? 'Bathroom' : `Bathroom ${i + 1}`,
      weight: 0.75,
    })
  }

  rooms.push({ type: 'circulation', name: 'Hall', weight: 0.6 })
  return rooms
}

function layoutRooms(roomPlans: RoomPlan[], width: number, depth: number): BimRoom[] {
  const minX = -width / 2
  const maxX = width / 2
  const minZ = -depth / 2
  const maxZ = depth / 2
  const hallDepth = Math.min(1.6, Math.max(1.1, depth * 0.16))
  const publicDepth = Math.max(2.2, (depth - hallDepth) * 0.45)
  const publicMaxZ = Math.min(maxZ - hallDepth - 1.8, minZ + publicDepth)
  const hallMaxZ = Math.min(maxZ - 1.2, publicMaxZ + hallDepth)
  const rooms: BimRoom[] = []
  const publicRooms = roomPlans.filter((room) => room.type === 'living' || room.type === 'kitchen')
  const privateRooms = roomPlans.filter(
    (room) => room.type === 'bedroom' || room.type === 'bathroom',
  )
  const circulationRooms = roomPlans.filter((room) => room.type === 'circulation')

  rooms.push(...layoutBand(publicRooms, minX, maxX, minZ, publicMaxZ, 0))
  rooms.push(...layoutBand(circulationRooms, minX, maxX, publicMaxZ, hallMaxZ, rooms.length))
  rooms.push(...layoutBand(privateRooms, minX, maxX, hallMaxZ, maxZ, rooms.length))
  return rooms
}

function layoutBand(
  roomPlans: RoomPlan[],
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  offset: number,
): BimRoom[] {
  if (roomPlans.length === 0) return []
  const width = maxX - minX
  const depth = maxZ - minZ
  const totalWeight = roomPlans.reduce((sum, room) => sum + room.weight, 0)
  let cursorX = minX

  return roomPlans.map((room, index) => {
    const isLast = index === roomPlans.length - 1
    const roomWidth = isLast ? maxX - cursorX : (width * room.weight) / totalWeight
    const x0 = cursorX
    const x1 = Math.min(maxX, cursorX + roomWidth)
    cursorX = x1
    const polygon = rectanglePolygonFromBounds(x0, x1, minZ, maxZ)
    return {
      id: `${room.type}-${offset + index + 1}`,
      name: room.name,
      type: room.type,
      targetAreaM2: roundToTenth((x1 - x0) * depth),
      polygon,
    }
  })
}

function rectanglePolygon(width: number, depth: number): [number, number][] {
  return rectanglePolygonFromBounds(-width / 2, width / 2, -depth / 2, depth / 2)
}

function rectanglePolygonFromBounds(
  x0: number,
  x1: number,
  z0: number,
  z1: number,
): [number, number][] {
  return [
    [roundToTenth(x0), roundToTenth(z0)],
    [roundToTenth(x1), roundToTenth(z0)],
    [roundToTenth(x1), roundToTenth(z1)],
    [roundToTenth(x0), roundToTenth(z1)],
  ]
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10
}
