# OBJ 导出错位问题分析与修复报告

## 摘要

本次问题表现为：从官网手动下载的 OBJ 文件可以正确渲染，而通过本项目批量导出脚本生成的 OBJ 文件渲染异常。对两个 OBJ 文件进行结构化对比后确认，问题不是 OBJ 语法、面索引或 roof 几何本身损坏，而是导出时 `merged-roof` 对象被写入了异常的世界坐标 Y 偏移，导致模型包围盒被拉到百万级，进而在 OBJ 查看器中显示错乱。

修复后重新导出的文件位于：

```text
codex/exports-fixed/6277f322fd6f.obj
```

修复后的 OBJ 整体 Y 范围与官网正确样本一致，且异常顶点数为 0。

## 涉及文件

| 文件 | 作用 |
| --- | --- |
| `codex/model_2026-05-14.obj` | 官网手动下载的正确 OBJ 样本 |
| `codex/exports/6277f322fd6f.obj` | 修复前批量导出的异常 OBJ 样本 |
| `codex/exports-fixed/6277f322fd6f.obj` | 修复后重新导出的 OBJ |
| `packages/editor/src/components/editor/export-manager.tsx` | 浏览器端 GLB/STL/OBJ 导出逻辑 |
| `packages/viewer/src/systems/level/level-system.tsx` | level 堆叠、爆炸、solo 模式的 Y 轴位置系统 |
| `packages/viewer/src/systems/level/level-system.test.ts` | level 插值防过冲回归测试 |
| `codex/batch-export-obj.mjs` | Playwright 批量 OBJ 导出脚本 |

## 现象

官网正确样本：

```text
codex/model_2026-05-14.obj
```

修复前程序导出样本：

```text
codex/exports/6277f322fd6f.obj
```

两者都能被 OBJ 解析器正常读取，顶点索引也合法。但程序导出的文件存在极端 Y 坐标，导致 OBJ 查看器按异常包围盒自动缩放后，正常建筑几何几乎不可见或渲染位置错误。

## 关键对比数据

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

进一步验证发现，修复前程序 OBJ 中的 `merged-roof` 与官网正确 OBJ 的 roof 几何逐点一致，只是整体多了一个固定 Y 偏移。也就是说，roof 几何本身正确，错误发生在导出时使用了异常的 world transform。

## 根因

根因在 `LevelSystem` 的平滑动画插值：

```ts
obj.position.y = lerp(obj.position.y, targetY, delta * 12)
```

`THREE.MathUtils.lerp(a, b, alpha)` 要求 `alpha` 通常处在 `0..1`。在 Playwright/headless 导出、页面恢复渲染、后台 tab 恢复等场景中，`useFrame` 的 `delta` 可能明显偏大，使 `delta * 12 > 1`。这会导致 level 的 `position.y` 从目标值反向过冲，甚至跑到百万级。

OBJ 导出使用 Three.js 的世界矩阵将顶点写入文件。一旦导出发生在 level transform 跑飞的瞬间，`merged-roof` 就会被写入异常的世界坐标。

这也解释了两个观察结果：

1. OBJ 文件语法和面索引合法，但查看器渲染异常。
2. 只有 `merged-roof` 出现巨大 Y 偏移，roof 几何形状、顶点数和面数仍与正确样本一致。

## 修复内容

### 1. 防止 level 插值过冲

在 `packages/viewer/src/systems/level/level-system.tsx` 中新增 `getLevelStepAlpha`：

```ts
const LEVEL_LERP_SPEED = 12

export function getLevelStepAlpha(delta: number): number {
  if (!Number.isFinite(delta) || delta <= 0) return 0
  return Math.min(delta * LEVEL_LERP_SPEED, 1)
}
```

并将 level 动画更新改为：

```ts
obj.position.y = lerp(obj.position.y, targetY, getLevelStepAlpha(delta))
```

这样即使 headless 环境出现大帧间隔，level 也只会最多移动到目标位置，不会越过目标继续发散。

### 2. 导出前强制 snap 到真实楼层位置

在 `packages/editor/src/components/editor/export-manager.tsx` 中，导出前调用 viewer 已有的 `snapLevelsToTruePositions()`：

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

这确保导出抓取的是稳定的真实堆叠位置，而不是 level 动画中的瞬时位置。导出完成后恢复用户当前 viewer 状态。

### 3. 批量导出脚本支持自定义输出目录

`codex/batch-export-obj.mjs` 增加 `PASCAL_EXPORT_DIR`：

```js
const EXPORT_DIR = process.env.PASCAL_EXPORT_DIR
  ? path.resolve(process.env.PASCAL_EXPORT_DIR)
  : path.join(__dirname, 'exports')
```

这次修复验证时使用独立目录输出，避免覆盖原异常样本：

```powershell
$env:PASCAL_EXPORT_DIR='codex/exports-fixed'
node codex/batch-export-obj.mjs 6277f322fd6f
```

## 回归测试

新增测试：

```text
packages/viewer/src/systems/level/level-system.test.ts
```

覆盖两点：

1. 大 `delta` 时 alpha 被 clamp 到 `1`，不会过冲。
2. 常规 `1/60` 秒帧间隔仍保留原先的平滑动画系数 `0.2`。

测试命令：

```powershell
bun test packages/viewer/src/systems/level/level-system.test.ts
```

结果：

```text
2 pass
0 fail
```

## 重新导出结果

导出命令：

```powershell
$env:PASCAL_EXPORT_DIR='codex/exports-fixed'
node codex/batch-export-obj.mjs 6277f322fd6f
```

导出报告：

```text
codex/exports-fixed/export-report-obj.json
```

结果摘要：

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
      "bytes": 537923,
      "path": "E:\\code for project\\editor-codex-fix-514\\codex\\exports-fixed\\6277f322fd6f.obj"
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

## 构建验证

已运行：

```powershell
bun run build
```

结果：构建通过。

构建过程中 Next/Turbopack 仍输出已有的 NFT trace warnings，内容与本次 OBJ 修复无关。

## 结论

本次问题的根因是 headless/Playwright 场景下帧间隔异常放大后，`LevelSystem` 的 level Y 插值没有 clamp，导致 level transform 过冲；OBJ 导出又将当时的异常 world transform 写入文件，最终造成 `merged-roof` 坐标跑飞。

修复后：

- level 动画不会因大 `delta` 过冲；
- 导出前会临时 snap 到真实楼层堆叠位置；
- 新生成 OBJ 的整体包围盒与官网正确样本一致；
- `merged-roof` 坐标恢复正常；
- 单测与完整 build 均通过。
