# BIM Batch Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a CLI-first batch pipeline that turns JSONL residential model requests into auditable BIM Spec JSON, Pascal SceneGraph JSON, validation reports, and an extension point for browser OBJ export.

**Architecture:** Keep generation pure and testable under `packages/mcp/src/bim-generation/`. The batch runner orchestrates file IO and reports, while schema normalization, BIM Spec generation, SceneGraph conversion, and validation stay in focused modules that can later be wrapped by an MCP tool.

**Tech Stack:** TypeScript, Bun test, Zod v4, `@pascal-app/core` scene schemas, Node `fs/promises` and `path`.

---

## Non-Invasive Implementation Rule

This feature must be implemented as an additive module. Do not replace, rewrite, or restructure existing MCP, editor, viewer, or core flows. Existing code is reference material and dependency surface only.

Allowed changes:

- Add new files under `packages/mcp/src/bim-generation/`.
- Add tests under the same new folder.
- Add a thin CLI file under `packages/mcp/src/bin/`.
- Make the smallest possible `packages/mcp/package.json` change for a script/bin entry, if the CLI is included in this pass.

Avoid:

- Large edits to existing MCP tools.
- Changes to editor or viewer export internals.
- Moving schema ownership out of `packages/core`.
- Introducing compatibility shims or speculative abstractions.

## File Structure

- Create `packages/mcp/src/bim-generation/manifest-schema.ts`
  - Defines JSONL input schema, normalized manifest type, defaults, and line parser.
- Create `packages/mcp/src/bim-generation/bim-spec-schema.ts`
  - Defines BIM Spec JSON schema and exported types.
- Create `packages/mcp/src/bim-generation/generate-bim-spec.ts`
  - Converts a normalized manifest row into deterministic high-level BIM Spec JSON.
- Create `packages/mcp/src/bim-generation/scenegraph-converter.ts`
  - Converts BIM Spec JSON into Pascal SceneGraph JSON using core node `.parse()` factories.
- Create `packages/mcp/src/bim-generation/validate-generated-scene.ts`
  - Runs first-version structural checks against generated SceneGraph JSON.
- Create `packages/mcp/src/bim-generation/batch-runner.ts`
  - Reads JSONL, writes per-sample outputs, writes run-level `report.json` and `report.md`.
- Create `packages/mcp/src/bim-generation/index.ts`
  - Re-exports the public generation API for CLI and future MCP tool reuse.
- Create `packages/mcp/src/bin/pascal-bim-batch.ts`
  - Thin CLI entrypoint around `runBimBatch`.
- Modify `packages/mcp/package.json`
  - Add `pascal-bim-batch` bin and a `bim:batch` script.
- Create `packages/mcp/src/bim-generation/bim-generation.test.ts`
  - Covers manifest parsing, spec generation, SceneGraph conversion, validation, and batch output.

## Task 1: Manifest Schema

**Files:**
- Create: `packages/mcp/src/bim-generation/manifest-schema.ts`
- Test: `packages/mcp/src/bim-generation/bim-generation.test.ts`

- [ ] **Step 1: Write failing tests for manifest parsing**

```ts
import { describe, expect, test } from 'bun:test'
import { parseManifestLine } from './manifest-schema'

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/mcp/src/bim-generation/bim-generation.test.ts`

Expected: FAIL because `manifest-schema.ts` does not exist.

- [ ] **Step 3: Implement `manifest-schema.ts`**

Use Zod to parse one JSONL row, enforce first-version limits, and return normalized defaults.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/mcp/src/bim-generation/bim-generation.test.ts`

Expected: PASS for manifest parsing tests.

## Task 2: BIM Spec Schema And Generator

**Files:**
- Create: `packages/mcp/src/bim-generation/bim-spec-schema.ts`
- Create: `packages/mcp/src/bim-generation/generate-bim-spec.ts`
- Test: `packages/mcp/src/bim-generation/bim-generation.test.ts`

- [ ] **Step 1: Add failing tests for BIM Spec generation**

```ts
import { generateBimSpec } from './generate-bim-spec'

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/mcp/src/bim-generation/bim-generation.test.ts`

Expected: FAIL because BIM Spec modules do not exist.

- [ ] **Step 3: Implement the schema and generator**

Generate a rectangular envelope from target area and constraints. Generate room program for living, kitchen, bath, bedrooms, and circulation. Preserve `brief`, `seed`, and generation metadata.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/mcp/src/bim-generation/bim-generation.test.ts`

Expected: PASS for manifest and BIM Spec tests.

## Task 3: SceneGraph Converter

**Files:**
- Create: `packages/mcp/src/bim-generation/scenegraph-converter.ts`
- Test: `packages/mcp/src/bim-generation/bim-generation.test.ts`

- [ ] **Step 1: Add failing tests for SceneGraph conversion**

```ts
import { AnyNode } from '@pascal-app/core/schema'
import { convertBimSpecToSceneGraph } from './scenegraph-converter'

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/mcp/src/bim-generation/bim-generation.test.ts`

Expected: FAIL because `scenegraph-converter.ts` does not exist.

- [ ] **Step 3: Implement the converter**

Use core schemas: `SiteNode`, `BuildingNode`, `LevelNode`, `WallNode`, `SlabNode`, `CeilingNode`, `ZoneNode`, `DoorNode`, and `WindowNode`. Keep all geometry rectangular and deterministic in the first version.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/mcp/src/bim-generation/bim-generation.test.ts`

Expected: PASS for SceneGraph conversion.

## Task 4: Generated Scene Validation

**Files:**
- Create: `packages/mcp/src/bim-generation/validate-generated-scene.ts`
- Test: `packages/mcp/src/bim-generation/bim-generation.test.ts`

- [ ] **Step 1: Add failing validation tests**

```ts
import { validateGeneratedScene } from './validate-generated-scene'

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/mcp/src/bim-generation/bim-generation.test.ts`

Expected: FAIL because validation module does not exist.

- [ ] **Step 3: Implement validation**

Check schema parsing, single occupied level, closed exterior wall shell, required room zones, wall-attached openings, and renderable node count.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/mcp/src/bim-generation/bim-generation.test.ts`

Expected: PASS for validation.

## Task 5: Batch Runner And Reports

**Files:**
- Create: `packages/mcp/src/bim-generation/batch-runner.ts`
- Create: `packages/mcp/src/bim-generation/index.ts`
- Test: `packages/mcp/src/bim-generation/bim-generation.test.ts`

- [ ] **Step 1: Add failing batch output test**

```ts
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runBimBatch } from './batch-runner'

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
  expect(await readFile(join(outDir, 'samples', 'sample-0005', 'bim-spec.json'), 'utf8')).toContain(
    'pascal-bim-spec',
  )
  expect(await readFile(join(outDir, 'samples', 'sample-0005', 'scene-graph.json'), 'utf8')).toContain(
    '"nodes"',
  )
  expect(await readFile(join(outDir, 'report.md'), 'utf8')).toContain('sample-0005')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/mcp/src/bim-generation/bim-generation.test.ts`

Expected: FAIL because `runBimBatch` does not exist.

- [ ] **Step 3: Implement batch runner**

Read manifest lines, generate each sample, write `input.json`, `bim-spec.json`, `scene-graph.json`, `validation.json`, `report.json`, `report.md`, and `README.md`. Support `exportObj: false` for JSON-only runs.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/mcp/src/bim-generation/bim-generation.test.ts`

Expected: PASS for batch runner.

## Task 6: CLI Entrypoint

**Files:**
- Create: `packages/mcp/src/bin/pascal-bim-batch.ts`
- Modify: `packages/mcp/package.json`
- Test: `packages/mcp/src/bim-generation/bim-generation.test.ts`

- [ ] **Step 1: Add a package-level script and bin design**

Add:

```json
{
  "bin": {
    "pascal-mcp": "./dist/bin/pascal-mcp.js",
    "pascal-bim-batch": "./dist/bin/pascal-bim-batch.js"
  },
  "scripts": {
    "bim:batch": "bun src/bin/pascal-bim-batch.ts"
  }
}
```

- [ ] **Step 2: Implement CLI parsing**

Support:

```bash
bun packages/mcp/src/bin/pascal-bim-batch.ts --manifest ./manifest.jsonl --out ./out/bim-batch/dev --skip-obj
```

Required flags:

- `--manifest <path>`
- `--out <path>`

Optional flags:

- `--skip-obj`

- [ ] **Step 3: Run a sample CLI smoke test**

Run: create a temporary manifest, then execute the command above with `--skip-obj`.

Expected: exit code 0 and output report path.

## Task 7: Browser OBJ Export Adapter Placeholder

**Files:**
- Create or extend: `packages/mcp/src/bim-generation/browser-obj-exporter.ts`
- Modify: `packages/mcp/src/bim-generation/batch-runner.ts`

- [ ] **Step 1: Add explicit export adapter boundary**

Create an `ObjExportAdapter` interface with a default `NotConfiguredObjExporter` that records a skipped OBJ export when `exportObj` is false.

- [ ] **Step 2: Wire batch runner to the adapter**

Keep JSON-only operation stable. Make browser OBJ export an explicit follow-up adapter instead of mixing Playwright directly into pure generation logic.

- [ ] **Step 3: Verify JSON-only batches still pass**

Run: `bun test packages/mcp/src/bim-generation/bim-generation.test.ts`

Expected: PASS.

## Verification

Run:

```bash
bun test packages/mcp/src/bim-generation/bim-generation.test.ts
bun run --cwd packages/mcp build
```

Expected:

- BIM generation tests pass.
- MCP package builds without TypeScript errors.

## Scope Notes

This plan executes the first stable core of the approved design: manifest normalization, BIM Spec JSON, Pascal SceneGraph JSON, validation, reports, CLI entrypoint, and a clean OBJ export boundary. Full Playwright-driven browser OBJ automation remains behind the adapter boundary so it can be implemented without changing generation semantics.
