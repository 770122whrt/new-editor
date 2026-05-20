import { z } from 'zod'

export const RoomTypeSchema = z.enum(['living', 'kitchen', 'bedroom', 'bathroom', 'circulation'])

export const BimRoomSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: RoomTypeSchema,
  targetAreaM2: z.number().positive(),
  polygon: z.array(z.tuple([z.number(), z.number()])).min(3),
})

export const BimSpecSchema = z.object({
  kind: z.literal('pascal-bim-spec'),
  version: z.literal(1),
  id: z.string(),
  seed: z.number().int(),
  brief: z.string(),
  sceneGraphRenderable: z.literal(false),
  generator: z.object({
    name: z.literal('pascal-bim-batch'),
    version: z.literal(1),
  }),
  building: z.object({
    buildingType: z.literal('single_family_house'),
    stories: z.literal(1),
    style: z.string(),
    grossAreaM2: z.number().positive(),
    widthM: z.number().positive(),
    depthM: z.number().positive(),
    wallHeightM: z.number().positive(),
    wallThicknessM: z.number().positive(),
  }),
  footprint: z.array(z.tuple([z.number(), z.number()])).min(4),
  rooms: z.array(BimRoomSchema).min(1),
  openings: z.object({
    exteriorDoors: z.array(
      z.object({
        wall: z.enum(['north', 'east', 'south', 'west']),
        t: z.number().min(0).max(1),
        widthM: z.number().positive(),
      }),
    ),
    windows: z.array(
      z.object({
        wall: z.enum(['north', 'east', 'south', 'west']),
        t: z.number().min(0).max(1),
        widthM: z.number().positive(),
        heightM: z.number().positive(),
        sillHeightM: z.number().min(0),
      }),
    ),
  }),
  materials: z.object({
    exteriorWalls: z.string(),
    interiorWalls: z.string(),
    floor: z.string(),
    ceiling: z.string(),
    roof: z.string(),
  }),
  options: z.object({
    includeRoof: z.boolean(),
    includeFurniture: z.boolean(),
  }),
})

export type BimSpec = z.infer<typeof BimSpecSchema>
export type BimRoom = z.infer<typeof BimRoomSchema>
export type RoomType = z.infer<typeof RoomTypeSchema>
