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
  const totalWeight = roomPlans.reduce((sum, room) => sum + room.weight, 0)
  let cursorX = -width / 2

  return roomPlans.map((room, index) => {
    const isLast = index === roomPlans.length - 1
    const roomWidth = isLast ? width / 2 - cursorX : (width * room.weight) / totalWeight
    const x0 = cursorX
    const x1 = Math.min(width / 2, cursorX + roomWidth)
    cursorX = x1
    const polygon = [
      [roundToTenth(x0), roundToTenth(-depth / 2)],
      [roundToTenth(x1), roundToTenth(-depth / 2)],
      [roundToTenth(x1), roundToTenth(depth / 2)],
      [roundToTenth(x0), roundToTenth(depth / 2)],
    ] as [number, number][]
    return {
      id: `${room.type}-${index + 1}`,
      name: room.name,
      type: room.type,
      targetAreaM2: roundToTenth((x1 - x0) * depth),
      polygon,
    }
  })
}

function rectanglePolygon(width: number, depth: number): [number, number][] {
  return [
    [roundToTenth(-width / 2), roundToTenth(-depth / 2)],
    [roundToTenth(width / 2), roundToTenth(-depth / 2)],
    [roundToTenth(width / 2), roundToTenth(depth / 2)],
    [roundToTenth(-width / 2), roundToTenth(depth / 2)],
  ]
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10
}
