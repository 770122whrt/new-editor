# BIM 批量生成与 OBJ/IFC 导出阶段周报

汇报日期：2026-05-20

## 一、本周目标

本周主要完成了一个自动化闭环：用结构化输入批量生成建筑场景 JSON，通过浏览器渲染流程导出 OBJ 模型文件，并进一步导出带基础 BIM 语义的 IFC 文件。

这项工作的重点不是手工建模，而是把“输入数据 -> 建筑语义 JSON -> 可渲染场景 JSON -> OBJ/IFC 文件”的流程跑通，为后续批量生成训练样本、模型资产或语义 BIM 数据做准备。

## 二、数据输入方式

当前输入采用 `jsonl` 格式。每一行代表一个待生成的建筑样本。

典型输入文件：

```text
out/bim-batch/manual-smoke/manifest.jsonl
```

其中一条样本大致包含这些信息：

```json
{
  "id": "manual-smoke-001",
  "seed": 20260520,
  "brief": "A compact two-bedroom single-story simple modern house with a roof and basic export-ready geometry.",
  "target": {
    "buildingType": "single_family_house",
    "stories": 1,
    "grossAreaM2": 85,
    "bedrooms": 2,
    "bathrooms": 1,
    "style": "simple_modern"
  },
  "constraints": {
    "includeRoof": true,
    "includeFurniture": false,
    "maxWidthM": 12,
    "maxDepthM": 10
  }
}
```

这一层输入主要表达“想要什么建筑”。它包含建筑类型、面积、楼层数、房间数量、风格、尺寸约束，以及自然语言 brief。后续如果要扩大数据规模，可以继续扩展为 CSV 或更大规模的 JSONL 数据集。

## 三、中间数据产物

系统会先把输入转换为一个高层建筑规格文件：

```text
bim-spec.json
```

这个文件可以理解为“可审计的生成说明书”。它记录了建筑的尺寸、房间规划、门窗、材料、屋顶等信息，但它本身不是浏览器可以直接渲染的格式。

随后系统会把 `bim-spec.json` 转换为 Pascal 项目内部可渲染的场景图：

```text
scene-graph.json
```

这个文件才是浏览器 editor 和 MCP 流程真正使用的场景数据。里面包含 site、building、level、wall、zone、slab、ceiling、door、window 等节点，以及节点之间的父子关系。

目前一条 smoke 样本生成的 SceneGraph 包含：

```text
nodeCount: 25
levelCount: 1
zoneCount: 6
renderableNodeCount: 16
```

## 四、输出结果

稳定流程会输出三类结果。

第一类是输入与中间 JSON：

```text
input.json
bim-spec.json
scene-graph.json
validation.json
```

第二类是批处理报告：

```text
report.json
report.md
README.md
```

第三类是最终模型文件：

```text
model.obj
model.ifc
```

本次已经成功生成的 OBJ 文件位置：

```text
out/bim-batch/manual-smoke-stable/samples/manual-smoke-001/model.obj
```

OBJ 检查结果：

```json
{
  "bytes": 342284,
  "vertices": 2984,
  "faces": 1275,
  "yRange": [-0.05000000000000333, 2.8749999991059303],
  "abnormalY": false
}
```

这说明导出的 OBJ 文件不是空文件，里面包含有效的顶点和面，并且坐标范围正常。

在单条样本跑通之后，已经进一步完成 20 条小规模数据集测试。输入文件为：

```text
out/bim-batch/manifests/small-batch-001.jsonl
```

完整批量输出目录为：

```text
out/bim-batch/small-batch-001/
```

批量结果：

```json
{
  "total": 20,
  "succeeded": 20,
  "failed": 0
}
```

这说明当前流程已经能够稳定批量产出 OBJ，而不是只完成单个样本的演示。

本次 20 个 OBJ 文件的轻量统计如下：

```json
{
  "count": 20,
  "minBytes": 318543,
  "maxBytes": 439043,
  "minVertices": 2803,
  "maxVertices": 3656,
  "minFaces": 1208,
  "maxFaces": 1509
}
```

每个样本目录中都保存了对应的 `input.json`、`bim-spec.json`、`scene-graph.json`、`validation.json` 和 `model.obj`，因此可以从最终 OBJ 反查到原始输入和中间生成逻辑。

在 OBJ 批量产出之后，已经新增 IFC 语义 BIM 导出。IFC 批量输出目录为：

```text
out/bim-batch/small-batch-001-ifc/
```

示例 IFC 文件地址：

```text
out/bim-batch/small-batch-001-ifc/samples/small-batch-001-compact-01/model.ifc
```

示例 IFC 验证文件地址：

```text
out/bim-batch/small-batch-001-ifc/samples/small-batch-001-compact-01/ifc-validation.json
```

IFC 批量导出结果：

```json
{
  "total": 20,
  "succeeded": 20,
  "failed": 0
}
```

本次 IFC v1 输出的是基础 BIM 语义，已包含 `IfcProject`、`IfcSite`、`IfcBuilding`、`IfcBuildingStorey`、`IfcSpace`、`IfcWall`、`IfcSlab`、`IfcDoor`、`IfcWindow` 和 `IfcRoof`。通过 Python `ifcopenshell` 自动打开 20 个 `model.ifc` 后，实体数量范围如下：

```json
{
  "count": 20,
  "min": {
    "IfcProject": 1,
    "IfcSite": 1,
    "IfcBuilding": 1,
    "IfcBuildingStorey": 1,
    "IfcSpace": 4,
    "IfcWall": 4,
    "IfcSlab": 1,
    "IfcDoor": 1,
    "IfcWindow": 4,
    "IfcRoof": 1
  },
  "max": {
    "IfcProject": 1,
    "IfcSite": 1,
    "IfcBuilding": 1,
    "IfcBuildingStorey": 1,
    "IfcSpace": 10,
    "IfcWall": 4,
    "IfcSlab": 1,
    "IfcDoor": 1,
    "IfcWindow": 4,
    "IfcRoof": 1
  }
}
```

## 五、整体 Workflow

当前稳定 workflow 如下：

```text
1. 准备 manifest.jsonl 输入
2. 读取每一条样本配置
3. 生成高层 BIM Spec JSON
4. 转换为 Pascal SceneGraph JSON
5. 对 SceneGraph 做结构校验
6. 保存 SceneGraph 到 editor 使用的 SceneStore
7. 通过 /api/scenes/<scene-id> 确认浏览器可以读取该 scene
8. 浏览器打开 /scene/<scene-id>
9. 等待浏览器渲染出可导出的 Three.js 场景
10. 调用 __pascalExportOBJ()
11. 捕获下载结果并保存为 model.obj
12. 如果启用 --ifc，则从 BIM Spec 生成 model.ifc
13. 生成 ifc-validation.json、report.json 和 report.md
```

在这个 workflow 中，LLM/Agent 主要承担了这些工作：

1. 根据目标约束主动构造 `manifest.jsonl` 输入数据，而不是依赖已有数据集。
2. 控制样本多样性，覆盖 compact、medium、large 和 edge-case 四类建筑请求。
3. 调用已有批处理 CLI，把输入逐条转换成 `bim-spec.json` 和 `scene-graph.json`。
4. 检查 editor API 和 SceneStore 是否可用，确认浏览器端能够读取保存后的 scene。
5. 执行浏览器自动化 OBJ 导出，并根据 `report.json` 判断成功或失败。
6. 失败时进行根因排查。本次发现首次失败不是数据错误，而是沙箱权限阻止了 `uv_spawn 'node'`。
7. 重新在合适权限下运行导出命令，并核验 OBJ 文件大小、顶点数和面数。
8. 新增 IFC 导出路径，把 BIM Spec 转换成 IFC4 STEP 文本，并用 IfcOpenShell 验证可解析性和实体数量。
9. 把测试经验和稳定复现方式整理进文档，便于后续继续扩大批量规模。

因此，LLM 在这里不是直接手写 OBJ 或 IFC 的最终内容，而是作为流程编排者、数据构造者和导出逻辑实现者：它负责把“批量生成建筑模型”拆成可执行步骤，创建输入，运行转换，调用浏览器导出，生成 IFC 语义文件，并对产物进行检查。

对应命令：

```powershell
bun packages/mcp/src/bin/pascal-bim-batch.ts --manifest out\bim-batch\manual-smoke\manifest.jsonl --out out\bim-batch\manual-smoke-stable --editor-url http://localhost:3002
```

成功结果：

```json
{
  "outDir": "out\\bim-batch\\manual-smoke-stable",
  "total": 1,
  "succeeded": 1,
  "failed": 0,
  "report": "out\\bim-batch\\manual-smoke-stable/report.md"
}
```

## 六、本周解决的关键问题

本周主要解决了两个问题。

第一个问题是 SceneStore 一致性。之前只生成本地 JSON 文件并不够，必须把 `scene-graph.json` 保存到浏览器 editor 正在读取的同一个 SceneStore 中，否则浏览器打开 `/scene/<scene-id>` 时会找不到场景。

第二个问题是 OBJ 导出稳定性。OBJ 不是在 Node 里直接拼出来的，而是复用浏览器里已经渲染好的 Three.js 场景。之前在 Bun 主进程里直接启动 Playwright Chromium 会出现卡住的问题，所以现在改成由批处理 CLI 派生 Node worker 来完成浏览器自动化导出。这条路径已经验证稳定。

第三个问题是 BIM 语义输出。OBJ 文件更适合表达几何，不适合承载建筑构件语义。因此本阶段新增了 `--ifc` 输出路径，直接从 `bim-spec.json` 生成 IFC4 STEP 文本，让每个样本除了可视化 OBJ 外，还能得到具备基础 BIM 语义的 `model.ifc`。

## 七、测试与验证

本周完成了三类验证。

单元测试：

```powershell
bun test packages/mcp/src/bim-generation/bim-generation.test.ts
```

结果：

```text
16 pass
0 fail
96 expect() calls
```

MCP 包构建：

```powershell
bun run --cwd packages/mcp build
```

结果：

```text
tsc --build
```

构建通过。

格式与静态检查：

```powershell
bunx biome check packages/mcp/src/bim-generation/browser-obj-exporter.ts packages/mcp/src/bim-generation/bim-generation.test.ts packages/mcp/src/bin/pascal-bim-batch.ts packages/mcp/package.json
```

结果：

```text
Checked 4 files. No fixes applied.
```

小批量数据集验证：

```powershell
bun -e "const fs=await import('node:fs/promises'); const p='out/bim-batch/manifests/small-batch-001.jsonl'; const lines=(await fs.readFile(p,'utf8')).trim().split(/\r?\n/); for (const [i,l] of lines.entries()) JSON.parse(l); console.log(lines.length)"
```

结果：

```text
20
```

JSON-only 批处理验证：

```powershell
bun packages/mcp/src/bin/pascal-bim-batch.ts --manifest out\bim-batch\manifests\small-batch-001.jsonl --out out\bim-batch\small-batch-001-json-only --skip-obj
```

结果：

```json
{
  "total": 20,
  "succeeded": 20,
  "failed": 0
}
```

完整 OBJ 批量导出验证：

```powershell
bun packages/mcp/src/bin/pascal-bim-batch.ts --manifest out\bim-batch\manifests\small-batch-001.jsonl --out out\bim-batch\small-batch-001 --editor-url http://localhost:3002
```

结果：

```json
{
  "total": 20,
  "succeeded": 20,
  "failed": 0
}
```

本次测试中还记录了一个环境经验：在沙箱内直接导出时，因为无法派生 Node worker，会出现 `EPERM: operation not permitted, uv_spawn 'node'`。这时 `validation.json` 仍然显示 SceneGraph 有效，说明问题不在生成数据，而在浏览器自动化导出运行权限。授权后重跑同一条命令即可成功。

IFC 批量导出验证：

```powershell
bun packages/mcp/src/bin/pascal-bim-batch.ts --manifest out\bim-batch\manifests\small-batch-001.jsonl --out out\bim-batch\small-batch-001-ifc --skip-obj --ifc
```

结果：

```json
{
  "total": 20,
  "succeeded": 20,
  "failed": 0
}
```

IfcOpenShell 自动验证：

```powershell
python -c "import ifcopenshell, pathlib; [ifcopenshell.open(str(p)) for p in pathlib.Path('out/bim-batch/small-batch-001-ifc/samples').glob('*/model.ifc')]"
```

结果：20 个 `model.ifc` 均可被打开，并且都包含基础 BIM 实体。

## 八、当前进度判断

当前已经具备一个可复现的最小闭环：

```text
结构化输入 -> 建筑语义规格 -> Pascal 场景图 -> 浏览器渲染 -> OBJ 文件
结构化输入 -> 建筑语义规格 -> IFC4 STEP -> IFC 文件
```

并且已经完成 20 条小规模数据集的批量验证：

```text
20 条输入 -> 20 个有效 SceneGraph -> 20 个 OBJ 文件
20 条输入 -> 20 个有效 IFC 文件
```

这说明后续可以围绕这个流程继续扩大样本规模。下一步更适合做三件事：

1. 增加更多 `manifest.jsonl` 样本，覆盖不同面积、房间数量和布局约束。
2. 扩展 `BIM Spec` 的语义字段，例如房间功能、材料、门窗规则、屋顶类型。
3. 对批量导出的 OBJ 做自动质量检查，例如文件大小、顶点数、面数、坐标范围和空模型检测。

目前的成果已经可以产出基础 IFC 语义 BIM 文件，但还不是完整专业 BIM。v1 重点是 Project/Site/Building/Storey/Space/Wall/Slab/Door/Window/Roof 等基础实体可解析、可追溯。下一阶段如果要提升专业度，应继续补充 opening relationships、space boundaries、材料、数量统计和更严格的 IFC 校验。
