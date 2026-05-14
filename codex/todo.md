# Pascal Editor 待办

## 开发环境

**启动命令**：`npx turbo run dev --env-mode=loose`（不要使用根目录 `npm run dev`）
**端口**：3002
**详细指南**：`codex/docs/dev-environment-guide.md`

## 当前目标

通过 Playwright 自动化浏览器原生 OBJ 导出能力，批量导出所有场景为 OBJ 文件。

## OBJ 批量导出

### 已完成
- [x] 确认源码 OBJ 导出逻辑无问题（`export-manager.tsx`，与 main 分支一致）
- [x] 编写 `codex/batch-export-obj.mjs` 批量导出脚本
- [x] 在 `export-manager.tsx` 暴露 `window.__pascalExportOBJ`

### 进行中
- [ ] 修复场景就绪检测：替换固定 5s 等待为 `__pascalSceneReady` 检查
- [ ] 验证修复后导出的 OBJ 质量（roof Y 值、家具完整性、面数）

### 待做
- [ ] 全量批量导出所有场景
- [ ] 导出报告和统计

## 场景就绪检测问题记录

### 问题
Playwright 导出时场景未完全就绪，导致：
1. **Roof Y=-7111**：roof 系统节流（`MAX_ROOFS_PER_FRAME=1`），5s 不够
2. **家具缺失**：外部 GLB 模型（Sofa、Chair、TV Stand）未加载完

### 正确 OBJ 基准（手动浏览器导出）
- 文件：`codex/model_2026-05-14.obj`
- 面数：2,009
- Y 范围：-0.05 ~ 7.11
- 对象：floor, walls, ceiling-grid, sofa_005, armchair_002, tv_wall_016, merged-roof 等

### 我们导出的 OBJ（修复前）
- 文件：`codex/exports/6277f322fd6f.obj`
- 面数：1,201
- Y 范围：-7114 ~ 2.85
- 问题：roof Y 错误、家具对象缺失

### 修复方案
1. `export-manager.tsx` 暴露 `__pascalSceneReady()` 检查 scene-renderer 下 mesh 数量
2. `batch-export-obj.mjs` 用 `waitForFunction` 等待就绪 + 2s 缓冲

## MCP 场景数据

- 数据库路径：`%APPDATA%/Pascal/data/pascal.db`
- MCP 场景 `6277f322fd6f`：19 节点（4 墙、1 楼板、1 天花、1 门、2 窗、3 家具、1 屋顶）
- 导出 JSON：`codex/mcp-scene-6277f322fd6f.json`

## GLB 导出（已暂停）

GLB 导出因 TEXCOORD_2 UV 映射问题暂停。详见 `codex/texcoord-2-issue.md`（如存在）。
