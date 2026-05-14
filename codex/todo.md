# Pascal Editor 待办

## 开发环境

- 启动命令：`npx turbo run dev --env-mode=loose`
- 端口：`3002`
- 详细指南：`codex/docs/dev-environment-guide.md`

不要使用根目录 `npm run dev` 启动本项目。

## 当前目标

稳定通过浏览器端原生 OBJ 导出能力，将 Pascal 场景批量导出为 OBJ 文件。

## OBJ 导出状态

### 已完成

- [x] 确认浏览器端 OBJ 导出入口位于 `packages/editor/src/components/editor/export-manager.tsx`
- [x] 在 `ExportManager` 中暴露 `window.__pascalExportOBJ`
- [x] 编写 `codex/batch-export-obj.mjs` 批量导出脚本
- [x] 用 `__pascalSceneReady()` 替换脚本里的固定 5 秒场景等待
- [x] 定位 `6277f322fd6f` 导出错位根因：`LevelSystem` 大 `delta` 插值过冲导致 world transform 跑飞
- [x] 修复 level 插值过冲：`getLevelStepAlpha(delta)` 将 alpha clamp 到 `0..1`
- [x] 修复导出瞬时状态：GLB/STL/OBJ 导出前临时 `snapLevelsToTruePositions()`
- [x] 重新导出修复样本：`codex/exports-obj-correct/6277f322fd6f.obj`
- [x] 编写合并后的修复报告：`codex/docs/obj-export-root-cause-report.md`

### 待做

- [ ] 对更多真实场景执行批量 OBJ 导出
- [ ] 汇总 `export-report-obj.json`，检查失败率、文件大小异常和空导出
- [ ] 为正式批量导出补充更严格的资源就绪信号，覆盖外部 GLB item 加载完成状态
- [ ] 决定是否重新归档修复前异常 OBJ 样本，用于长期回归对比

## 验证记录

- 单测：`bun test packages/viewer/src/systems/level/level-system.test.ts`，结果通过
- 构建：`bun run build`，结果通过
- 修复后 OBJ：
  - 文件：`codex/exports-obj-correct/6277f322fd6f.obj`
  - 整体 Y 范围：`-0.05 ~ 7.111219501495361`
  - `merged-roof` Y 范围：`2.8499999999999996 ~ 7.111219501495361`
  - 异常顶点数：`0`

## 参考样本

- 官网正确 OBJ：`codex/exports-obj-correct/model_2026-05-14.obj`
- 修复后 OBJ：`codex/exports-obj-correct/6277f322fd6f.obj`
- 导出报告：`codex/exports-obj-correct/export-report-obj.json`
- MCP 场景 JSON：`codex/exports-obj-correct/mcp-scene-6277f322fd6f.json`

## MCP 场景数据

- 数据库路径：`%APPDATA%/Pascal/data/pascal.db`
- MCP 场景 `6277f322fd6f`：19 节点，包括墙、楼板、天花、门、窗、家具和屋顶

## GLB 导出

GLB 导出因 TEXCOORD_2 UV 映射问题暂停。详见 `codex/docs/GLB-texcoord-2-issue.md`（如存在）。
