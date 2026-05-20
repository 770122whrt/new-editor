# BIM Batch Generation Delivery Report

Date: 2026-05-20
Branch: `OBJ514`

## Implemented

The BIM batch generation feature was implemented additively under:

```text
packages/mcp/src/bim-generation/
```

Existing MCP, editor, viewer, and core flows were not rewritten. The only connection outside the new folder is a thin CLI entrypoint and package script/bin registration.

Implemented modules:

- `manifest-schema.ts`: JSONL row parser, validation, and deterministic defaults.
- `bim-spec-schema.ts`: high-level BIM Spec JSON schema.
- `generate-bim-spec.ts`: manifest row to BIM Spec generator.
- `scenegraph-converter.ts`: BIM Spec to Pascal SceneGraph JSON converter.
- `validate-generated-scene.ts`: first-version generated-scene validation.
- `batch-runner.ts`: batch orchestration and report writing.
- `browser-obj-exporter.ts`: browser-based OBJ export adapter boundary.
- `cli-options.ts`: CLI argument parsing.
- `index.ts`: public exports for CLI and future MCP wrapper reuse.
- `packages/mcp/src/bin/pascal-bim-batch.ts`: CLI entrypoint.

Package wiring:

- `packages/mcp/package.json` adds `pascal-bim-batch` to `bin`.
- `packages/mcp/package.json` adds `bim:batch`.

## JSON Layers

The implementation preserves the agreed two-layer model:

- `bim-spec.json` is the high-level audit/spec layer and is not directly renderable in the browser.
- `scene-graph.json` is the Pascal-renderable model JSON, compatible with the existing editor/MCP scene graph shape.

## Typical Commands

Generate JSON outputs only:

```powershell
bun packages/mcp/src/bin/pascal-bim-batch.ts --manifest out\bim-batch\manual-smoke\manifest.jsonl --out out\bim-batch\manual-smoke --skip-obj
```

Generate JSON and attempt browser OBJ export through a running editor:

```powershell
bun packages/mcp/src/bin/pascal-bim-batch.ts --manifest out\bim-batch\manual-smoke\manifest.jsonl --out out\bim-batch\manual-smoke --editor-url http://localhost:3002
```

Start the editor dev server for browser export:

```powershell
bun run --cwd apps/editor dev
```

Run the focused tests:

```powershell
bun test packages/mcp/src/bim-generation/bim-generation.test.ts
```

Run package build:

```powershell
bun run --cwd packages/mcp build
```

Run formatting/static check for changed files:

```powershell
bunx biome check packages/mcp/src/bim-generation packages/mcp/src/bin/pascal-bim-batch.ts packages/mcp/package.json
```

## Verification Performed

Fresh verification commands were run after the latest code changes:

```text
bun test packages/mcp/src/bim-generation/bim-generation.test.ts
```

Result:

```text
11 pass
0 fail
62 expect() calls
```

```text
bun run --cwd packages/mcp build
```

Result:

```text
tsc --build
```

Exit code was `0`.

```text
bunx biome check packages/mcp/src/bim-generation packages/mcp/src/bin/pascal-bim-batch.ts packages/mcp/package.json
```

Result:

```text
Checked 12 files. No fixes applied.
```

The JSON-only CLI smoke test also succeeded:

```text
total: 1
succeeded: 1
failed: 0
report: out\bim-batch\manual-smoke/report.md
```

## Test JSON Artifacts

The local smoke-test artifacts are ignored by git under `out/`, but they exist in this workspace:

```text
out/bim-batch/manual-smoke/manifest.jsonl
out/bim-batch/manual-smoke/report.md
out/bim-batch/manual-smoke/report.json
out/bim-batch/manual-smoke/samples/manual-smoke-001/input.json
out/bim-batch/manual-smoke/samples/manual-smoke-001/bim-spec.json
out/bim-batch/manual-smoke/samples/manual-smoke-001/scene-graph.json
out/bim-batch/manual-smoke/samples/manual-smoke-001/validation.json
```

The key generated JSON files are:

- BIM Spec JSON: `out/bim-batch/manual-smoke/samples/manual-smoke-001/bim-spec.json`
- Pascal SceneGraph JSON: `out/bim-batch/manual-smoke/samples/manual-smoke-001/scene-graph.json`

## OBJ Artifact Status

Updated on 2026-05-20: the stable browser OBJ workflow is now verified.

The successful stable output path is:

```text
out/bim-batch/manual-smoke-stable/samples/manual-smoke-001/model.obj
```

The stable run used:

```powershell
bun packages/mcp/src/bin/pascal-bim-batch.ts --manifest out\bim-batch\manual-smoke\manifest.jsonl --out out\bim-batch\manual-smoke-stable --editor-url http://localhost:3002
```

Result:

```text
total: 1
succeeded: 1
failed: 0
```

OBJ verification:

```text
bytes: 342284
vertices: 2984
faces: 1275
Y range: -0.05000000000000333 ~ 2.8749999991059303
abnormalY: false
```

The fixed workflow is documented in:

```text
docs/superpowers/reports/2026-05-20-bim-batch-stable-workflow.md
```

## Current Scope Boundary

The delivered core is ready for JSON dataset generation, SceneGraph validation, browser SceneStore save/load, and browser-backed OBJ export. OBJ export depends on a reachable editor dev server and a shared SceneStore.
