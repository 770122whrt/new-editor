# Batch GLB Export

批量导出 Pascal 场景为 GLB 文件的自动化工具。

## 原理

项目浏览器端已有完整的 GLB 导出能力（`ExportManager` 组件），能导出包含真实几何、材质、层级的高保真 GLB。本工具通过 Playwright 无头浏览器自动化调用这一原生导出流程，不重复造轮子。

### 导出流程

```
batch-export-glb.mjs
  → Playwright 启动无头 Chromium
  → 逐个导航到 /scene/{id}
  → 等待 Three.js 渲染完成
  → 调用 window.__pascalExportGLB()（ExportManager 暴露的全局钩子）
  → 拦截浏览器下载事件
  → 保存 GLB 到 codex/exports/{sceneId}.glb
```

### 关键代码变更

`packages/editor/src/components/editor/export-manager.tsx` 中新增一行：

```ts
// Expose for Playwright / automation
;(window as any).__pascalExportGLB = () => exportFn('glb')
```

这行代码将浏览器端的导出函数挂载到 `window` 对象上，供 Playwright 脚本通过 `page.evaluate()` 调用。

### 为什么用浏览器导出而不是 Node.js 脚本

项目曾尝试在 Node.js 中用 Three.js 直接构建几何体并导出 GLB（见 `export-scene-to-glb.mjs`），但结果是简化版本（BoxGeometry 墙、flat box 门窗），与浏览器原生渲染差距很大（26KB vs 200KB）。

浏览器导出的优势：
- 几何精度最高（含墙角 mitering、CSG 洞口切割、曲线墙）
- 真实门扇/窗框/窗格几何
- 家具 GLB 模型加载
- 完整材质和纹理
- 所有屋顶类型支持
- 零额外维护成本——跟随编辑器代码自动更新

## 使用方式

### 前置条件

1. 安装依赖（首次）：
```bash
bun add -d playwright
npx playwright install chromium
```

2. 启动编辑器 dev server：
```bash
bun run dev
```

### 导出全部场景

```bash
node codex/batch-export-glb.mjs
```

脚本会自动从 `http://localhost:3002/api/scenes` 获取所有场景 ID，逐个导出。

### 导出指定场景

```bash
node codex/batch-export-glb.mjs 6277f322fd6f abc123 def456
```

### 指定服务地址

```bash
PASCAL_URL=http://localhost:3001 node codex/batch-export-glb.mjs
```

### 断点续跑

已导出的场景会自动跳过。中断后重新运行即可继续。

### 输出

```
codex/exports/
├── 6277f322fd6f.glb
├── abc123.glb
├── ...
└── export-report.json
```

`export-report.json` 包含每个场景的导出状态（ok / skipped / error）和文件大小。

## 配置项

在脚本顶部可调整：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `BASE_URL` | `http://localhost:3002` | 编辑器地址（或用 `PASCAL_URL` 环境变量） |
| `TIMEOUT_MS` | `30000` | 单场景超时时间（毫秒） |
| `RENDER_WAIT_MS` | `5000` | 渲染等待时间（毫秒），确保几何体构建完成 |

## 限制

- 需要 dev server 运行（headless 浏览器需要访问编辑器页面）
- 每个场景需要几秒到十几秒的加载+渲染时间
- 400 个场景预计总耗时 30-60 分钟
- WebGL 上下文限制，不能并行（顺序处理）
