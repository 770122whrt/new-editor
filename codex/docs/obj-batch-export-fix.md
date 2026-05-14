# OBJ 批量导出 — 场景就绪检测修复

## 问题

Playwright 批量导出 OBJ 时，场景未完全就绪就触发了导出。

### 现象
- 正确 OBJ（手动浏览器导出）：2,009 面，Y 范围 -0.05~7.11
- 我们导出的 OBJ：1,201 面，Y 范围 -7114~2.85

### 根因

`export-manager.tsx` 的导出代码与 main 分支完全一致，本身没有问题。

问题在于 Playwright 脚本使用固定 `waitForTimeout(5000)` 等待，不能保证：
1. 所有 geometry systems 处理完 dirty nodes（roof 有节流 `MAX_ROOFS_PER_FRAME=1`）
2. 外部 GLB 模型（items）从 Supabase 下载并解析完成

### 对比数据

| 指标 | 正确 OBJ | 我们导出 |
|------|---------|---------|
| 行数 | 12,641 | 10,117 |
| 对象数 | 57 | 69 |
| 面数 | 2,009 | 1,201 |
| Y 范围 | -0.05 ~ 7.11 | -7114 ~ 2.85 |
| 家具 | sofa_005, armchair_002, tv_wall_016 | 缺失 |
| Roof Y | 5.61 ~ 7.08 | -7111 |

## 修复方案

### 1. export-manager.tsx 暴露场景就绪检查

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

### 2. batch-export-obj.mjs 替换等待逻辑

```js
// 等待场景几何构建完成
await page.waitForFunction(
  () => typeof window.__pascalSceneReady === 'function' && window.__pascalSceneReady(),
  { timeout: 30_000 },
)
// 额外缓冲 2 秒
await page.waitForTimeout(2000)
```

## 验证方法

1. 单场景导出：`node codex/batch-export-obj.mjs 6277f322fd6f`
2. 检查 roof Y 值应在 5~7 范围
3. 检查应包含 sofa、armchair、tv_wall 对象
4. 面数应接近 2,009

## 相关文件

- `packages/editor/src/components/editor/export-manager.tsx` — 导出逻辑
- `codex/batch-export-obj.mjs` — 批量导出脚本
- `codex/model_2026-05-14.obj` — 正确 OBJ 基准
- `codex/mcp-scene-6277f322fd6f.json` — MCP 场景 JSON
- `%APPDATA%/Pascal/data/pascal.db` — SQLite 场景数据库
