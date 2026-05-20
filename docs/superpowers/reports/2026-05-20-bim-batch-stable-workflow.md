# BIM Batch Stable Workflow

Date: 2026-05-20
Branch: `OBJ514`

## Purpose

This document fixes the stable workflow for generating Pascal building scenes from batch input and exporting OBJ files.

The reliable path is:

```text
manifest.jsonl
  -> BIM Spec JSON
  -> Pascal SceneGraph JSON
  -> editor SceneStore save/check
  -> browser-rendered scene
  -> __pascalExportOBJ()
  -> model.obj
```

`BIM Spec JSON` is the auditable high-level building specification. It is not directly renderable.

`Pascal SceneGraph JSON` is the renderable Pascal model layer. It must be saved into the same SceneStore that the browser editor reads before OBJ export can work.

## Stable Conditions

The workflow is considered stable only when all conditions below are true:

1. The editor dev server is reachable.
2. The generated SceneGraph can be saved through `POST /api/scenes`.
3. The same scene can be loaded through `GET /api/scenes/<scene-id>`.
4. The browser page `/scene/<scene-id>` exposes `window.__pascalExportOBJ`.
5. `window.__pascalSceneReady()` returns `true`.
6. OBJ download is captured and saved as `model.obj`.
7. The generated OBJ has a sane coordinate range.

## SceneStore Requirement

The editor and generation/export process must use the same SceneStore.

The default database path observed in this workspace is:

```text
C:\Users\rt do believe\AppData\Roaming\Pascal\data\pascal.db
```

If a custom store is needed, start both MCP/editor-side processes with the same `PASCAL_DATA_DIR` or `PASCAL_DB_PATH`.

If SceneStore paths differ, the usual symptom is:

```text
MCP or script reports save success, but /scene/<scene-id> shows Scene not found.
```

## Start Editor

Use the editor dev server:

```powershell
bun run --cwd apps/editor dev
```

In this workspace the server runs at:

```text
http://localhost:3002
```

Check the API is reachable:

```powershell
bun -e "const r = await fetch('http://localhost:3002/api/scenes?limit=1'); console.log(r.status)"
```

Expected:

```text
200
```

## Run Stable Batch Export

Generate JSON, save the scene into the editor SceneStore, open it in the browser, and export OBJ:

```powershell
bun packages/mcp/src/bin/pascal-bim-batch.ts --manifest out\bim-batch\manual-smoke\manifest.jsonl --out out\bim-batch\manual-smoke-stable --editor-url http://localhost:3002
```

Expected summary:

```json
{
  "outDir": "out\\bim-batch\\manual-smoke-stable",
  "total": 1,
  "succeeded": 1,
  "failed": 0,
  "report": "out\\bim-batch\\manual-smoke-stable/report.md"
}
```

The stable implementation saves/loads the scene through the editor API, then delegates browser OBJ export to a Node worker process. This avoids the observed Bun + Playwright Chromium launch hang.

## Output Layout

For sample `manual-smoke-001`, the stable output is:

```text
out/bim-batch/manual-smoke-stable/manifest.jsonl
out/bim-batch/manual-smoke-stable/report.md
out/bim-batch/manual-smoke-stable/report.json
out/bim-batch/manual-smoke-stable/README.md
out/bim-batch/manual-smoke-stable/samples/manual-smoke-001/input.json
out/bim-batch/manual-smoke-stable/samples/manual-smoke-001/bim-spec.json
out/bim-batch/manual-smoke-stable/samples/manual-smoke-001/scene-graph.json
out/bim-batch/manual-smoke-stable/samples/manual-smoke-001/validation.json
out/bim-batch/manual-smoke-stable/samples/manual-smoke-001/model.obj
```

Primary files:

- `bim-spec.json`: high-level auditable BIM Spec.
- `scene-graph.json`: Pascal-renderable SceneGraph.
- `validation.json`: generated-scene validation result.
- `model.obj`: browser-exported OBJ.
- `report.json`: machine-readable batch result.
- `report.md`: human-readable batch result.

## Verified Result

The stable smoke run produced:

```text
out/bim-batch/manual-smoke-stable/samples/manual-smoke-001/model.obj
```

OBJ verification:

```json
{
  "bytes": 342284,
  "vertices": 2984,
  "faces": 1275,
  "yRange": [-0.05000000000000333, 2.8749999991059303],
  "abnormalY": false
}
```

The Y range does not show the earlier abnormal million-level Y offset.

## Implementation Notes

The stable code path lives in:

```text
packages/mcp/src/bim-generation/browser-obj-exporter.ts
```

Important behavior:

- `ensureEditorScene()` first tries `POST /api/scenes`.
- If the API returns HTTP 400 for an existing id, it confirms the scene with `GET /api/scenes/<scene-id>`.
- OBJ export runs in a spawned Node worker process.
- The worker opens `/scene/<scene-id>`, waits for `__pascalExportOBJ`, waits for `__pascalSceneReady()`, waits an extra 2 seconds, then captures the OBJ download.

This keeps the batch CLI stable while still reusing the browser exporter path that matches manual editor export.

## Fallback Command

The legacy debug script can still be used as an independent fallback:

```powershell
$env:PASCAL_EXPORT_DIR='out\bim-batch\manual-smoke-stable\samples\manual-smoke-001'
$env:PASCAL_URL='http://localhost:3002'
node codex\batch-export-obj.mjs manual-smoke-001
```

This script exports:

```text
out/bim-batch/manual-smoke-stable/samples/manual-smoke-001/manual-smoke-001.obj
```

The stable batch CLI exports:

```text
out/bim-batch/manual-smoke-stable/samples/manual-smoke-001/model.obj
```

## Troubleshooting

If `POST /api/scenes` fails:

- Check that `scene-graph.json` validates against Pascal node schemas.
- Check the HTTP response details in the batch report.
- If the scene id already exists, verify that `GET /api/scenes/<scene-id>` returns 200.

If `/scene/<scene-id>` shows `Scene not found`:

- The editor and generator are probably using different SceneStore paths.
- Set the same `PASCAL_DATA_DIR` or `PASCAL_DB_PATH` for both processes.

If OBJ export times out:

- Confirm the editor page exposes `window.__pascalExportOBJ`.
- Confirm `window.__pascalSceneReady()` returns `true`.
- Check `apps/editor/.next/dev/logs/next-development.log`.
- Use the fallback `node codex\batch-export-obj.mjs <scene-id>` command to isolate whether the issue is the batch wrapper or the editor page.

If OBJ coordinates are abnormal:

- Re-check the level transform export fixes in `packages/viewer/src/systems/level/level-system.tsx`.
- Re-check export snapping in `packages/editor/src/components/editor/export-manager.tsx`.
- Verify the OBJ Y range after export.

## Verification Commands

Run focused tests:

```powershell
bun test packages/mcp/src/bim-generation/bim-generation.test.ts
```

Run MCP package build:

```powershell
bun run --cwd packages/mcp build
```

Run formatter/static check for changed files:

```powershell
bunx biome check packages/mcp/src/bim-generation/browser-obj-exporter.ts packages/mcp/src/bim-generation/bim-generation.test.ts
```

Run stable smoke export:

```powershell
bun packages/mcp/src/bin/pascal-bim-batch.ts --manifest out\bim-batch\manual-smoke\manifest.jsonl --out out\bim-batch\manual-smoke-stable --editor-url http://localhost:3002
```
