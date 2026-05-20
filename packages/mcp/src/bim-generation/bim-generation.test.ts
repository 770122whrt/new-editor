import { describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AnyNode } from '@pascal-app/core/schema'
import { runBimBatch } from './batch-runner'
import { parseBimBatchCliArgs } from './cli-options'
import { generateBimSpec } from './generate-bim-spec'
import { parseManifestLine } from './manifest-schema'
import { convertBimSpecToSceneGraph } from './scenegraph-converter'
import { validateGeneratedScene } from './validate-generated-scene'

describe('BIM batch manifest parsing', () => {
  test('normalizes a minimal JSONL row with deterministic defaults', () => {
    const row = parseManifestLine(
      JSON.stringify({
        id: 'sample-0001',
        seed: 1001,
        brief: 'A compact two-bedroom single-story house.',
        target: {
          buildingType: 'single_family_house',
          stories: 1,
          grossAreaM2: 85,
        },
      }),
      1,
    )

    expect(row.id).toBe('sample-0001')
    expect(row.target.bedrooms).toBe(2)
    expect(row.target.bathrooms).toBe(1)
    expect(row.constraints.includeRoof).toBe(true)
    expect(row.constraints.includeFurniture).toBe(false)
  })

  test('reports line numbers for invalid JSONL rows', () => {
    expect(() => parseManifestLine('{bad json', 7)).toThrow('line 7')
  })
})

describe('BIM Spec generation', () => {
  test('generates an auditable BIM Spec that is not a SceneGraph', () => {
    const input = parseManifestLine(
      JSON.stringify({
        id: 'sample-0002',
        seed: 42,
        brief: 'A simple modern two-bedroom house with roof and basic furniture.',
        target: {
          buildingType: 'single_family_house',
          stories: 1,
          grossAreaM2: 96,
          bedrooms: 2,
          bathrooms: 1,
        },
        constraints: { includeRoof: true, includeFurniture: true },
      }),
      1,
    )

    const spec = generateBimSpec(input)

    expect(spec.id).toBe('sample-0002')
    expect(spec.kind).toBe('pascal-bim-spec')
    expect(spec.sceneGraphRenderable).toBe(false)
    expect(spec.building.stories).toBe(1)
    expect(spec.rooms.some((room) => room.type === 'bedroom')).toBe(true)
    expect(spec.openings.exteriorDoors.length).toBeGreaterThan(0)
  })
})

describe('BIM Spec to SceneGraph conversion', () => {
  test('converts BIM Spec into Pascal SceneGraph JSON', () => {
    const spec = generateBimSpec(
      parseManifestLine(
        JSON.stringify({
          id: 'sample-0003',
          seed: 77,
          brief: 'A small one-bedroom single-story house.',
          target: {
            buildingType: 'single_family_house',
            stories: 1,
            grossAreaM2: 64,
            bedrooms: 1,
            bathrooms: 1,
          },
        }),
        1,
      ),
    )

    const graph = convertBimSpecToSceneGraph(spec)
    const nodes = Object.values(graph.nodes)

    expect(graph.rootNodeIds.length).toBe(1)
    expect(nodes.some((node) => node.type === 'site')).toBe(true)
    expect(nodes.some((node) => node.type === 'building')).toBe(true)
    expect(nodes.some((node) => node.type === 'level')).toBe(true)
    expect(nodes.filter((node) => node.type === 'wall').length).toBeGreaterThanOrEqual(4)
    expect(nodes.some((node) => node.type === 'zone')).toBe(true)

    for (const node of nodes) {
      expect(() => AnyNode.parse(node)).not.toThrow()
    }
  })
})

describe('Generated SceneGraph validation', () => {
  test('validates generated single-story residential SceneGraph', () => {
    const spec = generateBimSpec(
      parseManifestLine(
        JSON.stringify({
          id: 'sample-0004',
          seed: 88,
          brief: 'A valid compact single-story house.',
          target: {
            buildingType: 'single_family_house',
            stories: 1,
            grossAreaM2: 72,
          },
        }),
        1,
      ),
    )
    const graph = convertBimSpecToSceneGraph(spec)
    const result = validateGeneratedScene(graph, spec)

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.summary.renderableNodeCount).toBeGreaterThan(0)
  })
})

describe('BIM batch runner', () => {
  test('runs a JSONL batch and writes per-sample outputs plus reports', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pascal-bim-batch-'))
    const manifestPath = join(dir, 'manifest.jsonl')
    const outDir = join(dir, 'out')
    await writeFile(
      manifestPath,
      `${JSON.stringify({
        id: 'sample-0005',
        seed: 123,
        brief: 'A compact single-story house.',
        target: {
          buildingType: 'single_family_house',
          stories: 1,
          grossAreaM2: 70,
        },
      })}\n`,
    )

    const report = await runBimBatch({ manifestPath, outDir, exportObj: false })

    expect(report.summary.total).toBe(1)
    expect(report.summary.succeeded).toBe(1)
    expect(
      await readFile(join(outDir, 'samples', 'sample-0005', 'bim-spec.json'), 'utf8'),
    ).toContain('pascal-bim-spec')
    expect(
      await readFile(join(outDir, 'samples', 'sample-0005', 'scene-graph.json'), 'utf8'),
    ).toContain('"nodes"')
    expect(await readFile(join(outDir, 'report.md'), 'utf8')).toContain('sample-0005')
  })
})

describe('BIM batch CLI options', () => {
  test('parses manifest and output flags with skip-obj', () => {
    const options = parseBimBatchCliArgs([
      '--manifest',
      './manifest.jsonl',
      '--out',
      './out/bim-batch/dev',
      '--skip-obj',
    ])

    expect(options.manifestPath).toBe('./manifest.jsonl')
    expect(options.outDir).toBe('./out/bim-batch/dev')
    expect(options.exportObj).toBe(false)
  })

  test('requires manifest and output flags', () => {
    expect(() => parseBimBatchCliArgs(['--manifest', './manifest.jsonl'])).toThrow('--out')
  })
})
