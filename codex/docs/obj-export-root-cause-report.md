# OBJ 导出业务逻辑与错位修复报告

## 摘要

本报告合并了早期的“场景就绪检测”记录和后续的根因分析，作为当前 OBJ 导出逻辑的唯一说明。

问题表现为：官网手动下载的 `codex/exports-obj-correct/model_2026-05-14.obj` 可以正确渲染，而早期批量脚本导出的 `6277f322fd6f.obj` 渲染异常。对比后确认，OBJ 语法、面索引和 roof 几何本身都没有损坏；真正的问题是导出时 `merged-roof` 被写入了异常的世界坐标 Y 偏移。

最终修复由两部分组成：

1. `LevelSystem` 对大帧间隔下的 level 插值进行 clamp，避免 transform 过冲。
2. `ExportManager` 在 GLB/STL/OBJ 导出前临时 snap 到真实楼层位置，导出结束后恢复 viewer 状态。

修复后重新导出的 OBJ 位于：

```text
codex/exports-obj-correct/6277f322fd6f.obj
```

该文件整体 Y 范围恢复为 `-0.05 ~ 7.111219501495361`，异常顶点数为 0。

## 当前 OBJ 导出流程

当前 OBJ 导出不是从数据库里的场景 JSON 直接拼一个文件，而是复用浏览器里已经渲染出来的三维场景。可以把它理解成：先让网页把房子、墙、楼板、屋顶、家具都摆到 Three.js 场景里，再把这个已经摆好的三维模型写成 OBJ 文件。

整体流程如下：

1. 页面加载场景后，`ExportManager` 会在浏览器的三维场景里找到 `scene-renderer`。这个组可以理解成“真正要导出的模型容器”，里面包含当前场景已经渲染出来的墙、楼板、屋顶、家具等对象。
2. `ExportManager` 内部有一个统一的导出函数 `exportFn(format)`。手动点击导出按钮、导出 GLB、导出 STL、导出 OBJ，本质上都会走这套浏览器端导出能力。
3. 为了让批量脚本也能使用同一套能力，页面会在浏览器的 `window` 上挂几个临时入口。这里的“暴露”不是把接口开放到服务器或公网，而是让 Playwright 这种浏览器自动化脚本可以在页面内部调用它们：
   - `window.__pascalExportGLB`：让脚本触发 GLB 下载。
   - `window.__pascalExportOBJ`：让脚本触发 OBJ 下载。
   - `window.__pascalSceneReady`：让脚本检查页面里是否已经出现可导出的三维内容。
4. 批量脚本 `codex/batch-export-obj.mjs` 会像自动操作员一样打开 `/scene/:sceneId` 页面。它不会自己生成 OBJ，而是等页面准备好后，调用 `window.__pascalExportOBJ()`，让网页自己执行一次和手动导出相同的下载流程。
5. 脚本在触发下载前会先等待两个条件：页面已经提供 OBJ 导出入口，并且 `__pascalSceneReady()` 返回 true。后者只表示场景里已经有 mesh，可以避免页面还没渲染出任何模型时就导出空文件。它只是就绪检查，不负责修复本次错位问题。
6. 真正开始导出时，`ExportManager` 会先临时把所有楼层放回真实堆叠位置。这样可以避免把爆炸视图、solo 视图或楼层动画中的临时偏移写进 OBJ。
7. 楼层摆正后，Three.js 会重新计算整棵三维场景中每个对象的最终世界坐标。简单说，就是重新确认墙、楼板、屋顶、家具现在到底在三维空间的哪个位置。
8. `OBJExporter` 读取 `scene-renderer` 里的对象，把这些最终坐标写入 OBJ 文件。OBJ 文件保存的是导出那一刻的实际坐标，所以如果导出前坐标已经跑偏，错误也会被原样写进文件。
9. 导出完成或失败后，页面会恢复用户原来的 viewer 状态。也就是说，导出前如果用户正在看爆炸视图或其他楼层显示状态，导出动作不会永久改变页面显示。

这套流程里，每个动作的职责可以简单概括为：浏览器负责把场景真实渲染出来，批量脚本负责打开页面并触发导出，就绪检查负责避免空场景导出，导出前摆正楼层负责避免坐标跑飞，OBJ 导出器负责把最终坐标写成文件，最后的恢复动作负责不影响用户当前看到的界面。

因此，本次问题不是 `__pascalSceneReady()` 没有检查够多，也不是 OBJ 写文件语法错误。核心问题是导出器会相信浏览器场景里物体“当下所在的位置”；如果楼层位置在动画或异常帧间隔中被带偏，OBJ 就会记录这个错误位置。修复的重点就是导出前先把楼层摆正，并防止楼层动画继续把坐标推过头。

## 涉及文件

| 文件 | 作用 |
| --- | --- |
| `packages/editor/src/components/editor/export-manager.tsx` | 浏览器端 GLB/STL/OBJ 导出逻辑 |
| `packages/viewer/src/systems/level/level-system.tsx` | level 堆叠、爆炸、solo 模式的 Y 轴位置系统 |
| `packages/viewer/src/systems/level/level-system.test.ts` | level 插值防过冲回归测试 |
| `codex/batch-export-obj.mjs` | Playwright 批量 OBJ 导出脚本 |
| `codex/exports-obj-correct/model_2026-05-14.obj` | 官网手动下载的正确 OBJ 样本 |
| `codex/exports-obj-correct/6277f322fd6f.obj` | 修复后重新导出的 OBJ |
| `codex/exports-obj-correct/export-report-obj.json` | 修复后批量导出报告 |
| `codex/exports-obj-correct/mcp-scene-6277f322fd6f.json` | 对应 MCP 场景 JSON |

## 对比结果

| 指标 | 官网正确 OBJ | 修复前程序 OBJ | 修复后程序 OBJ |
| --- | ---: | ---: | ---: |
| 文件大小 | 507,418 bytes | 538,378 bytes | 537,923 bytes |
| 行数 | 12,642 | 13,662 | 13,662 |
| 顶点数 | 3,528 | 3,816 | 3,816 |
| 面数 | 2,009 | 2,153 | 2,153 |
| 对象数 | 57 | 69 | 69 |
| 整体 Y 范围 | `-0.05 ~ 7.111219501495362` | `-7665891.86427494 ~ 2.849999952316284` | `-0.05 ~ 7.111219501495361` |
| 异常顶点数 | 0 | 存在大量百万级 Y 顶点 | 0 |

`merged-roof` 对比：

| 指标 | 官网正确 OBJ | 修复前程序 OBJ | 修复后程序 OBJ |
| --- | ---: | ---: | ---: |
| 顶点数 | 701 | 701 | 701 |
| 面数 | 239 | 239 | 239 |
| Roof Y 范围 | `2.85 ~ 7.111219501495362` | `-7665891.86427494 ~ -7665887.603055439` | `2.8499999999999996 ~ 7.111219501495361` |

修复前程序 OBJ 中的 `merged-roof` 与官网正确 OBJ 的 roof 几何逐点一致，只是整体多了固定 Y 偏移。因此问题发生在导出时使用的 world transform，而不是 roof mesh 生成逻辑。

## 根因

根因在 `LevelSystem` 的平滑动画插值：

```ts
obj.position.y = lerp(obj.position.y, targetY, delta * 12)
```

`THREE.MathUtils.lerp(a, b, alpha)` 的 `alpha` 应处在 `0..1`。在 Playwright/headless 导出、页面恢复渲染或后台 tab 恢复时，`useFrame` 的 `delta` 可能明显偏大，使 `delta * 12 > 1`。此时 level 的 `position.y` 会越过目标值并继续发散，极端情况下跑到百万级。

OBJ 导出会使用 Three.js 的世界矩阵写入顶点坐标。一旦导出发生在 level transform 跑飞的瞬间，`merged-roof` 就会被写入异常世界坐标，导致 OBJ 查看器按异常包围盒自动缩放后显示错乱。

早期排查曾怀疑固定等待时间不足，原因是脚本原来依赖固定 5 秒等待，可能遇到 mesh 尚未初始化或外部模型未加载完成。这一判断解释了自动化导出不稳定的一部分风险，但不能解释 `merged-roof` 几何逐点一致且只存在固定 Y 偏移的事实。因此当前结论以 level transform 过冲为最终根因。

## 修复内容

### 1. 防止 level 插值过冲

`packages/viewer/src/systems/level/level-system.tsx` 新增：

```ts
const LEVEL_LERP_SPEED = 12

export function getLevelStepAlpha(delta: number): number {
  if (!Number.isFinite(delta) || delta <= 0) return 0
  return Math.min(delta * LEVEL_LERP_SPEED, 1)
}
```

并将动画更新改为：

```ts
obj.position.y = lerp(obj.position.y, targetY, getLevelStepAlpha(delta))
```

这样即使 headless 环境出现大帧间隔，level 也最多移动到目标位置，不会越过目标继续发散。

### 2. 导出前 snap 到真实楼层位置

`packages/editor/src/components/editor/export-manager.tsx` 在导出前调用 `snapLevelsToTruePositions()`：

```ts
const restoreLevels = snapLevelsToTruePositions()

try {
  scene.updateMatrixWorld(true)
  // run GLB / STL / OBJ export
} finally {
  restoreLevels()
  scene.updateMatrixWorld(true)
}
```

这保证 GLB/STL/OBJ 导出抓取的是稳定的真实楼层堆叠位置，而不是 level 动画中的瞬时位置。

### 3. 自动化导出等待场景初始化

`ExportManager` 继续暴露 `__pascalSceneReady()`：

```tsx
;(window as any).__pascalSceneReady = () => {
  const sceneGroup = scene.getObjectByName('scene-renderer')
  if (!sceneGroup) return false
  let meshCount = 0
  sceneGroup.traverse((child: any) => {
    if (child.isMesh) meshCount++
  })
  return meshCount > 0
}
```

`codex/batch-export-obj.mjs` 在触发导出前等待该检查通过，并额外保留 2 秒缓冲：

```js
await page.waitForFunction(
  () => typeof window.__pascalSceneReady === 'function' && window.__pascalSceneReady(),
  { timeout: 30_000 },
)

await page.waitForTimeout(2000)
```

这属于自动化稳定性保护，不替代导出前 snap 和插值 clamp。

### 4. 支持自定义输出目录

`codex/batch-export-obj.mjs` 支持 `PASCAL_EXPORT_DIR`：

```js
const EXPORT_DIR = process.env.PASCAL_EXPORT_DIR
  ? path.resolve(process.env.PASCAL_EXPORT_DIR)
  : path.join(__dirname, 'exports')
```

修复验证时使用独立目录，避免覆盖异常样本。当前归档目录为 `codex/exports-obj-correct`：

```powershell
$env:PASCAL_EXPORT_DIR='codex/exports-obj-correct'
node codex/batch-export-obj.mjs 6277f322fd6f
```

## 验证结果

单测：

```powershell
bun test packages/viewer/src/systems/level/level-system.test.ts
```

结果：

```text
2 pass
0 fail
```

构建：

```powershell
bun run build
```

结果：构建通过。构建过程中的 Next/Turbopack NFT trace warnings 是已有警告，与本次 OBJ 修复无关。

修复后导出报告位于 `codex/exports-obj-correct/export-report-obj.json`。报告摘要：

```json
{
  "format": "obj",
  "total": 1,
  "success": 1,
  "skipped": 0,
  "errors": 0,
  "results": [
    {
      "sceneId": "6277f322fd6f",
      "status": "ok",
      "bytes": 537923
    }
  ]
}
```

修复后 OBJ 验证：

```text
整体 bbox Y: -0.05 ~ 7.111219501495361
merged-roof Y: 2.8499999999999996 ~ 7.111219501495361
异常顶点数: 0
```

## 后续建议

1. 批量导出更多真实场景，检查导出报告中的失败率和文件大小异常。
2. 如果后续要把 headless OBJ 导出变成正式能力，应补充更严格的“场景资源就绪”信号，而不是只检查 mesh 数量。
3. 如果还需要长期回归对比，应重新归档修复前异常 OBJ；当前仓库中的 `codex/exports-obj-correct/6277f322fd6f.obj` 是修复后的正确样本。
