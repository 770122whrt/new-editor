# Pascal Editor 待办

## GLB 导出完善

- [ ] 用项目现有浏览器导出功能，对同一个 MCP demo scene 导出一份 GLB，作为基准文件。
- [ ] 编写 GLB 检查脚本，输出节点数量、网格数量、材质数量、包围盒和主要对象层级。
- [ ] 对比浏览器导出 GLB 与当前 headless 导出 GLB 的结构差异。
- [ ] 将 `SceneGraph JSON -> Three.js Object3D` 的转换逻辑整理成可测试模块。
- [ ] 为墙、地板、天花、屋顶、门窗、家具分别建立覆盖测试。
- [ ] 补齐 headless 导出中的几何尺寸、坐标、层高、材质和对象命名。
- [ ] 明确文档说明：当前 GLB 是可视化网格模型，不是 BIM/IFC/RVT 模型。

## MCP 场景工作流

- [ ] 固化 MCP 建模流程：创建场地、建筑、楼层、房间、墙体、开口、家具、屋顶、校验、保存。
- [ ] 统一 MCP 保存路径和浏览器应用读取路径，避免再次出现 `Scene not found`。
- [ ] 补充一个最小可复现实例，说明如何从 MCP scene JSON 生成 GLB。

## 文档与巡检

- [ ] 定期检查 `AGENTS.md`、`README.md`、`.cursor/rules`、`.codex/rules`、skills 是否和真实项目结构一致。
- [ ] 将文档漂移检查纳入项目巡检流程。
- [ ] 将本次 GLB 导出实验结论更新到项目 review 报告中。
