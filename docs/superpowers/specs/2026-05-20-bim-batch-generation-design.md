# BIM Batch Generation Design

Date: 2026-05-20

## Goal

Build a first-version automated pipeline that generates batches of single-story residential building models as Pascal-compatible JSON, then reuses the existing browser OBJ export path to produce OBJ files.

The pipeline prioritizes:

1. Geometry validity and export success.
2. Rich semantic metadata for auditing and later filtering.
3. Layout diversity through controlled parameters and seeds.

## Core Decision

The system will produce two JSON layers:

1. **BIM Spec JSON**
   - A high-level, human-readable blueprint.
   - Describes user intent, normalized parameters, rooms, dimensions, materials, openings, furniture intent, generation seed, and validation expectations.
   - Does **not** load directly into the Pascal browser editor.
   - Exists so generated samples can be audited, reproduced, debugged, and regenerated.

2. **Pascal SceneGraph JSON**
   - The execution and rendering layer.
   - Uses the same scene graph shape consumed by the current editor and MCP flow.
   - Can be loaded into the browser editor.
   - Is the JSON used for OBJ export.

The agreed flow is:

```text
jsonl/csv + brief
  -> BIM Spec JSON
  -> Pascal SceneGraph JSON
  -> browser render
  -> OBJ export
```

## Inputs

The first version will use a JSONL manifest as the primary batch input. CSV can be added later as an adapter that normalizes into the same manifest shape.

Each JSONL row represents one model request. The manifest schema should be conservative and easy to generate:

```json
{
  "id": "sample-0001",
  "seed": 1001,
  "brief": "A compact two-bedroom single-story house with a simple hip roof.",
  "target": {
    "buildingType": "single_family_house",
    "stories": 1,
    "grossAreaM2": 85,
    "bedrooms": 2,
    "bathrooms": 1,
    "style": "simple_modern"
  },
  "constraints": {
    "maxWidthM": 12,
    "maxDepthM": 10,
    "includeFurniture": true,
    "includeRoof": true
  }
}
```

Required fields:

- `id`
- `seed`
- `brief`
- `target.buildingType`
- `target.stories`
- `target.grossAreaM2`

Optional fields may be omitted and filled by deterministic defaults.

## Outputs

Each run writes a self-contained output directory:

```text
out/bim-batch/<run-id>/
  manifest.jsonl
  README.md
  report.md
  report.json
  samples/
    sample-0001/
      input.json
      bim-spec.json
      scene-graph.json
      model.obj
      validation.json
    sample-0002/
      input.json
      bim-spec.json
      scene-graph.json
      validation.json
```

If OBJ export fails for a sample, the pipeline keeps `input.json`, `bim-spec.json`, `scene-graph.json` when available, and records the failure in `validation.json`, `report.json`, and `report.md`.

## Pipeline

### 1. Manifest Normalization

Read each JSONL row, apply defaults, validate basic ranges, and attach a deterministic seed. Invalid rows fail early with clear row-level errors.

### 2. BIM Spec Generation

Generate a high-level model specification from the normalized row. The BIM Spec should include:

- Project metadata: `id`, `seed`, `brief`, generator version.
- Building envelope: width, depth, gross area, wall height, wall thickness.
- Room program: room names, room types, approximate target areas, adjacency hints.
- Layout strategy: rectangular or L-shaped footprint in later versions, room subdivision plan, circulation intent.
- Openings: exterior doors, interior doors, windows, placement policy.
- Materials: wall, floor, ceiling, roof, and optional furniture presets.
- Furniture intent: room-level furniture requirements, not exact Pascal item nodes unless needed.
- Validation expectations: allowed tolerances and required checks.

BIM Spec JSON is not a rendering format.

### 3. SceneGraph Conversion

Convert BIM Spec into Pascal SceneGraph JSON using existing schema patterns:

- `site`
- `building`
- one occupied `level`
- perimeter `wall` nodes
- interior `wall` nodes
- `slab`
- `ceiling`
- `zone` nodes for rooms
- `door` and `window` children attached to walls
- optional `roof`
- optional `item` furniture

The converter should prefer existing core schemas and MCP construction semantics where possible. It should not introduce editor-only concepts into core data.

### 4. Validation

Run validation before attempting OBJ export.

Required first-version checks:

- SceneGraph schema validation passes.
- Exactly one occupied level is present.
- Exterior shell is closed.
- Zones are inside the shell.
- Rooms do not intentionally overlap.
- Doors and windows attach to valid walls.
- Required rooms from the manifest are present.
- Scene has enough renderable geometry to export.

Validation produces both machine-readable and Markdown reports.

### 5. Browser OBJ Export

The first version reuses the existing browser export path:

- Load `scene-graph.json` into the editor.
- Wait until the scene renderer is ready.
- Use the existing `window.__pascalSceneReady()` readiness hook.
- Call the existing `window.__pascalExportOBJ()` export hook.
- Store the downloaded OBJ as `model.obj` under the sample directory.

This avoids rebuilding viewer geometry export in Node for the first version.

## First-Version Scope

In scope:

- CLI-first batch generation.
- JSONL manifest input.
- Natural-language `brief` as supplemental guidance.
- Deterministic generation via seed.
- Single-story residential buildings.
- Rectangular footprints for the initial implementation.
- Exterior walls, interior walls, slab, ceiling, zones, doors, windows.
- Optional simple roof.
- Optional basic furniture.
- BIM Spec JSON and Pascal SceneGraph JSON output.
- Validation reports.
- Browser-based OBJ export automation.

Out of scope for the first version:

- Direct browser rendering of BIM Spec JSON.
- Headless OBJ export from SceneGraph.
- Multi-story homes as a required deliverable.
- Commercial or public building types.
- Complex curved walls or non-rectangular freeform plans.
- Photographic floor-plan recognition.
- Full architectural code compliance.
- Perfect interior design or photorealistic furnishing.

## Extension Points

The design should leave clear room for later expansion:

- Add CSV input by converting rows into the manifest schema.
- Add multi-story support with levels, stairs, slab openings, and roof support levels.
- Add more footprint generators beyond rectangles.
- Add a headless OBJ exporter if browser automation becomes a bottleneck.
- Add an MCP tool wrapper that calls the same generator core used by the CLI.
- Add template- or corpus-driven manifest generation for large synthetic datasets.

## Package Placement

The generator should be CLI-first, with reusable core logic separated from the command entrypoint.

Recommended shape:

```text
packages/mcp/src/bim-generation/
  manifest-schema.ts
  bim-spec-schema.ts
  generate-bim-spec.ts
  scenegraph-converter.ts
  validate-generated-scene.ts
  batch-runner.ts
  browser-obj-exporter.ts
```

The exact file placement can be adjusted during implementation, but the design intent is:

- Keep Pascal scene data and pure generation logic separate from browser automation.
- Keep CLI orchestration thin.
- Make future MCP wrapping possible without duplicating generation logic.

## Architecture Constraints

- `packages/core` remains the owner of scene schemas and pure domain data.
- `packages/viewer` remains the owner of browser rendering and export-facing Three.js behavior.
- `packages/editor` remains the owner of editor/browser experience and existing export hooks.
- The batch generator may consume core schemas and generate SceneGraph JSON.
- The batch generator must not move editor-only or viewer-only concepts into core.
- Browser OBJ export automation should call existing editor hooks instead of duplicating renderer internals.

## Success Criteria

A successful first version can:

1. Read a small JSONL manifest with several single-story residential requests.
2. Generate one BIM Spec JSON per valid input row.
3. Generate one Pascal SceneGraph JSON per valid BIM Spec.
4. Validate each SceneGraph and report failures clearly.
5. Load valid SceneGraphs in the browser editor.
6. Export OBJ files through the existing browser export hook.
7. Produce a run-level Markdown report summarizing successes, failures, and sample paths.

## Open Implementation Questions

- Whether the initial CLI should live under `packages/mcp` package scripts or a root-level workspace script.
- Whether browser automation should use Playwright downloads directly or route through an app-specific export endpoint later.
- Whether furniture should be enabled by default or gated behind `constraints.includeFurniture`.
- How strict room overlap checks should be in the MVP when using rectangular room subdivision.
