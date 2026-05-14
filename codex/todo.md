# Pascal Editor 待办

## 当前目标

尽可能完成一个高保真的 `SceneGraph JSON -> GLB` 导出流程，让我们自己导出的 GLB 在视觉结果、几何结构、对象层级和尺寸上尽量接近项目浏览器端原生导出的 GLB。

核心方法是先建立“标准答案”，再反向验证自己的导出能力：

1. 使用项目本身的浏览器导出功能，对同一个 scene 导出一份 GLB，作为 baseline。
2. 用脚本读取并分析 baseline GLB，得到网格、材质、节点层级、包围盒、对象命名等指标。
3. 使用我们自己的 `SceneGraph JSON -> GLB` 导出器导出同一个 scene。
4. 用 baseline GLB 验证我们自己的 GLB，逐步缩小差异。

## GLB 导出基准实验

- [ ] 确认项目浏览器端 GLB 导出入口：设置面板、命令面板或已有 `ExportManager`。
- [ ] 使用同一个 MCP demo scene，在浏览器中导出一份原生 GLB，保存为 `codex/baseline-browser-export.glb`。
- [ ] 记录导出 scene 的 ID、名称、节点数量、导出时间和浏览器端操作路径。
- [ ] 编写 GLB 检查脚本，读取 GLB 并输出节点数量、mesh 数量、material 数量、texture 数量、总包围盒和主要对象层级。
- [ ] 对 baseline GLB 生成结构报告，保存为 `codex/baseline-glb-inspection.md`。
- [ ] 确认 baseline GLB 能被 Three.js loader 或 `gltf-transform` 正常读取。

## 自研 JSON 到 GLB 导出

- [ ] 将当前 `codex/export-scene-to-glb.mjs` 从临时脚本整理成可测试模块。
- [ ] 明确输入格式：从项目 API 或本地 JSON 读取完整 SceneGraph。
- [ ] 明确输出格式：GLB 2.0 二进制文件，不是 BIM/IFC/RVT。
- [ ] 把 `SceneGraph JSON -> Three.js Object3D -> GLTFExporter -> GLB` 作为主流程。
- [ ] 尽量复用项目里的真实几何、材质和坐标逻辑；不能复用时，记录简化点和差异原因。
- [ ] 逐类补齐导出对象：墙、地板、天花、屋顶、门、窗、楼梯、家具、场地辅助对象。
- [ ] 为每类对象保留稳定命名，让 GLB 中的对象能追溯回原始 scene node ID。

## Baseline 对比测试目标

- [ ] 合法性测试：自研 GLB 文件头必须是 `glTF`，版本必须是 2，文件能被 loader 成功解析。
- [ ] 覆盖率测试：同一个 scene 中的主要 node 类型都应在自研 GLB 中出现。
- [ ] 几何尺寸测试：房间外轮廓、墙长、墙高、墙厚、层高、屋顶范围与 baseline 接近。
- [ ] 坐标测试：模型朝向、中心点、楼层高度和左右关系不能反向或错位。
- [ ] 结构测试：自研 GLB 的 mesh/material/node 数量与 baseline 的差距要可解释。
- [ ] 视觉测试：在固定相机角度下渲染 baseline 和自研 GLB，比较截图差异。
- [ ] 回归测试：固定 demo scene 的导出结果不能突然丢失墙、屋顶、门窗或家具。

## 通过标准

- [ ] 第一阶段通过：能稳定拿到项目浏览器端 baseline GLB，并能解析出结构报告。
- [ ] 第二阶段通过：自研 GLB 合法、可打开、主要建筑构件完整。
- [ ] 第三阶段通过：自研 GLB 的主要包围盒、对象覆盖率和固定视角截图与 baseline 接近。
- [ ] 第四阶段通过：文档明确说明哪些部分已经高保真复刻，哪些部分仍是简化实现。

## MCP 场景工作流

- [ ] 固化 MCP 建模流程：创建场地、建筑、楼层、房间、墙体、开口、家具、屋顶、校验、保存。
- [ ] 统一 MCP 保存路径和浏览器应用读取路径，避免再次出现 `Scene not found`。
- [ ] 补充一个最小可复现实例，说明如何从 MCP scene JSON 进入 GLB 导出流程。

## 文档与巡检

- [ ] 定期检查 `AGENTS.md`、`README.md`、`wiki/architecture`、`.agents/skills` 是否和真实项目结构一致。
- [ ] 将文档漂移检查纳入项目巡检流程。
- [ ] 将本次 GLB 导出实验结论更新到项目 review 报告中。
