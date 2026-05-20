# BIM 批量生成与 OBJ 导出稳定流程说明

日期：2026-05-20
分支：`OBJ514`

## 目标

这份文档说明当前已经跑通的稳定流程：从批量输入数据生成建筑场景 JSON，再通过浏览器渲染导出 OBJ 文件。

稳定链路如下：

```text
manifest.jsonl
  -> BIM Spec JSON
  -> Pascal SceneGraph JSON
  -> 保存到 editor 使用的 SceneStore
  -> 浏览器打开 /scene/<scene-id>
  -> 调用 __pascalExportOBJ()
  -> 输出 model.obj
```

这里有两个 JSON 层级：

- `bim-spec.json`：高层建筑规格，用来审计生成逻辑，不直接放进浏览器渲染。
- `scene-graph.json`：Pascal 可渲染的场景图，是浏览器 editor 和 OBJ 导出的实际输入。

## 稳定运行的必要条件

当前流程要稳定导出 OBJ，需要满足这些条件：

1. editor dev server 正常运行。
2. `scene-graph.json` 能通过 `/api/scenes` 保存。
3. 保存后的 scene 能通过 `/api/scenes/<scene-id>` 读回来。
4. 浏览器能打开 `/scene/<scene-id>`。
5. 页面里存在 `window.__pascalExportOBJ`。
6. `window.__pascalSceneReady()` 返回 `true`。
7. OBJ 下载被捕获并保存为 `model.obj`。
8. 导出的 OBJ 坐标范围正常，没有异常的大幅偏移。

## SceneStore 的关键约束

MCP、批处理脚本和浏览器 editor 必须使用同一个 SceneStore。

本工作区当前确认的默认数据库路径是：

```text
C:\Users\rt do believe\AppData\Roaming\Pascal\data\pascal.db
```

如果后续要指定其他数据目录，需要让相关进程使用同一个环境变量：

```text
PASCAL_DATA_DIR
```

或者直接指定数据库文件：

```text
PASCAL_DB_PATH
```

如果数据库路径不一致，常见现象是：脚本或 MCP 认为保存成功，但浏览器打开 `/scene/<scene-id>` 时显示 `Scene not found`。

## 启动 editor

启动浏览器 editor：

```powershell
bun run --cwd apps/editor dev
```

当前默认地址：

```text
http://localhost:3002
```

可以用下面的命令检查 API 是否可用：

```powershell
bun -e "const r = await fetch('http://localhost:3002/api/scenes?limit=1'); console.log(r.status)"
```

期望返回：

```text
200
```

## 运行稳定版批处理

当前稳定命令如下：

```powershell
bun packages/mcp/src/bin/pascal-bim-batch.ts --manifest out\bim-batch\manual-smoke\manifest.jsonl --out out\bim-batch\manual-smoke-stable --editor-url http://localhost:3002
```

成功时会输出：

```json
{
  "outDir": "out\\bim-batch\\manual-smoke-stable",
  "total": 1,
  "succeeded": 1,
  "failed": 0,
  "report": "out\\bim-batch\\manual-smoke-stable/report.md"
}
```

这条命令会完成四件事：

1. 从 `manifest.jsonl` 读取输入。
2. 生成 `bim-spec.json` 和 `scene-graph.json`。
3. 把 `scene-graph.json` 保存到 editor 的 SceneStore。
4. 派生 Node worker 打开浏览器页面并导出 `model.obj`。

这里使用 Node worker 是为了绕开之前观察到的 Bun 主进程启动 Playwright Chromium 卡住的问题。

## 输出目录

稳定 smoke run 的输出目录是：

```text
out/bim-batch/manual-smoke-stable/
```

核心文件如下：

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

其中：

- `input.json`：规范化后的单条输入。
- `bim-spec.json`：高层建筑规格。
- `scene-graph.json`：可渲染 Pascal 场景图。
- `validation.json`：生成结果校验。
- `model.obj`：最终导出的 OBJ 模型。
- `report.json` / `report.md`：批处理报告。

## 已验证结果

本次稳定运行已生成：

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

这说明 OBJ 已经有有效顶点和面，且没有出现之前报告中提到的百万级 Y 坐标异常。

## 当前实现位置

稳定导出逻辑主要在：

```text
packages/mcp/src/bim-generation/browser-obj-exporter.ts
```

测试在：

```text
packages/mcp/src/bim-generation/bim-generation.test.ts
```

CLI 入口在：

```text
packages/mcp/src/bin/pascal-bim-batch.ts
```

## 排查方式

如果保存 scene 失败：

- 查看 `report.json` 中的 HTTP 状态和错误信息。
- 确认 `scene-graph.json` 是否符合 Pascal 节点 schema。
- 如果 scene id 已经存在，确认 `/api/scenes/<scene-id>` 是否能返回 200。

如果浏览器显示 `Scene not found`：

- 优先检查 SceneStore 路径是否一致。
- 确认 editor 和脚本是否使用了相同的 `PASCAL_DATA_DIR` 或 `PASCAL_DB_PATH`。

如果 OBJ 导出超时：

- 检查 `/scene/<scene-id>` 是否能正常打开。
- 检查页面里是否有 `window.__pascalExportOBJ`。
- 检查 `window.__pascalSceneReady()` 是否返回 `true`。
- 查看 `apps/editor/.next/dev/logs/next-development.log`。

## 验证命令

单元测试：

```powershell
bun test packages/mcp/src/bim-generation/bim-generation.test.ts
```

MCP 包构建：

```powershell
bun run --cwd packages/mcp build
```

格式与静态检查：

```powershell
bunx biome check packages/mcp/src/bim-generation/browser-obj-exporter.ts packages/mcp/src/bim-generation/bim-generation.test.ts packages/mcp/src/bin/pascal-bim-batch.ts packages/mcp/package.json
```

稳定 smoke export：

```powershell
bun packages/mcp/src/bin/pascal-bim-batch.ts --manifest out\bim-batch\manual-smoke\manifest.jsonl --out out\bim-batch\manual-smoke-stable --editor-url http://localhost:3002
```
