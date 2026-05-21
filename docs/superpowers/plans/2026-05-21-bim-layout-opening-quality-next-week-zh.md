# BIM Layout And Opening Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 BIM 批量生成 v1 中门窗坐标不严谨和房间条带化的问题，并为下一周的楼梯、屋顶、对齐、多样性增强建立可执行范围。

**Architecture:** 保持现有批量链路不大改：`manifest.jsonl -> BIM Spec -> Pascal SceneGraph -> OBJ/IFC` 继续成立。修复优先落在 `packages/mcp/src/bim-generation/`，只复用已有 MCP 几何工具和 SceneGraph schema，不替换 editor/viewer/core 的渲染逻辑。

**Tech Stack:** TypeScript, Bun test, Zod, Pascal SceneGraph, `@pascal-app/core` schemas, existing MCP geometry helpers.

---

## Scope Decision

这次确认的维修方案分两层。

第一层是 v1 稳定性修复，优先级最高：

- 修复 batch converter 中门窗坐标系。
- 明确 door/window 必须使用墙局部坐标。
- 保持当前 OBJ/IFC 导出流程不变。
- 用测试证明窗户不是只在关系上挂墙，而是在坐标上也能被 wall renderer 正确解释。

第二层是下周质量增强，优先级次之：

- 把当前一维条带房间切分改为二维布局。
- 加入更真实的 room adjacency 和 hallway/circulation 规则。
- 为楼梯、屋顶、对齐、开口分配建立独立任务，不一次性塞进 v1 修复。

## Confirmed Technical Diagnosis

### 1. 条带状房间的原因

当前 `generate-bim-spec.ts` 的 `layoutRooms()` 沿 X 轴推进 `cursorX`，每个房间 polygon 都从 `-depth / 2` 到 `depth / 2`，因此每个房间都会贯穿整栋房子的深度。

这不是浏览器问题，也不是 OBJ 导出问题，而是 v1 generator 的确定性布局策略。

### 2. 窗户看起来没安到墙上的原因

当前 `scenegraph-converter.ts` 在创建 window/door 时写入了：

```ts
parentId: wall.id,
wallId: wall.id,
position: openingPositionOnWall(wall.start, wall.end, t, height)
```

这里的 `position` 是世界坐标。

但现有 MCP `add_window` 工具写入的是：

```ts
position: [localX, sillHeight + height / 2, 0]
```

这个 `position` 是墙局部坐标。`WindowNode` schema 也说明 window position 是 wall-local coordinate system。

因此修复方案必须统一为墙局部坐标，而不是在已有 world coordinate 写法上微调。

## File Structure

- Modify `packages/mcp/src/bim-generation/scenegraph-converter.ts`
  - Add local helper functions for wall length and local opening placement, or import the existing helper from `packages/mcp/src/tools/geometry.ts` if package boundaries remain clean.
  - Convert door/window positions from world coordinates to wall-local `[localX, centerY, 0]`.

- Modify `packages/mcp/src/bim-generation/generate-bim-spec.ts`
  - Keep v1 opening spec format as `{ wall, t, widthM, heightM, sillHeightM }`.
  - Add no complex layout changes in the door/window repair commit.

- Modify `packages/mcp/src/bim-generation/bim-generation.test.ts`
  - Add failing tests for window and door wall-local coordinate correctness.
  - Add regression assertions for east/west walls because those expose the bug most clearly.

- Later modify `packages/mcp/src/bim-generation/generate-bim-spec.ts`
  - Replace `layoutRooms()` with a deterministic two-dimensional layout planner.
  - Preserve existing schema output so downstream SceneGraph/IFC/export code does not change.

- Later optionally create `packages/mcp/src/bim-generation/layout-planner.ts`
  - Extract two-dimensional layout planning if `generate-bim-spec.ts` becomes too dense.

## Task 1: Repair Door And Window Coordinates

**Files:**
- Modify: `packages/mcp/src/bim-generation/scenegraph-converter.ts`
- Modify: `packages/mcp/src/bim-generation/bim-generation.test.ts`
- Reference: `packages/mcp/src/tools/room-tools.ts`
- Reference: `packages/mcp/src/tools/geometry.ts`
- Reference: `packages/core/src/schema/nodes/window.ts`

- [ ] **Step 1: Write failing test for wall-local window coordinates**

Add a test that converts a medium sample into SceneGraph and checks every window:

```ts
test('converts BIM windows to wall-local coordinates', () => {
  const spec = generateBimSpec(
    parseManifestLine(
      JSON.stringify({
        id: 'window-local-test',
        seed: 1,
        brief: 'A medium house with windows on all exterior walls.',
        target: {
          buildingType: 'single_family_house',
          stories: 1,
          grossAreaM2: 96,
          bedrooms: 2,
          bathrooms: 2,
        },
        constraints: { includeRoof: true, includeFurniture: false },
      }),
      1,
    ),
  )

  const graph = convertBimSpecToSceneGraph(spec)
  const windows = Object.values(graph.nodes).filter((node) => node.type === 'window')

  expect(windows.length).toBe(spec.openings.windows.length)
  for (const windowNode of windows) {
    const wall = graph.nodes[windowNode.wallId as keyof typeof graph.nodes]
    expect(wall?.type).toBe('wall')
    if (!wall || wall.type !== 'wall') continue

    const length = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1])
    expect(windowNode.position[0]).toBeGreaterThanOrEqual(windowNode.width / 2)
    expect(windowNode.position[0]).toBeLessThanOrEqual(length - windowNode.width / 2)
    expect(windowNode.position[2]).toBe(0)
  }
})
```

- [ ] **Step 2: Run the test and confirm current failure**

Run:

```powershell
bun test packages/mcp/src/bim-generation/bim-generation.test.ts
```

Expected: the new test fails for at least east/west wall windows because current positions use world X/Z values.

- [ ] **Step 3: Implement wall-local opening placement**

In `scenegraph-converter.ts`, replace world-coordinate opening placement with helpers equivalent to:

```ts
function wallLength(start: [number, number], end: [number, number]): number {
  return Math.hypot(end[0] - start[0], end[1] - start[1])
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return (min + max) / 2
  return Math.max(min, Math.min(max, value))
}

function openingLocalXOnWall(
  wall: { start: [number, number]; end: [number, number] },
  t: number,
  width: number,
): number {
  const length = wallLength(wall.start, wall.end)
  return clamp(t * length, width / 2, length - width / 2)
}

function openingLocalPositionOnWall(
  wall: { start: [number, number]; end: [number, number] },
  t: number,
  width: number,
  centerY: number,
): [number, number, number] {
  return [openingLocalXOnWall(wall, t, width), centerY, 0]
}
```

Use it for doors:

```ts
position: openingLocalPositionOnWall(wall, exteriorDoor.t, exteriorDoor.widthM, 1.05)
```

Use it for windows:

```ts
position: openingLocalPositionOnWall(
  wall,
  windowSpec.t,
  windowSpec.widthM,
  windowSpec.sillHeightM + windowSpec.heightM / 2,
)
```

- [ ] **Step 4: Run tests**

Run:

```powershell
bun test packages/mcp/src/bim-generation/bim-generation.test.ts
```

Expected: all BIM generation tests pass.

- [ ] **Step 5: Regenerate a smoke sample**

Run:

```powershell
bun packages/mcp/src/bin/pascal-bim-batch.ts --manifest out\bim-batch\manual-smoke\manifest.jsonl --out out\bim-batch\manual-smoke-opening-fix --editor-url http://localhost:3002
```

Expected:

```json
{
  "total": 1,
  "succeeded": 1,
  "failed": 0
}
```

- [ ] **Step 6: Commit**

Commit message:

```powershell
git add packages/mcp/src/bim-generation/scenegraph-converter.ts packages/mcp/src/bim-generation/bim-generation.test.ts
git commit -m "fix: use wall-local BIM opening coordinates"
```

## Task 2: Re-run The 20 Sample Batch After Opening Fix

**Files:**
- Generated output: `out/bim-batch/small-batch-001-opening-fix/`
- No source changes expected.

- [ ] **Step 1: Run 20-row OBJ batch**

Run:

```powershell
bun packages/mcp/src/bin/pascal-bim-batch.ts --manifest out\bim-batch\manifests\small-batch-001.jsonl --out out\bim-batch\small-batch-001-opening-fix --editor-url http://localhost:3002
```

Expected:

```json
{
  "total": 20,
  "succeeded": 20,
  "failed": 0
}
```

- [ ] **Step 2: Inspect representative scenes**

Open:

```text
http://localhost:3002/scene/small-batch-001-compact-01
http://localhost:3002/scene/small-batch-001-medium-06
```

Expected: windows are visually embedded in exterior walls. East/west wall windows should not float inward/outward or appear shifted along the wrong axis.

- [ ] **Step 3: Compare OBJ metrics**

Run a vertex/face count check against:

```text
out/bim-batch/small-batch-001-opening-fix/samples/*/model.obj
```

Expected: every sample exports a non-empty OBJ. Changes in vertex/face counts are acceptable because correct window cutouts can alter wall geometry.

## Task 3: Replace One-Dimensional Strip Layout With Two-Dimensional Layout

**Files:**
- Modify: `packages/mcp/src/bim-generation/generate-bim-spec.ts`
- Optional create: `packages/mcp/src/bim-generation/layout-planner.ts`
- Modify: `packages/mcp/src/bim-generation/bim-generation.test.ts`

- [ ] **Step 1: Write failing test for non-strip rooms**

Add a test asserting not every room spans full depth:

```ts
test('generates a two-dimensional room layout instead of full-depth strips', () => {
  const spec = generateBimSpec(
    parseManifestLine(
      JSON.stringify({
        id: 'two-dimensional-layout-test',
        seed: 2,
        brief: 'A practical three-bedroom medium house.',
        target: {
          buildingType: 'single_family_house',
          stories: 1,
          grossAreaM2: 100,
          bedrooms: 3,
          bathrooms: 2,
        },
        constraints: { includeRoof: true, includeFurniture: false },
      }),
      1,
    ),
  )

  const fullDepthRooms = spec.rooms.filter((room) => {
    const zs = room.polygon.map((point) => point[1])
    return Math.min(...zs) === -spec.building.depthM / 2 && Math.max(...zs) === spec.building.depthM / 2
  })

  expect(fullDepthRooms.length).toBeLessThan(spec.rooms.length)
})
```

- [ ] **Step 2: Implement deterministic two-zone layout**

Use a conservative first version:

- living and kitchen occupy a public band.
- bedrooms and bathrooms occupy a private band.
- circulation/hall occupies a connector strip.
- All room polygons remain rectangles.
- All rectangles stay inside the building footprint.
- Room dimensions are clamped to minimum width/depth.

- [ ] **Step 3: Add geometry validation tests**

Check:

```ts
expect(validateGeneratedScene(convertBimSpecToSceneGraph(spec), spec).valid).toBe(true)
```

Also assert each room polygon is inside `spec.footprint`.

- [ ] **Step 4: Run tests**

Run:

```powershell
bun test packages/mcp/src/bim-generation/bim-generation.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Generate comparison batch**

Run:

```powershell
bun packages/mcp/src/bin/pascal-bim-batch.ts --manifest out\bim-batch\manifests\small-batch-001.jsonl --out out\bim-batch\small-batch-001-layout-v2 --skip-obj --ifc
```

Expected:

```json
{
  "total": 20,
  "succeeded": 20,
  "failed": 0
}
```

## Task 4: Roof Quality Pass

**Files:**
- Modify: `packages/mcp/src/bim-generation/bim-spec-schema.ts`
- Modify: `packages/mcp/src/bim-generation/generate-bim-spec.ts`
- Modify: `packages/mcp/src/bim-generation/scenegraph-converter.ts`
- Modify: `packages/mcp/src/bim-generation/ifc-exporter.ts`
- Modify: `packages/mcp/src/bim-generation/bim-generation.test.ts`

- [ ] **Step 1: Decide v1 roof scope**

Keep roof simple for next week:

- `flat` or `gable` only.
- roof footprint aligned to building footprint.
- roof overhang is deterministic.
- IFC roof remains simplified and semantic.

- [ ] **Step 2: Add roof spec fields**

Add optional roof object:

```ts
roof: {
  type: 'flat' | 'gable'
  overhangM: number
  heightM: number
}
```

- [ ] **Step 3: Add tests for roof presence and alignment**

Assert:

- when `includeRoof=true`, SceneGraph includes roof or roof-equivalent node if supported.
- roof footprint bounds contain the wall footprint with expected overhang.
- IFC still contains `IfcRoof`.

- [ ] **Step 4: Run JSON + IFC test**

Run:

```powershell
bun packages/mcp/src/bin/pascal-bim-batch.ts --manifest out\bim-batch\manifests\small-batch-001.jsonl --out out\bim-batch\small-batch-001-roof-check --skip-obj --ifc
```

Expected: `20/20` success and every `model.ifc` contains `IfcRoof`.

## Task 5: Stairs As A Separate Future Track

**Files:**
- Future modify: `packages/mcp/src/bim-generation/bim-spec-schema.ts`
- Future modify: `packages/mcp/src/bim-generation/generate-bim-spec.ts`
- Future modify: `packages/mcp/src/bim-generation/scenegraph-converter.ts`
- Future modify: `packages/mcp/src/bim-generation/ifc-exporter.ts`

- [ ] **Step 1: Do not add stairs to single-story v1 samples**

Keep stairs out of the immediate repair unless `stories > 1`.

- [ ] **Step 2: Add stairs only after multi-story layout exists**

Required preconditions:

- BIM Spec supports `stories > 1` layout.
- SceneGraph has two levels.
- Slab/ceiling opening rules are defined.
- IFC export can represent stair product or at least semantic placeholder.

- [ ] **Step 3: Create separate stair plan before implementation**

Write a separate plan before coding stairs because it touches levels, slabs, ceilings, openings, and IFC semantics.

## Task 6: Documentation And Weekly Report Update

**Files:**
- Modify: `docs/superpowers/reports/2026-05-20-bim-batch-weekly-report-zh.md`
- Modify: `docs/superpowers/reports/2026-05-20-bim-batch-stable-workflow-zh.md`

- [ ] **Step 1: Document confirmed limitation**

Add a section explaining:

- current v1 layout used one-dimensional strips.
- door/window node relationships were present.
- door/window positions needed to be wall-local.

- [ ] **Step 2: Document fixed workflow after implementation**

After Task 1 and Task 2 pass, update workflow docs with:

```text
manifest.jsonl -> BIM Spec -> SceneGraph with wall-local openings -> OBJ/IFC
```

- [ ] **Step 3: Add before/after output paths**

Record:

```text
out/bim-batch/small-batch-001/
out/bim-batch/small-batch-001-opening-fix/
out/bim-batch/small-batch-001-layout-v2/
```

## Next Week Priority Order

1. Fix door/window wall-local coordinates.
2. Re-run one-sample and 20-sample OBJ batch to verify visual correctness.
3. Replace strip layout with deterministic two-dimensional layout.
4. Re-run JSON + IFC batch for layout v2.
5. Add roof quality pass if time remains.
6. Defer stairs to a separate multi-story phase unless the user explicitly switches scope.

## Acceptance Criteria

- Door/window SceneGraph positions use wall-local coordinates.
- East/west windows no longer use world X/Z values as local wall positions.
- Existing OBJ and IFC commands still run.
- Compact and medium samples differ not only by size and room count, but also by room arrangement.
- Generated outputs remain auditable through `input.json`, `bim-spec.json`, `scene-graph.json`, `validation.json`, `model.obj`, and `model.ifc`.
- Documentation clearly states v1 limitations and the next quality target.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-21-bim-layout-opening-quality-next-week-zh.md`.

Recommended execution mode: inline TDD for Task 1 and Task 2, then a checkpoint before implementing Task 3. This keeps the correctness repair separate from visual-quality expansion.
