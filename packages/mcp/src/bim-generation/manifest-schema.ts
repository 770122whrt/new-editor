import { z } from 'zod'

const TargetSchema = z.object({
  buildingType: z.literal('single_family_house'),
  stories: z.literal(1),
  grossAreaM2: z.number().min(30).max(250),
  bedrooms: z.number().int().min(0).max(6).optional(),
  bathrooms: z.number().int().min(1).max(4).optional(),
  style: z.string().optional(),
})

const ConstraintsSchema = z
  .object({
    maxWidthM: z.number().min(4).max(40).optional(),
    maxDepthM: z.number().min(4).max(40).optional(),
    includeFurniture: z.boolean().optional(),
    includeRoof: z.boolean().optional(),
  })
  .optional()

const ManifestRowSchema = z.object({
  id: z.string().min(1),
  seed: z.number().int(),
  brief: z.string().min(1),
  target: TargetSchema,
  constraints: ConstraintsSchema,
})

export type NormalizedManifestRow = {
  id: string
  seed: number
  brief: string
  target: {
    buildingType: 'single_family_house'
    stories: 1
    grossAreaM2: number
    bedrooms: number
    bathrooms: number
    style: string
  }
  constraints: {
    maxWidthM: number
    maxDepthM: number
    includeFurniture: boolean
    includeRoof: boolean
  }
}

export function parseManifestLine(line: string, lineNumber: number): NormalizedManifestRow {
  let raw: unknown
  try {
    raw = JSON.parse(line)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Invalid BIM manifest JSON on line ${lineNumber}: ${message}`)
  }

  const parsed = ManifestRowSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(
      `Invalid BIM manifest row on line ${lineNumber}: ${z.prettifyError(parsed.error)}`,
    )
  }

  const { constraints, target } = parsed.data
  return {
    id: parsed.data.id,
    seed: parsed.data.seed,
    brief: parsed.data.brief,
    target: {
      buildingType: target.buildingType,
      stories: target.stories,
      grossAreaM2: target.grossAreaM2,
      bedrooms: target.bedrooms ?? 2,
      bathrooms: target.bathrooms ?? 1,
      style: target.style ?? 'simple_modern',
    },
    constraints: {
      maxWidthM: constraints?.maxWidthM ?? 14,
      maxDepthM: constraints?.maxDepthM ?? 12,
      includeFurniture: constraints?.includeFurniture ?? false,
      includeRoof: constraints?.includeRoof ?? true,
    },
  }
}
