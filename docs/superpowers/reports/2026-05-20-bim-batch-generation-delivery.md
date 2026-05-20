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

No `model.obj` file has been successfully saved in this workspace yet.

Expected OBJ path after a successful browser export:

```text
out/bim-batch/manual-smoke/samples/manual-smoke-001/model.obj
```

What happened during validation:

1. JSON-only generation succeeded.
2. The editor dev server initially failed inside the sandbox with `spawn EPERM`.
3. After running the editor with elevated permissions, the server became reachable at `http://localhost:3002`.
4. A browser export attempt was made with:

```powershell
bun packages/mcp/src/bin/pascal-bim-batch.ts --manifest out\bim-batch\manual-smoke\manifest.jsonl --out out\bim-batch\manual-smoke --editor-url http://localhost:3002
```

5. Playwright required elevated permissions to launch Chromium.
6. After elevating Playwright, the generated SceneGraph validation still passed, but the editor upload/export path did not produce `model.obj`.

The current implementation now treats requested OBJ export as failed unless the browser exporter returns `status: "exported"`. This prevents OBJ export failures from being counted as fully successful samples.

## Current Scope Boundary

The delivered core is ready for JSON dataset generation and validation. Browser OBJ export has an adapter and CLI path, but the real end-to-end OBJ artifact still needs one more environment-level/export-path debugging pass before it can be claimed as producing saved OBJ files reliably on this machine.
