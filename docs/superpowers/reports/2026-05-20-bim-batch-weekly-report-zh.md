# BIM 批量生成与 OBJ 导出阶段周报

汇报日期：2026-05-20

## 一、本周目标

本周主要完成了一个自动化闭环：用结构化输入批量生成建筑场景 JSON，并通过浏览器渲染流程导出 OBJ 模型文件。

这项工作的重点不是手工建模，而是把“输入数据 -> 建筑语义 JSON -> 可渲染场景 JSON -> OBJ 文件”的流程跑通，为后续批量生成训练样本或模型资产做准备。

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
12. 生成 report.json 和 report.md
```

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

## 七、测试与验证

本周完成了三类验证。

单元测试：

```powershell
bun test packages/mcp/src/bim-generation/bim-generation.test.ts
```

结果：

```text
13 pass
0 fail
68 expect() calls
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

## 八、当前进度判断

当前已经具备一个可复现的最小闭环：

```text
结构化输入 -> 建筑语义规格 -> Pascal 场景图 -> 浏览器渲染 -> OBJ 文件
```

这说明后续可以围绕这个流程继续扩大样本规模。下一步更适合做三件事：

1. 增加更多 `manifest.jsonl` 样本，覆盖不同面积、房间数量和布局约束。
2. 扩展 `BIM Spec` 的语义字段，例如房间功能、材料、门窗规则、屋顶类型。
3. 对批量导出的 OBJ 做自动质量检查，例如文件大小、顶点数、面数、坐标范围和空模型检测。

目前的成果还不是 IFC 或专业 BIM 文件，但已经完成了从可控输入到可渲染建筑模型再到 OBJ 资产的自动化生成流程。
