# TEXCOORD_2 Validation Error

## 背景：UV 通道与 TEXCOORD

### 什么是 UV 坐标

UV 坐标是 3D 几何体上的 2D 纹理映射坐标。每个顶点有一个 (u, v) 值，告诉 GPU"这张纹理的哪个点贴在这个顶点上"。类似地图投影——把 2D 纹理"展开"贴到 3D 表面。

### 什么是 UV 通道

一个 mesh 可以有多组 UV 坐标，称为 UV 通道。常见用途：

| 通道 | 典型用途 |
|------|----------|
| UV 通道 0 | 主纹理（漫反射贴图） |
| UV 通道 1 | 光照贴图（Lightmap）、细节贴图 |
| UV 通道 2 | 视差贴图、自定义效果 |

### Three.js vs GLTF 的命名映射

| Three.js 属性名 | GLTF 语义名 | 说明 |
|-----------------|-------------|------|
| `uv` | `TEXCOORD_0` | 第一 UV 通道 |
| `uv1` | `TEXCOORD_1` | 第二 UV 通道 |
| `uv2` | `TEXCOORD_2` | 第三 UV 通道 |
| `uv3` | `TEXCOORD_3` | 第四 UV 通道 |

GLTF 规范要求：如果存在 `TEXCOORD_N`，则 `TEXCOORD_0` 到 `TEXCOORD_(N-1)` 必须全部存在。不能跳号。

---

## 问题

导出的 GLB 文件包含 `TEXCOORD_2` 但缺少 `TEXCOORD_1`，违反 GLTF 规范：

```
GLTF: Invalid attribute in mesh: primitive: 0 attrib: TEXCOORD_2.
All indices for indexed attribute semantics must start with 0 and be continuous positive integers:
TEXCOORD_0, TEXCOORD_1, etc.
```

## 根因

Three.js GLTFExporter（v0.184）的 UV 属性映射规则（`GLTFExporter.js:1814-1818`）：

```js
const nameConversion = {
    uv:  'TEXCOORD_0',
    uv1: 'TEXCOORD_1',
    uv2: 'TEXCOORD_2',
    uv3: 'TEXCOORD_3',
    ...
};
```

Viewer 系统在构建几何体时设置了 `uv`（→ TEXCOORD_0）和 `uv2`（→ TEXCOORD_2），但跳过了 `uv1`。

导致导出的 GLB 有 TEXCOORD_0 和 TEXCOORD_2，缺少 TEXCOORD_1，违反 GLTF 规范："所有 TEXCOORD_N 索引必须从 0 开始连续"。

## 影响范围

以下系统都设置了 `uv2`：

| 系统 | 文件 | 行号 |
|------|------|------|
| wall | `wall-system.tsx` | 56 |
| slab | `slab-system.tsx` | 16 |
| ceiling | `ceiling-system.tsx` | 9 |
| column | `column-geometry.ts` | 15, `column-renderer.tsx:217` |
| fence | `fence-system.tsx` | 141, 255 |
| roof | `roof-system.tsx` | 1051 |
| stair | `stair-system.tsx` | 493, `stair-renderer.tsx:777` |

## 对比数据

| 文件 | 大小 | Mesh 数 | TEXCOORD_2 问题 |
|------|------|---------|-----------------|
| native 导出（浏览器直接导出） | 199KB | 46 | 有 |
| batch 导出（Playwright 自动化） | 215KB | 58 | 有 |
| mcp-clean-demo-house（旧 Node.js 脚本） | 26KB | — | 无（简化导出） |

## 修复方案

`uv2` 的值与 `uv` 完全相同（`ensureUv2Attribute` 函数只是复制），且没有任何 shader 或 material 读取 `uv2`。因此直接将 `uv2` 改名为 `uv1`。

```ts
// 修复前
geometry.setAttribute('uv2', new Float32BufferAttribute(Array.from(uv.array), 2))

// 修复后
geometry.setAttribute('uv1', new Float32BufferAttribute(Array.from(uv.array), 2))
```

修复后 GLB 的 UV 通道：`TEXCOORD_0`（uv）+ `TEXCOORD_1`（uv1），连续无跳号。

## 验证

修复后用 MeshIO 或 glTF Validator 重新检查导出文件。
