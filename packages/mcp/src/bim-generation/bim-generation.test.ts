import { describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AnyNode } from '@pascal-app/core/schema'
import { runBimBatch } from './batch-runner'
import { BrowserObjExporter, ensureEditorScene } from './browser-obj-exporter'
import { parseBimBatchCliArgs } from './cli-options'
import { generateBimSpec } from './generate-bim-spec'
import { countIfcEntities, exportBimSpecToIfc } from './ifc-exporter'
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

  test('places generated doors and windows in wall-local coordinates', () => {
    const spec = generateBimSpec(
      parseManifestLine(
        JSON.stringify({
          id: 'opening-local-test',
          seed: 78,
          brief: 'A medium two-bedroom house with openings on every exterior wall.',
          target: {
            buildingType: 'single_family_house',
            stories: 1,
            grossAreaM2: 96,
            bedrooms: 2,
            bathrooms: 2,
          },
        }),
        1,
      ),
    )

    const graph = convertBimSpecToSceneGraph(spec)
    const openings = Object.values(graph.nodes).filter(
      (node) => node.type === 'door' || node.type === 'window',
    )

    expect(openings.length).toBe(spec.openings.exteriorDoors.length + spec.openings.windows.length)
    for (const opening of openings) {
      const wallId = opening.wallId
      expect(wallId).toBe(opening.parentId)
      const wall = wallId ? graph.nodes[wallId] : undefined
      expect(wall?.type).toBe('wall')
      if (!wall || wall.type !== 'wall') continue

      const wallLength = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1])
      expect(wall.children).toContain(opening.id)
      expect(opening.position[0]).toBeGreaterThanOrEqual(opening.width / 2)
      expect(opening.position[0]).toBeLessThanOrEqual(wallLength - opening.width / 2)
      expect(opening.position[2]).toBe(0)
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

describe('BIM Spec to IFC export', () => {
  test('exports deterministic IFC4 text with semantic building entities', () => {
    const spec = generateBimSpec(
      parseManifestLine(
        JSON.stringify({
          id: 'sample-ifc',
          seed: 126,
          brief: 'A compact single-story house for IFC export.',
          target: {
            buildingType: 'single_family_house',
            stories: 1,
            grossAreaM2: 80,
            bedrooms: 2,
            bathrooms: 1,
          },
          constraints: { includeRoof: true },
        }),
        1,
      ),
    )

    const ifcText = exportBimSpecToIfc(spec)
    const secondIfcText = exportBimSpecToIfc(spec)
    const counts = countIfcEntities(ifcText)

    expect(ifcText).toBe(secondIfcText)
    expect(ifcText).toContain("FILE_SCHEMA(('IFC4'))")
    expect(ifcText).toContain('IFCPROJECT')
    expect(ifcText).toContain('IFCSITE')
    expect(ifcText).toContain('IFCBUILDING')
    expect(ifcText).toContain('IFCBUILDINGSTOREY')
    expect(ifcText).toContain('IFCSPACE')
    expect(ifcText).toContain('IFCWALL')
    expect(ifcText).toContain('IFCSLAB')
    expect(ifcText).toContain('IFCDOOR')
    expect(ifcText).toContain('IFCWINDOW')
    expect(ifcText).toContain('IFCROOF')
    expect(ifcText).toContain('Pset_PascalSource')
    expect(counts.IfcProject).toBe(1)
    expect(counts.IfcBuilding).toBe(1)
    expect(counts.IfcBuildingStorey).toBe(1)
    expect(counts.IfcSpace).toBe(spec.rooms.length)
    expect(counts.IfcWall).toBeGreaterThanOrEqual(4)
    expect(counts.IfcSlab).toBe(1)
    expect(counts.IfcDoor).toBe(spec.openings.exteriorDoors.length)
    expect(counts.IfcWindow).toBe(spec.openings.windows.length)
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

  test('uses an injected OBJ exporter when export is enabled', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pascal-bim-batch-'))
    const manifestPath = join(dir, 'manifest.jsonl')
    const outDir = join(dir, 'out')
    await writeFile(
      manifestPath,
      `${JSON.stringify({
        id: 'sample-obj',
        seed: 124,
        brief: 'A compact single-story house for OBJ export.',
        target: {
          buildingType: 'single_family_house',
          stories: 1,
          grossAreaM2: 70,
        },
      })}\n`,
    )

    const report = await runBimBatch({
      manifestPath,
      outDir,
      exportObj: true,
      objExporter: {
        async export(sampleDir) {
          const objPath = join(sampleDir, 'model.obj')
          await writeFile(objPath, '# mock obj\n')
          return { status: 'exported', path: objPath, message: 'exported by test adapter' }
        },
      },
    })

    expect(report.samples[0]?.obj.status).toBe('exported')
    expect(await readFile(join(outDir, 'samples', 'sample-obj', 'model.obj'), 'utf8')).toContain(
      'mock obj',
    )
  })

  test('marks the sample failed when requested OBJ export is skipped', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pascal-bim-batch-'))
    const manifestPath = join(dir, 'manifest.jsonl')
    const outDir = join(dir, 'out')
    await writeFile(
      manifestPath,
      `${JSON.stringify({
        id: 'sample-obj-skipped',
        seed: 125,
        brief: 'A compact single-story house for failed OBJ export.',
        target: {
          buildingType: 'single_family_house',
          stories: 1,
          grossAreaM2: 70,
        },
      })}\n`,
    )

    const report = await runBimBatch({
      manifestPath,
      outDir,
      exportObj: true,
      objExporter: {
        async export() {
          return { status: 'skipped', path: null, message: 'browser export unavailable' }
        },
      },
    })

    expect(report.summary.succeeded).toBe(0)
    expect(report.summary.failed).toBe(1)
    expect(report.samples[0]?.status).toBe('failed')
    expect(report.samples[0]?.error).toContain('browser export unavailable')
  })

  test('writes IFC output and validation when IFC export is enabled', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pascal-bim-batch-'))
    const manifestPath = join(dir, 'manifest.jsonl')
    const outDir = join(dir, 'out')
    await writeFile(
      manifestPath,
      `${JSON.stringify({
        id: 'sample-ifc-batch',
        seed: 127,
        brief: 'A compact single-story house for batch IFC export.',
        target: {
          buildingType: 'single_family_house',
          stories: 1,
          grossAreaM2: 70,
        },
      })}\n`,
    )

    const report = await runBimBatch({ manifestPath, outDir, exportObj: false, exportIfc: true })

    expect(report.summary.succeeded).toBe(1)
    expect(report.samples[0]?.ifc.status).toBe('exported')
    expect(report.samples[0]?.ifc.entityCounts?.IfcProject).toBe(1)
    expect(
      await readFile(join(outDir, 'samples', 'sample-ifc-batch', 'model.ifc'), 'utf8'),
    ).toContain('IFCPROJECT')
    expect(
      await readFile(join(outDir, 'samples', 'sample-ifc-batch', 'ifc-validation.json'), 'utf8'),
    ).toContain('IfcWall')
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

  test('parses browser OBJ export flags', () => {
    const options = parseBimBatchCliArgs([
      '--manifest',
      './manifest.jsonl',
      '--out',
      './out/bim-batch/dev',
      '--editor-url',
      'http://localhost:3002',
      '--headed',
    ])

    expect(options.editorBaseUrl).toBe('http://localhost:3002')
    expect(options.exportObj).toBe(true)
    expect(options.headless).toBe(false)
  })

  test('parses IFC export with JSON-only OBJ mode', () => {
    const options = parseBimBatchCliArgs([
      '--manifest',
      './manifest.jsonl',
      '--out',
      './out/bim-batch/dev',
      '--skip-obj',
      '--ifc',
    ])

    expect(options.exportObj).toBe(false)
    expect(options.exportIfc).toBe(true)
  })

  test('requires manifest and output flags', () => {
    expect(() => parseBimBatchCliArgs(['--manifest', './manifest.jsonl'])).toThrow('--out')
  })
})

describe('Browser OBJ scene upload', () => {
  test('continues when POST reports duplicate id but the editor can load the scene', async () => {
    const calls: Array<{ method: string; url: string }> = []
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ method: init?.method ?? 'GET', url: String(url) })
      if (init?.method === 'POST') {
        return new Response(JSON.stringify({ error: 'invalid' }), { status: 400 })
      }
      return new Response(JSON.stringify({ id: 'existing-scene' }), { status: 200 })
    }

    const result = await ensureEditorScene({
      editorBaseUrl: 'http://localhost:3002',
      sceneId: 'existing-scene',
      graph: { nodes: {}, rootNodeIds: [] },
      fetchImpl,
    })

    expect(result.ok).toBe(true)
    expect(calls).toEqual([
      { method: 'POST', url: 'http://localhost:3002/api/scenes' },
      { method: 'GET', url: 'http://localhost:3002/api/scenes/existing-scene' },
    ])
  })

  test('exports model.obj through the stable Node worker path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pascal-browser-obj-'))
    const sampleDir = join(dir, 'manual-smoke-001')
    await mkdir(sampleDir, { recursive: true })
    await writeFile(
      join(sampleDir, 'scene-graph.json'),
      JSON.stringify({ nodes: {}, rootNodeIds: [] }),
    )

    const exporter = new BrowserObjExporter({
      editorBaseUrl: 'http://localhost:3002',
      fetchImpl: async () =>
        new Response(JSON.stringify({ id: 'manual-smoke-001' }), { status: 201 }),
      nodeWorker: async ({ outputPath, sceneId }) => {
        expect(sceneId).toBe('manual-smoke-001')
        await writeFile(outputPath, '# stable obj\n')
      },
    })

    const result = await exporter.export(sampleDir)

    expect(result.status).toBe('exported')
    expect(result.path).toBe(join(sampleDir, 'model.obj'))
    expect(await readFile(join(sampleDir, 'model.obj'), 'utf8')).toContain('stable obj')
  })
})
